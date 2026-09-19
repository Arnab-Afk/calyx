import { formatMessage } from "./client.js";
import type { CalyxClient } from "./client.js";

let consolePatched = false;

export function installConsoleHooks(
  client: CalyxClient,
  includeInfo: boolean
): void {
  if (consolePatched) return;
  consolePatched = true;

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
        /* never break the host */
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

export function resetConsoleHooksFlag(): void {
  consolePatched = false;
}
