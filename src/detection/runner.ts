// Detection runner: fetches time-windowed stats and records detected anomalies.
// Notification dispatch remains separate from durable alert-context persistence.

import pg from "pg";
import type { Anomaly } from "../schemas/index.js";
import type { Detector, TimeWindow } from "./types.js";
import { errorRateDetector } from "./detectors/error-rate.js";
import { recordAlertContext, type AlertContext } from "../storage/alerts.js";

const WINDOW_MINUTES = 5;
const BASELINE_WINDOWS = 12; // 12 × 5min = 1 hour of baseline

const DETECTORS: Detector[] = [errorRateDetector];

// Fetch event counts for a time window from the DB
async function fetchWindow(
  pool: pg.Pool,
  tenantId: string,
  service: string,
  from: Date,
  to: Date
): Promise<TimeWindow> {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE level IN ('error','fatal')) AS errors
     FROM events
     WHERE tenant_id = $1 AND service = $2
       AND timestamp >= $3 AND timestamp < $4`,
    [tenantId, service, from.toISOString(), to.toISOString()]
  );
  const total = parseInt(result.rows[0].total, 10);
  const errors = parseInt(result.rows[0].errors, 10);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    tenant_id: tenantId,
    service,
    event_count: total,
    error_count: errors,
    error_rate: total > 0 ? (errors / total) * 100 : 0,
  };
}

async function detectAnomalies(
  pool: pg.Pool,
  tenantId: string,
  service: string,
  now: Date
): Promise<Anomaly[]> {
  const windowMs = WINDOW_MINUTES * 60 * 1000;

  const current = await fetchWindow(
    pool,
    tenantId,
    service,
    new Date(now.getTime() - windowMs),
    now
  );

  const baselinePromises = Array.from({ length: BASELINE_WINDOWS }, (_, i) => {
    const windowEnd = new Date(now.getTime() - (i + 1) * windowMs);
    const windowStart = new Date(windowEnd.getTime() - windowMs);
    return fetchWindow(pool, tenantId, service, windowStart, windowEnd);
  });

  const baseline = await Promise.all(baselinePromises);

  const anomalies: Anomaly[] = [];
  for (const detect of DETECTORS) {
    anomalies.push(...detect(current, baseline));
  }

  return anomalies;
}

export interface DetectedAlert {
  anomaly: Anomaly;
  alert: AlertContext;
}

export async function detectAndRecordForService(
  pool: pg.Pool,
  tenantId: string,
  service: string,
  now: Date = new Date()
): Promise<DetectedAlert[]> {
  const anomalies = await detectAnomalies(pool, tenantId, service, now);
  return Promise.all(
    anomalies.map(async (anomaly) => ({
      anomaly,
      alert: await recordAlertContext(pool, anomaly),
    }))
  );
}

// Backwards-compatible detector entry point used by existing callers.
export async function detectForService(
  pool: pg.Pool,
  tenantId: string,
  service: string,
  now: Date = new Date()
): Promise<Anomaly[]> {
  const detected = await detectAndRecordForService(pool, tenantId, service, now);
  return detected.map(({ anomaly }) => anomaly);
}

// Dedup guard: track last-alerted timestamp per (tenant, service, type)
// to prevent re-firing on persisting anomalies every cycle.
const lastAlerted = new Map<string, number>();

export function shouldAlert(anomaly: Anomaly, minIntervalMs = 5 * 60 * 1000): boolean {
  const key = `${anomaly.tenant_id}:${anomaly.service}:${anomaly.type}`;
  const last = lastAlerted.get(key);
  const now = Date.now();
  if (last && now - last < minIntervalMs) return false;
  lastAlerted.set(key, now);
  return true;
}

export function resetAlertGuard(): void {
  lastAlerted.clear();
}
