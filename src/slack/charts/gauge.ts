// Gauge chart — single metric with green/amber/red zones.
// Good for "what's the current error rate?" or "health score for X service."
// Implemented as a half-doughnut ("speedometer" style).

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";

export interface GaugeOpts extends RenderOptions {
  value: number;   // 0–100
  label?: string;  // e.g. "Error rate"
  maxValue?: number;
}

function zoneColor(value: number, max: number): string {
  const pct = (value / max) * 100;
  if (pct >= 20) return COLORS.critical;
  if (pct >= 10) return COLORS.error;
  if (pct >= 5) return COLORS.warn;
  return COLORS.ok;
}

export async function gauge(opts: GaugeOpts): Promise<Buffer> {
  const { value, label = "Value", maxValue = 100 } = opts;
  const clamped = Math.min(value, maxValue);
  const remaining = maxValue - clamped;
  const color = zoneColor(clamped, maxValue);

  return renderChart(
    {
      type: "doughnut",
      data: {
        datasets: [
          {
            // Value segment + empty remainder + hidden bottom half
            data: [clamped, remaining, maxValue],
            backgroundColor: [color, COLORS.surface, "transparent"],
            borderWidth: 0,
            circumference: 180,
            rotation: -90,
          },
        ],
      },
      options: {
        cutout: "75%",
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: [
              label,
              `${clamped.toFixed(1)}${maxValue === 100 ? "%" : ""}`,
            ],
            color: COLORS.text,
            font: { size: 16, weight: "bold" as const },
            padding: { top: 20 },
          },
        },
      },
    },
    {
      width: 500,
      height: 320,
      title: opts.title,
    }
  );
}
