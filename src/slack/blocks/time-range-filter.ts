// Time-range quick-filter buttons — appended after any stats/query reply.
// Clicking a button re-runs the same tool query scoped to that time window.

export interface TimeRangeContext {
  toolName: string;
  tenantId: string;
  service?: string;   // if scoped to one service
}

const RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
] as const;

export function buildTimeRangeButtons(ctx: TimeRangeContext): object {
  return {
    type: "actions",
    block_id: "time_range_filter",
    elements: RANGES.map((r) => ({
      type: "button",
      text: { type: "plain_text", text: r.label, emoji: false },
      value: JSON.stringify({ ...ctx, hours: r.hours }),
      action_id: `time_range_${r.label}`,
    })),
  };
}

export function hoursToTimeRange(hours: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
