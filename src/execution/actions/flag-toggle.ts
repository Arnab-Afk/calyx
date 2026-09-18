// Action: toggle a feature flag
//
// This is deliberately the first action implemented — flag toggles are instant,
// cheap, and fully reversible, making them the ideal Tier 1/2 candidate before
// we trust the agent with pod restarts or deploy rollbacks.
//
// For MVP the flag store is in-memory. In production this calls LaunchDarkly /
// Unleash / your own flag service API.

import type { Action, ActionResult } from "../types.js";

export interface FlagToggleParams {
  flag_key: string;
  target_value: boolean;
  environment?: string;
}

// In-memory flag store (replace with real API calls in production)
const flagStore = new Map<string, boolean>();

export function setFlag(key: string, value: boolean): void {
  flagStore.set(key, value);
}

export function getFlag(key: string): boolean | undefined {
  return flagStore.get(key);
}

export function clearFlags(): void {
  flagStore.clear();
}

function parseParams(params: unknown): FlagToggleParams {
  const p = params as FlagToggleParams;
  if (typeof p.flag_key !== "string" || p.flag_key.length === 0) {
    throw new Error("flag_key is required");
  }
  if (typeof p.target_value !== "boolean") {
    throw new Error("target_value must be a boolean");
  }
  return {
    flag_key: p.flag_key,
    target_value: p.target_value,
    environment: typeof p.environment === "string" ? p.environment : "production",
  };
}

export const flagToggleAction: Action = {
  name: "flag_toggle",
  description:
    "Toggle a feature flag on or off. Instant, cheap, and fully reversible — " +
    "the safest automated action in the execution layer.",
  defaultTier: "1",
  reversible: true,

  async dry_run(params: unknown): Promise<ActionResult> {
    const { flag_key, target_value, environment } = parseParams(params);
    const current = flagStore.get(flag_key);

    if (current === target_value) {
      return {
        success: true,
        message: `Flag "${flag_key}" is already ${target_value} in ${environment}. No change needed.`,
        before: current,
        after: target_value,
      };
    }

    return {
      success: true,
      message:
        `Dry run: would set "${flag_key}" from ${current ?? "unset"} → ${target_value} ` +
        `in ${environment}.`,
      before: current,
      after: target_value,
    };
  },

  async execute(params: unknown): Promise<ActionResult> {
    const { flag_key, target_value, environment } = parseParams(params);
    const before = flagStore.get(flag_key);
    flagStore.set(flag_key, target_value);

    return {
      success: true,
      message: `Set "${flag_key}" to ${target_value} in ${environment}.`,
      before,
      after: target_value,
    };
  },

  async undo(params: unknown): Promise<ActionResult> {
    const { flag_key, environment } = parseParams(params);
    // Undo means flipping back to the original value.
    // We stored it as `before` in the audit log — the executor passes it through.
    // For simplicity in MVP, undo just flips the current value.
    const current = flagStore.get(flag_key);
    const restored = !current;
    flagStore.set(flag_key, restored);

    return {
      success: true,
      message: `Undid flag toggle: "${flag_key}" restored to ${restored} in ${environment}.`,
      before: current,
      after: restored,
    };
  },
};
