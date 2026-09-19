import { CalyxClient } from "./client.js";
import { resolveConfigFromEnv } from "./env.js";
import { installConsoleHooks, resetConsoleHooksFlag } from "./hooks.js";
import type { InitOptions } from "./types.js";

export type { CalyxClientOptions, CalyxEvent, InitOptions, LogLevel } from "./types.js";
export { CalyxClient } from "./client.js";
export { resolveConfigFromEnv } from "./env.js";

let singleton: CalyxClient | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Initialize Calyx browser / frontend logging.
 *
 * Reads `NEXT_PUBLIC_CALYX_INTAKE_URL` + `NEXT_PUBLIC_CALYX_SOURCE_TOKEN`
 * (or `VITE_*` / `CALYX_*`) unless you pass overrides.
 *
 * For Node/backend use `import { init } from 'calyx-logger'` instead.
 *
 * @example
 * ```ts
 * import { init } from 'calyx-logger/browser'
 * init()
 * ```
 */
export function init(options: InitOptions = {}): CalyxClient | null {
  if (singleton) return singleton;

  const config = resolveConfigFromEnv(options, "browser");
  if (!config) {
    if (typeof console !== "undefined") {
      console.warn(
        "[calyx-logger] missing intakeUrl/token — set NEXT_PUBLIC_CALYX_INTAKE_URL and NEXT_PUBLIC_CALYX_SOURCE_TOKEN"
      );
    }
    return null;
  }

  if (isBrowser()) {
    config.defaultAttributes = {
      runtime: "browser",
      href: typeof location !== "undefined" ? location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      ...config.defaultAttributes,
    };
  }

  singleton = new CalyxClient(config);

  const captureErrors = options.captureGlobalErrors !== false && isBrowser();
  const captureConsole = options.captureConsole !== false && isBrowser();
  const captureInfo = Boolean(options.captureConsoleInfo) && isBrowser();

  if (captureErrors) installGlobalHandlers(singleton);
  if (captureConsole) installConsoleHooks(singleton, captureInfo);
  if (isBrowser()) installLifecycleFlush(singleton);

  return singleton;
}

export function getClient(): CalyxClient | null {
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

/** Tear down hooks + client (tests). */
export function reset(): void {
  singleton?.destroy();
  singleton = null;
  resetConsoleHooksFlag();
}

function installGlobalHandlers(client: CalyxClient): void {
  window.addEventListener("error", (event) => {
    client.captureException(event.error ?? event.message, {
      kind: "window.onerror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    client.captureException(event.reason, { kind: "unhandledrejection" });
  });
}

function installLifecycleFlush(client: CalyxClient): void {
  const flush = () => client.flushSyncBeacon();
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export default init;
