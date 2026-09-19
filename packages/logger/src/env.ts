import type { CalyxClientOptions } from "./types.js";

type EnvBag = Record<string, string | undefined>;

export type ConfigRuntime = "browser" | "node";

function readEnv(): EnvBag {
  const out: EnvBag = {};

  try {
    const meta = import.meta as ImportMeta & { env?: EnvBag };
    if (meta.env) Object.assign(out, meta.env);
  } catch {
    /* ignore */
  }

  if (typeof process !== "undefined" && process.env) {
    Object.assign(out, process.env);
  }

  if (typeof globalThis !== "undefined") {
    const g = globalThis as Record<string, unknown>;
    for (const key of [
      "CALYX_INTAKE_URL",
      "CALYX_SOURCE_TOKEN",
      "CALYX_SERVICE",
      "NEXT_PUBLIC_CALYX_INTAKE_URL",
      "NEXT_PUBLIC_CALYX_SOURCE_TOKEN",
      "NEXT_PUBLIC_CALYX_SERVICE",
      "VITE_CALYX_INTAKE_URL",
      "VITE_CALYX_SOURCE_TOKEN",
      "VITE_CALYX_SERVICE",
    ]) {
      if (typeof g[key] === "string" && !out[key]) {
        out[key] = g[key] as string;
      }
    }
  }

  return out;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v?.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Resolve intake config from env.
 * - browser: NEXT_PUBLIC_* / VITE_* first, then CALYX_*
 * - node: CALYX_* first (so backend does not pick up a public FE token by accident)
 */
export function resolveConfigFromEnv(
  overrides: Partial<CalyxClientOptions> = {},
  runtime: ConfigRuntime = "browser"
): CalyxClientOptions | null {
  const env = readEnv();

  const intakeUrl =
    overrides.intakeUrl ||
    (runtime === "node"
      ? firstDefined(env.CALYX_INTAKE_URL, env.NEXT_PUBLIC_CALYX_INTAKE_URL, env.VITE_CALYX_INTAKE_URL)
      : firstDefined(env.NEXT_PUBLIC_CALYX_INTAKE_URL, env.VITE_CALYX_INTAKE_URL, env.CALYX_INTAKE_URL));

  const token =
    overrides.token ||
    (runtime === "node"
      ? firstDefined(env.CALYX_SOURCE_TOKEN, env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN, env.VITE_CALYX_SOURCE_TOKEN)
      : firstDefined(
          env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN,
          env.VITE_CALYX_SOURCE_TOKEN,
          env.CALYX_SOURCE_TOKEN
        ));

  if (!intakeUrl || !token) return null;

  const service =
    overrides.service ||
    (runtime === "node"
      ? firstDefined(env.CALYX_SERVICE, env.NEXT_PUBLIC_CALYX_SERVICE, env.VITE_CALYX_SERVICE)
      : firstDefined(env.NEXT_PUBLIC_CALYX_SERVICE, env.VITE_CALYX_SERVICE, env.CALYX_SERVICE)) ||
    (runtime === "node" ? "api" : "web");

  return {
    intakeUrl,
    token,
    service,
    batchSize: overrides.batchSize,
    flushIntervalMs: overrides.flushIntervalMs,
    defaultAttributes: overrides.defaultAttributes,
    fetch: overrides.fetch,
    disabled: overrides.disabled,
  };
}
