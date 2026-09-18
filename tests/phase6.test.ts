import { describe, it, expect, beforeEach } from "vitest";
import { executeAction, undoAction } from "../src/execution/executor.js";
import { registerAction, clearActionRegistry } from "../src/execution/registry.js";
import { getAuditLog, clearAuditLog, getStatus } from "../src/execution/audit-log.js";
import { setTierOverride, clearTierOverrides } from "../src/execution/policy.js";
import {
  flagToggleAction,
  setFlag,
  getFlag,
  clearFlags,
} from "../src/execution/actions/flag-toggle.js";
import type { Action, ActionResult } from "../src/execution/types.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearActionRegistry();
  clearAuditLog();
  clearTierOverrides();
  clearFlags();
  // Re-register the flag toggle action for each test
  registerAction(flagToggleAction);
});

// ─── Dry-run gate ─────────────────────────────────────────────────────────────

describe("Phase 6 — dry_run gate", () => {
  it("dry_run fires before every execution", async () => {
    setFlag("my-feature", false);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "my-feature", target_value: true },
      triggered_by: "test-agent",
    });
    // For Tier 1 (default for flag_toggle), execution proceeds
    // The audit entry must have a dry_run_result
    const log = getAuditLog("t1");
    const proposal = log.find((e) => e.status === "proposed");
    expect(proposal).toBeDefined();
    expect(proposal!.dry_run_result).toBeDefined();
    expect(proposal!.dry_run_result!.success).toBe(true);
  });

  it("dry_run result describes the change before it happens", async () => {
    setFlag("perf-flag", true);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "perf-flag", target_value: false },
      triggered_by: "test-agent",
    });
    const proposal = getAuditLog("t1").find((e) => e.status === "proposed");
    expect(proposal!.dry_run_result!.before).toBe(true);
    expect(proposal!.dry_run_result!.after).toBe(false);
  });
});

// ─── Approval gate ────────────────────────────────────────────────────────────

describe("Phase 6 — approval gate", () => {
  it("Tier 0 action does NOT auto-execute", async () => {
    // Override flag_toggle to Tier 0 for this tenant
    setTierOverride("t-strict", "flag_toggle", "0");
    setFlag("guarded-flag", false);

    const resp = await executeAction({
      tenant_id: "t-strict",
      action_name: "flag_toggle",
      params: { flag_key: "guarded-flag", target_value: true },
      triggered_by: "agent",
    });

    expect(resp.executed).toBe(false);
    expect(resp.message).toMatch(/human approval/i);
    // Flag must NOT have changed
    expect(getFlag("guarded-flag")).toBe(false);
  });

  it("Tier 0 + human_approved=true allows execution", async () => {
    setTierOverride("t-strict", "flag_toggle", "0");
    setFlag("guarded-flag", false);

    const resp = await executeAction({
      tenant_id: "t-strict",
      action_name: "flag_toggle",
      params: { flag_key: "guarded-flag", target_value: true },
      triggered_by: "agent",
      human_approved: true,
    });

    expect(resp.executed).toBe(true);
    expect(getFlag("guarded-flag")).toBe(true);
  });

  it("Tier 1 action auto-executes without human approval", async () => {
    setFlag("auto-flag", false);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "auto-flag", target_value: true },
      triggered_by: "agent",
    });
    expect(resp.executed).toBe(true);
    expect(getFlag("auto-flag")).toBe(true);
  });

  it("Tier 2 + reversible action auto-executes", async () => {
    setTierOverride("t2", "flag_toggle", "2");
    setFlag("t2-flag", false);
    const resp = await executeAction({
      tenant_id: "t2",
      action_name: "flag_toggle",
      params: { flag_key: "t2-flag", target_value: true },
      triggered_by: "agent",
    });
    expect(resp.executed).toBe(true);
  });

  it("Tier 2 + irreversible action does NOT auto-execute", async () => {
    // Create a mock non-reversible action
    const irreversibleAction: Action = {
      name: "nuke_cache",
      description: "Delete the cache — cannot be undone",
      defaultTier: "2",
      reversible: false,
      async dry_run(): Promise<ActionResult> {
        return { success: true, message: "Would clear cache" };
      },
      async execute(): Promise<ActionResult> {
        return { success: true, message: "Cache cleared" };
      },
    };
    registerAction(irreversibleAction);

    const resp = await executeAction({
      tenant_id: "t2",
      action_name: "nuke_cache",
      params: {},
      triggered_by: "agent",
    });

    expect(resp.executed).toBe(false);
    expect(resp.message).toMatch(/not reversible/i);
  });

  it("unknown action throws, not silently fails", async () => {
    await expect(
      executeAction({
        tenant_id: "t1",
        action_name: "does_not_exist",
        params: {},
        triggered_by: "agent",
      })
    ).rejects.toThrow("Unknown action");
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("Phase 6 — Audit log", () => {
  it("every execute() call writes to the audit log", async () => {
    setFlag("audit-flag", false);
    await executeAction({
      tenant_id: "t-audit",
      action_name: "flag_toggle",
      params: { flag_key: "audit-flag", target_value: true },
      triggered_by: "agent-X",
    });

    const log = getAuditLog("t-audit");
    expect(log.length).toBeGreaterThanOrEqual(2); // proposed + executed
    const executed = log.find((e) => e.status === "executed");
    expect(executed).toBeDefined();
    expect(executed!.triggered_by).toBe("agent-X");
    expect(executed!.action_name).toBe("flag_toggle");
  });

  it("a Tier 0 refused action still writes a proposal entry", async () => {
    setTierOverride("t-log", "flag_toggle", "0");
    await executeAction({
      tenant_id: "t-log",
      action_name: "flag_toggle",
      params: { flag_key: "some-flag", target_value: true },
      triggered_by: "agent",
    });

    const log = getAuditLog("t-log");
    expect(log.some((e) => e.status === "proposed")).toBe(true);
    // No executed entry
    expect(log.every((e) => e.status !== "executed")).toBe(true);
  });

  it("audit log entries are tenant-isolated", async () => {
    setFlag("shared-flag", false);
    await executeAction({
      tenant_id: "tenant-A",
      action_name: "flag_toggle",
      params: { flag_key: "shared-flag", target_value: true },
      triggered_by: "agent",
    });

    const logA = getAuditLog("tenant-A");
    const logB = getAuditLog("tenant-B");
    expect(logA.length).toBeGreaterThan(0);
    expect(logB).toHaveLength(0);
  });

  it("execute_result is captured in the executed entry", async () => {
    setFlag("result-flag", false);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "result-flag", target_value: true },
      triggered_by: "agent",
    });
    expect(resp.entry.execute_result).toBeDefined();
    expect(resp.entry.execute_result!.success).toBe(true);
    expect(resp.entry.execute_result!.before).toBe(false);
    expect(resp.entry.execute_result!.after).toBe(true);
  });
});

