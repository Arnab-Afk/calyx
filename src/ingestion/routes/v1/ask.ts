// POST /v1/ask — HTTP interface to the Calyx agent, used by calyx-ui and any external client.
// Requires X-Tenant-ID header. Returns { answer, toolCallsMade, chartType, chartData }.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runAgent } from "../../../agent/index.js";
import { autoChartType } from "../../../slack/charts/index.js";

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().optional(),
});

export async function askRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/ask", async (req, reply) => {
    const tenantId = (req.headers["x-tenant-id"] as string) ?? "default";

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: parsed.error.flatten() });
    }

    const { message } = parsed.data;
    const response = await runAgent(tenantId, message);

    // Find the last chartable tool output
    const chartableCall = [...response.toolCallsMade]
      .reverse()
      .find((c) => c.output?.visualization_hint && c.output.visualization_hint !== "none");

    let chartType: string | null = null;
    let chartData: unknown = null;

    if (chartableCall?.output) {
      chartType = autoChartType(
        chartableCall.output.visualization_hint!,
        chartableCall.output.data
      );
      chartData = chartableCall.output.data;
    }

    return reply.status(200).send({
      answer: response.answer,
      toolCallsMade: response.toolCallsMade.map((c) => ({
        toolName: c.toolName,
        summary: c.result.summary,
      })),
      chartType,
      chartData,
      turns: response.turns,
    });
  });
}
