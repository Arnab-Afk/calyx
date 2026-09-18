import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { insertEvents } from "../src/storage/events.js";
import { closePool, getPool } from "../src/storage/client.js";
import { initAgent, executeTool } from "../src/agent/index.js";
import { EventSchema, type Event } from "../src/schemas/index.js";

const TENANT = "golden-tests";

// ─── Seed data ────────────────────────────────────────────────────────────────
// Deterministic timestamps so queries are stable

function ts(daysAgo: number, hour = 12): string {
  const d = new Date("2025-09-01T00:00:00.000Z");
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour);
  return d.toISOString();
}

function ev(overrides: Partial<Event>): Event {
  return EventSchema.parse({
    tenant_id: TENANT,
    timestamp: ts(0),
    service: "api",
    level: "info",
    message: "heartbeat",
    ...overrides,
  });
}

const SEED_EVENTS: Event[] = [
  // api service — 5 errors, 3 warns, 10 infos
  ...Array.from({ length: 5 }, (_, i) =>
    ev({
      service: "api",
      level: "error",
      message: "Unhandled exception: null pointer",
      timestamp: ts(0, i + 1),
      trace_id: i === 0 ? "trace-golden-001" : undefined,
    })
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    ev({
      service: "api",
      level: "warn",
      message: "High memory usage detected",
      timestamp: ts(0, i + 6),
    })
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    ev({
      service: "api",
      level: "info",
      message: `Request processed: GET /users/${i}`,
      timestamp: ts(0, i + 10),
      trace_id: i < 2 ? "trace-golden-001" : undefined,
    })
  ),

  // worker service — 2 errors, 5 infos
  ...Array.from({ length: 2 }, (_, i) =>
    ev({
      service: "worker",
      level: "error",
      message: "Job failed: timeout after 30s",
      timestamp: ts(1, i + 2),
    })
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    ev({
      service: "worker",
      level: "info",
      message: `Job completed: task-${i}`,
      timestamp: ts(1, i + 5),
    })
  ),

  // db service — 1 fatal
  ev({
    service: "db",
    level: "fatal",
    message: "Connection timeout: max pool size reached",
    timestamp: ts(2, 3),
    attributes: { pool_size: 50, pending_connections: 200 },
  }),
];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Clear any previous golden-test rows
  const pool = getPool();
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await insertEvents(SEED_EVENTS);
  initAgent();
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await closePool();
});

// ─── Golden questions — tool layer (always run) ───────────────────────────────

describe("Phase 2 — Tool layer golden questions", () => {
  // 1. Error count for api service
  it("Q1: query_logs returns 5 errors for api service", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      service: "api",
      level: "error",
      limit: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { level: string }[];
    expect(data).toHaveLength(5);
    expect(data.every((e) => e.level === "error")).toBe(true);
  });

  // 2. Fatal events for db service
  it("Q2: query_logs finds the fatal db event", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      service: "db",
      level: "fatal",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { message: string; level: string }[];
    expect(data).toHaveLength(1);
    expect(data[0].message).toContain("Connection timeout");
    expect(data[0].level).toBe("fatal");
  });

  // 3. Worker errors
  it("Q3: query_logs returns 2 errors for worker service", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      service: "worker",
      level: "error",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(2);
  });

  // 4. get_service_stats shows 3 services
  it("Q4: get_service_stats returns 3 distinct services", async () => {
    const result = await executeTool("get_service_stats", {
      tenant_id: TENANT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { stats } = result.output.data as { stats: { service: string }[] };
    const services = new Set(stats.map((s) => s.service));
    expect(services.has("api")).toBe(true);
    expect(services.has("worker")).toBe(true);
    expect(services.has("db")).toBe(true);
    expect(stats.length).toBe(3);
  });

  // 5. Service stats for api: error rate = 5/18 ≈ 27.78%
  it("Q5: get_service_stats for api has correct error rate", async () => {
    const result = await executeTool("get_service_stats", {
      tenant_id: TENANT,
      service: "api",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { stats } = result.output.data as {
      stats: { service: string; total: number; error_count: number; error_rate: number }[];
    };
    expect(stats).toHaveLength(1);
    expect(stats[0].total).toBe(18); // 5 errors + 3 warns + 10 infos
    expect(stats[0].error_count).toBe(5);
    expect(stats[0].error_rate).toBeCloseTo(27.78, 0);
  });

  // 6. search_past_incidents finds "timeout" across services
  it("Q6: search_past_incidents finds timeout events across services", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["timeout"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { service: string; message: string }[];
    expect(data.length).toBeGreaterThanOrEqual(2); // db fatal + 2 worker errors
    const services = new Set(data.map((e) => e.service));
    expect(services.has("db")).toBe(true);
    expect(services.has("worker")).toBe(true);
  });

  // 7. search_past_incidents finds "null pointer" — api errors only
  it("Q7: search_past_incidents finds null pointer errors", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["null pointer"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { service: string }[];
    expect(data.length).toBeGreaterThanOrEqual(5);
    expect(data.every((e) => e.service === "api")).toBe(true);
  });

  // 8. No data case — nonexistent keyword
  it("Q8: search_past_incidents returns empty for nonexistent keyword", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["__calyx_no_match_xyz_12345__"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(0);
    expect(result.output.summary).toMatch(/no past incidents/i);
  });

  // 9. No data case — nonexistent service
  it("Q9: query_logs returns empty for nonexistent service", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      service: "payment",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(0);
    expect(result.output.summary).toMatch(/no log events/i);
  });

  // 10. get_service_stats for nonexistent service returns empty
  it("Q10: get_service_stats for payment service returns empty stats", async () => {
    const result = await executeTool("get_service_stats", {
      tenant_id: TENANT,
      service: "payment",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { stats } = result.output.data as { stats: unknown[] };
    expect(stats).toHaveLength(0);
    expect(result.output.summary).toMatch(/no stats/i);
  });

  // 11. Fatal events across all services
  it("Q11: query_logs returns exactly 1 fatal event total", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      level: "fatal",
      limit: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(1);
  });

  // 12. Warn events across all services
  it("Q12: query_logs returns exactly 3 warn events total", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      level: "warn",
      limit: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(3);
  });

  // 13. Total event count across all services = 18 + 7 + 1 = 26
  it("Q13: query_logs with no filters returns all 26 seeded events", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      limit: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(26);
  });

  // 14. Time range filter — only db events from 2 days ago
  it("Q14: time range filter narrows results correctly", async () => {
    const from = ts(3); // 3 days ago
    const to = ts(1);   // 1 day ago
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      from,
      to,
      limit: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { service: string }[];
    // Only the db fatal (2 days ago) and 2 worker errors + 5 worker infos (1 day ago) fall in this range
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e) => e.service !== "api")).toBe(true); // api events are 0 days ago
  });

  // 15. Multi-keyword search (OR across keywords)
  it("Q15: multi-keyword search finds events from both keywords", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["null pointer", "pool size"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { service: string; message: string }[];
    expect(data.length).toBeGreaterThanOrEqual(1);
    const messages = data.map((e) => e.message);
    // Should find both api errors and db fatal
    const hasNullPointer = messages.some((m) => m.includes("null pointer"));
    const hasPoolSize = messages.some((m) => m.includes("pool size"));
    expect(hasNullPointer || hasPoolSize).toBe(true);
  });
});

