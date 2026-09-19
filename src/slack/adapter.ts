// Slack adapter — thin wrapper over the agent/tool layer.
// Zero agent logic lives here; this file only handles Slack wire format.

import { App, type AppMentionEvent, type GenericMessageEvent } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { runAgent } from "../agent/index.js";
import { buildAlertCard } from "./alert-card.js";
import {
  appendToThread,
  buildConversationPrompt,
  hydrateThread,
  isKnownThread,
  lastAssistantContent,
  persistThread,
} from "./conversation.js";
import { shouldHandleUnmentionedReply, stripBotMentions } from "./thread-replies.js";
import { autoChartType, renderChartForSlack } from "./charts/index.js";
import { acknowledgeAlert, resolveAlert, getAlertState } from "./alert-state.js";
import {
  storePendingAction,
  getPendingAction,
  removePendingAction,
} from "./pending-actions.js";
import { buildApprovalModal } from "./modals/approval.js";
import {
  buildTimeRangeButtons,
  hoursToTimeRange,
} from "./blocks/time-range-filter.js";
import { buildServiceDrilldownButtons } from "./blocks/service-drilldown.js";
import { executeAction } from "../execution/executor.js";
import { executeTool } from "../agent/registry.js";
import { buildStatusOverviewCard } from "./blocks/status-card.js";
import {
  SLACK_REPLY_INSTRUCTIONS,
  SLACK_FOLLOWUP_INSTRUCTIONS,
  markdownToSlackBlocks,
  fallbackText,
  buildLogListBlocks,
} from "./format-answer.js";
import { quickAck } from "./quick-ack.js";
import {
  unwrapServiceStats,
  unwrapDailyHealth,
  unwrapTotals,
  asLogEvents,
} from "./tool-data.js";
import type { Alert } from "../schemas/index.js";
import type { ToolCallRecord } from "../agent/loop.js";

// Tenant lookup: for MVP, every workspace maps to one tenant.
function tenantForTeam(teamId: string): string {
  return process.env[`CALYX_TENANT_${teamId}`] ?? teamId;
}

function pickWidestStatsCall(calls: ToolCallRecord[]): ToolCallRecord | undefined {
  const statsCalls = calls.filter((c) => c.toolName === "get_service_stats" && c.output);
  if (statsCalls.length === 0) return undefined;
  return statsCalls.reduce((best, c) =>
    unwrapServiceStats(c.output?.data).length >= unwrapServiceStats(best.output?.data).length
      ? c
      : best
  );
}

function pickStatsCall(calls: ToolCallRecord[]): ToolCallRecord | undefined {
  return pickWidestStatsCall(calls) ?? calls.find((c) => c.toolName === "query_logs");
}

function pickChartableCall(calls: ToolCallRecord[]): ToolCallRecord | undefined {
  const widest = pickWidestStatsCall(calls);
  if (widest) return widest;
  return [...calls]
    .reverse()
    .find((c) => c.output?.visualization_hint && c.output.visualization_hint !== "none");
}

type SlackSay = (args: {
  text: string;
  thread_ts: string;
  blocks?: object[];
}) => Promise<unknown>;

