import Anthropic from "@anthropic-ai/sdk";
import { getAllTools, executeTool } from "./registry.js";
import { toApiTool } from "../schemas/index.js";
import type { ToolInput, ToolOutput } from "../schemas/index.js";
import { runNvidiaAgent } from "./nvidia.js";

const MAX_TURNS = 10;
const SLACK_ONCALL_MODEL = "claude-opus-5";

export type AgentProvider = "anthropic" | "nvidia";

export interface AgentRunOptions {
  /** Slack always passes "anthropic". CLI may pass "nvidia" as a spare. */
  provider?: AgentProvider;
  model?: string;
  /** Prevent wrapper tools such as `ask` from recursively invoking themselves. */
  excludeTools?: string[];
  /** Server-derived identity attached to mutation tool calls. */
  actorId?: string;
}

function looksLikeNvidiaModel(model: string): boolean {
  return (
    /^(nvidia|meta|mistralai|moonshotai)\//.test(model) ||
    /nemotron/i.test(model)
  );
}

export function agentProvider(override?: AgentProvider): AgentProvider {
  if (override === "nvidia" || override === "anthropic") return override;
  const explicit = process.env.CALYX_PROVIDER?.toLowerCase();
  if (explicit === "nvidia" || explicit === "anthropic") return explicit;
  const model = process.env.CALYX_MODEL ?? "";
  if (looksLikeNvidiaModel(model)) return "nvidia";
  return "anthropic";
}

function anthropicModel(override?: string): string {
  if (override && !looksLikeNvidiaModel(override)) return override;
  const model = process.env.CALYX_MODEL ?? SLACK_ONCALL_MODEL;
  if (looksLikeNvidiaModel(model)) return SLACK_ONCALL_MODEL;
  return model;
}

export interface ToolCallRecord {
  toolName: string;
  input: ToolInput;
  result: { ok: boolean; summary?: string; error?: string };
  output?: ToolOutput;
}

export interface AgentResponse {
  answer: string;
  toolCallsMade: ToolCallRecord[];
  stopReason: string;
  turns: number;
}

export async function runAgent(
  tenantId: string,
  userMessage: string,
  systemPrompt?: string,
  systemSuffix?: string,
  maxTokens = 4096,
  options?: AgentRunOptions,
): Promise<AgentResponse> {
  if (agentProvider(options?.provider) === "nvidia") {
    return runNvidiaAgent(
      tenantId,
      userMessage,
      systemPrompt,
      systemSuffix,
      maxTokens,
      options?.excludeTools,
      options?.actorId,
    );
  }

  const model = anthropicModel(options?.model);
  const useAdaptiveThinking = !/haiku/i.test(model);
  const client = new Anthropic();
  const excludedTools = new Set(["ask", ...(options?.excludeTools ?? [])]);
  const tools = getAllTools()
    .filter((tool) => !excludedTools.has(tool.name))
    .map(toApiTool);

  const base =
    systemPrompt ??
    `You are Calyx, an AI observability assistant. You help engineering teams understand what is
happening in their production systems by analyzing logs and metrics. The tenant you are
assisting has tenant_id: "${tenantId}". Always use this tenant_id when calling tools.

When you cannot find data, say so clearly rather than guessing. When you do find data,
cite specific numbers and service names from the tool results. Never call a mutation or
remediation proposal tool unless the user explicitly asked you to prepare that action.`;

  const system = systemSuffix ? `${base}\n${systemSuffix}` : base;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const toolCallsMade: ToolCallRecord[] = [];
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(useAdaptiveThinking
        ? { thinking: { type: "adaptive" as const } }
        : {}),
      system,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const answer = extractText(response.content);
      return { answer, toolCallsMade, stopReason: "end_turn", turns };
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const input = {
            ...(block.input as ToolInput),
            tenant_id: tenantId,
            ...(options?.actorId && { actor_id: options.actorId }),
          };
          const result = await executeTool(block.name, input);
          const record: ToolCallRecord = {
            toolName: block.name,
            input,
            result: result.ok
              ? { ok: true, summary: result.output.summary }
              : { ok: false, error: result.error },
            output: result.ok ? result.output : undefined,
          };
          toolCallsMade.push(record);

          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result.ok
              ? JSON.stringify(result.output)
              : JSON.stringify({ error: result.error }),
            is_error: !result.ok,
          };
        }),
      );

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Any other stop reason (refusal, max_tokens, etc.) — return what we have
    const answer = extractText(response.content);
    return {
      answer,
      toolCallsMade,
      stopReason: response.stop_reason ?? "unknown",
      turns,
    };
  }

  return {
    answer: "Agent reached maximum turns without completing.",
    toolCallsMade,
    stopReason: "max_turns",
    turns,
  };
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
