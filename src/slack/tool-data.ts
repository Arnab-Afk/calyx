import type { ServiceDailyHealth, ServiceStats, StoredEvent } from "../storage/events.js";
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

export function unwrapDailyHealth(data: unknown): ServiceDailyHealth[] {
  if (!data || typeof data !== "object") return [];
  const daily = (data as { daily?: unknown }).daily;
  if (!Array.isArray(daily)) return [];
  return daily.filter(
    (row): row is ServiceDailyHealth =>
      !!row && typeof row === "object" && typeof (row as ServiceDailyHealth).service === "string" && Array.isArray((row as ServiceDailyHealth).days)
  );
}

export function unwrapTotals(data: unknown): { totalEvents: number; overallErrorRate: number } {
  if (!data || typeof data !== "object") return { totalEvents: 0, overallErrorRate: 0 };
  const d = data as { total_events?: unknown; overall_error_rate?: unknown };
  const stats = unwrapServiceStats(data);
  const totalEvents =
    typeof d.total_events === "number"
      ? d.total_events
      : stats.reduce((n, s) => n + s.total, 0);
  const overallErrorRate =
    typeof d.overall_error_rate === "number"
      ? d.overall_error_rate
      : totalEvents > 0
        ? (stats.reduce((n, s) => n + s.error_count, 0) / totalEvents) * 100
        : 0;
  return { totalEvents, overallErrorRate };
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
