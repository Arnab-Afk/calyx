// Base chart renderer — all chart types go through this.
// Returns a PNG buffer ready to upload to Slack.

import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";

// Calyx design tokens — dark-first, works in both light and dark Slack themes
export const COLORS = {
  // Severity
  ok: "#2eb67d",       // green
  warn: "#ecb22e",     // amber
  error: "#e01e5a",    // red
  critical: "#9b0000", // deep red
  fatal: "#6b0a0a",    // very deep red

  // Log levels
  debug: "#aaaaaa",
  info: "#36c5f0",
  warning: "#ecb22e",

  // Palette for multi-series
  series: [
    "#36c5f0", // cyan
    "#2eb67d", // green
    "#ecb22e", // amber
    "#e01e5a", // red/pink
    "#9b59b6", // purple
    "#e67e22", // orange
    "#1abc9c", // teal
    "#3498db", // blue
  ],

  // Canvas
  background: "#1a1d21",  // Slack dark sidebar color
  surface: "#222529",
  text: "#d1d2d3",
  subtext: "#868686",
  grid: "#2d3136",
  border: "#3d4147",
};

export interface RenderOptions {
  width?: number;
  height?: number;
  title?: string;
}

export async function renderChart(
  config: ChartConfiguration,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const { width = 800, height = 400 } = opts;

  const canvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: COLORS.background,
  });

  // Merge global defaults into the config
  const merged: ChartConfiguration = {
    ...config,
    options: {
      responsive: false,
      animation: false as never,
      plugins: {
        legend: {
          labels: {
            color: COLORS.text,
            font: { family: "sans-serif", size: 12 },
          },
          ...(config.options?.plugins?.legend ?? {}),
        },
        title: opts.title
          ? {
              display: true,
              text: opts.title,
              color: COLORS.text,
              font: { family: "sans-serif", size: 14, weight: "bold" as const },
              padding: { bottom: 12 },
            }
          : { display: false },
        ...(config.options?.plugins ?? {}),
      },
      scales:
        config.type === "pie" || config.type === "doughnut"
          ? {}
          : {
              x: {
                ticks: { color: COLORS.subtext, font: { size: 11 } },
                grid: { color: COLORS.grid },
                border: { color: COLORS.border },
                ...(config.options?.scales?.x ?? {}),
              },
              y: {
                ticks: { color: COLORS.subtext, font: { size: 11 } },
                grid: { color: COLORS.grid },
                border: { color: COLORS.border },
                ...(config.options?.scales?.y ?? {}),
              },
              ...(config.options?.scales ?? {}),
            },
      ...config.options,
    },
  };

  return canvas.renderToBuffer(merged);
}
