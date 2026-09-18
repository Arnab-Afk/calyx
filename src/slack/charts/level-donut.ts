// Donut chart — event distribution by log level.
// Good answer to "what kinds of events are we seeing?" or "how noisy is the system?"

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";

const LEVEL_ORDER = ["debug", "info", "warn", "error", "fatal"] as const;
const LEVEL_COLORS: Record<string, string> = {
  debug: COLORS.debug,
  info: COLORS.info,
  warn: COLORS.warn,
  error: COLORS.error,
  fatal: COLORS.critical,
};

export async function levelDonut(
  byLevel: Record<string, number>,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const present = LEVEL_ORDER.filter((l) => (byLevel[l] ?? 0) > 0);
  const labels = present.map((l) => `${l.charAt(0).toUpperCase() + l.slice(1)} (${byLevel[l] ?? 0})`);
  const data = present.map((l) => byLevel[l] ?? 0);
  const colors = present.map((l) => LEVEL_COLORS[l] ?? COLORS.series[0]);

  return renderChart(
    {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderColor: COLORS.background,
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        cutout: "60%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: COLORS.text,
              padding: 14,
              font: { size: 13 },
            },
          },
        },
      },
    },
    {
      width: 640,
      height: 360,
      title: opts.title ?? "Event Distribution by Level",
    }
  );
}
