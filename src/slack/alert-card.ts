import type { Alert, AnomalySeverity } from "../schemas/index.js";

// Shared alert-card template — used by Slack, web, and any future adapter.
// Returns Slack Block Kit JSON. Other adapters can convert to their own format.

const SEVERITY_EMOJI: Record<AnomalySeverity, string> = {
  low: ":information_source:",
  medium: ":warning:",
  high: ":rotating_light:",
  critical: ":red_circle:",
};

const SEVERITY_COLOR: Record<AnomalySeverity, string> = {
  low: "#36a64f",
  medium: "#ff9f00",
  high: "#e01e5a",
  critical: "#9b0000",
};

export interface AlertCard {
  // Slack-flavored block kit JSON
  blocks: SlackBlock[];
  // Side color bar for attachment rendering
  color: string;
  // Plain-text fallback for notifications
  text: string;
}

// Minimal typing for the block shapes we produce
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export function buildAlertCard(alert: Alert): AlertCard {
  const emoji = SEVERITY_EMOJI[alert.severity];
  const color = SEVERITY_COLOR[alert.severity];
  const label = alert.severity.toUpperCase();

  const text = `${emoji} *[${label}] Calyx Alert* — ${alert.anomaly.type.replace(/_/g, " ")} in ${alert.anomaly.service}`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Calyx Alert — ${label}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Service*\n${alert.anomaly.service}` },
        { type: "mrkdwn", text: `*Type*\n${alert.anomaly.type.replace(/_/g, " ")}` },
        {
          type: "mrkdwn",
          text: `*Detected*\n<!date^${Math.floor(new Date(alert.anomaly.detected_at).getTime() / 1000)}^{date_short_pretty} at {time}|${alert.anomaly.detected_at}>`,
        },
        { type: "mrkdwn", text: `*Severity*\n${label}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*:mag: Impact*\n${alert.impact}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*:bulb: Root cause*\n${alert.root_cause}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:wrench: Recommended action*\n${alert.recommended_action}`,
      },
    },
    { type: "divider" },
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
          text: { type: "plain_text", text: "Start an Incident", emoji: true },
          style: "danger",
          value: alert.id,
          action_id: "start_incident",
        },
      ],
    },
  ];

  return { blocks, color, text };
}
