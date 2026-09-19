import { z } from "zod";
import { listIncidents } from "../../storage/incidents.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  status: z.enum(["open", "investigating", "resolved"]).optional(),
  service: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const incidents = await listIncidents(input.tenant_id, input);
  return {
    summary:
      incidents.length === 0
        ? "No durable incidents matched the requested filters."
        : `Found ${incidents.length} incident(s): ${incidents.map((incident) => incident.title).join(", ")}.`,
    data: { incidents, count: incidents.length },
    visualization_hint: incidents.length > 0 ? "table" : "none",
  };
}

export const listIncidentsTool: Tool<Input> = {
  name: "list_incidents",
  description:
    "List durable Calyx incidents for the authenticated tenant, optionally filtered by status or service.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      status: {
        type: "string",
        enum: ["open", "investigating", "resolved"],
        description: "Optional incident status",
      },
      service: { type: "string", description: "Optional service filter" },
      limit: { type: "number", description: "Maximum incidents (1-100, default 20)" },
    },
    required: ["tenant_id"],
  },
  handler,
};
