import { z } from "zod";
import { searchByMessage } from "../../storage/events.js";
import type { Tool, ToolOutput, StoredEvent } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1).max(10),
  limit: z.number().int().min(1).max(50).default(10),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  // Search each keyword and merge, deduplicating by event id
  const seen = new Set<string>();
  const results: StoredEvent[] = [];

  for (const kw of input.keywords) {
    const rows = await searchByMessage(input.tenant_id, kw, input.limit);
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        results.push(row);
      }
    }
    if (results.length >= input.limit) break;
  }

  results.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const trimmed = results.slice(0, input.limit);

  if (trimmed.length === 0) {
    return {
      summary: `No past incidents found matching: ${input.keywords.join(", ")}.`,
      data: [],
      visualization_hint: "none",
    };
  }

  const byService: Record<string, number> = {};
  for (const e of trimmed) {
    byService[e.service] = (byService[e.service] ?? 0) + 1;
  }

  return {
    summary:
      `Found ${trimmed.length} past incident(s) matching keywords [${input.keywords.join(", ")}]. ` +
      `Affected services: ${Object.entries(byService)
        .map(([s, n]) => `${s} (${n})`)
        .join(", ")}.`,
    data: trimmed,
    visualization_hint: "table",
  };
}

export const searchPastIncidentsTool: Tool<Input> = {
  name: "search_past_incidents",
  description:
    "Deprecated compatibility tool: search historical raw log evidence by keyword. " +
    "Use search_incidents for durable incidents. This tool remains temporarily available so existing clients do not break.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Search terms to look for in event messages (1–10 keywords)",
      },
      limit: {
        type: "number",
        description: "Max results to return (1–50, default 10)",
      },
    },
    required: ["tenant_id", "keywords"],
  },
  handler,
};
