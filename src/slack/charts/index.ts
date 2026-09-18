// Chart dispatcher — given a ToolOutput, picks and renders the right chart.
// The AI never has to know which chart type to use; the visualization_hint
// and data shape determine it automatically.

import { serviceHealthBars } from "./service-health-bars.js";
import { levelDonut } from "./level-donut.js";
import { errorTimeseries } from "./error-timeseries.js";
import { eventVolumeBar } from "./event-volume-bar.js";
import { gauge } from "./gauge.js";
import { sparklineGrid } from "./sparkline-grid.js";
import { anomalyScatter } from "./anomaly-scatter.js";
import {
  buildStatusBarsMessage,
  sparkline,
  trendArrow,
} from "./text-status-bar.js";
import { unwrapServiceStats, toStatusBarServices } from "../tool-data.js";
import type { TimeSeries } from "./error-timeseries.js";
import type { AnomalyPoint } from "./anomaly-scatter.js";

export type ChartType =
  | "service-health-bars"   // horizontal bars per service, colored by error rate
  | "level-donut"           // donut of debug/info/warn/error/fatal
  | "error-timeseries"      // line chart: error rate over time
  | "event-volume-bar"      // stacked bar: event count by service × level
  | "gauge"                 // speedometer for a single metric
  | "sparkline-grid"        // mini trend lines for all services
  | "anomaly-scatter"       // bubble chart: time × error rate × volume
  | "text-status-bars";     // Block Kit text bars, no image upload

export interface ChartRequest {
  type: ChartType;
  title?: string;
  data: unknown;
}

export interface ChartResult {
  /** PNG image buffer — upload to Slack with files.upload */
  image?: Buffer;
  /** Block Kit blocks — post directly without file upload */
  blocks?: object[];
  /** Human-readable label shown in the thread alongside the chart */
  caption: string;
}

export async function renderChartForSlack(req: ChartRequest): Promise<ChartResult> {
  switch (req.type) {
    case "service-health-bars": {
      const stats = unwrapServiceStats(req.data);
      const image = await serviceHealthBars(stats, { title: req.title });
      const worst = [...stats].sort((a, b) => b.error_rate - a.error_rate)[0];
      return {
        image,
        caption:
          req.title ??
          `Service health — ${stats.length} services. Worst: ${worst?.service} at ${worst?.error_rate.toFixed(1)}% errors.`,
      };
    }

    case "level-donut": {
      const byLevel = req.data as Record<string, number>;
      const image = await levelDonut(byLevel, { title: req.title });
      const total = Object.values(byLevel).reduce((s, v) => s + v, 0);
      const errors = (byLevel.error ?? 0) + (byLevel.fatal ?? 0);
      return {
        image,
        caption: req.title ?? `${total.toLocaleString()} events — ${((errors / total) * 100).toFixed(1)}% error/fatal.`,
      };
    }

    case "error-timeseries": {
      const series = req.data as TimeSeries[];
      const image = await errorTimeseries(series, { title: req.title });
      const latest = series.map((s) => s.points[s.points.length - 1]?.value ?? 0);
      const maxNow = Math.max(...latest);
      return {
        image,
        caption: req.title ?? `Error rate trend — current max: ${maxNow.toFixed(1)}%.`,
      };
    }

    case "event-volume-bar": {
      const stats = unwrapServiceStats(req.data);
      const image = await eventVolumeBar(stats, { title: req.title });
      const total = stats.reduce((s, r) => s + r.total, 0);
      return {
        image,
        caption: req.title ?? `Event volume — ${total.toLocaleString()} events across ${stats.length} services.`,
      };
    }

    case "gauge": {
      const { value, label, maxValue } = req.data as { value: number; label?: string; maxValue?: number };
      const image = await gauge({ value, label, maxValue, title: req.title });
      return {
        image,
        caption: req.title ?? `${label ?? "Metric"}: ${value.toFixed(1)}${maxValue === undefined || maxValue === 100 ? "%" : ""}`,
      };
    }

    case "sparkline-grid": {
      const series = req.data as TimeSeries[];
      const image = await sparklineGrid(series, { title: req.title });
      const summaries = series
        .map((s) => {
          const vals = s.points.map((p) => p.value);
          return `${s.label}: ${sparkline(vals)} ${trendArrow(vals)}`;
        })
        .join("  |  ");
      return {
        image,
        caption: req.title ?? summaries,
      };
    }

    case "anomaly-scatter": {
      const points = req.data as AnomalyPoint[];
      const image = await anomalyScatter(points, { title: req.title });
      const anomalies = points.filter((p) => p.isAnomaly).length;
      return {
        image,
        caption: req.title ?? `Anomaly timeline — ${anomalies} anomalous window(s) detected.`,
      };
    }

    case "text-status-bars": {
      const stats = unwrapServiceStats(req.data);
      const services =
        stats.length > 0
          ? toStatusBarServices(stats)
          : (req.data as {
              service: string;
              errorRate: number;
              total: number;
              errorCount: number;
            }[]);
      const blocks = buildStatusBarsMessage(services);
      return {
        blocks,
        caption: req.title ?? "System health status",
      };
    }

    default:
      throw new Error(`Unknown chart type: ${(req as ChartRequest).type}`);
  }
}

// Auto-pick the best chart type from a ToolOutput visualization_hint + data shape
export function autoChartType(
  hint: "table" | "timeseries" | "bar" | "none",
  data: unknown
): ChartType | null {
  if (hint === "none") return null;

  if (hint === "timeseries") return "error-timeseries";

  if (hint === "bar") {
    if (unwrapServiceStats(data).length > 0) return "service-health-bars";
    return "event-volume-bar";
  }

  if (hint === "table") {
    const stats = unwrapServiceStats(data);
    if (stats.length > 0 && "error_rate" in stats[0]) {
      return "text-status-bars";
    }
    const arr = Array.isArray(data) ? data : [];
    if (arr[0] && typeof arr[0] === "object" && "error_rate" in arr[0]) {
      return "text-status-bars";
    }
    return null;
  }

  return null;
}
