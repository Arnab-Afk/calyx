import { z } from "zod";
import { getDistinctServices, queryEvents } from "../../storage/events.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  service: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const rows = await queryEvents({
    tenant_id: input.tenant_id,
    service: input.service,
    level: input.level,
    from: input.from,
    to: input.to,
    limit: input.limit,
    offset: input.offset,
  });

  if (rows.length === 0) {
    const services = await getDistinctServices(input.tenant_id);
    let summary: string;
    if (services.length === 0) {
      summary =
        "No log data is available for this tenant yet. Ingest at least one log event, then try again.";
    } else if (input.service && !services.includes(input.service)) {
      summary = `No log events matched service "${input.service}". Known services: ${services.join(", ")}.`;
    } else {
      summary = `No log events matched the query. Known services: ${services.join(", ")}. Try a wider time range or fewer filters.`;
    }
    return {
      summary,
      data: [],
      visualization_hint: "table",
    };
  }

  const levelCounts: Record<string, number> = {};
  for (const r of rows) {
    levelCounts[r.level] = (levelCounts[r.level] ?? 0) + 1;
  }

  const summary = [
    `Found ${rows.length} event(s)`,
    input.service ? `for service "${input.service}"` : "",
    input.level ? `at level "${input.level}"` : "",
    `(${Object.entries(levelCounts)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")})`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    summary,
    data: rows,
    visualization_hint: "table",
  };
}

export const queryLogsTool: Tool<Input> = {
  name: "query_logs",
  description:
    "Query log events for a tenant. Supports filtering by service, severity level, and time range. " +
    "Returns a list of events ordered by timestamp descending. Use this to investigate errors, " +
    "check recent activity, or find specific log entries.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      service: { type: "string", description: "Filter by service name" },
      level: {
        type: "string",
        enum: ["debug", "info", "warn", "error", "fatal"],
        description: "Filter by log level",
      },
      from: {
        type: "string",
        description: "Start of time range (ISO 8601 with offset)",
      },
      to: {
        type: "string",
        description: "End of time range (ISO 8601 with offset)",
      },
      limit: {
        type: "number",
        description: "Max results to return (1–100, default 20)",
      },
      offset: {
        type: "number",
        description: "Pagination offset (default 0)",
      },
    },
    required: ["tenant_id"],
  },
  handler,
};
