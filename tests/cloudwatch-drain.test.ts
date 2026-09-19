import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { normalizeCloudWatchEnvelope } from "../src/ingestion/cloudwatch-normalize.js";

const context = {
  tenantId: "tenant-a",
  projectId: "project-a",
  sourceId: "source-a",
  service: "checkout",
  role: "backend",
};

function envelope(payload: object): string {
  return gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64");
}

describe("normalizeCloudWatchEnvelope", () => {
  it("decodes AWS subscription payloads into normalized tenant events", () => {
    const events = normalizeCloudWatchEnvelope(
      envelope({
        messageType: "DATA_MESSAGE",
        owner: "123456789012",
        logGroup: "/aws/lambda/checkout",
        logStream: "2026/09/20/[$LATEST]abc",
        subscriptionFilters: ["calyx-errors"],
        logEvents: [
          { id: "event-1", timestamp: 1573817250283, message: '{"level":"error","msg":"payment failed"}' },
          { id: "event-2", timestamp: 1573817251283, message: "WARN checkout slow" },
        ],
      }),
      context
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.level)).toEqual(["error", "warn"]);
    expect(events[0]).toMatchObject({
      tenant_id: "tenant-a",
      service: "checkout",
      attributes: {
        source: "cloudwatch_logs",
        source_id: "source-a",
        project_id: "project-a",
        aws_account_id: "123456789012",
        cloudwatch_log_group: "/aws/lambda/checkout",
      },
    });
  });

  it("accepts AWS control messages without creating events", () => {
    expect(
      normalizeCloudWatchEnvelope(
        envelope({
          messageType: "CONTROL_MESSAGE",
          owner: "123456789012",
          logGroup: "/aws/lambda/checkout",
          logStream: "stream",
          subscriptionFilters: [],
          logEvents: [],
        }),
        context
      )
    ).toEqual([]);
  });

  it("rejects invalid compressed data", () => {
    expect(() => normalizeCloudWatchEnvelope("not-gzip", context)).toThrow();
  });
});
