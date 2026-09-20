import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runAgent } from "../../../agent/index.js";
import { pickChartFromToolCalls } from "../../../slack/pick-chart.js";
import {
  authorizeInternal,
  resolveWorkspaceTenant,
} from "../../internal-auth.js";

const Body = z.object({
  message: z.string().trim().min(1).max(4000),
  threadId: z.string().max(200).nullish(),
  actorId: z.string().startsWith("web:").max(500).optional(),
});

export async function internalAskRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/internal/workspaces/:workspaceId/ask",
    async (request, reply) => {
      if (!authorizeInternal(request, reply)) return;
      const { workspaceId } = request.params as { workspaceId: string };
      const parsed = Body.safeParse(request.body);
      if (!parsed.success)
        return reply.status(422).send({ error: parsed.error.flatten() });
      const tenantId = await resolveWorkspaceTenant(workspaceId, reply);
      if (!tenantId) return;

      const investigationNudge = `
For this web ask:
- If the user names a project (e.g. app1), call list_services and use that project's mapped
  log-source services (e.g. prohuman-api) — do not filter tools with service=<project slug>
  unless that slug also appears as a real emitting service with non-synthetic traffic.
- For errors/spikes/uptime/health/"what changed", use query_logs + get_service_stats on the
  mapped services, plus get_change_context for the window.
- Answer style: lead with the live service (e.g. "prohuman-api is running — N events, X% errors").
  One short clause for project→service mapping is enough. Do NOT write long "Naming note"
  digressions about synthetic/smoke services. Keep the prose under ~8 short lines; cards show detail.
`;

      const response = await runAgent(
        tenantId,
        parsed.data.message,
        undefined,
        investigationNudge,
        4096,
        {
          actorId: parsed.data.actorId,
        },
      );
      const picked = pickChartFromToolCalls(response.toolCallsMade);

      return {
        answer: response.answer,
        toolCallsMade: response.toolCallsMade.map((call) => ({
          toolName: call.toolName,
          summary: call.result.summary,
        })),
        chartType: picked?.chartType ?? null,
        chartData: picked?.chartData ?? null,
        turns: response.turns,
      };
    },
  );
}
