import { z } from "zod";
import { getGithubChangeContext } from "../../storage/github.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  since: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
  repo: z.string().min(3).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  if (new Date(input.since) > new Date(input.until)) throw new Error("since must be before until");
  const context = await getGithubChangeContext({
    tenantId: input.tenant_id,
    since: input.since,
    until: input.until,
    repo: input.repo,
    limit: input.limit,
  });
  return {
    summary: `Found ${context.deployments.length} deployment(s) and ${context.commits.length} commit(s) in the change window.`,
    data: { ...context, since: input.since, until: input.until, repo: input.repo ?? null },
    visualization_hint: context.deployments.length + context.commits.length > 0 ? "table" : "none",
  };
}

export const getChangeContextTool: Tool<Input> = {
  name: "get_change_context",
  description: "Find durable GitHub deployments and commits in a time window to correlate changes with an incident.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      since: { type: "string", description: "Inclusive ISO-8601 window start" },
      until: { type: "string", description: "Inclusive ISO-8601 window end" },
      repo: { type: "string", description: "Optional owner/repository filter" },
      limit: { type: "number", description: "Maximum commits and deployments each (1-100)" },
    },
    required: ["tenant_id", "since", "until"],
  },
  handler,
};
