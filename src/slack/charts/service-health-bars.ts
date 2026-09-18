// Horizontal status bar chart — one bar per service, colored by error rate.
// Great answer to "how is the system doing?" or "which services are unhealthy?"

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";
import type { ServiceStats } from "../../storage/events.js";

function healthColor(errorRate: number): string {
  if (errorRate >= 20) return COLORS.critical;
  if (errorRate >= 10) return COLORS.error;
  if (errorRate >= 5) return COLORS.warn;
  return COLORS.ok;
}

export async function serviceHealthBars(
  stats: ServiceStats[],
  opts: RenderOptions = {}
): Promise<Buffer> {
  const sorted = [...stats].sort((a, b) => b.error_rate - a.error_rate);
  const labels = sorted.map((s) => s.service);

  return renderChart(
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Error rate %",
            data: sorted.map((s) => s.error_rate),
            backgroundColor: sorted.map((s) => healthColor(s.error_rate)),
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: "Total events",
            data: sorted.map((s) => s.total),
            backgroundColor: COLORS.series[0] + "33",
            borderColor: COLORS.series[0],
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: "yTotal",
          },
        ],
      },
      options: {
        indexAxis: "y",
        scales: {
          x: {
            title: { display: true, text: "Error rate %", color: COLORS.subtext },
            min: 0,
          },
          yTotal: {
            type: "linear",
            position: "right",
            title: { display: true, text: "Total events", color: COLORS.subtext },
            grid: { drawOnChartArea: false },
          },
        },
      },
    },
    {
      width: 800,
      height: Math.max(300, 80 + labels.length * 50),
      title: opts.title ?? "Service Health Overview",
    }
  );
}
