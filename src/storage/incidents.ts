import { getPool } from "./client.js";
import type { AlertContext } from "./alerts.js";

export interface Incident {
  id: string;
  tenant_id: string;
  title: string;
  summary: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved";
  started_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentEvidence {
  id: string;
  kind: "detector" | "log" | "note";
  source_id: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function mapIncident(row: Record<string, unknown>): Incident {
  return {
    ...(row as unknown as Incident),
    started_at: iso(row.started_at as Date)!,
    resolved_at: iso(row.resolved_at as Date | null),
    created_at: iso(row.created_at as Date)!,
    updated_at: iso(row.updated_at as Date)!,
  };
}

export async function listIncidents(
  tenantId: string,
  filters: { status?: Incident["status"]; service?: string; limit?: number } = {}
): Promise<Incident[]> {
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let position = 2;
  if (filters.status) {
    conditions.push(`status = $${position++}`);
    params.push(filters.status);
  }
  if (filters.service) {
    conditions.push(`service = $${position++}`);
    params.push(filters.service);
  }
  params.push(Math.min(filters.limit ?? 20, 100));
  const result = await getPool().query(
    `SELECT id, tenant_id, title, summary, service, severity, status,
            started_at, resolved_at, created_at, updated_at
     FROM incidents
     WHERE ${conditions.join(" AND ")}
     ORDER BY updated_at DESC
     LIMIT $${position}`,
    params
  );
  return result.rows.map(mapIncident);
}

export async function searchIncidents(
  tenantId: string,
  keywords: string[],
  limit = 20
): Promise<Incident[]> {
  const patterns = keywords.map((keyword) => `%${keyword}%`);
  const result = await getPool().query(
    `SELECT id, tenant_id, title, summary, service, severity, status,
            started_at, resolved_at, created_at, updated_at
     FROM incidents
     WHERE tenant_id = $1
       AND (title ILIKE ANY($2::text[])
         OR summary ILIKE ANY($2::text[])
         OR service ILIKE ANY($2::text[]))
     ORDER BY updated_at DESC
     LIMIT $3`,
    [tenantId, patterns, Math.min(limit, 100)]
  );
  return result.rows.map(mapIncident);
}

export async function getIncident(tenantId: string, incidentId: string): Promise<{
  incident: Incident;
  alerts: AlertContext[];
  evidence: IncidentEvidence[];
} | null> {
  const pool = getPool();
  const incidentResult = await pool.query(
    `SELECT id, tenant_id, title, summary, service, severity, status,
            started_at, resolved_at, created_at, updated_at
     FROM incidents WHERE tenant_id = $1 AND id = $2`,
    [tenantId, incidentId]
  );
  if (!incidentResult.rows[0]) return null;

  const [alertsResult, evidenceResult] = await Promise.all([
    pool.query(
      `SELECT a.id, a.tenant_id, a.type, a.severity, a.service, a.status, a.evidence,
              a.first_detected_at, a.last_detected_at, a.occurrence_count,
              a.created_at, a.updated_at
       FROM alert_contexts a
       JOIN incident_alert_contexts link ON link.alert_context_id = a.id
       WHERE a.tenant_id = $1 AND link.incident_id = $2
       ORDER BY a.last_detected_at ASC`,
      [tenantId, incidentId]
    ),
    pool.query(
      `SELECT id, kind, source_id, snapshot, created_at
       FROM incident_evidence
       WHERE tenant_id = $1 AND incident_id = $2
       ORDER BY created_at ASC`,
      [tenantId, incidentId]
    ),
  ]);

  const alerts = alertsResult.rows.map((row) => ({
    ...row,
    first_detected_at: row.first_detected_at.toISOString(),
    last_detected_at: row.last_detected_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  })) as AlertContext[];
  const evidence = evidenceResult.rows.map((row) => ({
    ...row,
    created_at: row.created_at.toISOString(),
  })) as IncidentEvidence[];

  return { incident: mapIncident(incidentResult.rows[0]), alerts, evidence };
}
