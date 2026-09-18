// Line/area chart — error rate over time for one or more services.
// Good answer to "when did errors start?" or "show me the trend."

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";

export interface TimePoint {
  time: string;   // ISO timestamp or label like "14:30"
  value: number;
}

export interface TimeSeries {
  label: string;
  points: TimePoint[];
  color?: string;
}

export async function errorTimeseries(
  series: TimeSeries[],
  opts: RenderOptions & { yLabel?: string } = {}
): Promise<Buffer> {
  return renderChart(
    {
      type: "line",
      data: {
        labels: series[0]?.points.map((p) => p.time) ?? [],
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.points.map((p) => p.value),
          borderColor: s.color ?? COLORS.series[i % COLORS.series.length],
          backgroundColor: (s.color ?? COLORS.series[i % COLORS.series.length]) + "22",
          fill: true,
          tension: 0.3,
          pointRadius: series[0]?.points.length <= 20 ? 4 : 2,
          pointHoverRadius: 6,
          borderWidth: 2,
        })),
      },
      options: {
        interaction: { mode: "index" as const, intersect: false },
        scales: {
          x: {
            title: { display: true, text: "Time", color: COLORS.subtext },
            ticks: { maxTicksLimit: 12, maxRotation: 45 },
          },
          y: {
            title: {
              display: true,
              text: opts.yLabel ?? "Error rate %",
              color: COLORS.subtext,
            },
            min: 0,
            suggestedMax: 100,
          },
        },
      },
    },
    {
      width: 900,
      height: 380,
      title: opts.title ?? "Error Rate Over Time",
    }
  );
}
