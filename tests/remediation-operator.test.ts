import crypto from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveAction, proposeAction } from "../src/execution/executor.js";
import { initAgent, executeTool } from "../src/agent/index.js";
import { clearActionRegistry } from "../src/execution/registry.js";
import { runRemediationDeliveryCycle } from "../src/detection/scheduler.js";
import { enqueueRemediationDelivery } from "../src/storage/remediation-deliveries.js";
import { closePool, getPool } from "../src/storage/client.js";
import { getRemediationRequest } from "../src/storage/remediations.js";

const TENANT = "operator-tests";
const SECRET = "operator-test-secret-that-is-at-least-32-bytes";
let incidentId: string;
let endpoint: string;
const calls: Array<{
  headers: IncomingHttpHeaders;
  raw: string;
  body: Record<string, unknown>;
}> = [];

const server = createServer((request, response) => {
  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    calls.push({ headers: request.headers, raw, body: JSON.parse(raw) });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        message: "operator accepted request",
        before: { replicas: 2 },
        after: { replicas: 3 },
      }),
    );
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test server did not start");
  endpoint = `http://127.0.0.1:${address.port}/actions`;
  process.env.CALYX_OPERATOR_CONFIG = JSON.stringify({
    [TENANT]: {
      url: endpoint,
      secret: SECRET,
      allowed_operations: ["service.scale"],
    },
  });
  await getPool().query("DELETE FROM remediation_events WHERE tenant_id=$1", [
    TENANT,
  ]);
  await getPool().query("DELETE FROM remediation_requests WHERE tenant_id=$1", [
    TENANT,
  ]);
  await getPool().query("DELETE FROM incidents WHERE tenant_id=$1", [TENANT]);
  const incident = await getPool().query(
    `INSERT INTO incidents (tenant_id, title, summary, service, severity, started_at)
     VALUES ($1, 'API saturation', 'API is saturated', 'api', 'high', NOW()) RETURNING id`,
    [TENANT],
  );
  incidentId = incident.rows[0].id;
  clearActionRegistry();
  initAgent();
});

afterAll(async () => {
  delete process.env.CALYX_OPERATOR_CONFIG;
  await getPool().query("DELETE FROM remediation_events WHERE tenant_id=$1", [
    TENANT,
  ]);
  await getPool().query("DELETE FROM remediation_requests WHERE tenant_id=$1", [
    TENANT,
  ]);
  await getPool().query("DELETE FROM incidents WHERE tenant_id=$1", [TENANT]);
  await closePool();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("tenant remediation operator", () => {
  it("binds dry run and execution to one signed idempotent request", async () => {
    const proposal = await proposeAction({
      tenantId: TENANT,
      incidentId,
      actionName: "operator_webhook",
      params: {
        operation: "service.scale",
        target: "api",
        input: { replicas: 3 },
      },
      proposedBy: "calyx-agent",
    });

    expect(proposal.request).toMatchObject({ status: "pending", incidentId });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      request_id: proposal.request.id,
      tenant_id: TENANT,
      phase: "dry_run",
      operation: "service.scale",
      target: "api",
    });
    expect(calls[0].headers["idempotency-key"]).toBe(
      `${proposal.request.id}:dry_run`,
    );
    const timestamp = calls[0].headers["x-calyx-timestamp"] as string;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${timestamp}.${calls[0].raw}`)
      .digest("hex");
    expect(calls[0].headers["x-calyx-signature"]).toBe(`sha256=${expected}`);

    const executed = await approveAction({
      requestId: proposal.request.id,
      approvedBy: "T1:U1",
      reason: "Scale is within the incident runbook",
    });
    expect(executed).toMatchObject({
      executed: true,
      request: { status: "executed" },
    });
    expect(calls[1].body).toMatchObject({
      request_id: proposal.request.id,
      phase: "execute",
    });
    expect(calls[1].headers["idempotency-key"]).toBe(
      `${proposal.request.id}:execute`,
    );
  });

  it("rejects non-allowlisted operations before contacting the operator", async () => {
    const before = calls.length;
    const proposal = await proposeAction({
      tenantId: TENANT,
      incidentId,
      actionName: "operator_webhook",
      params: { operation: "database.drop", target: "primary" },
      proposedBy: "calyx-agent",
    });
    expect(proposal.request.status).toBe("failed");
    expect(proposal.request.dryRunResult.message).toMatch(/not allowed/);
    expect(calls).toHaveLength(before);
  });

  it("turns an agent recommendation into a durable approval-card delivery", async () => {
    const recommendation = await executeTool("propose_remediation", {
      tenant_id: TENANT,
      actor_id: "slack:T1:U1",
      incident_id: incidentId,
      operation: "service.scale",
      target: "api",
      input: { replicas: 4 },
    });
    expect(recommendation.ok).toBe(true);
    if (!recommendation.ok) throw new Error(recommendation.error);
    const requestId = (
      recommendation.output.data as { remediation_request_id: string }
    ).remediation_request_id;
    expect(await getRemediationRequest(requestId, TENANT)).toMatchObject({
      proposedBy: "slack:T1:U1",
      incidentId,
    });
    const callCount = calls.length;
    const duplicate = await executeTool("propose_remediation", {
      tenant_id: TENANT,
      actor_id: "slack:T1:U1",
      incident_id: incidentId,
      operation: "service.scale",
      target: "api",
      input: { replicas: 4 },
    });
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error(duplicate.error);
    expect(
      (duplicate.output.data as { remediation_request_id: string })
        .remediation_request_id,
    ).toBe(requestId);
    expect(calls).toHaveLength(callCount);

    expect(
      await enqueueRemediationDelivery({
        tenantId: TENANT,
        requestId,
        target: "C123",
        threadTs: "1700.1",
      }),
    ).toBe(true);
    expect(
      await enqueueRemediationDelivery({
        tenantId: TENANT,
        requestId,
        target: "C123",
        threadTs: "1700.1",
      }),
    ).toBe(false);

    const delivered = await runRemediationDeliveryCycle(
      async (delivery, request) => {
        expect(delivery.thread_ts).toBe("1700.1");
        expect(request.id).toBe(requestId);
        return { externalId: "1700.2" };
      },
    );
    expect(delivered).toEqual({ delivered: 1, failed: 0 });
    const stored = await getPool().query(
      "SELECT status, external_id, attempts FROM remediation_deliveries WHERE request_id=$1",
      [requestId],
    );
    expect(stored.rows).toEqual([
      { status: "delivered", external_id: "1700.2", attempts: 1 },
    ]);
  });
});
