import type pg from "pg";
import type { Anomaly, StoredEvent } from "../schemas/index.js";
import { getPool } from "./client.js";

export interface AlertContext {
  id: string;
  tenant_id: string;
  type: string;
  severity: Anomaly["severity"];
  service: string;
  status: "open" | "acknowledged" | "resolved";
  evidence: Anomaly["evidence"];
  first_detected_at: string;
  last_detected_at: string;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

function mapAlert(row: Record<string, unknown>): AlertContext {
  return {
    ...(row as unknown as AlertContext),
    first_detected_at: (row.first_detected_at as Date).toISOString(),
    last_detected_at: (row.last_detected_at as Date).toISOString(),
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

export async function recordAlertContext(
  pool: pg.Pool,
  anomaly: Anomaly
): Promise<AlertContext> {
  const dedupKey = `${anomaly.type}:${anomaly.service}`;
  const result = await pool.query(
    `INSERT INTO alert_contexts
       (tenant_id, dedup_key, type, severity, service, evidence, first_detected_at, last_detected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (tenant_id, dedup_key)
       WHERE status IN ('open', 'acknowledged')
     DO UPDATE SET
       severity = EXCLUDED.severity,
       evidence = EXCLUDED.evidence,
       last_detected_at = EXCLUDED.last_detected_at,
       occurrence_count = alert_contexts.occurrence_count + 1,
       updated_at = NOW()
     RETURNING id, tenant_id, type, severity, service, status, evidence,
               first_detected_at, last_detected_at, occurrence_count, created_at, updated_at`,
    [
      anomaly.tenant_id,
      dedupKey,
      anomaly.type,
      anomaly.severity,
      anomaly.service,
      anomaly.evidence,
      anomaly.detected_at,
    ]
  );
  return mapAlert(result.rows[0]);
}

export async function getAlertContext(
  tenantId: string,
  alertId: string
): Promise<AlertContext | null> {
  const result = await getPool().query(
    `SELECT id, tenant_id, type, severity, service, status, evidence,
            first_detected_at, last_detected_at, occurrence_count, created_at, updated_at
     FROM alert_contexts
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, alertId]
  );
  return result.rows[0] ? mapAlert(result.rows[0]) : null;
}

export async function getAlertEvidenceEvents(
  tenantId: string,
  alert: AlertContext,
  limit = 20
): Promise<StoredEvent[]> {
  const from = new Date(new Date(alert.first_detected_at).getTime() - 5 * 60 * 1000);
  const to = new Date(new Date(alert.last_detected_at).getTime() + 60 * 1000);
  const result = await getPool().query(
    `SELECT id, tenant_id, timestamp, service, level, message,
            trace_id, span_id, attributes, ingested_at
     FROM events
     WHERE tenant_id = $1 AND service = $2
       AND level IN ('error', 'fatal')
       AND timestamp >= $3 AND timestamp <= $4
     ORDER BY timestamp DESC
     LIMIT $5`,
    [tenantId, alert.service, from.toISOString(), to.toISOString(), Math.min(limit, 50)]
  );
  return result.rows.map((row) => ({
    ...row,
    timestamp: row.timestamp.toISOString(),
    ingested_at: row.ingested_at.toISOString(),
  }));
}
