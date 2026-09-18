import { describe, it, expect, beforeEach } from "vitest";
import { buildAlertCard } from "../src/slack/alert-card.js";
import {
  getThreadHistory,
  appendToThread,
  buildConversationPrompt,
  clearThread,
} from "../src/slack/conversation.js";
import { AlertSchema, AnomalySchema } from "../src/schemas/index.js";
import type { Alert } from "../src/schemas/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  const now = new Date().toISOString();
  const anomaly = AnomalySchema.parse({
    type: "error_spike",
    severity: "high",
    tenant_id: "test-tenant",
    service: "api",
    detected_at: now,
    evidence: { description: "Error rate jumped from 0.5% to 12%", metric_value: 12, baseline_value: 0.5 },
  });

  return AlertSchema.parse({
    id: "alert-test-001",
    tenant_id: "test-tenant",
    severity: "high",
    impact: "12% of API requests are returning 500 errors. ~200 users affected.",
    root_cause: "Null pointer exception in UserController.getProfile() introduced in deploy d3f9a1.",
    recommended_action: "Roll back to the previous deploy or hot-fix the null check in UserController.",
    anomaly,
    created_at: now,
    ...overrides,
  });
}

// ─── Alert card format ────────────────────────────────────────────────────────

describe("Phase 3 — Alert card", () => {
  it("buildAlertCard returns a non-empty block list", () => {
    const card = buildAlertCard(makeAlert());
    expect(card.blocks.length).toBeGreaterThan(3);
  });

  it("card has a header block with severity label", () => {
    const card = buildAlertCard(makeAlert({ severity: "critical" }));
    const header = card.blocks.find((b) => b.type === "header");
    expect(header).toBeDefined();
    const headerText = (header as { text: { text: string } }).text.text;
    expect(headerText).toContain("CRITICAL");
  });

  it("card contains impact text", () => {
    const card = buildAlertCard(makeAlert());
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("Impact");
    expect(json).toContain("200 users affected");
  });

  it("card contains root cause text", () => {
    const card = buildAlertCard(makeAlert());
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("Root cause");
    expect(json).toContain("Null pointer");
  });

  it("card contains recommended action text", () => {
    const card = buildAlertCard(makeAlert());
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("Recommended action");
    expect(json).toContain("Roll back");
  });

  it("card has both action buttons", () => {
    const card = buildAlertCard(makeAlert());
    const actions = card.blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
    const elements = (actions as { elements: { action_id: string }[] }).elements;
    const actionIds = new Set(elements.map((e) => e.action_id));
    expect(actionIds.has("view_alert")).toBe(true);
    expect(actionIds.has("start_incident")).toBe(true);
  });

  it("alert id is embedded in button values", () => {
    const card = buildAlertCard(makeAlert({ id: "alert-42" }));
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("alert-42");
  });

  it("different severities produce different colors", () => {
    const critical = buildAlertCard(makeAlert({ severity: "critical" }));
    const low = buildAlertCard(makeAlert({ severity: "low" }));
    expect(critical.color).not.toBe(low.color);
  });

  it("card includes service name in section fields", () => {
    const card = buildAlertCard(makeAlert());
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("api"); // the service name
  });

  it("card text field is a non-empty plain-text fallback", () => {
    const card = buildAlertCard(makeAlert());
    expect(typeof card.text).toBe("string");
    expect(card.text.length).toBeGreaterThan(10);
  });
});

// ─── Thread conversation context ─────────────────────────────────────────────

describe("Phase 3 — Thread context", () => {
  const THREAD_A = "thread-ts-aaa";
  const THREAD_B = "thread-ts-bbb";

  beforeEach(() => {
    clearThread(THREAD_A);
    clearThread(THREAD_B);
  });

  it("fresh thread has empty history", () => {
    expect(getThreadHistory(THREAD_A)).toHaveLength(0);
  });

  it("appended messages appear in history in order", () => {
    appendToThread(THREAD_A, { role: "user", content: "first", userId: "U001", timestamp: "t1" });
    appendToThread(THREAD_A, { role: "assistant", content: "response", userId: "calyx-bot", timestamp: "t2" });
    const h = getThreadHistory(THREAD_A);
    expect(h).toHaveLength(2);
    expect(h[0].content).toBe("first");
    expect(h[1].role).toBe("assistant");
  });

  it("thread histories are isolated from each other", () => {
    appendToThread(THREAD_A, { role: "user", content: "thread A message", userId: "U001", timestamp: "t1" });
    expect(getThreadHistory(THREAD_B)).toHaveLength(0);
  });

  it("two users in the same thread are both attributed", () => {
    appendToThread(THREAD_A, { role: "user", content: "msg from alice", userId: "U_alice", timestamp: "t1" });
    appendToThread(THREAD_A, { role: "assistant", content: "response 1", userId: "calyx-bot", timestamp: "t2" });
    appendToThread(THREAD_A, { role: "user", content: "msg from bob", userId: "U_bob", timestamp: "t3" });
    appendToThread(THREAD_A, { role: "assistant", content: "response 2", userId: "calyx-bot", timestamp: "t4" });

    const h = getThreadHistory(THREAD_A);
    expect(h).toHaveLength(4);

    const userIds = h.filter((m) => m.role === "user").map((m) => m.userId);
    expect(userIds).toContain("U_alice");
    expect(userIds).toContain("U_bob");
  });

  it("buildConversationPrompt returns empty suffix for a fresh thread", () => {
    const { systemSuffix } = buildConversationPrompt(THREAD_A, "what is going on?", "U001");
    expect(systemSuffix).toBe("");
  });

  it("buildConversationPrompt includes prior history when thread has messages", () => {
    appendToThread(THREAD_A, { role: "user", content: "prior question", userId: "U001", timestamp: "t1" });
    appendToThread(THREAD_A, { role: "assistant", content: "prior answer", userId: "calyx-bot", timestamp: "t2" });

    const { systemSuffix, userMessage } = buildConversationPrompt(
      THREAD_A,
      "follow-up question",
      "U002"
    );

    expect(systemSuffix).toContain("prior question");
    expect(systemSuffix).toContain("prior answer");
    expect(userMessage).toContain("follow-up question");
    expect(userMessage).toContain("U002");
  });

  it("buildConversationPrompt includes the user ID of the caller", () => {
    appendToThread(THREAD_A, { role: "user", content: "hi", userId: "U001", timestamp: "t1" });

    const { userMessage } = buildConversationPrompt(THREAD_A, "my question", "U_specific");
    expect(userMessage).toContain("U_specific");
  });

  it("clearThread removes all history", () => {
    appendToThread(THREAD_A, { role: "user", content: "msg", userId: "U001", timestamp: "t1" });
    clearThread(THREAD_A);
    expect(getThreadHistory(THREAD_A)).toHaveLength(0);
  });
});

// ─── Schema integrity ─────────────────────────────────────────────────────────

describe("Phase 3 — Alert schema", () => {
  it("AlertSchema rejects a missing impact field", () => {
    const result = AlertSchema.safeParse({
      id: "a1",
      tenant_id: "t1",
      severity: "high",
      // impact missing
      root_cause: "some cause",
      recommended_action: "some action",
      anomaly: {
        type: "error_spike",
        severity: "high",
        tenant_id: "t1",
        service: "api",
        detected_at: new Date().toISOString(),
        evidence: { description: "desc" },
      },
      created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("well-formed Alert passes schema validation", () => {
    const result = AlertSchema.safeParse(makeAlert());
    expect(result.success).toBe(true);
  });
});
