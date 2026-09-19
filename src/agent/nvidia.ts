import { getAllTools, executeTool } from "./registry.js";
import { toOpenAiTool } from "../schemas/index.js";
import type { ToolInput } from "../schemas/index.js";
import type { AgentResponse, ToolCallRecord } from "./loop.js";

const NVIDIA_BASE = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
function nvidiaModel(): string {
  const model = process.env.CALYX_MODEL;
  if (model && !/^claude|^haiku/i.test(model)) return model;
  return "nvidia/nemotron-3-super-120b-a12b";
}
const MAX_TURNS = 10;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatCompletion = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
  error?: { message?: string } | string;
};

function nvidiaKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");
  return key;
}

function thinkingEnabled(): boolean {
  return process.env.CALYX_NVIDIA_THINKING === "true";
}

function reasoningBudget(): number {
  const n = parseInt(process.env.CALYX_NVIDIA_REASONING_BUDGET ?? "1024", 10);
  return Number.isFinite(n) && n > 0 ? n : 1024;
}

function extractAnswer(
  message: { content?: string | null; reasoning_content?: string | null } | undefined,
  finish: string
): string {
  const content = (message?.content ?? "").trim();
  const reasoning = (message?.reasoning_content ?? "").trim();
  // Tiny max_tokens + thinking ON copies the trace into `content` (finish=length).
  if (
    finish === "length" &&
    reasoning &&
    (content === reasoning || content.startsWith(reasoning.slice(0, 40)))
  ) {
    return "";
  }
  return content;
}

async function chat(messages: ChatMessage[], maxTokens: number, excludedTools: Set<string>): Promise<ChatCompletion> {
  const thinking = thinkingEnabled();
  const budget = reasoningBudget();
  // Thinking tokens count against max_tokens; Slack's 400/800 will starve the answer.
  const tokenCap = thinking ? maxTokens + budget : maxTokens;

  const body: Record<string, unknown> = {
    model: nvidiaModel(),
    messages,
    max_tokens: tokenCap,
    temperature: 1,
    top_p: 0.95,
    tools: getAllTools().filter((tool) => !excludedTools.has(tool.name)).map(toOpenAiTool),
    tool_choice: "auto",
    chat_template_kwargs: { enable_thinking: thinking },
  };
  if (thinking) body.reasoning_budget = budget;

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nvidiaKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: ChatCompletion;
  try {
    parsed = JSON.parse(text) as ChatCompletion;
  } catch {
    throw new Error(`NVIDIA NIM returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = parsed.error;
    const msg = typeof err === "string" ? err : err?.message ?? text.slice(0, 200);
    throw new Error(`NVIDIA NIM ${res.status}: ${msg}`);
  }

  return parsed;
}

function parseArgs(raw: string): ToolInput {
  try {
    return JSON.parse(raw) as ToolInput;
  } catch {
    return {};
  }
}

export async function runNvidiaAgent(
  tenantId: string,
  userMessage: string,
  systemPrompt?: string,
  systemSuffix?: string,
  maxTokens = 4096,
  excludeTools: string[] = []
): Promise<AgentResponse> {
  const base =
    systemPrompt ??
    `You are Calyx, an AI observability assistant. You help engineering teams understand what is
happening in their production systems by analyzing logs and metrics. The tenant you are
assisting has tenant_id: "${tenantId}". Always use this tenant_id when calling tools.

When you cannot find data, say so clearly rather than guessing. When you do find data,
cite specific numbers and service names from the tool results.`;

  const system = systemSuffix ? `${base}\n${systemSuffix}` : base;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];

  const toolCallsMade: ToolCallRecord[] = [];
  const excludedTools = new Set(["ask", ...excludeTools]);
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;
    const response = await chat(messages, maxTokens, excludedTools);
    const choice = response.choices?.[0];
    const message = choice?.message;
    const finish = choice?.finish_reason ?? "unknown";
    const toolCalls = message?.tool_calls ?? [];

    if (finish === "tool_calls" || toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: message?.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const input = { ...parseArgs(call.function.arguments), tenant_id: tenantId };
        const result = await executeTool(call.function.name, input);
        const record: ToolCallRecord = {
          toolName: call.function.name,
          input,
          result: result.ok
            ? { ok: true, summary: result.output.summary }
            : { ok: false, error: result.error },
          output: result.ok ? result.output : undefined,
        };
        toolCallsMade.push(record);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result.ok
            ? JSON.stringify(result.output)
            : JSON.stringify({ error: result.error }),
        });
      }
      continue;
    }

    const answer = extractAnswer(message, finish);
    return { answer, toolCallsMade, stopReason: finish, turns };
  }

  return {
    answer: "Agent reached maximum turns without completing.",
    toolCallsMade,
    stopReason: "max_turns",
    turns,
  };
}
