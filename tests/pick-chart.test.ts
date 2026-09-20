import { describe, expect, it } from "vitest";
import { pickChartFromToolCalls } from "../src/slack/pick-chart.js";

describe("pickChartFromToolCalls", () => {
  it("prefers get_service_stats over trailing query_logs", () => {
    const picked = pickChartFromToolCalls([
      {
        toolName: "get_service_stats",
        output: {
          summary: "ok",
          visualization_hint: "bar",
          data: {
            stats: [
              {
                service: "prohuman-api",
                total: 100,
                error_count: 2,
                error_rate: 2,
                by_level: { info: 98, error: 2 },
              },
            ],
          },
        },
      },
      {
        toolName: "query_logs",
        output: {
          summary: "logs",
          visualization_hint: "table",
          data: [
            {
              message: "hello",
              level: "info",
              service: "prohuman-api",
              timestamp: "2026-01-01T00:00:00Z",
            },
          ],
        },
      },
      {
        toolName: "get_change_context",
        output: {
          summary: "changes",
          visualization_hint: "table",
          data: { commits: [{ sha: "abcdef1", message: "fix stuff" }], deployments: [] },
        },
      },
    ]);

    expect(picked?.chartType).toBe("service-health-bars");
    expect(Array.isArray(picked?.chartData)).toBe(true);
    expect((picked?.chartData as Array<{ service: string }>)[0]?.service).toBe("prohuman-api");
  });

  it("falls back to error-digest from query_logs", () => {
    const picked = pickChartFromToolCalls([
      {
        toolName: "query_logs",
        output: {
          summary: "logs",
          visualization_hint: "table",
          data: [
            { message: "boom", level: "error", service: "api", timestamp: "t1" },
            { message: "boom", level: "error", service: "api", timestamp: "t2" },
            { message: "ok", level: "info", service: "api", timestamp: "t3" },
          ],
        },
      },
    ]);
    expect(picked?.chartType).toBe("error-digest");
    expect((picked?.chartData as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });
});
