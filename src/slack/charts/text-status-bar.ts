// Text-based status bars — pure Block Kit, no image upload required.
// Works even if the Slack bot doesn't have files:write scope.
// Great for quick "is X healthy?" answers inline in a thread.

const BAR_WIDTH = 20;
const FILLED = "█";
const EMPTY = "░";

function statusEmoji(errorRate: number): string {
  if (errorRate >= 20) return ":red_circle:";
  if (errorRate >= 10) return ":large_orange_circle:";
  if (errorRate >= 5) return ":large_yellow_circle:";
  return ":large_green_circle:";
}

function progressBar(fraction: number, width = BAR_WIDTH): string {
  const filled = Math.round(fraction * width);
  return FILLED.repeat(filled) + EMPTY.repeat(width - filled);
}

export interface StatusBarService {
  service: string;
  errorRate: number;
  total: number;
  errorCount: number;
}

// Returns a Slack Block Kit section for a service's health bar
export function serviceStatusBlock(s: StatusBarService): object {
  const emoji = statusEmoji(s.errorRate);
  const bar = progressBar(s.errorRate / 100);
  const label = s.errorRate >= 1
    ? `${s.errorRate.toFixed(1)}% errors`
    : "healthy";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${emoji} *${s.service}*\n\`${bar}\` ${label} — ${s.total.toLocaleString()} events, ${s.errorCount} errors`,
    },
  };
}

// Returns a full Block Kit message with status bars for all services
export function buildStatusBarsMessage(services: StatusBarService[]): object[] {
  const sorted = [...services].sort((a, b) => b.errorRate - a.errorRate);

  const overallError = sorted.reduce((s, svc) => s + svc.errorCount, 0);
  const overallTotal = sorted.reduce((s, svc) => s + svc.total, 0);
  const overallRate = overallTotal > 0 ? (overallError / overallTotal) * 100 : 0;
  const overallEmoji = statusEmoji(overallRate);

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${overallEmoji} System Health — ${sorted.length} services`,
        emoji: true,
      },
    },
    { type: "divider" },
    ...sorted.map(serviceStatusBlock),
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Overall: ${overallRate.toFixed(1)}% error rate across ${overallTotal.toLocaleString()} events`,
        },
      ],
    },
  ];
}

// Inline sparkline using Unicode block elements ▁▂▃▄▅▆▇█
const SPARK_CHARS = "▁▂▃▄▅▆▇█";

export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0.001);
  return values
    .map((v) => SPARK_CHARS[Math.min(7, Math.floor((v / max) * 7))])
    .join("");
}

// Trend arrow based on first vs last value
export function trendArrow(values: number[]): string {
  if (values.length < 2) return ":arrow_right:";
  const delta = values[values.length - 1] - values[0];
  if (delta > values[0] * 0.1) return ":arrow_upper_right:";
  if (delta < -values[0] * 0.1) return ":arrow_lower_right:";
  return ":arrow_right:";
}
