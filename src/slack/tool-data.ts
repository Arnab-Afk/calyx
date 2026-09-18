import type { ServiceStats, StoredEvent } from "../storage/events.js";
import type { StatusBarService } from "./charts/text-status-bar.js";

/** get_service_stats returns `{ stats, total_events, ... }`, not a bare array. */
export function unwrapServiceStats(data: unknown): ServiceStats[] {
  if (Array.isArray(data)) {
    return data.filter(isServiceStats);
  }
  if (data && typeof data === "object" && Array.isArray((data as { stats?: unknown }).stats)) {
    return ((data as { stats: unknown[] }).stats).filter(isServiceStats);
  }
  return [];
}

function isServiceStats(row: unknown): row is ServiceStats {
  return (
    !!row &&
    typeof row === "object" &&
    typeof (row as ServiceStats).service === "string" &&
    typeof (row as ServiceStats).error_rate === "number"
  );
}

export function toStatusBarServices(stats: ServiceStats[]): StatusBarService[] {
  return stats.map((s) => ({
    service: s.service,
    errorRate: s.error_rate,
    total: s.total,
    errorCount: s.error_count,
  }));
}

export function asLogEvents(data: unknown): StoredEvent[] {
  if (Array.isArray(data)) {
    return data.filter(
      (row): row is StoredEvent =>
        !!row && typeof row === "object" && "message" in row && "level" in row
    );
  }
  return [];
}
