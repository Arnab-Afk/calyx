import { z } from "zod";
import {
  getServiceStats,
  getDistinctServices,
  getServiceDailyHealth,
} from "../../storage/events.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  service: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const stats = await getServiceStats(input.tenant_id, {
    service: input.service,
    from: input.from,
    to: input.to,
  });

  if (stats.length === 0) {
    const services = await getDistinctServices(input.tenant_id);
    const hint =
      services.length > 0
        ? ` Known services: ${services.join(", ")}.`
        : " No services have logged events for this tenant.";
    return {
      summary: `No stats found for the given filters.${hint}`,
      data: { stats: [], known_services: services },
      visualization_hint: "none",
    };
  }

  const totalEvents = stats.reduce((s, r) => s + r.total, 0);
  const totalErrors = stats.reduce((s, r) => s + r.error_count, 0);
  const overallErrorRate =
    totalEvents > 0 ? Math.round((totalErrors / totalEvents) * 10000) / 100 : 0;

  const summary = input.service
    ? `Service "${input.service}": ${stats[0].total} events, ` +
      `${stats[0].error_count} errors (${stats[0].error_rate}% error rate).`
    : `${stats.length} service(s), ${totalEvents} total events, ` +
      `${totalErrors} errors overall (${overallErrorRate}% error rate). ` +
      `Services: ${stats.map((s) => s.service).join(", ")}.`;

  const daily = await getServiceDailyHealth(input.tenant_id, {
    service: input.service,
    days: 7,
  });

  return {
    summary,
    data: {
      stats,
      total_events: totalEvents,
      overall_error_rate: overallErrorRate,
      daily,
    },
    visualization_hint: "bar",
  };
}

export const getServiceStatsTool: Tool<Input> = {
  name: "get_service_stats",
  description:
    "Get aggregate statistics for one or all services: total event counts, counts per log level, " +
    "error rate, and time range of activity. Use this to understand system health at a glance, " +
    "compare services, or check if a specific service has elevated error rates.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      service: {
        type: "string",
        description: "Service name (omit for all services)",
      },
      from: {
        type: "string",
        description: "Start of time window (ISO 8601 with offset)",
      },
      to: {
        type: "string",
        description: "End of time window (ISO 8601 with offset)",
      },
    },
    required: ["tenant_id"],
  },
  handler,
};
