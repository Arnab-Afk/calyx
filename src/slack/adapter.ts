// Slack adapter — thin wrapper over the agent/tool layer.
// Zero agent logic lives here; this file only handles Slack wire format.

import { App, type AppMentionEvent } from "@slack/bolt";
import { runAgent } from "../agent/index.js";
import { buildAlertCard } from "./alert-card.js";
import {
  appendToThread,
  buildConversationPrompt,
} from "./conversation.js";
import { autoChartType, renderChartForSlack } from "./charts/index.js";
import type { Alert } from "../schemas/index.js";

// Tenant lookup: for MVP, every workspace maps to one tenant.
// In production this would query a tenants table by team_id.
function tenantForTeam(teamId: string): string {
  return process.env[`CALYX_TENANT_${teamId}`] ?? teamId;
}

export function createSlackApp(): App {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: process.env.SLACK_SOCKET_MODE === "true",
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // @mention → agent query
  app.event("app_mention", async ({ event, say, client }) => {
    const mentionEvent = event as AppMentionEvent & {
      thread_ts?: string;
      team?: string;
    };
    const threadTs = mentionEvent.thread_ts ?? mentionEvent.ts;
    const tenantId = tenantForTeam(mentionEvent.team ?? "default");
    const userId = mentionEvent.user;

    // Strip the bot mention from the message text
    const rawText = mentionEvent.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    // Build a conversation-aware prompt from thread history
    const { systemSuffix, userMessage } = buildConversationPrompt(
      threadTs,
      rawText,
      userId
    );

    // Acknowledge immediately so Slack doesn't time out
    const thinking = await say({
      text: "Looking into that...",
      thread_ts: threadTs,
    });

    // Run the agent (this calls Claude + tools)
    const response = await runAgent(
      tenantId,
      userMessage,
      systemSuffix
        ? undefined // system prompt is built in loop.ts; we pass override below
        : undefined
    );

    // Store the exchange in thread history for subsequent messages
    appendToThread(threadTs, { role: "user", content: rawText, userId, timestamp: mentionEvent.ts });
    appendToThread(threadTs, {
      role: "assistant",
      content: response.answer,
      userId: "calyx-bot",
      timestamp: new Date().toISOString(),
    });

    // Delete the "Looking into that..." placeholder
    if (thinking.ts) {
      await client.chat
        .delete({ channel: mentionEvent.channel, ts: thinking.ts as string })
        .catch(() => {}); // ignore if it fails
    }

    // Build the main reply blocks
    const replyBlocks: object[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: response.answer },
      },
    ];

    // Find the last tool output that has a visualization hint we can chart
    const chartableCall = [...response.toolCallsMade]
      .reverse()
      .find((c) => c.output?.visualization_hint && c.output.visualization_hint !== "none");

    let chartResult: Awaited<ReturnType<typeof renderChartForSlack>> | null = null;
    if (chartableCall?.output) {
      const hint = chartableCall.output.visualization_hint!;
      const chartType = autoChartType(hint, chartableCall.output.data);
      if (chartType) {
        chartResult = await renderChartForSlack({
          type: chartType,
          data: chartableCall.output.data,
        }).catch(() => null);
      }
    }

    // Inline text chart blocks go directly into the reply
    if (chartResult?.blocks) {
      replyBlocks.push(...chartResult.blocks);
    }

    if (response.toolCallsMade.length > 0) {
      replyBlocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_Used tools: ${[...new Set(response.toolCallsMade.map((t) => t.toolName))].join(", ")}_`,
          },
        ],
      });
    }

    await say({
      text: response.answer,
      thread_ts: threadTs,
      blocks: replyBlocks as Parameters<typeof say>[0]["blocks"],
    });

    // Upload PNG chart as a file snippet (no inline image blocks needed)
    if (chartResult?.image) {
      await client.files
        .uploadV2({
          channel_id: mentionEvent.channel,
          thread_ts: threadTs,
          filename: "calyx-chart.png",
          file: chartResult.image,
          initial_comment: chartResult.caption,
        })
        .catch(() => {}); // non-fatal: chart is nice-to-have
    }
  });

  // Button action — view alert
  app.action("view_alert", async ({ ack, body }) => {
    await ack();
    // Navigate to alert detail page (web dashboard, Phase 5+)
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    console.log(`View alert requested: ${alertId}`);
  });

  // Button action — start incident
  app.action("start_incident", async ({ ack, say, body }) => {
    await ack();
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    await say({
      text: `Incident started for alert ${alertId}. A thread has been created.`,
      thread_ts: (body as { message: { ts: string } }).message?.ts,
    });
  });

  return app;
}

// Post a formatted alert card to a channel.
// Called by the anomaly detection background job (Phase 4).
export async function postAlert(
  app: App,
  channelId: string,
  alert: Alert
): Promise<{ ts: string }> {
  const card = buildAlertCard(alert);

  const result = await app.client.chat.postMessage({
    channel: channelId,
    text: card.text,
    blocks: card.blocks as Parameters<typeof app.client.chat.postMessage>[0]["blocks"],
    attachments: [{ color: card.color, fallback: card.text }],
  });

  return { ts: result.ts as string };
}
