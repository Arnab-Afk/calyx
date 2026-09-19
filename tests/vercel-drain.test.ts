import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeVercelDrain,
  parseVercelDrainBody,
} from "../src/ingestion/vercel-normalize.js";
import { verifyVercelSignature } from "../src/ingestion/routes/v1/vercel-drain.js";

const ctx = {
  tenantId: "default",
  projectId: "proj-1",
  sourceId: "src-1",
  service: "web",
  role: "frontend",
};

describe("parseVercelDrainBody", () => {
  it("parses JSON array", () => {
    const body = JSON.stringify([
      {
        id: "1",
        timestamp: 1573817250283,
        level: "error",
        message: "boom",
        source: "lambda",
      },
    ]);
    expect(parseVercelDrainBody(body)).toHaveLength(1);
  });

  it("parses NDJSON", () => {
    const body = [
      JSON.stringify({ id: "1", timestamp: 1e12, level: "info", message: "a" }),
      JSON.stringify({ id: "2", timestamp: 1e12, level: "warning", message: "b" }),
    ].join("\n");
    expect(parseVercelDrainBody(body)).toHaveLength(2);
  });
});

describe("normalizeVercelDrain", () => {
  it("maps warning → warn and stamps source attributes", () => {
    const body = JSON.stringify([
      {
        id: "log-1",
        timestamp: 1573817250283,
        level: "warning",
        message: "slow",
        source: "edge",
        path: "/api",
        statusCode: 200,
        traceId: "abc",
        spanId: "def",
      },
    ]);
    const [event] = normalizeVercelDrain(body, ctx);
    expect(event.level).toBe("warn");
    expect(event.service).toBe("web");
    expect(event.trace_id).toBe("abc");
    expect(event.attributes.source).toBe("vercel_drain");
    expect(event.attributes.source_id).toBe("src-1");
    expect(event.attributes.vercel_path).toBe("/api");
    expect(event.timestamp).toBe(new Date(1573817250283).toISOString());
  });
});

describe("verifyVercelSignature", () => {
  it("accepts HMAC-SHA1 hex of raw body", () => {
    const secret = "drain-secret-hex";
    const raw = '[{"id":"1","message":"hi"}]';
    const sig = createHmac("sha1", secret).update(raw, "utf8").digest("hex");
    expect(verifyVercelSignature(secret, raw, sig)).toBe(true);
    expect(verifyVercelSignature(secret, raw, "deadbeef")).toBe(false);
    expect(verifyVercelSignature(secret, raw, undefined)).toBe(false);
  });
});