// ─── Undo ─────────────────────────────────────────────────────────────────────

describe("Phase 6 — Undo", () => {
  it("undo reverses a successful execution", async () => {
    setFlag("undo-flag", false);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "undo-flag", target_value: true },
      triggered_by: "agent",
    });
    expect(resp.executed).toBe(true);
    expect(getFlag("undo-flag")).toBe(true);

    const undoResp = await undoAction(resp.entry.id, "human-U001");
    expect(undoResp.executed).toBe(true);
    expect(getFlag("undo-flag")).toBe(false);
  });

  it("undo writes an audit entry with status 'undone'", async () => {
    setFlag("undo-audit-flag", false);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "flag_toggle",
      params: { flag_key: "undo-audit-flag", target_value: true },
      triggered_by: "agent",
    });
    await undoAction(resp.entry.id, "human-U001");

    const log = getAuditLog("t1");
    expect(log.some((e) => e.status === "undone")).toBe(true);
  });

  it("undo of a non-reversible action throws", async () => {
    const badAction: Action = {
      name: "bad_action",
      description: "no undo",
      defaultTier: "1",
      reversible: false,
      async dry_run(): Promise<ActionResult> { return { success: true, message: "ok" }; },
      async execute(): Promise<ActionResult> { return { success: true, message: "done" }; },
      // no undo method
    };
    registerAction(badAction);
    const resp = await executeAction({
      tenant_id: "t1",
      action_name: "bad_action",
      params: {},
      triggered_by: "agent",
    });
    await expect(undoAction(resp.entry.id, "agent")).rejects.toThrow("not reversible");
  });
});

// ─── Chaos: wrong action proposed, gate stops it ──────────────────────────────

describe("Phase 6 — Chaos test: gate stops wrong action", () => {
  it("a wrong action on a Tier 0 tenant is blocked before execution", async () => {
    // Suppose the agent proposes a destructive flag disable on a protected tenant
    setTierOverride("protected-tenant", "flag_toggle", "0");
    setFlag("kill-switch", true);

    const resp = await executeAction({
      tenant_id: "protected-tenant",
      action_name: "flag_toggle",
      params: { flag_key: "kill-switch", target_value: false },
      triggered_by: "autonomous-agent",
    });

    // Gate must block it
    expect(resp.executed).toBe(false);
    // Flag must still be true
    expect(getFlag("kill-switch")).toBe(true);
    // Proposal is recorded — full audit trail even for blocked attempts
    const log = getAuditLog("protected-tenant");
    expect(log.some((e) => e.status === "proposed")).toBe(true);
  });
});
