import { autoChartType, type ChartType } from "./charts/index.js";
import { asLogEvents, toStatusBarServices, unwrapServiceStats } from "./tool-data.js";
import type { ToolOutput } from "../schemas/index.js";

export interface ChartableCall {
  toolName: string;
  output?: ToolOutput;
}

export interface PickedChart {
  chartType: ChartType | "approval-card" | "error-digest" | "data-table" | "release-notes" | "metric-chips";
  chartData: unknown;
}

/** Prefer health/stats cards over trailing log/table tools that autoChartType can't render. */
export function pickChartFromToolCalls(calls: ChartableCall[]): PickedChart | null {
  const remediation = [...calls]
    .reverse()
    .find((call) => call.toolName === "propose_remediation" && call.output?.data);
  if (remediation?.output?.data) {
    return { chartType: "approval-card", chartData: remediation.output.data };
  }

  let best: { score: number; picked: PickedChart } | null = null;

  for (const call of calls) {
    const picked = chartFromCall(call);
    if (!picked) continue;
    const score = scoreCall(call, picked.chartType);
    if (!best || score > best.score) {
      best = { score, picked };
    }
  }

  return best?.picked ?? null;
}

function scoreCall(call: ChartableCall, chartType: string): number {
  if (call.toolName === "get_service_stats") return 100;
  if (chartType === "service-health-bars" || chartType === "text-status-bars" || chartType === "metric-chips") {
    return 90;
  }
  if (call.toolName === "query_logs" || call.toolName === "tail_logs") return 60;
  if (call.toolName === "get_change_context") return 50;
  if (call.toolName === "list_incidents" || call.toolName === "search_incidents") return 40;
  return 20;
}

function chartFromCall(call: ChartableCall): PickedChart | null {
  const output = call.output;
  if (!output?.visualization_hint || output.visualization_hint === "none") return null;
  const data = output.data;

  if (call.toolName === "get_service_stats") {
    const stats = unwrapServiceStats(data);
    if (stats.length === 0) return null;
    return { chartType: "service-health-bars", chartData: stats };
  }

  if (call.toolName === "query_logs" || call.toolName === "tail_logs") {
    const events = asLogEvents(data);
    if (events.length === 0) return null;
    const digest = logsToErrorDigest(events);
    if (digest.items.length > 0) {
      return { chartType: "error-digest", chartData: digest };
    }
    return {
      chartType: "data-table",
      chartData: {
        caption: `${events.length} recent log lines`,
        columns: ["time", "service", "level", "message"],
        rows: events.slice(0, 12).map((e) => [
          e.timestamp ?? "",
          e.service ?? "",
          e.level ?? "",
          String(e.message ?? "").slice(0, 160),
        ]),
      },
    };
  }

  if (call.toolName === "get_change_context" && data && typeof data === "object") {
    const ctx = data as {
      commits?: Array<{
        sha?: string;
        message?: string;
        committed_at?: string;
        created_at?: string;
        timestamp?: string;
      }>;
      deployments?: Array<{ sha?: string; environment?: string; deployed_at?: string; created_at?: string }>;
      since?: string;
      until?: string;
    };
    const commits = Array.isArray(ctx.commits) ? ctx.commits : [];
    if (commits.length === 0 && !(ctx.deployments?.length)) return null;
    const items = commits.slice(0, 8).map((c) => {
      const sha = (c.sha ?? "").slice(0, 7);
      const msg = (c.message ?? "").split("\n")[0]?.slice(0, 100) || "commit";
      return sha ? `${sha} — ${msg}` : msg;
    });
    const shippedAt =
      commits[0]?.committed_at ??
      commits[0]?.created_at ??
      commits[0]?.timestamp ??
      ctx.deployments?.[0]?.deployed_at ??
      ctx.until ??
      ctx.since ??
      "recent";
    return {
      chartType: "release-notes",
      chartData: {
        version: commits[0]?.sha?.slice(0, 7) ?? "changes",
        shippedAt: String(shippedAt).slice(0, 32),
        items: items.length > 0 ? items : ["No commit messages in window"],
      },
    };
  }

  const typed = autoChartType(output.visualization_hint, data);
  if (!typed) return null;

  if (typed === "service-health-bars" || typed === "event-volume-bar") {
    const stats = unwrapServiceStats(data);
    return { chartType: typed, chartData: stats.length > 0 ? stats : data };
  }
  if (typed === "text-status-bars") {
    const stats = unwrapServiceStats(data);
    if (stats.length > 0) {
      return { chartType: "text-status-bars", chartData: toStatusBarServices(stats) };
    }
  }
  return { chartType: typed, chartData: data };
}

function logsToErrorDigest(events: Array<{ message?: string; level?: string; service?: string }>) {
  const preferred = events.filter((e) => e.level === "error" || e.level === "fatal" || e.level === "warn");
  const source = preferred.length > 0 ? preferred : events;
  const counts = new Map<string, { plain: string; count: number; route?: string }>();
  for (const event of source) {
    const plain = String(event.message ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!plain) continue;
    const key = plain.toLowerCase();
    const cur = counts.get(key) ?? { plain, count: 0, route: event.service };
    cur.count += 1;
    counts.set(key, cur);
  }
  return {
    period: "recent window",
    items: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
