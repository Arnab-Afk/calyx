import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { buildAlertCard } from "../slack/alert-card.js";
import { postPendingActionCard } from "../slack/adapter.js";
import { closePool, getPool } from "../storage/client.js";
import {
  runDeliveryCycle,
  runDetectionCycle,
  runRemediationDeliveryCycle,
  type DeliveryHandler,
  type RemediationDeliveryHandler,
} from "./scheduler.js";
import type { Alert } from "../schemas/index.js";

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const intervalMs = positiveInt("CALYX_DETECTION_INTERVAL_MS", 60_000);
const lookbackHours = positiveInt("CALYX_ACTIVE_SERVICE_LOOKBACK_HOURS", 24);
const slack = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

const chatBase = (
  process.env.CALYX_CHAT_URL ||
  process.env.CALYX_CHAT_API_URL ||
  ""
).replace(/\/$/, "");
const internalKey = process.env.CALYX_INTERNAL_API_KEY?.trim() || "";

const slackHandler: DeliveryHandler | undefined = slack
  ? async (delivery, alert) => {
      const card = buildAlertCard(alert);
      const result = await slack.chat.postMessage({
        channel: delivery.target,
        text: card.text,
        blocks: card.blocks as never,
        attachments: [{ color: card.color, fallback: card.text }],
      });
      if (!result.ts)
        throw new Error("Slack did not return a message timestamp");
      return { externalId: result.ts };
    }
  : undefined;

function webAlertPayload(alert: Alert) {
  return {
    id: alert.id,
    service: alert.anomaly.service,
    severity: alert.severity,
    type: alert.anomaly.type,
    impact: alert.impact,
    rootCause: alert.root_cause,
    recommendation: alert.recommended_action,
    detectedAt: alert.anomaly.detected_at,
  };
}

const webHandler: DeliveryHandler | undefined =
  chatBase && internalKey
    ? async (delivery, alert) => {
        const chartData = webAlertPayload(alert);
        const answer = [
          `**${alert.anomaly.type.replaceAll("_", " ")}** on \`${alert.anomaly.service}\` (${alert.severity})`,
          alert.impact,
          `Root cause: ${alert.root_cause}`,
          `Recommended: ${alert.recommended_action}`,
        ].join("\n\n");
        const res = await fetch(
          `${chatBase}/v1/internal/workspaces/${encodeURIComponent(delivery.target)}/alerts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Calyx-Internal-Key": internalKey,
            },
            body: JSON.stringify({
              answer,
              chartType: "alert-card",
              chartData,
              toolNames: ["get_alert_context"],
            }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Chat alert post failed (${res.status}): ${text.slice(0, 200)}`,
          );
        }
        const body = (await res.json().catch(() => null)) as {
          message?: { id?: string };
        } | null;
        const id = body?.message?.id;
        if (!id) throw new Error("Chat API did not return a message id");
        return { externalId: id };
      }
    : undefined;

const remediationSlackHandler: RemediationDeliveryHandler | undefined = slack
  ? async (delivery, request) => {
      const result = await postPendingActionCard(
        slack,
        delivery.target,
        delivery.thread_ts,
        request,
      );
      return { externalId: result.ts };
    }
  : undefined;

let stopping = false;
async function run(): Promise<void> {
  const pool = getPool();
  console.log(
    `Detection scheduler started (interval=${intervalMs}ms, lookback=${lookbackHours}h, slack=${Boolean(slackHandler)}, web=${Boolean(webHandler)})`,
  );
  while (!stopping) {
    const started = Date.now();
    try {
      const detection = await runDetectionCycle(
        pool,
        new Date(),
        lookbackHours,
      );
      const delivery = await runDeliveryCycle({
        ...(slackHandler ? { slack: slackHandler } : {}),
        ...(webHandler ? { web: webHandler } : {}),
      });
      const remediationDelivery = await runRemediationDeliveryCycle(
        remediationSlackHandler,
      );
      if (
        detection.alertsDetected > 0 ||
        delivery.delivered > 0 ||
        delivery.failed > 0 ||
        remediationDelivery.delivered > 0 ||
        remediationDelivery.failed > 0
      ) {
        console.log(
          { detection, delivery, remediationDelivery },
          "Detection cycle complete",
        );
      }
    } catch (error) {
      console.error("Detection cycle failed:", error);
    }
    const waitMs = Math.max(0, intervalMs - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  await closePool();
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

await run();
