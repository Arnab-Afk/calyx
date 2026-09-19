import { z } from "zod";
import {
  getAlertContext,
  getAlertEvidenceEvents,
} from "../../storage/alerts.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  alert_id: z.string().uuid(),
  event_limit: z.number().int().min(1).max(50).default(20),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const alert = await getAlertContext(input.tenant_id, input.alert_id);
  if (!alert) {
    return {
      summary: `Alert "${input.alert_id}" was not found for this tenant.`,
      data: { alert: null, evidence_events: [] },
      visualization_hint: "none",
    };
  }

  const evidenceEvents = await getAlertEvidenceEvents(
    input.tenant_id,
    alert,
    input.event_limit
  );
  return {
    summary:
      `${alert.severity} ${alert.type} alert for service "${alert.service}" ` +
      `(${alert.occurrence_count} occurrence(s)); found ${evidenceEvents.length} nearby error event(s).`,
    data: { alert, evidence_events: evidenceEvents },
    visualization_hint: "table",
  };
}

export const getAlertContextTool: Tool<Input> = {
  name: "get_alert_context",
  description:
    "Retrieve one durable Calyx alert by ID with nearby error evidence. Use an alert ID from a Calyx web or Slack notification to continue the investigation in an IDE.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      alert_id: { type: "string", description: "Calyx alert UUID" },
      event_limit: {
        type: "number",
        description: "Maximum nearby error events to return (1-50, default 20)",
      },
    },
    required: ["tenant_id", "alert_id"],
  },
  handler,
};
