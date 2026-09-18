// Slack adapter — thin wrapper over the agent/tool layer.
// Zero agent logic lives here; this file only handles Slack wire format.

import { App, type AppMentionEvent } from "@slack/bolt";
import { runAgent } from "../agent/index.js";
import { buildAlertCard } from "./alert-card.js";
import { appendToThread, buildConversationPrompt } from "./conversation.js";
import { autoChartType, renderChartForSlack } from "./charts/index.js";
import { ackAlert, resolveAlert, getAlertState } from "./alert-state.js";
import {
  storePendingAction,
  getPendingAction,
  removePendingAction,
  generateActionId,
} from "./pending-actions.js";
import { buildApprovalModal } from "./modals/approval.js";
import {
  buildTimeRangeButtons,
  hoursToTimeRange,
} from "./blocks/time-range-filter.js";
import { buildServiceDrilldownButtons } from "./blocks/service-drilldown.js";
import { executeAction } from "../execution/executor.js";
import { executeTool } from "../agent/registry.js";
import { renderChartForSlack as renderChart } from "./charts/index.js";
import type { Alert } from "../schemas/index.js";
import type { ServiceStats } from "../storage/events.js";

// Tenant lookup: for MVP, every workspace maps to one tenant.
function tenantForTeam(teamId: string): string {
  return process.env[`CALYX_TENANT_${teamId}`] ?? teamId;
}

/** Slack section mrkdwn hard-caps at 3000 chars — split long answers into multiple blocks. */
const SLACK_SECTION_MAX = 2900;

function chunkMrkdwn(text: string, max = SLACK_SECTION_MAX): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = remaining.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = max;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function answerBlocks(answer: string): object[] {
  return chunkMrkdwn(answer).map((text) => ({
    type: "section",
    text: { type: "mrkdwn", text },
  }));
}