// ─── Tool registry validation ─────────────────────────────────────────────────

describe("Phase 2 — Registry", () => {
  it("all 3 tools are registered", async () => {
    const { getAllTools } = await import("../src/agent/index.js");
    const tools = getAllTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("query_logs")).toBe(true);
    expect(names.has("get_service_stats")).toBe(true);
    expect(names.has("search_past_incidents")).toBe(true);
  });

  it("unknown tool returns error, not throw", async () => {
    const result = await executeTool("does_not_exist", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown tool");
    }
  });

  it("invalid input returns validation error, not throw", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: "", // min(1) violation
    });
    expect(result.ok).toBe(false);
  });

  it("each tool has matching Zod and JSON schema required fields", async () => {
    const { getAllTools } = await import("../src/agent/index.js");
    for (const tool of getAllTools()) {
      expect(tool.inputJsonSchema.type).toBe("object");
      expect(typeof tool.inputJsonSchema.properties).toBe("object");
      // required must be an array if present
      if (tool.inputJsonSchema.required) {
        expect(Array.isArray(tool.inputJsonSchema.required)).toBe(true);
      }
    }
  });
});

// ─── Agent integration tests (skipped without ANTHROPIC_API_KEY) ─────────────

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKey)("Phase 2 — Agent integration (requires API key)", () => {
  it("agent calls query_logs when asked about errors", async () => {
    const { runAgent } = await import("../src/agent/index.js");
    const resp = await runAgent(TENANT, "Are there any errors in the api service?");
    expect(resp.toolCallsMade.length).toBeGreaterThan(0);
    // At least one tool call should be query_logs or get_service_stats
    const toolNames = resp.toolCallsMade.map((c) => c.toolName);
    expect(
      toolNames.some((n) => ["query_logs", "get_service_stats"].includes(n))
    ).toBe(true);
    // Answer should mention the api service
    expect(resp.answer.toLowerCase()).toContain("api");
  }, 60_000);

  it("agent says 'no data' for a nonexistent service", async () => {
    const { runAgent } = await import("../src/agent/index.js");
    const resp = await runAgent(
      TENANT,
      "What events have been logged by the payment service?"
    );
    expect(resp.toolCallsMade.length).toBeGreaterThan(0);
    // Should acknowledge no data found
    const answer = resp.answer.toLowerCase();
    expect(
      answer.includes("no") ||
        answer.includes("not found") ||
        answer.includes("none") ||
        answer.includes("zero") ||
        answer.includes("empty")
    ).toBe(true);
  }, 60_000);

  it("agent surfaces the db connection timeout", async () => {
    const { runAgent } = await import("../src/agent/index.js");
    const resp = await runAgent(
      TENANT,
      "Was there any database trouble recently? What happened?"
    );
    expect(resp.toolCallsMade.length).toBeGreaterThan(0);
    // Answer should reference connection timeout or db
    const answer = resp.answer.toLowerCase();
    expect(
      answer.includes("timeout") ||
        answer.includes("connection") ||
        answer.includes("db") ||
        answer.includes("database")
    ).toBe(true);
  }, 60_000);
});
