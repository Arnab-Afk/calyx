// Stacked bar chart — event volume by service, stacked by level.
// Good answer to "what's the traffic breakdown?" or "which service is noisiest?"

import { renderChart, COLORS, type RenderOptions } from "./renderer.js";
import type { ServiceStats } from "../../storage/events.js";

const LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
const LEVEL_COLORS: Record<string, string> = {
  debug: COLORS.debug,
  info: COLORS.info,
  warn: COLORS.warn,
  error: COLORS.error,
  fatal: COLORS.critical,
};

export async function eventVolumeBar(
  stats: ServiceStats[],
  opts: RenderOptions = {}
): Promise<Buffer> {
  const labels = stats.map((s) => s.service);

  const datasets = LEVELS.filter((level) =>
    stats.some((s) => (s.by_level[level] ?? 0) > 0)
  ).map((level) => ({
    label: level.charAt(0).toUpperCase() + level.slice(1),
    data: stats.map((s) => s.by_level[level] ?? 0),
    backgroundColor: LEVEL_COLORS[level],
    borderWidth: 0,
    borderRadius: level === "fatal" ? { topLeft: 4, topRight: 4 } as never : 0,
  }));

  return renderChart(
    {
      type: "bar",
      data: { labels, datasets },
      options: {
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            title: { display: true, text: "Event count", color: COLORS.subtext },
          },
        },
        plugins: {
          legend: { position: "top" },
        },
      },
    },
    {
      width: 800,
      height: 380,
      title: opts.title ?? "Event Volume by Service",
    }
  );
}
