// Thread-aware conversation context — tracks message history per Slack thread
// so follow-up questions in the same thread get full context.

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  userId: string;
  timestamp: string;
}

// In-memory store for MVP. Replace with Redis or DB for multi-instance.
const threadHistory = new Map<string, ThreadMessage[]>();

export function getThreadHistory(threadTs: string): ThreadMessage[] {
  return threadHistory.get(threadTs) ?? [];
}

export function appendToThread(threadTs: string, msg: ThreadMessage): void {
  const history = threadHistory.get(threadTs) ?? [];
  history.push(msg);
  threadHistory.set(threadTs, history);
}

export function clearThread(threadTs: string): void {
  threadHistory.delete(threadTs);
}

// Build a conversation-aware prompt that includes thread history
export function buildConversationPrompt(
  threadTs: string,
  currentMessage: string,
  userId: string
): { systemSuffix: string; userMessage: string } {
  const history = getThreadHistory(threadTs);

  if (history.length === 0) {
    return { systemSuffix: "", userMessage: currentMessage };
  }

  const historyText = history
    .map((m) => `[${m.userId}]: ${m.content}`)
    .join("\n");

  return {
    systemSuffix: `\n\nThis is a follow-up question in an ongoing thread. Prior conversation:\n${historyText}`,
    userMessage: `[${userId}]: ${currentMessage}`,
  };
}
