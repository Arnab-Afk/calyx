import { z } from "zod";
import { queryEventsAfter } from "../../storage/events.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  cursor: z.string().optional(),
  service: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  wait_ms: z.number().int().min(0).max(25_000).default(10_000),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const deadline = Date.now() + input.wait_ms;

  do {
    const result = await queryEventsAfter({
      tenant_id: input.tenant_id,
      cursor: input.cursor,
      service: input.service,
      level: input.level,
      limit: input.limit,
    });

    if (result.events.length > 0) {
      return {
        summary: `Received ${result.events.length} new log event(s). Continue with cursor "${result.next_cursor}".`,
        data: result,
        visualization_hint: "table",
      };
    }

    if (Date.now() >= deadline) {
      return {
        summary: "No new log events arrived during the wait window.",
        data: result,
        visualization_hint: "table",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())));
  } while (true);
}

export const tailLogsTool: Tool<Input> = {
  name: "tail_logs",
  description:
    "Wait for and return newly ingested log events. Call again with next_cursor to continuously follow live logs without duplicates.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      cursor: { type: "string", description: "Opaque next_cursor returned by the previous call" },
      service: { type: "string", description: "Optional service filter" },
      level: {
        type: "string",
        enum: ["debug", "info", "warn", "error", "fatal"],
        description: "Optional severity filter",
      },
      limit: { type: "number", description: "Maximum events per call (1-100)" },
      wait_ms: { type: "number", description: "Long-poll duration in milliseconds (0-25000)" },
    },
    required: ["tenant_id"],
  },
  handler,
};