export function createSlackApp(): App {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: process.env.SLACK_SOCKET_MODE === "true",
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // ─── @mention → agent query ──────────────────────────────────────────────────

  app.event("app_mention", async ({ event, say, client }) => {
    const mentionEvent = event as AppMentionEvent & {
      thread_ts?: string;
      team?: string;
    };
    const threadTs = mentionEvent.thread_ts ?? mentionEvent.ts;
    const tenantId = tenantForTeam(mentionEvent.team ?? "default");
    const userId = mentionEvent.user;

    const rawText = mentionEvent.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const { userMessage } = buildConversationPrompt(threadTs, rawText, userId);

    const thinking = await say({ text: "Looking into that...", thread_ts: threadTs });

    const response = await runAgent(tenantId, userMessage);

    appendToThread(threadTs, { role: "user", content: rawText, userId, timestamp: mentionEvent.ts });
    appendToThread(threadTs, {
      role: "assistant",
      content: response.answer,
      userId: "calyx-bot",
      timestamp: new Date().toISOString(),
    });

    if (thinking.ts) {
      await client.chat
        .delete({ channel: mentionEvent.channel, ts: thinking.ts as string })
        .catch(() => {});
    }

    // Determine if we have chartable tool output
    const chartableCall = [...response.toolCallsMade]
      .reverse()
      .find((c) => c.output?.visualization_hint && c.output.visualization_hint !== "none");

    let chartResult: Awaited<ReturnType<typeof renderChartForSlack>> | null = null;
    if (chartableCall?.output) {
      const chartType = autoChartType(
        chartableCall.output.visualization_hint!,
        chartableCall.output.data
      );
      if (chartType) {
        chartResult = await renderChartForSlack({ type: chartType, data: chartableCall.output.data }).catch(() => null);
      }
    }

    // Build reply blocks (Slack section text max 3000 chars)
    const replyBlocks: object[] = [...answerBlocks(response.answer)];

    if (chartResult?.blocks) replyBlocks.push(...chartResult.blocks);

    // Time-range quick-filter — shown after stats tool calls
    const statsCall = response.toolCallsMade.find((c) =>
      c.toolName === "get_service_stats" || c.toolName === "query_logs"
    );
    if (statsCall) {
      const statsData = statsCall.output?.data as ServiceStats[] | undefined;
      const services = Array.isArray(statsData) ? statsData.map((s) => s.service) : [];

      replyBlocks.push(
        buildTimeRangeButtons({ toolName: statsCall.toolName, tenantId })
      );

      // Service drill-down buttons (only for multi-service stats)
      if (statsCall.toolName === "get_service_stats" && services.length > 1) {
        const drilldown = buildServiceDrilldownButtons(tenantId, services);
        if (drilldown) replyBlocks.push(drilldown);
      }
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
      text: response.answer.slice(0, 3500),
      thread_ts: threadTs,
      blocks: replyBlocks as Parameters<typeof say>[0]["blocks"],
    });

    if (chartResult?.image) {
      await client.files
        .uploadV2({
          channel_id: mentionEvent.channel,
          thread_ts: threadTs,
          filename: "calyx-chart.png",
          file: chartResult.image,
          initial_comment: chartResult.caption,
        })
        .catch(() => {});
    }
  });

  // ─── Alert: Acknowledge ───────────────────────────────────────────────────────

  app.action("ack_alert", async ({ ack, body, client }) => {
    await ack();
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    const userId = (body as { user: { id: string } }).user.id;
    const state = ackAlert(alertId, userId);

    // Update the original message to reflect new state
    const msg = body as { message: { blocks: object[]; ts: string }; channel: { id: string } };
    await client.chat
      .update({
        channel: msg.channel.id,
        ts: msg.message.ts,
        blocks: msg.message.blocks.map((b) => {
          const block = b as { type: string; elements?: object[] };
          if (block.type === "actions") {
            return {
              ...block,
              elements: (block.elements ?? []).filter(
                (el) => (el as { action_id: string }).action_id !== "ack_alert"
              ),
            };
          }
          return b;
        }),
        text: `Alert acknowledged by <@${userId}>`,
      })
      .catch(() => {});

    // Post confirmation in thread
    const threadTs = (body as { message: { thread_ts?: string; ts: string } }).message.thread_ts
      ?? (body as { message: { ts: string } }).message.ts;
    await client.chat
      .postMessage({
        channel: msg.channel.id,
        thread_ts: threadTs,
        text: `:eyes: <@${userId}> acknowledged this alert.`,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `:eyes: <@${userId}> acknowledged this alert at <!date^${Math.floor(new Date(state.acknowledgedAt!).getTime() / 1000)}^{time}|now>.`,
              },
            ],
          },
        ],
      })
      .catch(() => {});
  });

  // ─── Alert: Resolve ───────────────────────────────────────────────────────────

  app.action("resolve_alert", async ({ ack, body, client }) => {
    await ack();
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    const userId = (body as { user: { id: string } }).user.id;

    // Open a modal to capture resolve reason
    const triggerId = (body as { trigger_id: string }).trigger_id;
    await client.views
      .open({
        trigger_id: triggerId,
        view: {
          type: "modal",
          callback_id: "resolve_alert_modal",
          private_metadata: JSON.stringify({
            alertId,
            channel: (body as { channel: { id: string } }).channel.id,
            messageTs: (body as { message: { ts: string } }).message.ts,
            threadTs:
              (body as { message: { thread_ts?: string; ts: string } }).message.thread_ts
              ?? (body as { message: { ts: string } }).message.ts,
          }),
          title: { type: "plain_text", text: "Resolve Alert", emoji: true },
          submit: { type: "plain_text", text: "Resolve", emoji: true },
          close: { type: "plain_text", text: "Cancel", emoji: true },
          blocks: [
            {
              type: "input",
              block_id: "resolve_reason_block",
              label: { type: "plain_text", text: "Resolution notes" },
              hint: { type: "plain_text", text: "What fixed it? Or why is this not actionable?" },
              element: {
                type: "plain_text_input",
                action_id: "resolve_reason_input",
                multiline: true,
                placeholder: { type: "plain_text", text: "e.g. Rolled back deploy v1.4.2 — error rate returned to baseline" },
              },
            },
          ],
        },
      })
      .catch(() => {});
  });

  // ─── Modal: Resolve Alert submission ─────────────────────────────────────────

  app.view("resolve_alert_modal", async ({ ack, view, body, client }) => {
    await ack();
    const userId = body.user.id;
    const { alertId, channel, messageTs, threadTs } = JSON.parse(view.private_metadata);
    const reason =
      view.state.values.resolve_reason_block?.resolve_reason_input?.value ?? undefined;

    const state = resolveAlert(alertId, userId, reason);

    await client.chat
      .postMessage({
        channel,
        thread_ts: threadTs,
        text: `:white_check_mark: <@${userId}> resolved this alert.`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:white_check_mark: *Alert resolved* by <@${userId}>${reason ? `\n_${reason}_` : ""}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Resolved at <!date^${Math.floor(new Date(state.resolvedAt!).getTime() / 1000)}^{date_short_pretty} at {time}|now>`,
              },
            ],
          },
        ],
      })
      .catch(() => {});
  });

  // ─── Time range filter ────────────────────────────────────────────────────────

  const timeRangeHandler = async ({ ack, body, client }: {
    ack: () => Promise<void>;
    body: unknown;
    client: App["client"];
  }) => {
    await ack();
    const actionBody = body as {
      actions: { value: string }[];
      channel: { id: string };
      message: { thread_ts?: string; ts: string };
      user: { id: string };
    };
    const { toolName, tenantId, service, hours } = JSON.parse(
      actionBody.actions[0]?.value ?? "{}"
    ) as { toolName: string; tenantId: string; service?: string; hours: number };

    const { from, to } = hoursToTimeRange(hours);
    const threadTs = actionBody.message.thread_ts ?? actionBody.message.ts;

    // Re-run the tool with the new time window
    const input = toolName === "get_service_stats"
      ? { tenant_id: tenantId, service, from, to }
      : { tenant_id: tenantId, from, to, limit: 50 };

    const result = await executeTool(toolName, input as never);

    if (!result.ok) {
      await client.chat
        .postMessage({
          channel: actionBody.channel.id,
          thread_ts: threadTs,
          text: `Error re-running ${toolName}: ${result.error}`,
        })
        .catch(() => {});
      return;
    }

    const hint = result.output.visualization_hint;
    const chartType = hint && hint !== "none" ? autoChartType(hint, result.output.data) : null;
    const chartResult = chartType
      ? await renderChart({ type: chartType, data: result.output.data }).catch(() => null)
      : null;

    const label = hours < 24 ? `${hours}h` : hours === 168 ? "7d" : `${hours}h`;
    const replyBlocks: object[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${toolName.replace(/_/g, " ")} — last ${label}*\n${result.output.summary}` },
      },
      ...(chartResult?.blocks ?? []),
      buildTimeRangeButtons({ toolName, tenantId, service }),
    ];

    await client.chat
      .postMessage({
        channel: actionBody.channel.id,
        thread_ts: threadTs,
        text: result.output.summary,
        blocks: replyBlocks as never,
      })
      .catch(() => {});

    if (chartResult?.image) {
      await client.files
        .uploadV2({
          channel_id: actionBody.channel.id,
          thread_ts: threadTs,
          filename: "calyx-chart.png",
          file: chartResult.image,
          initial_comment: chartResult.caption,
        })
        .catch(() => {});
    }
  };

  app.action("time_range_1h", timeRangeHandler);
  app.action("time_range_6h", timeRangeHandler);
  app.action("time_range_24h", timeRangeHandler);
  app.action("time_range_7d", timeRangeHandler);

  // ─── Service drill-down ───────────────────────────────────────────────────────

  app.action("drill_down_service", async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as {
      actions: { value: string }[];
      channel: { id: string };
      message: { thread_ts?: string; ts: string };
    };
    const { tenantId, service } = JSON.parse(actionBody.actions[0]?.value ?? "{}") as {
      tenantId: string;
      service: string;
    };
    const threadTs = actionBody.message.thread_ts ?? actionBody.message.ts;

    // Fetch stats for just this service
    const statsResult = await executeTool("get_service_stats", {
      tenant_id: tenantId,
      service,
    } as never);

    const replyBlocks: object[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `↗ ${service}`, emoji: false },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: statsResult.ok ? statsResult.output.summary : `No data for ${service}.`,
        },
      },
    ];

    // Gauge chart for error rate
    if (statsResult.ok) {
      const stats = statsResult.output.data as ServiceStats[];
      const svc = stats[0];
      if (svc) {
        replyBlocks.push(buildTimeRangeButtons({ toolName: "get_service_stats", tenantId, service }));

        const gaugeResult = await renderChart({
          type: "gauge",
          title: `${service} — error rate`,
          data: { value: svc.error_rate, label: "Error rate %", maxValue: 100 },
        }).catch(() => null);

        if (gaugeResult?.image) {
          await client.files
            .uploadV2({
              channel_id: actionBody.channel.id,
              thread_ts: threadTs,
              filename: `${service}-gauge.png`,
              file: gaugeResult.image,
              initial_comment: gaugeResult.caption,
            })
            .catch(() => {});
        }
      }
    }

    await client.chat
      .postMessage({
        channel: actionBody.channel.id,
        thread_ts: threadTs,
        text: `Drill-down: ${service}`,
        blocks: replyBlocks as never,
      })
      .catch(() => {});
  });

  // ─── Action approval flow ─────────────────────────────────────────────────────

  app.action("approve_action", async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as {
      actions: { value: string }[];
      channel: { id: string };
      trigger_id: string;
    };
    const actionId = actionBody.actions[0]?.value;
    const pending = getPendingAction(actionId);
    if (!pending) {
      await client.chat
        .postMessage({
          channel: actionBody.channel.id,
          text: `:warning: Could not find pending action \`${actionId}\` — it may have expired or already been handled.`,
        })
        .catch(() => {});
      return;
    }

    await client.views
      .open({
        trigger_id: actionBody.trigger_id,
        view: buildApprovalModal(pending) as never,
      })
      .catch(() => {});
  });

  app.action("reject_action", async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as {
      actions: { value: string }[];
      channel: { id: string };
      message: { thread_ts?: string; ts: string };
      user: { id: string };
    };
    const actionId = actionBody.actions[0]?.value;
    removePendingAction(actionId);
    const threadTs = actionBody.message.thread_ts ?? actionBody.message.ts;

    await client.chat
      .postMessage({
        channel: actionBody.channel.id,
        thread_ts: threadTs,
        text: `:no_entry: <@${actionBody.user.id}> rejected the action.`,
      })
      .catch(() => {});
  });

  // ─── Modal: Approve action submission ────────────────────────────────────────

  app.view("approve_action_modal", async ({ ack, view, body, client }) => {
    await ack();
    const actionId = view.private_metadata;
    const userId = body.user.id;
    const reason =
      view.state.values.reason_block?.reason_input?.value ?? "Approved via Slack";

    const pending = getPendingAction(actionId);
    if (!pending) return;

    removePendingAction(actionId);

    const execResult = await executeAction({
      tenant_id: pending.tenantId,
      action_name: pending.actionName,
      params: pending.params,
      triggered_by: userId,
      human_approved: true,
    });

    const statusEmoji = execResult.executed ? ":white_check_mark:" : ":x:";
    await client.chat
      .postMessage({
        channel: pending.channel,
        thread_ts: pending.threadTs,
        text: `${statusEmoji} Action ${pending.actionName}: ${execResult.message}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${statusEmoji} *\`${pending.actionName}\`* — ${execResult.message}\n_Approved by <@${userId}>: ${reason}_`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Audit entry: \`${execResult.entry.id}\``,
              },
            ],
          },
        ],
      })
      .catch(() => {});
  });

  // ─── Existing button handlers ─────────────────────────────────────────────────

  app.action("view_alert", async ({ ack, body }) => {
    await ack();
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    console.log(`View alert requested: ${alertId}`);
  });

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

