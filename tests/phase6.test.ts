import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveAction,
  proposeAction,
  rejectAction,
  undoAction,
} from "../src/execution/executor.js";
import { initExecution } from "../src/execution/index.js";
import {
  clearActionRegistry,
  registerAction,
} from "../src/execution/registry.js";
import {
  clearFlags,
  flagToggleAction,
  getFlag,
  setFlag,
} from "../src/execution/actions/flag-toggle.js";
import { getRemediationRequest } from "../src/storage/remediations.js";
import { closePool, getPool } from "../src/storage/client.js";
import type { Action } from "../src/execution/types.js";
import { isRemediationApprover } from "../src/slack/adapter.js";

const TENANT = "remediation-tests";

async function clean(): Promise<void> {
  await getPool().query("DELETE FROM remediation_events WHERE tenant_id=$1", [
    TENANT,
  ]);
  await getPool().query("DELETE FROM remediation_requests WHERE tenant_id=$1", [
    TENANT,
  ]);
}

beforeEach(async () => {
  await clean();
  clearActionRegistry();
  clearFlags();
  initExecution();
});

afterAll(async () => {
  await clean();
  await closePool();
});

async function proposeFlag(key = "guarded-flag", target = true) {
  return proposeAction({
    tenantId: TENANT,
    actionName: "flag_toggle",
    params: { flag_key: key, target_value: target },
    proposedBy: "agent-1",
  });
}

describe("durable remediation approvals", () => {
  it("fails closed when no Slack approver allowlist is configured", () => {
    const previous = process.env.SLACK_REMEDIATION_APPROVER_IDS;
    delete process.env.SLACK_REMEDIATION_APPROVER_IDS;
    expect(isRemediationApprover("U1")).toBe(false);
    process.env.SLACK_REMEDIATION_APPROVER_IDS = "U1, U2";
    process.env.SLACK_REMEDIATION_APPROVER_IDS_T1 = "U3";
    expect(isRemediationApprover("U2")).toBe(true);
    expect(isRemediationApprover("U2", "T1")).toBe(false);
    expect(isRemediationApprover("U3", "T1")).toBe(true);
    delete process.env.SLACK_REMEDIATION_APPROVER_IDS_T1;
    if (previous === undefined)
      delete process.env.SLACK_REMEDIATION_APPROVER_IDS;
    else process.env.SLACK_REMEDIATION_APPROVER_IDS = previous;
  });

  it("always persists a proposal without executing it", async () => {
    setFlag("guarded-flag", false);
    const result = await proposeFlag();

    expect(result.executed).toBe(false);
    expect(result.request.status).toBe("pending");
    expect(result.request.dryRunResult).toMatchObject({
      success: true,
      before: false,
      after: true,
    });
    expect(getFlag("guarded-flag")).toBe(false);
    expect(
      await getRemediationRequest(result.request.id, TENANT),
    ).toMatchObject({ status: "pending" });
  });

  it("does not allow a failed dry run to be approved", async () => {
    const action: Action = {
      name: "blocked",
      description: "fails validation",
      defaultTier: "0",
      reversible: false,
      async dry_run() {
        return { success: false, message: "unsafe target" };
      },
      async execute() {
        throw new Error("must not run");
      },
    };
    registerAction(action);
    const proposal = await proposeAction({
      tenantId: TENANT,
      actionName: action.name,
      params: {},
      proposedBy: "agent",
    });

    expect(proposal.request.status).toBe("failed");
    await expect(
      approveAction({
        requestId: proposal.request.id,
        approvedBy: "human",
        reason: "run",
      }),
    ).rejects.toThrow("not pending");
  });

  it("requires a non-empty approval reason", async () => {
    const proposal = await proposeFlag();
    await expect(
      approveAction({
        requestId: proposal.request.id,
        approvedBy: "human",
        reason: " ",
      }),
    ).rejects.toThrow("reason is required");
  });

  it("executes a request at most once under concurrent approvals", async () => {
    setFlag("once", false);
    const proposal = await proposeFlag("once");
    const results = await Promise.allSettled([
      approveAction({
        requestId: proposal.request.id,
        approvedBy: "human-a",
        reason: "confirmed",
      }),
      approveAction({
        requestId: proposal.request.id,
        approvedBy: "human-b",
        reason: "also confirmed",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(getFlag("once")).toBe(true);
    const stored = await getRemediationRequest(proposal.request.id, TENANT);
    expect(stored).toMatchObject({
      status: "executed",
      executeResult: { success: true },
    });
    const events = await getPool().query(
      "SELECT event_type, actor_id, reason FROM remediation_events WHERE request_id=$1 ORDER BY created_at",
      [proposal.request.id],
    );
    expect(
      events.rows.filter((row) => row.event_type === "approved"),
    ).toHaveLength(1);
    expect(events.rows.some((row) => row.event_type === "executed")).toBe(true);
  });

  it("durably rejects a request and prevents later approval", async () => {
    const proposal = await proposeFlag();
    const rejected = await rejectAction({
      requestId: proposal.request.id,
      rejectedBy: "human",
      reason: "wrong target",
    });

    expect(rejected).toMatchObject({
      status: "rejected",
      rejectedBy: "human",
      rejectionReason: "wrong target",
    });
    await expect(
      approveAction({
        requestId: proposal.request.id,
        approvedBy: "other",
        reason: "run",
      }),
    ).rejects.toThrow("not pending");
  });

  it("can execute a durable proposal after the action registry is reinitialized", async () => {
    setFlag("restart", false);
    const proposal = await proposeFlag("restart");
    clearActionRegistry();
    initExecution();

    const result = await approveAction({
      requestId: proposal.request.id,
      approvedBy: "human",
      reason: "after restart",
    });
    expect(result.executed).toBe(true);
    expect(getFlag("restart")).toBe(true);
  });

  it("undo restores the captured before value and records the actor", async () => {
    setFlag("undo", false);
    const proposal = await proposeFlag("undo");
    await approveAction({
      requestId: proposal.request.id,
      approvedBy: "human",
      reason: "execute",
    });

    const undone = await undoAction({
      requestId: proposal.request.id,
      triggeredBy: "human-2",
      reason: "incident recovered",
    });
    expect(undone.executed).toBe(true);
    expect(undone.request.status).toBe("undone");
    expect(getFlag("undo")).toBe(false);
    const event = await getPool().query(
      "SELECT actor_id, reason FROM remediation_events WHERE request_id=$1 AND event_type='undo_started'",
      [proposal.request.id],
    );
    expect(event.rows[0]).toMatchObject({
      actor_id: "human-2",
      reason: "incident recovered",
    });
  });

  it("keeps request lookup tenant-scoped", async () => {
    const proposal = await proposeFlag();
    expect(
      await getRemediationRequest(proposal.request.id, "another-tenant"),
    ).toBeNull();
  });
});
