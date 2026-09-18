// Scatter / bubble chart — events plotted by time × error rate, bubble size = volume.
// Good for "show me the anomaly timeline" or after an incident investigation.

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";

export interface AnomalyPoint {
  time: string;        // label for x axis
  errorRate: number;   // y axis
  volume: number;      // bubble radius
  service: string;
  isAnomaly?: boolean;
}

export async function anomalyScatter(
  points: AnomalyPoint[],
  opts: RenderOptions = {}
): Promise<Buffer> {
  const services = [...new Set(points.map((p) => p.service))];

  const datasets = services.map((svc, i) => {
    const svcPoints = points.filter((p) => p.service === svc);
    return {
      label: svc,
      data: svcPoints.map((p, idx) => ({ x: idx, y: p.errorRate, r: Math.max(4, Math.sqrt(p.volume) * 0.4) })),
      backgroundColor: svcPoints.map((p) =>
        p.isAnomaly
          ? COLORS.critical + "cc"
          : (COLORS.series[i % COLORS.series.length] + "88")
      ),
      borderColor: svcPoints.map((p) =>
        p.isAnomaly ? COLORS.critical : COLORS.series[i % COLORS.series.length]
      ),
      borderWidth: svcPoints.map((p) => (p.isAnomaly ? 2 : 1)),
    };
  });

  const allTimes = [...new Set(points.map((p) => p.time))];

  return renderChart(
    {
      type: "bubble",
      data: { datasets },
      options: {
        scales: {
          x: {
            ticks: {
              callback: (val: number | string) => allTimes[val as number] ?? val,
              maxTicksLimit: 12,
            },
            title: { display: true, text: "Time", color: COLORS.subtext },
          },
          y: {
            title: { display: true, text: "Error rate %", color: COLORS.subtext },
            min: 0,
          },
        },
      },
    },
    {
      width: 900,
      height: 400,
      title: opts.title ?? "Anomaly Timeline",
    }
  );
}
