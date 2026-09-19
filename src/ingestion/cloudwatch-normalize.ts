import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { Event } from "../schemas/index.js";

const Payload = z.object({
  messageType: z.enum(["DATA_MESSAGE", "CONTROL_MESSAGE"]),
  owner: z.string(),
  logGroup: z.string(),
  logStream: z.string(),
  subscriptionFilters: z.array(z.string()).default([]),
  logEvents: z
    .array(z.object({ id: z.string(), timestamp: z.number(), message: z.string() }))
    .max(10_000)
    .default([]),
});

function level(message: string): Event["level"] {
  try {
    const parsed = JSON.parse(message) as { level?: string; severity?: string };
    const value = (parsed.level ?? parsed.severity ?? "").toLowerCase();
    if (["debug", "info", "warn", "error", "fatal"].includes(value)) return value as Event["level"];
  } catch { /* plain-text log */ }
  if (/\bfatal\b/i.test(message)) return "fatal";
  if (/\berror|exception|failed\b/i.test(message)) return "error";
  if (/\bwarn(?:ing)?\b/i.test(message)) return "warn";
  if (/\bdebug\b/i.test(message)) return "debug";
  return "info";
}

export function normalizeCloudWatchEnvelope(data: string, context: {
  tenantId: string;
  projectId: string;
  sourceId: string;
  service: string;
  role: string;
}): Event[] {
  const compressed = Buffer.from(data, "base64");
  if (compressed.length > 1_048_576) throw new Error("CloudWatch payload exceeds 1 MiB compressed");
  const json = gunzipSync(compressed, { maxOutputLength: 5 * 1024 * 1024 }).toString("utf8");
  const payload = Payload.parse(JSON.parse(json));
  if (payload.messageType === "CONTROL_MESSAGE") return [];
  return payload.logEvents.map((entry) => ({
    tenant_id: context.tenantId,
    timestamp: new Date(entry.timestamp).toISOString(),
    service: context.service,
    level: level(entry.message),
    message: entry.message || "(empty CloudWatch log event)",
    attributes: {
      source: "cloudwatch_logs",
      source_id: context.sourceId,
      project_id: context.projectId,
      source_role: context.role,
      aws_account_id: payload.owner,
      cloudwatch_log_group: payload.logGroup,
      cloudwatch_log_stream: payload.logStream,
      cloudwatch_event_id: entry.id,
      cloudwatch_subscription_filters: payload.subscriptionFilters,
    },
  }));
}
