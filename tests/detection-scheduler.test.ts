import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/storage/client.js";
import { enqueueAlertDelivery } from "../src/storage/alert-deliveries.js";
import { runDeliveryCycle, slackChannelForTenant } from "../src/detection/scheduler.js";
import { acknowledgeAlert, resolveAlert } from "../src/slack/alert-state.js";

const TENANT = "scheduler-tests";
let alertId: string;
let failedAlertId: string;

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM incidents WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM alert_contexts WHERE tenant_id = $1", [TENANT]);
  const result = await pool.query(
    `INSERT INTO alert_contexts
       (tenant_id, dedup_key, type, severity, service, evidence, first_detected_at, last_detected_at)
     VALUES ($1, 'error_spike:api', 'error_spike', 'high', 'api', $2, NOW(), NOW())
     RETURNING id`,
    [TENANT, { description: "API error rate increased", sample_event_ids: [] }]
  );
  alertId = result.rows[0].id;
  const failed = await pool.query(
    `INSERT INTO alert_contexts
       (tenant_id, dedup_key, type, severity, service, evidence, first_detected_at, last_detected_at)
     VALUES ($1, 'error_spike:worker', 'error_spike', 'medium', 'worker', $2, NOW(), NOW())
     RETURNING id`,
    [TENANT, { description: "Worker errors increased", sample_event_ids: [] }]
  );
  failedAlertId = failed.rows[0].id;
  const incident = await pool.query(
    `INSERT INTO incidents (tenant_id, title, summary, service, severity, started_at)
     VALUES ($1, 'API errors', 'API error rate increased', 'api', 'high', NOW())
     RETURNING id`,
    [TENANT]
  );
  await pool.query(
    `INSERT INTO incident_alert_contexts (incident_id, alert_context_id) VALUES ($1, $2)`,
    [incident.rows[0].id, alertId]
  );
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM incidents WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM alert_contexts WHERE tenant_id = $1", [TENANT]);
  await closePool();
});

describe("detection scheduler configuration", () => {
  it("routes only explicitly mapped tenants", () => {
    const env = {
      CALYX_SLACK_ALERT_CHANNELS: JSON.stringify({ [TENANT]: "C123" }),
      CALYX_TENANT_ID: "other",
      CALYX_SLACK_ALERT_CHANNEL: "C-fallback",
    } as NodeJS.ProcessEnv;
    expect(slackChannelForTenant(TENANT, env)).toBe("C123");
    expect(slackChannelForTenant("unknown", env)).toBeUndefined();
  });

  it("rejects malformed multi-tenant channel configuration", () => {
    expect(() =>
      slackChannelForTenant(TENANT, {
        CALYX_SLACK_ALERT_CHANNELS: "not-json",
      } as NodeJS.ProcessEnv)
    ).toThrow(/JSON object/);
  });
});

describe("durable alert delivery", () => {
  it("deduplicates and records successful Slack delivery", async () => {
    const input = {
      tenantId: TENANT,
      alertId,
      destination: "slack" as const,
      target: "C123",
    };
    expect(await enqueueAlertDelivery(input)).toBe(true);
    expect(await enqueueAlertDelivery(input)).toBe(false);

    const seen: string[] = [];
    const result = await runDeliveryCycle({
      slack: async (delivery, alert) => {
        seen.push(delivery.id);
        expect(alert.id).toBe(alertId);
        expect(alert.tenant_id).toBe(TENANT);
        expect(alert.root_cause.length).toBeGreaterThan(0);
        expect(alert.recommended_action.length).toBeGreaterThan(0);
        return { externalId: "1700000000.000001" };
      },
    });

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(seen).toHaveLength(1);
    const stored = await getPool().query(
      `SELECT status, attempts, external_id
       FROM alert_deliveries WHERE tenant_id = $1 AND alert_id = $2`,
      [TENANT, alertId]
    );
    expect(stored.rows).toEqual([
      { status: "delivered", attempts: 1, external_id: "1700000000.000001" },
    ]);

    const acknowledged = await acknowledgeAlert(alertId, "C123", "U123");
    expect(acknowledged).toMatchObject({ status: "acknowledged", acknowledgedBy: "U123" });
    expect(await acknowledgeAlert(alertId, "wrong-channel", "U999")).toBeNull();

    const resolved = await resolveAlert(alertId, "C123", "U123", "Rolled back");
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedBy: "U123",
      reason: "Rolled back",
    });
    const lifecycle = await getPool().query(
      `SELECT alert.status AS alert_status, incident.status AS incident_status
       FROM alert_contexts alert
       JOIN incident_alert_contexts link ON link.alert_context_id = alert.id
       JOIN incidents incident ON incident.id = link.incident_id
       WHERE alert.id = $1`,
      [alertId]
    );
    expect(lifecycle.rows[0]).toEqual({
      alert_status: "resolved",
      incident_status: "resolved",
    });
  });

  it("persists failures for a delayed retry", async () => {
    await enqueueAlertDelivery({
      tenantId: TENANT,
      alertId: failedAlertId,
      destination: "slack",
      target: "C123",
    });
    const result = await runDeliveryCycle({
      slack: async () => {
        throw new Error("temporary Slack outage");
      },
    });
    expect(result).toEqual({ delivered: 0, failed: 1 });

    const stored = await getPool().query(
      `SELECT status, attempts, last_error, available_at > NOW() AS delayed
       FROM alert_deliveries WHERE alert_id = $1`,
      [failedAlertId]
    );
    expect(stored.rows).toEqual([
      {
        status: "failed",
        attempts: 1,
        last_error: "temporary Slack outage",
        delayed: true,
      },
    ]);
  });
});
