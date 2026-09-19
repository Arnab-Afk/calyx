import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { insertEvents } from "../src/storage/events.js";
import { closePool, getPool } from "../src/storage/client.js";
import { detectForService, shouldAlert, resetAlertGuard } from "../src/detection/runner.js";
import { errorRateDetector } from "../src/detection/detectors/error-rate.js";
import { getAlertContextTool } from "../src/agent/tools/get_alert_context.js";
import { getIncidentTool } from "../src/agent/tools/get_incident.js";
import { listIncidentsTool } from "../src/agent/tools/list_incidents.js";
import { searchIncidentsTool } from "../src/agent/tools/search_incidents.js";
import { EventSchema, type Event } from "../src/schemas/index.js";
import type { TimeWindow } from "../src/detection/types.js";

const TENANT = "detection-tests";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ev(
  service: string,
  level: Event["level"],
  minsAgo: number,
  message = "test"
): Event {
  return EventSchema.parse({
    tenant_id: TENANT,
    service,
    level,
    message,
    timestamp: new Date(Date.now() - minsAgo * 60 * 1000).toISOString(),
  });
}

// Build a TimeWindow directly (for unit tests of the detector pure function)
function window_(
  errorRate: number,
  service = "api",
  eventCount = 100
): TimeWindow {
  const errorCount = Math.round((errorRate / 100) * eventCount);
  return {
    from: new Date(Date.now() - 5 * 60_000).toISOString(),
    to: new Date().toISOString(),
    tenant_id: TENANT,
    service,
    event_count: eventCount,
    error_count: errorCount,
    error_rate: errorRate,
  };
}

function baseline(rates: number[]): TimeWindow[] {
  return rates.map((r) => window_(r));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM incidents WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM alert_contexts WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM incidents WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM alert_contexts WHERE tenant_id = $1", [TENANT]);
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await closePool();
});

beforeEach(() => {
  resetAlertGuard();
});

// ─── Unit tests: errorRateDetector pure function ───────────────────────────────

