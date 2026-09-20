import { z } from "zod";
import type { Tool, ToolOutput } from "../../schemas/index.js";
import { runAgent } from "../loop.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  question: z.string().trim().min(1).max(4000),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const response = await runAgent(
    input.tenant_id,
    input.question,
    undefined,
    "Separate observed evidence, correlations, and hypotheses. Never claim an unverified hypothesis as root cause.",
    4096,
    { excludeTools: ["ask", "propose_remediation"] },
  );
  const chartableCall = [...response.toolCallsMade]
    .reverse()
    .find(
      (call) =>
        call.output?.visualization_hint &&
        call.output.visualization_hint !== "none",
    );

  return {
    summary: response.answer,
    data: {
      answer: response.answer,
      toolCalls: response.toolCallsMade.map((call) => ({
        toolName: call.toolName,
        input: call.input,
        ok: call.result.ok,
        summary: call.result.summary,
        error: call.result.error,
      })),
      chartHint: chartableCall?.output?.visualization_hint ?? null,
      chartData: chartableCall?.output?.data ?? null,
      turns: response.turns,
      stopReason: response.stopReason,
    },
    visualization_hint: chartableCall?.output?.visualization_hint ?? "none",
  };
}

export const askTool: Tool<Input> = {
  name: "ask",
  description:
    "Ask the Calyx investigation agent a natural-language question. It uses the same evidence tools as web chat, Slack, and CLI and returns the evidence tool calls it made.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      question: {
        type: "string",
        description:
          "Observability or incident question to investigate (maximum 4000 characters)",
      },
    },
    required: ["tenant_id", "question"],
  },
  handler,
};
