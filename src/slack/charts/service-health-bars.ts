// Horizontal bars — error rate % only. Do not mix volume on the same axis
// (Chart.js dual-axis + indexAxis:y swaps labels and hides a 0.01% rate).

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
        ],
      },
      options: {
        indexAxis: "y",
        scales: {
          x: {
            title: { display: true, text: "Error rate %", color: COLORS.subtext },
            min: 0,
            suggestedMax: Math.max(5, ...sorted.map((s) => s.error_rate)),
          },
        },
      },
    },
    {
      width: 800,
      height: Math.max(300, 80 + labels.length * 50),
      title: opts.title ?? "Error rate by service",
    }
  );
}
