import type { CalyxClientOptions } from "./types.js";

type EnvBag = Record<string, string | undefined>;

function readEnv(): EnvBag {
  const out: EnvBag = {};

  // Vite
  try {
    const meta = import.meta as ImportMeta & { env?: EnvBag };
    if (meta.env) Object.assign(out, meta.env);
  } catch {
    /* ignore */
  }

  // Node / Next server
  if (typeof process !== "undefined" && process.env) {
    Object.assign(out, process.env);
  }

  // Next.js inlines NEXT_PUBLIC_* at build time — also accept globals if set
  if (typeof globalThis !== "undefined") {
    const g = globalThis as Record<string, unknown>;
    for (const key of [
      "CALYX_INTAKE_URL",
      "CALYX_SOURCE_TOKEN",
      "CALYX_SERVICE",
      "NEXT_PUBLIC_CALYX_INTAKE_URL",
      "NEXT_PUBLIC_CALYX_SOURCE_TOKEN",
      "NEXT_PUBLIC_CALYX_SERVICE",
    ]) {
      if (typeof g[key] === "string" && !out[key]) {
        out[key] = g[key] as string;
      }
    }
  }

  return out;
}

/**
 * Resolve intake config from env.
 * Prefers NEXT_PUBLIC_* / VITE_* for browser bundles, then CALYX_*.
 */
export function resolveConfigFromEnv(
  overrides: Partial<CalyxClientOptions> = {}
): CalyxClientOptions | null {
  const env = readEnv();

  const intakeUrl =
    overrides.intakeUrl ||
    env.NEXT_PUBLIC_CALYX_INTAKE_URL ||
    env.VITE_CALYX_INTAKE_URL ||
    env.CALYX_INTAKE_URL;

  const token =
    overrides.token ||
    env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN ||
    env.VITE_CALYX_SOURCE_TOKEN ||
    env.CALYX_SOURCE_TOKEN;

  if (!intakeUrl || !token) return null;

  const service =
    overrides.service ||
    env.NEXT_PUBLIC_CALYX_SERVICE ||
    env.VITE_CALYX_SERVICE ||
    env.CALYX_SERVICE ||
    "web";

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
