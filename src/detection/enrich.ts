import Anthropic from "@anthropic-ai/sdk";
import type { Alert } from "../schemas/index.js";

const ENRICH_MODEL = process.env.CALYX_ALERT_ENRICH_MODEL ?? "claude-haiku-4-5";
const ENRICH_TIMEOUT_MS = 8_000;

export type AlertEnrichment = {
  impact: string;
  root_cause: string;
  recommended_action: string;
};

function fallbackEnrichment(alert: Alert): AlertEnrichment {
  return {
    impact: alert.impact || alert.anomaly.evidence.description,
    root_cause: "Not yet verified",
    recommended_action:
      "Investigate the linked evidence before taking action.",
  };
}

function parseEnrichment(text: string, alert: Alert): AlertEnrichment {
  const fallback = fallbackEnrichment(alert);
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as Partial<AlertEnrichment>;
    return {
      impact:
        typeof parsed.impact === "string" && parsed.impact.trim()
          ? parsed.impact.trim().slice(0, 500)
          : fallback.impact,
      root_cause:
        typeof parsed.root_cause === "string" && parsed.root_cause.trim()
          ? parsed.root_cause.trim().slice(0, 400)
          : fallback.root_cause,
      recommended_action:
        typeof parsed.recommended_action === "string" &&
        parsed.recommended_action.trim()
          ? parsed.recommended_action.trim().slice(0, 400)
          : fallback.recommended_action,
    };
  } catch {
    return fallback;
  }
}

async function callEnrich(alert: Alert): Promise<AlertEnrichment> {
  const client = new Anthropic();
  const evidence = alert.anomaly.evidence;
  const response = await client.messages.create({
    model: ENRICH_MODEL,
    max_tokens: 400,
    system: `You enrich Calyx production alerts for on-call engineers.
Return ONLY a JSON object with keys: impact, root_cause, recommended_action.
Be concise (1-2 sentences each). Do not invent metrics that are not in the evidence.
If cause is unclear, say so and suggest the next verification step.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          type: alert.anomaly.type,
          severity: alert.severity,
          service: alert.anomaly.service,
          evidence,
          occurrence_hint: alert.impact,
        }),
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseEnrichment(text, alert);
}

/** Short Anthropic pass to fill impact / root_cause / recommended_action. Never throws. */
export async function enrichAlert(alert: Alert): Promise<Alert> {
  const fallback = fallbackEnrichment(alert);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { ...alert, ...fallback };
  }
  try {
    const enrichment = await Promise.race([
      callEnrich(alert),
      new Promise<AlertEnrichment>((resolve) =>
        setTimeout(() => resolve(fallback), ENRICH_TIMEOUT_MS),
      ),
    ]);
    return { ...alert, ...enrichment };
  } catch {
    return { ...alert, ...fallback };
  }
}
