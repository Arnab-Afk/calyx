import { CalyxClient, formatMessage } from "./client.js";
import { resolveConfigFromEnv } from "./env.js";
import type { InitOptions } from "./types.js";

export type { CalyxClientOptions, CalyxEvent, InitOptions, LogLevel } from "./types.js";
export { CalyxClient } from "./client.js";
export { resolveConfigFromEnv } from "./env.js";

let singleton: CalyxClient | null = null;
let patched = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Initialize Calyx browser logging.
 *
 * Reads `NEXT_PUBLIC_CALYX_INTAKE_URL` + `NEXT_PUBLIC_CALYX_SOURCE_TOKEN`
 * (or `VITE_*` / `CALYX_*`) unless you pass overrides.
 *
 * @example
 * ```ts
 * // app/layout.tsx or instrumentation-client.ts
 * import { init } from '@calyx/logger/browser'
 * init()
 * ```
 */
export function init(options: InitOptions = {}): CalyxClient | null {
  if (singleton) return singleton;

  const config = resolveConfigFromEnv(options);
  if (!config) {
    if (typeof console !== "undefined") {
      console.warn(
        "[@calyx/logger] missing intakeUrl/token — set NEXT_PUBLIC_CALYX_INTAKE_URL and NEXT_PUBLIC_CALYX_SOURCE_TOKEN"
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

  patched = captureErrors || captureConsole;
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
  patched = false;
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

function installConsoleHooks(client: CalyxClient, includeInfo: boolean): void {
  if (patched) return;

  const wrap =
    (level: "error" | "warn" | "info" | "debug" | "log", original: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        const message = formatMessage(args);
        if (level === "error") client.error(message, { kind: "console.error" });
        else if (level === "warn") client.warn(message, { kind: "console.warn" });
        else if (level === "debug") client.debug(message, { kind: "console.debug" });
        else client.info(message, { kind: `console.${level}` });
      } catch {
        /* never break the page */
      }
      original.apply(console, args);
    };

  console.error = wrap("error", console.error.bind(console));
  console.warn = wrap("warn", console.warn.bind(console));
  if (includeInfo) {
    console.log = wrap("log", console.log.bind(console));
    console.info = wrap("info", console.info.bind(console));
    console.debug = wrap("debug", console.debug.bind(console));
  }
}

function installLifecycleFlush(client: CalyxClient): void {
  const flush = () => client.flushSyncBeacon();
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export default init;