async function handleQuestion(opts: {
  threadTs: string;
  tenantId: string;
  userId: string;
  rawText: string;
  eventTs: string;
  channel: string;
  isFollowUp: boolean;
  say: SlackSay;
  client: WebClient;
}): Promise<void> {
  const { threadTs, tenantId, userId, rawText, eventTs, channel, isFollowUp, say, client } =
    opts;

  const { userMessage, systemSuffix } = buildConversationPrompt(threadTs, rawText, userId);
  const prior = lastAssistantContent(threadTs);

  // Claim the thread immediately so later replies don't need @Calyx,
  // even if this investigation is still running.
  appendToThread(threadTs, { role: "user", content: rawText, userId, timestamp: eventTs });
  void persistThread(threadTs);

  const voice = isFollowUp ? SLACK_FOLLOWUP_INSTRUCTIONS : SLACK_REPLY_INSTRUCTIONS;

  const responsePromise = runAgent(
    tenantId,
    userMessage,
    undefined,
    `${voice}${systemSuffix}`,
    isFollowUp ? 400 : 800,
    {
      provider: "anthropic",
      model: process.env.CALYX_SLACK_MODEL ?? "claude-opus-5",
    }
  );
  const ackPromise = quickAck(rawText, isFollowUp, prior);

  const ackText = await ackPromise;
  await say({
    text: ackText,
    thread_ts: threadTs,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: ackText },
      },
    ],
  });

  const response = await responsePromise;

  appendToThread(threadTs, {
    role: "assistant",
    content: response.answer,
    userId: "calyx-bot",
    timestamp: new Date().toISOString(),
  });
  void persistThread(threadTs);

  const statsCall = pickStatsCall(response.toolCallsMade);
  const stats = unwrapServiceStats(statsCall?.output?.data);
  const showStatusCard = statsCall?.toolName === "get_service_stats" && stats.length > 0;

  const replyBlocks: object[] = [];

  if (showStatusCard) {
    const { totalEvents, overallErrorRate } = unwrapTotals(statsCall!.output!.data);
    replyBlocks.push(
      ...buildStatusOverviewCard({
        stats,
        daily: unwrapDailyHealth(statsCall!.output!.data),
        totalEvents,
        overallErrorRate,
      })
    );
  }

  replyBlocks.push(...markdownToSlackBlocks(response.answer));

  let chartResult: Awaited<ReturnType<typeof renderChartForSlack>> | null = null;
  if (!showStatusCard) {
    const chartableCall = pickChartableCall(response.toolCallsMade);
    if (chartableCall?.output) {
      const chartType = autoChartType(
        chartableCall.output.visualization_hint ?? "bar",
        chartableCall.output.data
      );
      if (chartType) {
        chartResult = await renderChartForSlack({
          type: chartType,
          data: chartableCall.output.data,
        }).catch(() => null);
      }
    }
    if (chartResult?.blocks) replyBlocks.push(...chartResult.blocks);
  }

  if (statsCall) {
    const services = stats.map((s) => s.service);
    replyBlocks.push(buildTimeRangeButtons({ toolName: statsCall.toolName, tenantId }));
    if (statsCall.toolName === "get_service_stats" && services.length > 1) {
      const drilldown = buildServiceDrilldownButtons(tenantId, services);
      if (drilldown) replyBlocks.push(drilldown);
    }
  }

  await say({
    text: fallbackText(response.answer),
    thread_ts: threadTs,
    blocks: replyBlocks,
  });

  if (chartResult?.image) {
    await client.files
      .uploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: "calyx-chart.png",
        file: chartResult.image,
        initial_comment: chartResult.caption,
      })
      .catch(() => {});
  }
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
    const rawText = stripBotMentions(mentionEvent.text);

    await hydrateThread(threadTs);
    const isFollowUp = Boolean(mentionEvent.thread_ts) || isKnownThread(threadTs);

    await handleQuestion({
      threadTs,
      tenantId,
      userId,
      rawText,
      eventTs: mentionEvent.ts,
      channel: mentionEvent.channel,
      isFollowUp,
      say: say as SlackSay,
      client,
    });
  });

  // Thread replies and DMs — no @Calyx required once we're already talking.
  // Slack app must subscribe to message.channels / message.groups / message.im.
  app.message(async ({ message, say, client, context, body }) => {
    const msg = message as GenericMessageEvent & {
      subtype?: string;
      bot_id?: string;
      channel_type?: string;
      team?: string;
    };
    const threadTs = msg.thread_ts ?? (msg.channel_type === "im" ? msg.channel : undefined);
    if (threadTs) await hydrateThread(threadTs);

    if (
      !shouldHandleUnmentionedReply({
        subtype: msg.subtype,
        botId: msg.bot_id,
        userId: msg.user,
        text: msg.text,
        threadTs: msg.thread_ts,
        messageTs: msg.ts,
        channelType: msg.channel_type,
        calyxBotUserId: context.botUserId,
        knownThread: threadTs ? isKnownThread(threadTs) : false,
      })
    ) {
      return;
    }

    const key = threadTs ?? msg.channel;
    const teamId =
      (body as { team_id?: string }).team_id ??
      (msg as GenericMessageEvent & { team?: string }).team ??
      "default";

    await handleQuestion({
      threadTs: key,
      tenantId: tenantForTeam(teamId),
      userId: msg.user ?? "unknown",
      rawText: stripBotMentions(msg.text ?? ""),
      eventTs: msg.ts,
      channel: msg.channel,
      isFollowUp: isKnownThread(key) || Boolean(msg.thread_ts),
      say: say as SlackSay,
      client,
    });
  });

  // ─── Alert: Acknowledge ───────────────────────────────────────────────────────

  app.action("ack_alert", async ({ ack, body, client }) => {
    await ack();
    const alertId = (body as { actions: { value: string }[] }).actions[0]?.value;
    const userId = (body as { user: { id: string } }).user.id;
    const channelId = (body as { channel: { id: string } }).channel.id;
    const state = await acknowledgeAlert(alertId, channelId, userId);
    if (!state) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "This alert is no longer open or is not valid for this channel.",
      });
      return;
    }

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

    const state = await resolveAlert(alertId, channel, userId, reason);
    if (!state) {
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: "This alert is already resolved or is not valid for this channel.",
      });
      return;
    }

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

    const label = hours < 24 ? `${hours}h` : hours === 168 ? "7d" : `${hours / 24}d`;
    const stats = unwrapServiceStats(result.output.data);
    const { totalEvents, overallErrorRate } = unwrapTotals(result.output.data);

    const replyBlocks: object[] = [];

    if (toolName === "get_service_stats" && stats.length > 0) {
      replyBlocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `Window: last *${label}*` }],
      });
      replyBlocks.push(
        ...buildStatusOverviewCard({
          stats,
          daily: unwrapDailyHealth(result.output.data),
          totalEvents,
          overallErrorRate,
        })
      );
    } else if (toolName === "query_logs") {
      replyBlocks.push(
        ...buildLogListBlocks(asLogEvents(result.output.data), `Logs — last ${label}`)
      );
    } else {
      replyBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Last ${label}*\n${result.output.summary}` },
      });
    }

    replyBlocks.push(buildTimeRangeButtons({ toolName, tenantId, service }));

    await client.chat
      .postMessage({
        channel: actionBody.channel.id,
        thread_ts: threadTs,
        text: result.output.summary,
        blocks: replyBlocks as never,
      })
      .catch(() => {});
  };

  app.action("time_range_1h", timeRangeHandler);
  app.action("time_range_6h", timeRangeHandler);
  app.action("time_range_24h", timeRangeHandler);
  app.action("time_range_7d", timeRangeHandler);

  // ─── Service drill-down ───────────────────────────────────────────────────────

  app.action(/^drill_down_service/, async ({ ack, body, client }) => {
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

    const statsResult = await executeTool("get_service_stats", {
      tenant_id: tenantId,
      service,
    } as never);

    const replyBlocks: object[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `↗ ${service}`.slice(0, 150), emoji: false },
      },
    ];

    if (statsResult.ok) {
      const svcStats = unwrapServiceStats(statsResult.output.data);
      const { totalEvents, overallErrorRate } = unwrapTotals(statsResult.output.data);
      if (svcStats.length > 0) {
        replyBlocks.push(
          ...buildStatusOverviewCard({
            stats: svcStats,
            daily: unwrapDailyHealth(statsResult.output.data),
            totalEvents,
            overallErrorRate,
          })
        );
      } else {
        replyBlocks.push({
          type: "section",
          text: { type: "mrkdwn", text: statsResult.output.summary },
        });
      }
      replyBlocks.push(buildTimeRangeButtons({ toolName: "get_service_stats", tenantId, service }));
    } else {
      replyBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `No data for ${service}.` },
      });
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
  const state = await getAlertState(alert.id);
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