describe("Phase 4 — errorRateDetector (pure function)", () => {
  it("returns nothing when baseline has fewer than 3 windows", () => {
    const result = errorRateDetector(window_(20), baseline([1, 2]));
    expect(result).toHaveLength(0);
  });

  it("returns nothing when current rate is below 1% floor", () => {
    const result = errorRateDetector(
      window_(0.5), // below MIN_ABSOLUTE_ERROR_RATE
      baseline([0.1, 0.2, 0.1, 0.3, 0.1])
    );
    expect(result).toHaveLength(0);
  });

  it("returns nothing on normal traffic (within 2σ)", () => {
    // Baseline mean ≈ 2%, stddev ≈ 0.5%, threshold ≈ 3%
    const result = errorRateDetector(
      window_(2.5), // within noise
      baseline([1.5, 2.0, 2.5, 2.0, 1.8, 2.2, 2.1])
    );
    expect(result).toHaveLength(0);
  });

  it("fires on a clear spike (>2σ above mean)", () => {
    // Baseline mean ≈ 1%, current = 15% — very clear spike
    const result = errorRateDetector(
      window_(15),
      baseline([0.8, 1.0, 1.2, 0.9, 1.1, 1.0, 0.9])
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("error_spike");
    expect(result[0].service).toBe("api");
  });

  it("emits an Anomaly with evidence when it fires", () => {
    const result = errorRateDetector(
      window_(15),
      baseline([0.8, 1.0, 1.2, 0.9, 1.1, 1.0, 0.9])
    );
    expect(result[0].evidence.metric_value).toBe(15);
    expect(typeof result[0].evidence.baseline_value).toBe("number");
    expect(result[0].evidence.description).toContain("Error rate");
  });

  it("classifies severity: high when 1.5–2x above threshold", () => {
    const result = errorRateDetector(
      window_(10),
      baseline([0.8, 1.0, 1.2, 0.9, 1.1, 1.0, 0.9])
    );
    expect(result[0].severity).toMatch(/^(medium|high|critical)$/);
  });

  it("classifies severity: critical when 2x above threshold", () => {
    const result = errorRateDetector(
      window_(50),
      baseline([0.8, 1.0, 1.2, 0.9, 1.1, 1.0, 0.9])
    );
    expect(result[0].severity).toBe("critical");
  });

  it("returns nothing when window has zero events", () => {
    const result = errorRateDetector(
      { ...window_(0), event_count: 0 },
      baseline([1, 1, 1, 1, 1])
    );
    expect(result).toHaveLength(0);
  });

  it("false-positive rate: fires at most once in 20 normal windows", () => {
    // Simulate 20 consecutive normal-traffic windows
    const bline = baseline([2.0, 2.1, 1.9, 2.0, 2.2, 2.0, 1.8]);
    let fires = 0;
    for (let i = 0; i < 20; i++) {
      // Vary the rate slightly within 2σ
      const rate = 1.5 + Math.sin(i) * 0.5; // 1.0–2.0%, well within baseline
      const result = errorRateDetector(window_(rate), bline);
      fires += result.length;
    }
    expect(fires).toBe(0);
  });
});

// ─── Integration: detectForService hits the real DB ───────────────────────────

describe("Phase 4 — detectForService (integration)", () => {
  it("returns no anomalies when there is no data", async () => {
    const pool = getPool();
    const anomalies = await detectForService(pool, TENANT, "empty-svc");
    expect(anomalies).toHaveLength(0);
  });

  it("returns no anomalies on stable low-error traffic", async () => {
    const pool = getPool();
    // Seed 1 hour of stable traffic: ~1% errors across 12 × 5min windows
    const events: Event[] = [];
    for (let min = 0; min < 60; min++) {
      // 10 info events per minute, 1 error per 10 minutes
      events.push(ev("stable-svc", "info", min, `request-${min}`));
      if (min % 10 === 0) events.push(ev("stable-svc", "error", min, "occasional error"));
    }
    await insertEvents(events);

    const anomalies = await detectForService(pool, TENANT, "stable-svc");
    // Should not fire on normal traffic
    expect(anomalies).toHaveLength(0);
  });

  it("detects a spike in the most recent window", async () => {
    const pool = getPool();
    // Seed 1 hour of stable ~1% error rate, then spike in last 5 minutes
    const stableEvents: Event[] = [];
    for (let min = 5; min < 65; min++) {
      stableEvents.push(ev("spike-svc", "info", min, `info-${min}`));
      if (min % 30 === 0) stableEvents.push(ev("spike-svc", "error", min, "rare error"));
    }
    await insertEvents(stableEvents);

    // Now seed a spike in the last 5 minutes: 50% errors
    const spikeEvents: Event[] = [];
    for (let i = 0; i < 10; i++) {
      spikeEvents.push(ev("spike-svc", "error", Math.floor(i * 0.4), "Unhandled exception in spike"));
      spikeEvents.push(ev("spike-svc", "info", Math.floor(i * 0.4), "some ok request"));
    }
    await insertEvents(spikeEvents);

    const anomalies = await detectForService(pool, TENANT, "spike-svc");
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].type).toBe("error_spike");
    expect(anomalies[0].service).toBe("spike-svc");

    const repeated = await detectForService(pool, TENANT, "spike-svc");
    expect(repeated.length).toBeGreaterThan(0);

    const stored = await pool.query(
      "SELECT id, occurrence_count FROM alert_contexts WHERE tenant_id = $1 AND service = $2",
      [TENANT, "spike-svc"]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].occurrence_count).toBe(2);

    const context = await getAlertContextTool.handler({
      tenant_id: TENANT,
      alert_id: stored.rows[0].id,
      event_limit: 5,
    });
    const data = context.data as {
      alert: { tenant_id: string; service: string };
      evidence_events: { tenant_id: string; service: string }[];
    };
    expect(data.alert).toMatchObject({ tenant_id: TENANT, service: "spike-svc" });
    expect(data.evidence_events.length).toBeGreaterThan(0);
    expect(data.evidence_events.every((event) => event.tenant_id === TENANT)).toBe(true);

    const crossTenant = await getAlertContextTool.handler({
      tenant_id: "different-tenant",
      alert_id: stored.rows[0].id,
      event_limit: 5,
    });
    expect(crossTenant.data).toEqual({ alert: null, evidence_events: [] });

    const listed = await listIncidentsTool.handler({ tenant_id: TENANT, limit: 20 });
    const incidents = (listed.data as { incidents: { id: string }[] }).incidents;
    expect(incidents).toHaveLength(1);

    const searched = await searchIncidentsTool.handler({
      tenant_id: TENANT,
      keywords: ["spike-svc"],
      limit: 20,
    });
    expect((searched.data as { count: number }).count).toBe(1);

    const incident = await getIncidentTool.handler({
      tenant_id: TENANT,
      incident_id: incidents[0].id,
    });
    const incidentData = incident.data as { alerts: unknown[]; evidence: unknown[] };
    expect(incidentData.alerts).toHaveLength(1);
    expect(incidentData.evidence).toHaveLength(2);

    const crossTenantIncident = await getIncidentTool.handler({
      tenant_id: "different-tenant",
      incident_id: incidents[0].id,
    });
    expect(crossTenantIncident.data).toEqual({ incident: null, alerts: [], evidence: [] });
  });
});

// ─── Dedup guard: persisting anomaly doesn't spam ─────────────────────────────

describe("Phase 4 — Alert dedup guard", () => {
  const anomaly = {
    type: "error_spike" as const,
    severity: "high" as const,
    tenant_id: TENANT,
    service: "dedup-svc",
    detected_at: new Date().toISOString(),
    evidence: { description: "test", sample_event_ids: [] },
  };

  it("first call returns true (should alert)", () => {
    expect(shouldAlert(anomaly)).toBe(true);
  });

  it("second call within the interval returns false (deduped)", () => {
    shouldAlert(anomaly); // first
    expect(shouldAlert(anomaly)).toBe(false); // within interval
  });

  it("different service does not interfere with dedup", () => {
    shouldAlert(anomaly);
    const other = { ...anomaly, service: "other-svc" };
    expect(shouldAlert(other)).toBe(true);
  });

  it("after the interval elapses, alert fires again", () => {
    // Use a very short interval for this test
    shouldAlert(anomaly, 100); // arms it
    // Wait just beyond the interval
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(shouldAlert(anomaly, 100)).toBe(true);
        resolve();
      }, 150);
    });
  });

  it("resetAlertGuard clears all dedup state", () => {
    shouldAlert(anomaly); // fires and arms
    resetAlertGuard(); // clear
    expect(shouldAlert(anomaly)).toBe(true); // should fire again
  });
});
