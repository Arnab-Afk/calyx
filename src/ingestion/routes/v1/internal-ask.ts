import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runAgent } from "../../../agent/index.js";
import { autoChartType } from "../../../slack/charts/index.js";
import {
  authorizeInternal,
  resolveWorkspaceTenant,
} from "../../internal-auth.js";

const Body = z.object({
  message: z.string().trim().min(1).max(4000),
  threadId: z.string().max(200).optional(),
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

      const response = await runAgent(
        tenantId,
        parsed.data.message,
        undefined,
        undefined,
        4096,
        {
          actorId: parsed.data.actorId,
        },
      );
      const remediation = [...response.toolCallsMade]
        .reverse()
        .find(
          (call) => call.toolName === "propose_remediation" && call.result.ok,
        );
      const chartable = [...response.toolCallsMade]
        .reverse()
        .find(
          (call) =>
            call.output?.visualization_hint &&
            call.output.visualization_hint !== "none",
        );
      const chartType = remediation
        ? "approval-card"
        : chartable?.output
          ? autoChartType(
              chartable.output.visualization_hint!,
              chartable.output.data,
            )
          : null;

      return {
        answer: response.answer,
        toolCallsMade: response.toolCallsMade.map((call) => ({
          toolName: call.toolName,
          summary: call.result.summary,
        })),
        chartType,
        chartData: remediation?.output?.data ?? chartable?.output?.data ?? null,
        turns: response.turns,
      };
    },
  );
}
