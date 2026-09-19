import type { Event, EventLevel } from "../schemas/index.js";

/** Subset of Vercel Log Drain fields we care about. */
export interface VercelLogEntry {
  id?: string;
  deploymentId?: string;
  source?: string;
  host?: string;
  timestamp?: number;
  projectId?: string;
  level?: string;
  message?: string;
  buildId?: string;
  entrypoint?: string;
  path?: string;
  type?: string;
  statusCode?: number;
  requestId?: string;
  environment?: string;
  branch?: string;
  projectName?: string;
  executionRegion?: string;
  traceId?: string;
  spanId?: string;
  "trace.id"?: string;
  "span.id"?: string;
  proxy?: Record<string, unknown>;
}

function mapLevel(level: string | undefined): EventLevel {
  switch ((level ?? "info").toLowerCase()) {
    case "debug":
      return "debug";
    case "warning":
    case "warn":
      return "warn";
    case "error":
      return "error";
    case "fatal":
      return "fatal";
    default:
      return "info";
  }
}

function toIso(ts: number | undefined): string {
  if (typeof ts === "number" && Number.isFinite(ts)) {
    // Vercel sends ms epoch; tolerate seconds.
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

/** Parse JSON array or NDJSON body into log objects. */
export function parseVercelDrainBody(raw: string): VercelLogEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON array of log entries");
    }
    return parsed as VercelLogEntry[];
  }

  // Single JSON object
  if (trimmed.startsWith("{") && !trimmed.includes("\n")) {
    return [JSON.parse(trimmed) as VercelLogEntry];
  }

  // NDJSON (one object per line)
  const out: VercelLogEntry[] = [];
  for (const line of trimmed.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t) as VercelLogEntry);
  }
  return out;
}

export function vercelEntryToEvent(
  entry: VercelLogEntry,
  ctx: {
    tenantId: string;
    projectId: string;
    sourceId: string;
    service: string;
    role: string;
  }
): Event {
  const message =
    (entry.message && entry.message.trim()) ||
    [
      entry.source,
      entry.type,
      entry.path ?? entry.entrypoint,
      entry.statusCode != null ? `status=${entry.statusCode}` : null,
    ]
      .filter(Boolean)
      .join(" ") ||
    "vercel log";

  return {
    tenant_id: ctx.tenantId,
    timestamp: toIso(entry.timestamp),
    service: ctx.service,
    level: mapLevel(entry.level),
    message,
    trace_id: entry.traceId ?? entry["trace.id"],
    span_id: entry.spanId ?? entry["span.id"],
    attributes: {
      source: "vercel_drain",
      source_id: ctx.sourceId,
      project_id: ctx.projectId,
      source_role: ctx.role,
      vercel_log_id: entry.id,
      vercel_deployment_id: entry.deploymentId,
      vercel_project_id: entry.projectId,
      vercel_project_name: entry.projectName,
      vercel_source: entry.source,
      vercel_host: entry.host,
      vercel_path: entry.path,
      vercel_entrypoint: entry.entrypoint,
      vercel_type: entry.type,
      vercel_status_code: entry.statusCode,
      vercel_request_id: entry.requestId,
      vercel_environment: entry.environment,
      vercel_branch: entry.branch,
      vercel_region: entry.executionRegion,
      vercel_build_id: entry.buildId,
      ...(entry.proxy
        ? {
            vercel_proxy_method: entry.proxy.method,
            vercel_proxy_path: entry.proxy.path,
            vercel_proxy_status: entry.proxy.statusCode,
            vercel_cache: entry.proxy.vercelCache,
          }
        : {}),
    },
  };
}

export function normalizeVercelDrain(
  raw: string,
  ctx: {
    tenantId: string;
    projectId: string;
    sourceId: string;
    service: string;
    role: string;
  }
): Event[] {
  return parseVercelDrainBody(raw).map((e) => vercelEntryToEvent(e, ctx));
}
