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

interface EventCursor {
  ingestedAt: string;
  id: string;
}

function encodeEventCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeEventCursor(cursor: string): EventCursor {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as EventCursor;
    if (!value.ingestedAt || !value.id || Number.isNaN(Date.parse(value.ingestedAt))) {
      throw new Error("Malformed cursor");
    }
    return value;
  } catch {
    throw new Error("Invalid live-log cursor");
  }
}

export async function queryEventsAfter(q: {
  tenant_id: string;
  cursor?: string;
  service?: string;
  level?: string;
  limit?: number;
}): Promise<{ events: StoredEvent[]; next_cursor: string }> {
  const start: EventCursor = q.cursor
    ? decodeEventCursor(q.cursor)
    : { ingestedAt: new Date().toISOString(), id: "00000000-0000-0000-0000-000000000000" };
  const conditions = ["tenant_id = $1", "(ingested_at, id) > ($2::timestamptz, $3::uuid)"];
  const params: unknown[] = [q.tenant_id, start.ingestedAt, start.id];
  let p = 4;

  if (q.service) {
    conditions.push(`service = $${p++}`);
    params.push(q.service);
  }
  if (q.level) {
    conditions.push(`level = $${p++}`);
    params.push(q.level);
  }

  const limit = Math.min(q.limit ?? 50, 100);
  params.push(limit);
  const result = await getPool().query(
    `SELECT id, tenant_id, timestamp, service, level, message,
            trace_id, span_id, attributes, ingested_at
     FROM events
     WHERE ${conditions.join(" AND ")}
     ORDER BY ingested_at ASC, id ASC
     LIMIT $${p}`,
    params
  );

  const events: StoredEvent[] = result.rows.map((row) => ({
    ...row,
    timestamp: row.timestamp.toISOString(),
    ingested_at: row.ingested_at.toISOString(),
  }));
  const last = events.at(-1);
  const next = last ? { ingestedAt: last.ingested_at, id: last.id } : start;
  return { events, next_cursor: encodeEventCursor(next) };
}

export async function searchByMessage(
  tenant_id: string,
  text: string,
  limit = 20
): Promise<StoredEvent[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, tenant_id, timestamp, service, level, message,
            trace_id, span_id, attributes, ingested_at
     FROM events
     WHERE tenant_id = $1 AND message ILIKE $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [tenant_id, `%${text}%`, limit]
  );
  return result.rows.map((r) => ({
    ...r,
    timestamp: r.timestamp.toISOString(),
    ingested_at: r.ingested_at.toISOString(),
  }));
}

export interface ServiceStats {
  service: string;
  total: number;
  by_level: Record<string, number>;
  error_count: number;
  error_rate: number;
  first_seen: string;
  last_seen: string;
}

export async function getServiceStats(
  tenant_id: string,
  opts: { service?: string; from?: string; to?: string } = {}
): Promise<ServiceStats[]> {
  const pool = getPool();
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [tenant_id];
  let p = 2;

  if (opts.service) {
    conditions.push(`service = $${p++}`);
    params.push(opts.service);
  }
  if (opts.from) {
    conditions.push(`timestamp >= $${p++}`);
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push(`timestamp <= $${p++}`);
    params.push(opts.to);
  }

  const where = conditions.join(" AND ");

  // Per-service, per-level counts
  const levelResult = await pool.query(
    `SELECT service, level, COUNT(*) AS cnt
     FROM events WHERE ${where}
     GROUP BY service, level`,
    params
  );

  // Per-service aggregates
  const aggResult = await pool.query(
    `SELECT service,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE level IN ('error','fatal')) AS error_count,
            MIN(timestamp) AS first_seen,
            MAX(timestamp) AS last_seen
     FROM events WHERE ${where}
     GROUP BY service
     ORDER BY error_count DESC`,
    params
  );

  // Merge
  const levelMap: Record<string, Record<string, number>> = {};
  for (const row of levelResult.rows) {
    levelMap[row.service] ??= {};
    levelMap[row.service][row.level] = parseInt(row.cnt, 10);
  }

  return aggResult.rows.map((r) => {
    const total = parseInt(r.total, 10);
    const error_count = parseInt(r.error_count, 10);
    return {
      service: r.service,
      total,
      by_level: levelMap[r.service] ?? {},
      error_count,
      error_rate: total > 0 ? Math.round((error_count / total) * 10000) / 100 : 0,
      first_seen: r.first_seen.toISOString(),
      last_seen: r.last_seen.toISOString(),
    };
  });
}

