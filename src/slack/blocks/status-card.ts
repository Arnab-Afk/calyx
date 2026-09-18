import type { ServiceDailyHealth, ServiceStats } from "../../storage/events.js";

const TICK: Record<string, string> = {
  ok: ":large_green_square:",
  warn: ":large_yellow_square:",
  error: ":red_square:",
  empty: ":white_large_square:",
};

export interface StatusOverviewInput {
  stats: ServiceStats[];
  daily?: ServiceDailyHealth[];
  totalEvents: number;
  overallErrorRate: number;
}

function warnRate(s: ServiceStats): number {
  const warns = s.by_level?.warn ?? 0;
  return s.total > 0 ? (warns / s.total) * 100 : 0;
}

function headline(stats: ServiceStats[]): { emoji: string; text: string } {
  const noisy = stats.filter((s) => warnRate(s) >= 10);
  const hot = stats.filter((s) => s.error_rate >= 1 || s.error_count >= 20);
  if (hot.length > 0) {
    return {
      emoji: ":red_circle:",
      text: `${hot.length} service${hot.length === 1 ? "" : "s"} with elevated errors`,
    };
  }
  if (noisy.length > 0) {
    return {
      emoji: ":large_green_circle:",
      text: `All systems operational. ${noisy.length} service${noisy.length === 1 ? "" : "s"} noisy (warns), no elevated error rates.`,
    };
  }
  return {
    emoji: ":large_green_circle:",
    text: "All systems operational. No elevated error rates detected.",
  };
}

function ticksFor(service: string, daily: ServiceDailyHealth[] | undefined): string {
  const row = daily?.find((d) => d.service === service);
  const n = row?.days.length ?? daily?.[0]?.days.length ?? 0;
  if (n === 0) return "";
  if (!row) return Array.from({ length: n }, () => TICK.empty).join("");
  return row.days.map((d) => TICK[d.status] ?? TICK.empty).join("");
}

function dayAxis(): string {
  return `${TICK.ok} ok   ${TICK.warn} warn   ${TICK.error} error   ${TICK.empty} no data`;
}

/**
 * Slack status card: banner, service pills, 7-day ticks.
 * Interactivity is the buttons the adapter appends — not hover on a PNG.
 */
export function buildStatusOverviewCard(input: StatusOverviewInput): object[] {
  const { stats, daily, totalEvents, overallErrorRate } = input;
  if (stats.length === 0) return [];

  const { emoji, text } = headline(stats);
  const pills = stats
    .slice(0, 8)
    .map((s) => `\`${s.service}\``)
    .join("  ");
  const extra = stats.length > 8 ? `  +${stats.length - 8} more` : "";
  const errors = stats.reduce((n, s) => n + s.error_count, 0);

  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${emoji} *${text}*` },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Monitoring: ${pills}${extra}`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${totalEvents.toLocaleString()} events  ·  ${errors} errors (${overallErrorRate.toFixed(2)}%)`,
        },
      ],
    },
  ];

  const hasTicks = (daily ?? []).some((d) => d.days.length > 0);
  if (hasTicks) {
    blocks.push({ type: "divider" });
    const lines = [...stats]
      .sort((a, b) => b.error_count - a.error_count || b.total - a.total)
      .map((s) => {
        const t = ticksFor(s.service, daily);
        const warns = s.by_level?.warn ?? 0;
        const note =
          s.error_count > 0
            ? `${s.error_count} errors`
            : warns > 0
              ? `${warns.toLocaleString()} warns`
              : "healthy";
        return t ? `*${s.service}*\n${t}  _${note}_` : `*${s.service}*  _${note}_`;
      });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n\n").slice(0, 2900) },
    });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: dayAxis() }],
    });
  }

  return blocks;
}