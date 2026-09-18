import type { Alert, AnomalySeverity } from "../schemas/index.js";
import type { AlertState } from "./alert-state.js";

// Compact alert card: title, severity/status, one punchy summary, two actions.
// Root cause / recommended action stay on the Alert object for Investigate — not three essays on the card.

const SEVERITY_EMOJI: Record<AnomalySeverity, string> = {
  low: ":information_source:",
  medium: ":warning:",
  high: ":exclamation:",
  critical: ":red_circle:",
};

const SEVERITY_COLOR: Record<AnomalySeverity, string> = {
  low: "#36a64f",
  medium: "#ff9f00",
  high: "#e01e5a",
  critical: "#9b0000",
};

export interface AlertCard {
  blocks: SlackBlock[];
  color: string;
  text: string;
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

function titleCaseType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusLabel(state?: AlertState): string {
  if (!state || state.status === "active") return "Open";
  if (state.status === "acknowledged") return "Acknowledged";
  return "Resolved";
}

export function buildAlertCard(alert: Alert, state?: AlertState): AlertCard {
  const emoji = SEVERITY_EMOJI[alert.severity];
  const color = SEVERITY_COLOR[alert.severity];
  const severity = alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1);
  const title = `${alert.anomaly.service}: ${titleCaseType(alert.anomaly.type)}`;

  const text = `${emoji} *${title}* — ${severity} · ${statusLabel(state)}`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: title.slice(0, 150), emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Severity:* ${emoji} ${severity}` },
        { type: "mrkdwn", text: `*Status:* ${statusLabel(state)}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: alert.impact },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in Calyx", emoji: true },
          style: "primary",
          value: alert.id,
          action_id: "view_alert",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Investigate", emoji: true },
          value: alert.id,
          action_id: "start_incident",
        },
        ...(state?.status !== "resolved"
          ? [
              {
                type: "button",
                text: { type: "plain_text", text: "Resolve", emoji: true },
                value: alert.id,
                action_id: "resolve_alert",
              },
            ]
          : []),
      ],
    },
    ...(state && state.status !== "active"
      ? [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text:
                  state.status === "resolved"
                    ? `:white_check_mark: Resolved by <@${state.resolvedBy}>${state.reason ? ` — _${state.reason}_` : ""}`
                    : `:eyes: Acknowledged by <@${state.acknowledgedBy}>`,
              },
            ],
          },
        ]
      : []),
  ];

  return { blocks, color, text };
}
