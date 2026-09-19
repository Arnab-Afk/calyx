export type { CalyxClientOptions, CalyxEvent, LogLevel } from "./types.js";
export { CalyxClient, formatMessage } from "./client.js";
export { resolveConfigFromEnv } from "./env.js";

import { CalyxClient } from "./client.js";
import { resolveConfigFromEnv } from "./env.js";
import type { CalyxClientOptions } from "./types.js";

let singleton: CalyxClient | null = null;

/** Create a client from options or env (`CALYX_INTAKE_URL` + `CALYX_SOURCE_TOKEN`). */
export function createClient(options: Partial<CalyxClientOptions> = {}): CalyxClient {
  const config = resolveConfigFromEnv(options);
  if (!config) {
    throw new Error(
      "calyx-logger: set CALYX_INTAKE_URL and CALYX_SOURCE_TOKEN (or pass intakeUrl + token)"
    );
  }
  return new CalyxClient(config);
}

/** Lazy singleton for server / scripts. */
export function getClient(options?: Partial<CalyxClientOptions>): CalyxClient {
  if (!singleton) singleton = createClient(options ?? {});
  return singleton;
}

export function resetClient(): void {
  singleton?.destroy();
  singleton = null;
}
