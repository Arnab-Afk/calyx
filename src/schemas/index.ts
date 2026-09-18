import { z } from "zod";

// ─── Event ────────────────────────────────────────────────────────────────────

export const EventLevel = z.enum(["debug", "info", "warn", "error", "fatal"]);
export type EventLevel = z.infer<typeof EventLevel>;

export const EventSchema = z.object({
  tenant_id: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  service: z.string().min(1),
  level: EventLevel,
  message: z.string().min(1),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  attributes: z.record(z.unknown()).default({}),
});
export type Event = z.infer<typeof EventSchema>;

// Stored event — Event + DB-assigned id and ingested_at
export type StoredEvent = Event & {
  id: string;
  ingested_at: string;
};

// ─── Anomaly ──────────────────────────────────────────────────────────────────

export const AnomalyType = z.enum([
  "error_spike",
  "latency_degradation",
  "silent_failure",
  "cost_spike",
]);
export type AnomalyType = z.infer<typeof AnomalyType>;

export const AnomalySeverity = z.enum(["low", "medium", "high", "critical"]);
export type AnomalySeverity = z.infer<typeof AnomalySeverity>;

export const AnomalySchema = z.object({
  type: AnomalyType,
  severity: AnomalySeverity,
  tenant_id: z.string(),
  service: z.string(),
  detected_at: z.string().datetime({ offset: true }),
  evidence: z.object({
    description: z.string(),
    metric_value: z.number().optional(),
    baseline_value: z.number().optional(),
    sample_event_ids: z.array(z.string()).default([]),
  }),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

// ─── Alert ────────────────────────────────────────────────────────────────────

export const AlertSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  severity: AnomalySeverity,
  impact: z.string(),
  root_cause: z.string(),
  recommended_action: z.string(),
  anomaly: AnomalySchema,
  created_at: z.string().datetime({ offset: true }),
});
export type Alert = z.infer<typeof AlertSchema>;

// ─── Tool ─────────────────────────────────────────────────────────────────────

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  summary: string;
  data: unknown;
  visualization_hint?: "table" | "timeseries" | "bar" | "none";
}

export interface ToolJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface Tool<I extends ToolInput = ToolInput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  // Explicit JSON Schema for the Anthropic API — keep in sync with inputSchema
  inputJsonSchema: ToolJsonSchema;
  handler: (input: I) => Promise<ToolOutput>;
}

// Converts a Tool to the shape the Anthropic Messages API expects
export function toApiTool(tool: Tool): {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
} {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputJsonSchema,
  };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export const ApprovalTier = z.enum(["0", "1", "2"]);
export type ApprovalTier = z.infer<typeof ApprovalTier>;

export interface ActionResult {
  success: boolean;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface Action {
  name: string;
  description: string;
  defaultTier: ApprovalTier;
  reversible: boolean;
  dry_run: (params: unknown) => Promise<ActionResult>;
  execute: (params: unknown) => Promise<ActionResult>;
  undo?: (params: unknown) => Promise<ActionResult>;
}
