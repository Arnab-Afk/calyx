export type { CalyxClientOptions, CalyxEvent, InitOptions, LogLevel } from "./types.js";
export { CalyxClient, formatMessage } from "./client.js";
export { resolveConfigFromEnv } from "./env.js";

import { CalyxClient } from "./client.js";
import { resolveConfigFromEnv } from "./env.js";
import { installConsoleHooks, resetConsoleHooksFlag } from "./hooks.js";
import type { CalyxClientOptions, InitOptions } from "./types.js";

let singleton: CalyxClient | null = null;
let processHandlersInstalled = false;

/**
 * Initialize Calyx logging for Node / backend (API routes, workers, Next server).
 *
 * Reads `CALYX_INTAKE_URL` + `CALYX_SOURCE_TOKEN` (server tokens — not NEXT_PUBLIC_*).
 *
 * @example
 * ```ts
 * // instrumentation.ts or server entry
 * import { init } from 'calyx-logger'
 * init()
 * ```
 */
export function init(options: InitOptions = {}): CalyxClient | null {
  if (singleton) return singleton;

  const config = resolveConfigFromEnv(options, "node");
  if (!config) {
    if (typeof console !== "undefined") {
      console.warn(
        "[calyx-logger] missing intakeUrl/token — set CALYX_INTAKE_URL and CALYX_SOURCE_TOKEN"
      );
    }
    return null;
  }

  config.defaultAttributes = {
    runtime: "node",
    node_env: typeof process !== "undefined" ? process.env.NODE_ENV : undefined,
    pid: typeof process !== "undefined" ? process.pid : undefined,
    ...config.defaultAttributes,
  };

  singleton = new CalyxClient(config);

  const captureErrors = options.captureGlobalErrors !== false;
  const captureConsole = options.captureConsole !== false;
  const captureInfo = Boolean(options.captureConsoleInfo);

  if (captureConsole) installConsoleHooks(singleton, captureInfo);
  if (captureErrors) installProcessHandlers(singleton);
  installProcessFlush(singleton);

  return singleton;
}

/** Create a client from options or env (does not install global hooks). */
export function createClient(options: Partial<CalyxClientOptions> = {}): CalyxClient {
  const config = resolveConfigFromEnv(options, "node");
  if (!config) {
    throw new Error(
      "calyx-logger: set CALYX_INTAKE_URL and CALYX_SOURCE_TOKEN (or pass intakeUrl + token)"
    );
  }
  return new CalyxClient({
    ...config,
    defaultAttributes: { runtime: "node", ...config.defaultAttributes },
  });
}

export function getClient(options?: Partial<CalyxClientOptions>): CalyxClient {
  if (!singleton) {
    if (options) return createClient(options);
    const created = init();
    if (!created) throw new Error("calyx-logger: init failed — missing env");
    return created;
  }
  return singleton;
}

export function debug(message: string, attributes?: Record<string, unknown>): void {
  singleton?.debug(message, attributes);
}

export function info(message: string, attributes?: Record<string, unknown>): void {
  singleton?.info(message, attributes);
}

export function warn(message: string, attributes?: Record<string, unknown>): void {
  singleton?.warn(message, attributes);
}

export function error(message: string, attributes?: Record<string, unknown>): void {
  singleton?.error(message, attributes);
}

export function captureException(err: unknown, attributes?: Record<string, unknown>): void {
  singleton?.captureException(err, attributes);
}

export async function flush(): Promise<void> {
  await singleton?.flush();
}

export function reset(): void {
  singleton?.destroy();
  singleton = null;
  processHandlersInstalled = false;
  resetConsoleHooksFlag();
}

/** @deprecated use reset() */
export function resetClient(): void {
  reset();
}

function installProcessHandlers(client: CalyxClient): void {
  if (typeof process === "undefined" || processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("uncaughtException", (err) => {
    client.captureException(err, { kind: "uncaughtException" });
    void client.flush();
  });

  process.on("unhandledRejection", (reason) => {
    client.captureException(reason, { kind: "unhandledRejection" });
    void client.flush();
  });
}

function installProcessFlush(client: CalyxClient): void {
  if (typeof process === "undefined") return;

  const flush = () => {
    void client.flush();
  };

  process.once("beforeExit", flush);
  process.once("SIGTERM", () => {
    flush();
  });
  process.once("SIGINT", () => {
    flush();
  });
}

export default init;
