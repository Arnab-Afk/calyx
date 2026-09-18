import { describe, it, expect } from "vitest";
import { buildStatusOverviewCard } from "../src/slack/blocks/status-card.js";
import { bucketStatus } from "../src/storage/events.js";
import type { ServiceStats } from "../src/storage/events.js";

function stats(partial: Partial<ServiceStats> & { service: string }): ServiceStats {
  return {
    total: 1000,
    by_level: { info: 1000 },
    error_count: 0,
    error_rate: 0,
    first_seen: "2026-08-01T00:00:00.000Z",
    last_seen: "2026-08-21T00:00:00.000Z",
    ...partial,
  };
}

describe("bucketStatus", () => {
  it("is empty when there are no events", () => {
    expect(bucketStatus(0, 0, 0)).toBe("empty");
  });

  it("is error when error count is material", () => {
    expect(bucketStatus(100, 10, 0)).toBe("error");
  });

  it("is warn when warn rate is high even with zero errors", () => {
    expect(bucketStatus(100, 0, 27)).toBe("warn");
  });

  it("is ok for clean traffic", () => {
    expect(bucketStatus(1000, 0, 2)).toBe("ok");
  });
});

describe("buildStatusOverviewCard", () => {
  it("leads with an operational banner when error rates are low", () => {
    const blocks = buildStatusOverviewCard({
      stats: [
        stats({ service: "eventio", total: 17697, error_count: 17, error_rate: 0.1, by_level: { error: 17, warn: 25 } }),
        stats({
          service: "swdc.somaiya.edu",
          total: 123339,
          error_count: 10,
          error_rate: 0.01,
          by_level: { warn: 32716, error: 10 },
        }),
      ],
      totalEvents: 141036,
      overallErrorRate: 0.02,
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain("All systems operational");
    expect(json).toContain("eventio");
    expect(json).toContain("swdc.somaiya.edu");
    expect(json).not.toContain("Error rate %");
  });

  it("renders 7-day ticks per service", () => {
    const days = ["01", "02", "03", "04", "05", "06", "07"].map((d, i) => ({
      date: `2026-08-${d}`,
      status: (i === 6 ? "warn" : "ok") as const,
      total: 10,
      error_count: 0,
      warn_count: i === 6 ? 8 : 0,
    }));
    const blocks = buildStatusOverviewCard({
      stats: [stats({ service: "eventio" })],
      daily: [{ service: "eventio", days }],
      totalEvents: 1000,
      overallErrorRate: 0,
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain(":large_green_square:");
    expect(json).toContain(":large_yellow_square:");
  });
});
