// Service drill-down buttons — appended after multi-service stats replies.
// Clicking a service button re-runs get_service_stats for just that service
// and posts a gauge + timeseries in-thread.

export function buildServiceDrilldownButtons(
  tenantId: string,
  services: string[]
): object | null {
  // Only show up to 5 services (Slack actions block limit is 25 but UX degrades fast)
  const visible = services.slice(0, 5);
  if (visible.length < 2) return null; // no point drilling down on 1 service

  return {
    type: "actions",
    block_id: "service_drilldown",
    elements: visible.map((svc) => ({
      type: "button",
      text: { type: "plain_text", text: `↗ ${svc}`, emoji: false },
      value: JSON.stringify({ tenantId, service: svc }),
      action_id: "drill_down_service",
    })),
  };
}
