import { getPool } from "../storage/client.js";

export type AlertStatus = "active" | "acknowledged" | "resolved";

export interface AlertState {
  alertId: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  reason?: string;
}

function mapState(row: Record<string, unknown> | undefined, alertId: string): AlertState {
  if (!row) return { alertId, status: "active" };
  return {
    alertId,
    status:
      row.status === "acknowledged"
        ? "acknowledged"
        : row.status === "resolved"
          ? "resolved"
          : "active",
    ...(row.acknowledged_by ? { acknowledgedBy: row.acknowledged_by as string } : {}),
    ...(row.acknowledged_at
      ? { acknowledgedAt: new Date(row.acknowledged_at as Date).toISOString() }
      : {}),
    ...(row.resolved_by ? { resolvedBy: row.resolved_by as string } : {}),
    ...(row.resolved_at
      ? { resolvedAt: new Date(row.resolved_at as Date).toISOString() }
      : {}),
    ...(row.resolution_reason ? { reason: row.resolution_reason as string } : {}),
  };
}

export async function getAlertState(alertId: string): Promise<AlertState> {
  const result = await getPool().query(
    `SELECT status, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_reason
     FROM alert_contexts WHERE id = $1`,
    [alertId]
  );
  return mapState(result.rows[0], alertId);
}

async function updateAlertState(input: {
  alertId: string;
  channelId: string;
  userId: string;
  status: "acknowledged" | "resolved";
  reason?: string;
}): Promise<AlertState | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      input.status === "acknowledged"
        ? `UPDATE alert_contexts alert
           SET status = 'acknowledged', acknowledged_by = $3, acknowledged_at = NOW(), updated_at = NOW()
           WHERE alert.id = $1 AND alert.status = 'open'
             AND EXISTS (
               SELECT 1 FROM alert_deliveries delivery
               WHERE delivery.alert_id = alert.id AND delivery.destination = 'slack'
                 AND delivery.target = $2 AND delivery.status = 'delivered'
             )
           RETURNING alert.*`
        : `UPDATE alert_contexts alert
           SET status = 'resolved', resolved_by = $3, resolved_at = NOW(),
               resolution_reason = $4, updated_at = NOW()
           WHERE alert.id = $1 AND alert.status IN ('open','acknowledged')
             AND EXISTS (
               SELECT 1 FROM alert_deliveries delivery
               WHERE delivery.alert_id = alert.id AND delivery.destination = 'slack'
                 AND delivery.target = $2 AND delivery.status = 'delivered'
             )
           RETURNING alert.*`,
      input.status === "acknowledged"
        ? [input.alertId, input.channelId, input.userId]
        : [input.alertId, input.channelId, input.userId, input.reason ?? null]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE incidents incident
       SET status = $3, resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       FROM incident_alert_contexts link
       WHERE incident.id = link.incident_id AND link.alert_context_id = $1
         AND incident.tenant_id = $2`,
      [
        input.alertId,
        result.rows[0].tenant_id,
        input.status === "resolved" ? "resolved" : "investigating",
      ]
    );
    await client.query("COMMIT");
    return mapState(result.rows[0], input.alertId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function acknowledgeAlert(
  alertId: string,
  channelId: string,
  userId: string
): Promise<AlertState | null> {
  return updateAlertState({ alertId, channelId, userId, status: "acknowledged" });
}

export function resolveAlert(
  alertId: string,
  channelId: string,
  userId: string,
  reason?: string
): Promise<AlertState | null> {
  return updateAlertState({ alertId, channelId, userId, status: "resolved", reason });
}
