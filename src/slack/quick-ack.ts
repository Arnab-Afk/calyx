import Anthropic from "@anthropic-ai/sdk";

const ACK_MODEL = process.env.CALYX_ACK_MODEL ?? "claude-haiku-4-5";
const ACK_TIMEOUT_MS = 2000;

export function fallbackAck(question: string, isFollowUp: boolean): string {
  const q = question.replace(/\s+/g, " ").trim().slice(0, 72);
  if (!q) return isFollowUp ? "On it." : "Checking now.";
  if (isFollowUp) return `Checking that — ${q.replace(/\?+$/, "")}.`;
  return `Checking: ${q.replace(/\?+$/, "")}.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function oneLine(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 200);
}

async function callHaiku(
  question: string,
  isFollowUp: boolean,
  prior?: string
): Promise<string> {
  const client = new Anthropic();
  const priorLine = prior
    ? `\nYou already told them (do not repeat it): "${prior.replace(/\s+/g, " ").trim().slice(0, 180)}"`
    : "";
  const response = await client.messages.create({
    model: ACK_MODEL,
    max_tokens: 80,
    system: isFollowUp
      ? `You are Calyx, on-call in Slack. The teammate asked a follow-up.${priorLine} Reply with ONE short sentence: what you're about to check next. No numbers, no analysis, no greeting. Slack mrkdwn, *bold* with single asterisks.`
      : `You are Calyx, on-call in Slack. Reply with ONE short sentence acknowledging their question and what you'll check. Sound like a teammate, not a spinner. No numbers, no analysis, no "Looking into that". Slack mrkdwn, *bold* with single asterisks.`,
    messages: [{ role: "user", content: question }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ");
  return oneLine(text);
}

/** Fast Haiku one-liner (target <2s). Never throws — falls back to a short ack. */
export async function quickAck(
  question: string,
  isFollowUp: boolean,
  prior?: string
): Promise<string> {
  const fallback = fallbackAck(question, isFollowUp);
  try {
    const text = await Promise.race([
      callHaiku(question, isFollowUp, prior),
      sleep(ACK_TIMEOUT_MS).then(() => fallback),
    ]);
    return oneLine(text) || fallback;
  } catch {
    return fallback;
  }
}
