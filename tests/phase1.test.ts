import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { logsRoute } from "../src/ingestion/routes/v1/logs.js";
import { insertEvents, queryEvents, countEvents } from "../src/storage/events.js";
import { closePool, getPool } from "../src/storage/client.js";
import { z } from "zod";
import { EventSchema, type Event } from "../src/schemas/index.js";

// Use a test-specific tenant so runs don't interfere
const TENANT = `test-${Date.now()}`;

// ─── Test app (no Redis — writes directly to storage) ─────────────────────────

async function buildTestApp() {
  const app = Fastify();
  await app.register(cors);

  // Mirrors the production route exactly — queue replaced with direct insert
  app.post("/v1/logs", async (request, reply) => {
    const tenantId = (request.headers["x-tenant-id"] as string | undefined)?.trim();
    if (!tenantId) return reply.status(400).send({ error: "Missing X-Tenant-ID header" });

    const BatchSchema = z.union([EventSchema, z.array(EventSchema).min(1).max(1000)]);
    const parsed = BatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: "Validation failed", issues: parsed.error.issues });
    }

    const events = (Array.isArray(parsed.data) ? parsed.data : [parsed.data]).map(
      (e) => ({ ...e, tenant_id: tenantId })
    );
    const inserted = await insertEvents(events);
    return reply.status(202).send({ received: events.length, inserted });
  });

  await app.ready();
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Event> = {}): Event {
  return EventSchema.parse({
    tenant_id: TENANT,
    timestamp: new Date().toISOString(),
    service: "api",
    level: "info",
    message: "test event",
    ...overrides,
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
  // Clean up test tenant rows
  const pool = getPool();
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 1 — Ingestion + Storage", () => {
  it("rejects a request with no X-Tenant-ID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      payload: makeEvent(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects malformed payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      headers: { "x-tenant-id": TENANT },
      payload: { not_a_valid_event: true },
    });
    expect(res.statusCode).toBe(422);
  });

  it("accepts a single valid event and returns 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      headers: { "x-tenant-id": TENANT, "content-type": "application/json" },
      payload: makeEvent({ message: "single event test" }),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().received).toBe(1);
  });

  it("accepts a batch of events", async () => {
    const batch = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ message: `batch event ${i}`, service: "batch-svc" })
    );
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      headers: { "x-tenant-id": TENANT, "content-type": "application/json" },
      payload: batch,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().received).toBe(10);
  });

  it("stores events and counts match exactly", async () => {
    const before = await countEvents(TENANT);
    const events = [
      makeEvent({ message: "count-test A", service: "counter" }),
      makeEvent({ message: "count-test B", service: "counter" }),
      makeEvent({ message: "count-test C", service: "counter" }),
    ];
    await insertEvents(events);
    const after = await countEvents(TENANT);
    expect(after - before).toBe(3);
  });

  it("round-trips message content faithfully", async () => {
    const msg = "round-trip-unicode-snowman-test";
    const ts = "2025-01-15T12:00:00.000Z";
    await insertEvents([
      makeEvent({ message: msg, timestamp: ts, service: "rt-svc" }),
    ]);
    const rows = await queryEvents({ tenant_id: TENANT, service: "rt-svc" });
    const row = rows.find((r) => r.message === msg);
    expect(row).toBeDefined();
    expect(new Date(row!.timestamp).toISOString()).toBe(ts);
  });

  it("handles timezone-offset timestamps and stores correctly as UTC", async () => {
    // +05:30 = IST — 2025-03-01T00:00:00+05:30 = 2025-02-28T18:30:00Z
    const ts = "2025-03-01T00:00:00+05:30";
    const expectedUtc = new Date(ts).toISOString();
    await insertEvents([makeEvent({ timestamp: ts, service: "tz-test" })]);
    const rows = await queryEvents({ tenant_id: TENANT, service: "tz-test" });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Date(rows[0].timestamp).toISOString()).toBe(expectedUtc);
  });

  it("deduplicates identical events — inserting twice yields one row", async () => {
    const event = makeEvent({
      message: "dedup-test",
      timestamp: "2025-06-01T10:00:00.000Z",
      service: "dedup-svc",
      trace_id: "trace-abc-123",
      span_id: "span-xyz-456",
    });
    const before = await countEvents(TENANT);
    await insertEvents([event]);
    await insertEvents([event]); // exact duplicate
    const after = await countEvents(TENANT);
    expect(after - before).toBe(1); // only one row inserted
  });

  it("different messages are NOT deduplicated", async () => {
    const base = {
      timestamp: "2025-06-01T11:00:00.000Z",
      service: "dedup-diff-svc",
      trace_id: "trace-diff",
      span_id: "span-diff",
    };
    const before = await countEvents(TENANT);
    await insertEvents([makeEvent({ ...base, message: "msg-A" })]);
    await insertEvents([makeEvent({ ...base, message: "msg-B" })]);
    const after = await countEvents(TENANT);
    expect(after - before).toBe(2);
  });

  it("stores and queries open attributes map", async () => {
    const attrs = { request_id: "req-1", http_status: 500, region: "us-east-1" };
    await insertEvents([
      makeEvent({ message: "attrs-test", service: "attrs-svc", attributes: attrs }),
    ]);
    const rows = await queryEvents({ tenant_id: TENANT, service: "attrs-svc" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].attributes).toMatchObject(attrs);
  });

  it("tenant isolation — events from one tenant never appear in another's query", async () => {
    const otherTenant = `${TENANT}-other`;
    await insertEvents([makeEvent({ tenant_id: otherTenant, message: "cross-tenant" })]);
    const rows = await queryEvents({ tenant_id: TENANT });
    const leaked = rows.find((r) => r.tenant_id === otherTenant);
    // Clean up
    const pool = getPool();
    await pool.query("DELETE FROM events WHERE tenant_id = $1", [otherTenant]);
    expect(leaked).toBeUndefined();
  });

  it("query filters by service", async () => {
    const ts = new Date().toISOString();
    await insertEvents([
      makeEvent({ message: "svc-filter-A", service: "filter-svc", timestamp: ts }),
      makeEvent({ message: "svc-filter-B", service: "other-svc", timestamp: ts }),
    ]);
    const rows = await queryEvents({ tenant_id: TENANT, service: "filter-svc" });
    expect(rows.every((r) => r.service === "filter-svc")).toBe(true);
    expect(rows.some((r) => r.message === "svc-filter-A")).toBe(true);
  });

  it("query filters by level", async () => {
    const ts = new Date().toISOString();
    await insertEvents([
      makeEvent({ message: "lvl-err", level: "error", service: "lvl-svc", timestamp: ts }),
      makeEvent({ message: "lvl-info", level: "info", service: "lvl-svc", timestamp: ts }),
    ]);
    const rows = await queryEvents({ tenant_id: TENANT, level: "error" });
    expect(rows.every((r) => r.level === "error")).toBe(true);
  });

  it("burst test — 500 events insert without data loss", async () => {
    const burstTenant = `${TENANT}-burst`;
    const events = Array.from({ length: 500 }, (_, i) =>
      makeEvent({
        tenant_id: burstTenant,
        message: `burst-${i}`,
        service: "burst-svc",
        timestamp: new Date(Date.now() + i).toISOString(),
      })
    );
    await insertEvents(events);
    const count = await countEvents(burstTenant);
    // Clean up
    const pool = getPool();
    await pool.query("DELETE FROM events WHERE tenant_id = $1", [burstTenant]);
    expect(count).toBe(500);
  });

  it("rejects an invalid level value", async () => {
    // Build raw object without going through makeEvent (which itself validates)
    const result = EventSchema.safeParse({
      tenant_id: TENANT,
      timestamp: new Date().toISOString(),
      service: "test",
      level: "CRITICAL",
      message: "bad level",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a batch larger than 1000", async () => {
    const huge = Array.from({ length: 1001 }, () => makeEvent());
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      headers: { "x-tenant-id": TENANT, "content-type": "application/json" },
      payload: huge,
    });
    expect(res.statusCode).toBe(422);
  });
});
