import type { CalyxClientOptions, CalyxEvent, LogLevel } from "./types.js";

const DEFAULT_BATCH = 50;
const DEFAULT_FLUSH_MS = 2000;

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatMessage(args: unknown[]): string {
  if (args.length === 0) return "(empty)";
  return args.map(stringifyArg).join(" ");
}

export class CalyxClient {
  private readonly intakeUrl: string;
  private readonly token: string;
  private readonly service: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly defaultAttributes: Record<string, unknown>;
  private readonly fetchImpl: typeof fetch;
  private readonly disabled: boolean;

  private queue: CalyxEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(options: CalyxClientOptions) {
    if (!options.intakeUrl?.trim()) {
      throw new Error("calyx-logger: intakeUrl is required");
    }
    if (!options.token?.trim()) {
      throw new Error("calyx-logger: token is required");
    }

    this.intakeUrl = options.intakeUrl.replace(/\/$/, "");
    this.token = options.token.trim();
    this.service = options.service?.trim() || "web";
    this.batchSize = Math.min(Math.max(options.batchSize ?? DEFAULT_BATCH, 1), 1000);
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.defaultAttributes = options.defaultAttributes ?? {};
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.disabled = Boolean(options.disabled);

    if (!this.disabled && this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);
      // Node + browsers that support it
      if (typeof this.timer === "object" && "unref" in this.timer) {
        (this.timer as NodeJS.Timeout).unref?.();
      }
    }
  }

  log(level: LogLevel, message: string, attributes?: Record<string, unknown>): void {
    this.enqueue({
      timestamp: nowIso(),
      level,
      message: message || "(empty)",
      service: this.service,
      attributes: { ...this.defaultAttributes, ...attributes },
    });
  }

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log("debug", message, attributes);
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.log("info", message, attributes);
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log("warn", message, attributes);
  }

  error(message: string, attributes?: Record<string, unknown>): void {
    this.log("error", message, attributes);
  }

  fatal(message: string, attributes?: Record<string, unknown>): void {
    this.log("fatal", message, attributes);
  }

  /** Capture an Error object. */
  captureException(err: unknown, attributes?: Record<string, unknown>): void {
    const error = err instanceof Error ? err : new Error(stringifyArg(err));
    this.error(error.message, {
      ...attributes,
      error_name: error.name,
      stack: error.stack,
    });
  }

  private enqueue(event: CalyxEvent): void {
    if (this.disabled) return;
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.disabled || this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      const res = await this.fetchImpl(this.intakeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (!res.ok) {
        // Put back once so a transient outage doesn't drop forever.
        this.queue.unshift(...batch);
        if (typeof console !== "undefined") {
          console.warn(`[calyx-logger] intake ${res.status}`);
        }
      }
    } catch {
      this.queue.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }

  /** Best-effort flush for pagehide / beforeunload. */
  flushSyncBeacon(): void {
    if (this.disabled || this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.batchSize);
    const body = JSON.stringify(batch);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // sendBeacon cannot set Authorization; fall through to keepalive fetch.
    }

    try {
      void this.fetchImpl(this.intakeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body,
        keepalive: true,
      });
    } catch {
      this.queue.unshift(...batch);
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.flush();
  }
}
