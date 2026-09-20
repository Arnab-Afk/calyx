import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proposeAction } from "../src/execution/executor.js";
import { registerAction } from "../src/execution/registry.js";
import { remediationsRoute } from "../src/ingestion/routes/v1/remediations.js";
import { createMgmtKey } from "../src/mgmt/auth.js";
import { closePool, getPool } from "../src/storage/client.js";

const TENANT = "remediation-route-tests";
const OTHER_TENANT = "remediation-route-other";
const INTERNAL_KEY = "remediation-route-internal-key-32-bytes";
const app = Fastify();
let token: string;
let otherToken: string;
let requestId: string;
let executions = 0;

beforeAll(async () => {
  process.env.CALYX_INTERNAL_API_KEY = INTERNAL_KEY;
  await getPool().query(
    "DELETE FROM remediation_events WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  await getPool().query(
    "DELETE FROM remediation_requests WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  await getPool().query(
    "DELETE FROM mgmt_api_keys WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  token = (
    await createMgmtKey({
      tenantId: TENANT,
      name: "web-admin",
      scopes: ["integrations:write"],
    })
  ).token;
  otherToken = (
    await createMgmtKey({
      tenantId: OTHER_TENANT,
      name: "other",
      scopes: ["integrations:write"],
    })
  ).token;
  registerAction({
    name: "route_test_action",
    description: "route test",
    defaultTier: "0",
    reversible: false,
    async dry_run() {
      return { success: true, message: "safe" };
    },
    async execute() {
      executions++;
      return { success: true, message: "done" };
    },
  });
  requestId = (
    await proposeAction({
      tenantId: TENANT,
      actionName: "route_test_action",
      params: { target: "api" },
      proposedBy: "agent",
    })
  ).request.id;
  await app.register(remediationsRoute);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await getPool().query(
    "DELETE FROM remediation_events WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  await getPool().query(
    "DELETE FROM remediation_requests WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  await getPool().query(
    "DELETE FROM mgmt_api_keys WHERE tenant_id IN ($1,$2)",
    [TENANT, OTHER_TENANT],
  );
  await closePool();
  delete process.env.CALYX_INTERNAL_API_KEY;
});

const headers = (value = token) => ({ authorization: `Bearer ${value}` });

describe("management remediation routes", () => {
  it("lists and reads only the credential tenant", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/v1/remediations?status=pending",
      headers: headers(),
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().remediations.map((item: { id: string }) => item.id),
    ).toContain(requestId);
    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/remediations/${requestId}`,
      headers: headers(otherToken),
    });
    expect(crossTenant.statusCode).toBe(404);
  });

  it("requires a reason and a service-authenticated web actor", async () => {
    const missingReason = await app.inject({
      method: "POST",
      url: `/v1/remediations/${requestId}/approve`,
      headers: headers(),
      payload: { reason: "" },
    });
    expect(missingReason.statusCode).toBe(422);
    const forgedActor = await app.inject({
      method: "POST",
      url: `/v1/remediations/${requestId}/approve`,
      headers: { ...headers(), "x-calyx-actor-id": "web:workspace:member" },
      payload: { reason: "runbook approved" },
    });
    expect(forgedActor.statusCode).toBe(401);
    expect(executions).toBe(0);
  });

  it("rejects a request without executing it", async () => {
    const rejectedId = (
      await proposeAction({
        tenantId: TENANT,
        actionName: "route_test_action",
        params: { target: "worker" },
        proposedBy: "agent",
      })
    ).request.id;
    const response = await app.inject({
      method: "POST",
      url: `/v1/remediations/${rejectedId}/reject`,
      headers: {
        ...headers(),
        "x-calyx-internal-key": INTERNAL_KEY,
        "x-calyx-actor-id": "web:workspace-1:member-1",
      },
      payload: { reason: "Unsafe during peak traffic" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      remediation: { status: "rejected", rejectionReason: "Unsafe during peak traffic" },
    });
    expect(executions).toBe(0);
  });

  it("executes once and records the server-derived web actor", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/remediations/${requestId}/approve`,
      headers: {
        ...headers(),
        "x-calyx-internal-key": INTERNAL_KEY,
        "x-calyx-actor-id": "web:workspace-1:member-1",
      },
      payload: { reason: "runbook approved" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      executed: true,
      request: { status: "executed" },
    });
    expect(executions).toBe(1);
    const stored = await getPool().query(
      "SELECT approved_by, approval_reason FROM remediation_requests WHERE id=$1",
      [requestId],
    );
    expect(stored.rows[0]).toEqual({
      approved_by: "web:workspace-1:member-1",
      approval_reason: "runbook approved",
    });
  });
});
