import { z } from "zod";
import { getDistinctServices } from "../../storage/events.js";
import { listProjectServiceMap } from "../../storage/projects.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const [services, projects] = await Promise.all([
    getDistinctServices(input.tenant_id),
    listProjectServiceMap(input.tenant_id),
  ]);

  if (services.length === 0 && projects.length === 0) {
    return {
      summary:
        "No services have sent logs for this tenant yet. Ingest at least one log event, then try again.",
      data: { services: [], projects: [], count: 0, has_data: false },
      visualization_hint: "none",
    };
  }

  const projectLines = projects
    .map((p) => {
      const svc =
        p.services.length > 0 ? p.services.join(", ") : "(no sources yet)";
      return `${p.slug} → [${svc}]`;
    })
    .join("; ");

  return {
    summary:
      `${services.length} service(s) with events: ${services.join(", ") || "(none)"}.` +
      (projects.length
        ? ` Project→service map: ${projectLines}. When the user names a project (e.g. app1), query its mapped services — do not treat the project slug as a log service name.`
        : ""),
    data: {
      services,
      projects,
      count: services.length,
      has_data: services.length > 0,
    },
    visualization_hint: "table",
  };
}

export const listServicesTool: Tool<Input> = {
  name: "list_services",
  description:
    "List services that have sent log events, plus each Calyx project's configured log-source service names. " +
    "Project slugs (e.g. app1) are NOT log service names — resolve them via this project's services list " +
    "(e.g. app1 → prohuman-api) before calling query_logs or get_service_stats.",
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
