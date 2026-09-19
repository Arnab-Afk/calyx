import { z } from "zod";
import { getDistinctServices } from "../../storage/events.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const services = await getDistinctServices(input.tenant_id);

  if (services.length === 0) {
    return {
      summary:
        "No services have sent logs for this tenant yet. Ingest at least one log event, then try again.",
      data: { services: [], count: 0, has_data: false },
      visualization_hint: "none",
    };
  }

  return {
    summary: `${services.length} service(s) have sent logs: ${services.join(", ")}.`,
    data: { services, count: services.length, has_data: true },
    visualization_hint: "table",
  };
}

export const listServicesTool: Tool<Input> = {
  name: "list_services",
  description:
    "List the services that have sent log events for this tenant. Use this before filtering other tools when service names are unknown.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
    },
    required: ["tenant_id"],
  },
  handler,
};
