// Thread-aware conversation context — tracks message history per Slack thread
// so follow-up questions in the same thread get full context.
// Memory is the hot path; Redis survives Slack container restarts.

import { getRedis } from "../ingestion/queue.js";

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  userId: string;
  timestamp: string;
}

const THREAD_KEY_PREFIX = "calyx:slack:thread:";
const THREAD_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MESSAGES = 24;
const PROMPT_HISTORY = 16;
const ASSISTANT_PROMPT_CHARS = 500;

const threadHistory = new Map<string, ThreadMessage[]>();

function redisKey(threadTs: string): string {
  return `${THREAD_KEY_PREFIX}${threadTs}`;
}

export function getThreadHistory(threadTs: string): ThreadMessage[] {
  return threadHistory.get(threadTs) ?? [];
}

export function isKnownThread(threadTs: string): boolean {
  return getThreadHistory(threadTs).length > 0;
}

export function lastAssistantContent(threadTs: string): string | undefined {
  const history = getThreadHistory(threadTs);
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i].content;
  }
  return undefined;
}

export function appendToThread(threadTs: string, msg: ThreadMessage): void {
  const history = threadHistory.get(threadTs) ?? [];
  history.push(msg);
  threadHistory.set(threadTs, history.slice(-MAX_MESSAGES));
}

export function clearThread(threadTs: string): void {
  threadHistory.delete(threadTs);
}

export async function hydrateThread(threadTs: string): Promise<void> {
  if (threadHistory.has(threadTs)) return;
  try {
    const raw = await getRedis().get(redisKey(threadTs));
    if (!raw) return;
    const parsed = JSON.parse(raw) as ThreadMessage[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      threadHistory.set(threadTs, parsed.slice(-MAX_MESSAGES));
    }
  } catch {
    // Redis is optional — in-memory still works for the process lifetime.
  }
}

export async function persistThread(threadTs: string): Promise<void> {
  const history = threadHistory.get(threadTs);
  if (!history?.length) return;
  try {
    await getRedis().setex(redisKey(threadTs), THREAD_TTL_SECONDS, JSON.stringify(history));
  } catch {
    // ignore — conversation still lives in memory
  }
}

export function buildConversationPrompt(
  threadTs: string,
  currentMessage: string,
  userId: string
): { systemSuffix: string; userMessage: string } {
  const history = getThreadHistory(threadTs).slice(-PROMPT_HISTORY);

  if (history.length === 0) {
    return { systemSuffix: "", userMessage: currentMessage };
  }

  const historyText = history
    .map((m) => {
      const content =
        m.role === "assistant" ? m.content.slice(0, ASSISTANT_PROMPT_CHARS) : m.content;
      return `[${m.userId}]: ${content}`;
    })
    .join("\n");

  return {
    systemSuffix: `\n\nThis is a follow-up in an ongoing thread. Answer only the new question. Prior conversation:\n${historyText}`,
    userMessage: `[${userId}]: ${currentMessage}`,
  };
}