export type DayHealthStatus = "ok" | "warn" | "error" | "empty";

export interface DailyBucket {
  date: string; // YYYY-MM-DD UTC
  status: DayHealthStatus;
  total: number;
  error_count: number;
  warn_count: number;
}

export interface ServiceDailyHealth {
  service: string;
  days: DailyBucket[];
}

export function bucketStatus(total: number, errorCount: number, warnCount: number): DayHealthStatus {
  if (total <= 0) return "empty";
  const errorRate = (errorCount / total) * 100;
  const warnRate = (warnCount / total) * 100;
  if (errorRate >= 1 || errorCount >= 5) return "error";
  if (errorCount > 0 || warnRate >= 5) return "warn";
  return "ok";
}

function utcDayKeys(days: number, end = new Date()): string[] {
  const keys: string[] = [];
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(endUtc - i * 86400000).toISOString().slice(0, 10));
  }
  return keys;
}

/** Last N UTC days of per-service health, with empty days filled in. */
export async function getServiceDailyHealth(
  tenant_id: string,
  opts: { service?: string; days?: number } = {}
): Promise<ServiceDailyHealth[]> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 14);
  const keys = utcDayKeys(days);
  const from = `${keys[0]}T00:00:00.000Z`;
  const to = `${keys[keys.length - 1]}T23:59:59.999Z`;

  const pool = getPool();
  const conditions = ["tenant_id = $1", "timestamp >= $2", "timestamp <= $3"];
  const params: unknown[] = [tenant_id, from, to];
  if (opts.service) {
    conditions.push("service = $4");
    params.push(opts.service);
  }

  const result = await pool.query(
    `SELECT service,
            to_char(date_trunc('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE level IN ('error','fatal')) AS error_count,
            COUNT(*) FILTER (WHERE level = 'warn') AS warn_count
     FROM events
     WHERE ${conditions.join(" AND ")}
     GROUP BY service, day
     ORDER BY service, day`,
    params
  );

  const byService = new Map<string, Map<string, DailyBucket>>();
  for (const row of result.rows) {
    const total = parseInt(row.total, 10);
    const error_count = parseInt(row.error_count, 10);
    const warn_count = parseInt(row.warn_count, 10);
    if (!byService.has(row.service)) byService.set(row.service, new Map());
    byService.get(row.service)!.set(row.day, {
      date: row.day,
      status: bucketStatus(total, error_count, warn_count),
      total,
      error_count,
      warn_count,
    });
  }

  const services = [...byService.keys()].sort();
  return services.map((service) => ({
    service,
    days: keys.map((date) => {
      const hit = byService.get(service)?.get(date);
      return hit ?? { date, status: "empty", total: 0, error_count: 0, warn_count: 0 };
    }),
  }));
}

export async function getActiveTenantServices(
  since: Date
): Promise<Array<{ tenant_id: string; service: string }>> {
  const result = await getPool().query(
    `SELECT DISTINCT tenant_id, service
     FROM events
     WHERE timestamp >= $1
     ORDER BY tenant_id, service`,
    [since.toISOString()]
  );
  return result.rows;
}

export async function getDistinctServices(tenant_id: string): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT DISTINCT service FROM events WHERE tenant_id = $1 ORDER BY service",
    [tenant_id]
  );
  return result.rows.map((r) => r.service);
}

export async function countEvents(tenant_id: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT COUNT(*) AS n FROM events WHERE tenant_id = $1",
    [tenant_id]
  );
  return parseInt(result.rows[0].n, 10);
}
