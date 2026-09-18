import crypto from "node:crypto";
import { getPool } from "./client.js";
import type { Event, StoredEvent } from "../schemas/index.js";

function contentHash(e: Event): string {
  const raw = [
    e.tenant_id,
    e.service,
    e.timestamp,
    e.trace_id ?? "",
    e.span_id ?? "",
    e.message,
  ].join("\x00");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Insert one or many events. Silently ignores duplicates (same content_hash).
// Returns the number of rows actually inserted.
export async function insertEvents(events: Event[]): Promise<number> {
  if (events.length === 0) return 0;

  const pool = getPool();
  let inserted = 0;

  for (const e of events) {
    const hash = contentHash(e);
    const result = await pool.query(
      `INSERT INTO events
         (tenant_id, timestamp, service, level, message, trace_id, span_id, attributes, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (content_hash) DO NOTHING`,
      [
        e.tenant_id,
        e.timestamp,
        e.service,
        e.level,
        e.message,
        e.trace_id ?? null,
        e.span_id ?? null,
        JSON.stringify(e.attributes),
        hash,
      ]
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

export interface EventQuery {
  tenant_id: string;
  service?: string;
  level?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function queryEvents(q: EventQuery): Promise<StoredEvent[]> {
  const pool = getPool();
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [q.tenant_id];
  let p = 2;

  if (q.service) {
    conditions.push(`service = $${p++}`);
    params.push(q.service);
  }
  if (q.level) {
    conditions.push(`level = $${p++}`);
    params.push(q.level);
  }
  if (q.from) {
    conditions.push(`timestamp >= $${p++}`);
    params.push(q.from);
  }
  if (q.to) {
    conditions.push(`timestamp <= $${p++}`);
    params.push(q.to);
  }

  const limit = Math.min(q.limit ?? 100, 1000);
  const offset = q.offset ?? 0;

  const sql = `
    SELECT id, tenant_id, timestamp, service, level, message,
           trace_id, span_id, attributes, ingested_at
    FROM events
    WHERE ${conditions.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT $${p++} OFFSET $${p++}
  `;
  params.push(limit, offset);

  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    ...r,
    timestamp: r.timestamp.toISOString(),
    ingested_at: r.ingested_at.toISOString(),
  }));
}

export async function countEvents(tenant_id: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT COUNT(*) AS n FROM events WHERE tenant_id = $1",
    [tenant_id]
  );
  return parseInt(result.rows[0].n, 10);
}
