import { z } from "zod";
import { searchIncidents } from "../../storage/incidents.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  keywords: z.array(z.string().trim().min(1)).min(1).max(10),
  limit: z.number().int().min(1).max(100).default(20),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const incidents = await searchIncidents(input.tenant_id, input.keywords, input.limit);
  return {
    summary:
      incidents.length === 0
        ? `No durable incidents matched: ${input.keywords.join(", ")}.`
        : `Found ${incidents.length} durable incident(s) matching: ${input.keywords.join(", ")}.`,
    data: { incidents, count: incidents.length },
    visualization_hint: incidents.length > 0 ? "table" : "none",
  };
}

export const searchIncidentsTool: Tool<Input> = {
  name: "search_incidents",
  description:
    "Search durable incidents by title, summary, or service. Prefer this over the deprecated search_past_incidents raw-log compatibility tool.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Incident title, summary, or service terms (1-10)",
      },
      limit: { type: "number", description: "Maximum incidents (1-100, default 20)" },
    },
    required: ["tenant_id", "keywords"],
  },
  handler,
};
