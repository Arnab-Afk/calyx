// Chart generation tests — validate each chart type produces correct output
// without needing a live Slack or database connection.

import { describe, it, expect } from "vitest";
import {
  renderChartForSlack,
  autoChartType,
  type ChartRequest,
} from "../src/slack/charts/index.js";
import {
  sparkline,
  trendArrow,
  buildStatusBarsMessage,
} from "../src/slack/charts/text-status-bar.js";

// ─── Text chart helpers ───────────────────────────────────────────────────────

describe("sparkline", () => {
  it("returns empty string for empty input", () => {
    expect(sparkline([])).toBe("");
  });

  it("uses low glyph for low values", () => {
    const result = sparkline([0, 0, 0]);
    expect(result).toBe("▁▁▁");
  });

  it("uses max glyph for the peak", () => {
    const result = sparkline([0, 50, 100]);
    // Peak is at the end
    expect(result[result.length - 1]).toBe("█");
  });

  it("length matches input array", () => {
    const values = [10, 20, 30, 40, 50];
    expect(sparkline(values)).toHaveLength(5);
  });
});

describe("trendArrow", () => {
  it("returns right arrow for single value", () => {
    expect(trendArrow([5])).toBe(":arrow_right:");
  });

  it("returns up arrow for rising trend", () => {
    expect(trendArrow([1, 5, 20])).toBe(":arrow_upper_right:");
  });

  it("returns down arrow for falling trend", () => {
    expect(trendArrow([20, 5, 1])).toBe(":arrow_lower_right:");
  });

  it("returns right arrow for flat trend", () => {
    expect(trendArrow([10, 10, 10])).toBe(":arrow_right:");
  });
});

describe("buildStatusBarsMessage", () => {
  const services = [
    { service: "api-gateway", errorRate: 2.5, total: 1000, errorCount: 25 },
    { service: "auth-service", errorRate: 0.1, total: 5000, errorCount: 5 },
    { service: "payment-worker", errorRate: 15, total: 200, errorCount: 30 },
  ];

  it("returns a non-empty blocks array", () => {
    const blocks = buildStatusBarsMessage(services);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("starts with a header block", () => {
    const blocks = buildStatusBarsMessage(services) as { type: string }[];
    expect(blocks[0].type).toBe("header");
  });

  it("sorts services by error rate descending", () => {
    const blocks = buildStatusBarsMessage(services) as {
      type: string;
      text?: { text: string };
    }[];
    const sections = blocks.filter((b) => b.type === "section");
    // First section should be payment-worker (15% error rate)
    expect(sections[0].text?.text).toContain("payment-worker");
  });

  it("includes total events in output", () => {
    const blocks = buildStatusBarsMessage(services) as { type: string }[];
    const json = JSON.stringify(blocks);
    expect(json).toContain("6,200"); // 1000 + 5000 + 200
  });
});

// ─── autoChartType ────────────────────────────────────────────────────────────

describe("autoChartType", () => {
  it("returns null for 'none' hint", () => {
    expect(autoChartType("none", {})).toBeNull();
  });

  it("returns error-timeseries for 'timeseries' hint", () => {
    expect(autoChartType("timeseries", [])).toBe("error-timeseries");
  });

  it("returns service-health-bars when bar hint + stats array", () => {
    const data = { stats: [{ service: "x", error_rate: 5 }] };
    expect(autoChartType("bar", data)).toBe("service-health-bars");
  });

  it("returns event-volume-bar for plain bar hint", () => {
    expect(autoChartType("bar", [])).toBe("event-volume-bar");
  });

  it("returns text-status-bars for table hint with error_rate data", () => {
    const data = [{ service: "x", error_rate: 5 }];
    expect(autoChartType("table", data)).toBe("text-status-bars");
  });

  it("returns null for table hint without error_rate data", () => {
    const data = [{ id: 1, message: "hello" }];
    expect(autoChartType("table", data)).toBeNull();
  });
});

// ─── PNG chart rendering (chartjs-node-canvas) ────────────────────────────────

const STATS = [
  {
    service: "api-gateway",
    total: 1200,
    by_level: { debug: 120, info: 900, warn: 120, error: 60, fatal: 0 },
    error_count: 60,
    error_rate: 5.0,
    first_seen: "2026-08-21T00:00:00Z",
    last_seen: "2026-08-21T01:00:00Z",
  },
  {
    service: "auth",
    total: 800,
    by_level: { debug: 6, info: 740, warn: 50, error: 4, fatal: 0 },
    error_count: 4,
    error_rate: 0.5,
    first_seen: "2026-08-21T00:00:00Z",
    last_seen: "2026-08-21T01:00:00Z",
  },
];

describe("renderChartForSlack — PNG charts", () => {
  it("service-health-bars produces a PNG buffer", async () => {
    const result = await renderChartForSlack({
      type: "service-health-bars",
      data: STATS,
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.length).toBeGreaterThan(1000);
    // PNG magic bytes
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
    expect(result.caption).toContain("api-gateway");
  });

  it("service-health-bars accepts wrapped { stats } tool output", async () => {
    const result = await renderChartForSlack({
      type: "service-health-bars",
      data: { stats: STATS, total_events: 2000, overall_error_rate: 3.2 },
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
  });

  it("level-donut produces a PNG buffer", async () => {
    const result = await renderChartForSlack({
      type: "level-donut",
      data: { debug: 100, info: 800, warn: 50, error: 40, fatal: 5 },
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
  });

  it("error-timeseries produces a PNG buffer", async () => {
    const series = [
      {
        label: "api-gateway",
        points: [
          { time: "10:00", value: 2 },
          { time: "10:05", value: 5 },
          { time: "10:10", value: 12 },
        ],
      },
    ];
    const result = await renderChartForSlack({
      type: "error-timeseries",
      data: series,
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
    expect(result.caption).toContain("12.0%");
  });

  it("event-volume-bar produces a PNG buffer", async () => {
    const result = await renderChartForSlack({
      type: "event-volume-bar",
      data: STATS,
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
    expect(result.caption).toContain("2,000"); // 1200 + 800
  });

  it("gauge produces a PNG buffer", async () => {
    const result = await renderChartForSlack({
      type: "gauge",
      data: { value: 7.3, label: "Error rate", maxValue: 100 },
    });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
    expect(result.caption).toContain("7.3");
  });

  it("sparkline-grid produces a PNG buffer", async () => {
    const series = [
      { label: "svc-a", points: [{ time: "t1", value: 1 }, { time: "t2", value: 3 }] },
      { label: "svc-b", points: [{ time: "t1", value: 5 }, { time: "t2", value: 2 }] },
    ];
    const result = await renderChartForSlack({ type: "sparkline-grid", data: series });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
  });

  it("anomaly-scatter produces a PNG buffer", async () => {
    const points = [
      { time: "10:00", errorRate: 2, volume: 100, service: "api", isAnomaly: false },
      { time: "10:05", errorRate: 18, volume: 95, service: "api", isAnomaly: true },
    ];
    const result = await renderChartForSlack({ type: "anomaly-scatter", data: points });
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image!.slice(0, 4).toString("hex")).toBe("89504e47");
    expect(result.caption).toContain("1 anomalous");
  });
});

// ─── Text chart blocks ────────────────────────────────────────────────────────

describe("renderChartForSlack — text-status-bars", () => {
  it("returns blocks array, no image", async () => {
    const result = await renderChartForSlack({
      type: "text-status-bars",
      data: [
        { service: "api", errorRate: 5, total: 1000, errorCount: 50 },
      ],
    });
    expect(result.image).toBeUndefined();
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(result.blocks!.length).toBeGreaterThan(0);
  });
});
