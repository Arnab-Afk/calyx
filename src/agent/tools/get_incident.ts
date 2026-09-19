import { z } from "zod";
import { getIncident } from "../../storage/incidents.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  incident_id: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const context = await getIncident(input.tenant_id, input.incident_id);
  if (!context) {
    return {
      summary: `Incident "${input.incident_id}" was not found for this tenant.`,
      data: { incident: null, alerts: [], evidence: [] },
      visualization_hint: "none",
    };
  }

  return {
    summary:
      `${context.incident.severity} ${context.incident.status} incident ` +
      `"${context.incident.title}" with ${context.alerts.length} alert(s) and ` +
      `${context.evidence.length} evidence record(s).`,
    data: context,
    visualization_hint: "table",
  };
}

export const getIncidentTool: Tool<Input> = {
  name: "get_incident",
  description:
    "Retrieve one durable incident with its linked detector alerts and immutable evidence snapshots.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      incident_id: { type: "string", description: "Calyx incident UUID" },
    },
    required: ["tenant_id", "incident_id"],
  },
  handler,
};