// ─── postAlert ────────────────────────────────────────────────────────────────

export async function postAlert(
  app: App,
  channelId: string,
  alert: Alert
): Promise<{ ts: string }> {
  const state = getAlertState(alert.id);
  const card = buildAlertCard(alert, state);

  const result = await app.client.chat.postMessage({
    channel: channelId,
    text: card.text,
    blocks: card.blocks as Parameters<typeof app.client.chat.postMessage>[0]["blocks"],
    attachments: [{ color: card.color, fallback: card.text }],
  });

  return { ts: result.ts as string };
}

// ─── postPendingActionCard ────────────────────────────────────────────────────
// Called by any Slack-triggered flow that proposes a Tier-0/blocked action.

export async function postPendingActionCard(
  app: App,
  channelId: string,
  threadTs: string,
  pending: Parameters<typeof storePendingAction>[0]
): Promise<void> {
  storePendingAction(pending);

  const result = await app.client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `:lock: Action requires approval: \`${pending.actionName}\``,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:lock: *Action requires your approval*\n*\`${pending.actionName}\`* — ${pending.description}\n\n*Dry-run:* ${pending.dryRunResult.success ? ":white_check_mark: would succeed" : ":x: would fail"} — ${pending.dryRunResult.message}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: ":white_check_mark: Approve", emoji: true },
            style: "primary",
            value: pending.actionId,
            action_id: "approve_action",
          },
          {
            type: "button",
            text: { type: "plain_text", text: ":no_entry: Reject", emoji: true },
            style: "danger",
            value: pending.actionId,
            action_id: "reject_action",
          },
        ],
      },
    ],
  });

  // Store the message ts so we can update it later
  pending.messageTs = result.ts as string;
}
