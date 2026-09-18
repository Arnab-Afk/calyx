// Sparkline grid — small trend lines for multiple services on one chart.
// Good for "give me a quick view of all services" without the full time-series detail.

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";
import type { TimeSeries } from "./error-timeseries.js";

export async function sparklineGrid(
  series: TimeSeries[],
  opts: RenderOptions = {}
): Promise<Buffer> {
  const labels = series[0]?.points.map((p) => p.time) ?? [];

  return renderChart(
    {
      type: "line",
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.points.map((p) => p.value),
          borderColor: s.color ?? COLORS.series[i % COLORS.series.length],
          backgroundColor: "transparent",
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        scales: {
          x: { display: false },
          y: {
            min: 0,
            ticks: { maxTicksLimit: 4 },
          },
        },
        plugins: {
          legend: { position: "right" },
        },
      },
    },
    {
      width: 900,
      height: 280,
      title: opts.title ?? "Error Rate Sparklines",
    }
  );
}
