export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface CalyxEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  trace_id?: string;
  span_id?: string;
  attributes?: Record<string, unknown>;
}

export interface CalyxClientOptions {
  /** Full intake URL, e.g. https://intake.example.com/v1/logs */
  intakeUrl: string;
  /** Write-only source token from `calyx sources create` */
  token: string;
  /** Default service name stamped on events */
  service?: string;
  /** Max events per POST (default 50, max 1000) */
  batchSize?: number;
  /** Flush interval in ms (default 2000) */
  flushIntervalMs?: number;
  /** Extra attributes on every event */
  defaultAttributes?: Record<string, unknown>;
  /** Custom fetch (tests / edge) */
  fetch?: typeof fetch;
  /** Disable network (dry run) */
  disabled?: boolean;
}

export interface InitOptions extends Partial<CalyxClientOptions> {
  /**
   * Capture global errors:
   * - browser: window.onerror + unhandledrejection (default true)
   * - node: uncaughtException + unhandledRejection (default true)
   */
  captureGlobalErrors?: boolean;
  /**
   * Mirror console.error / console.warn into Calyx (default true).
   */
  captureConsole?: boolean;
  /**
   * Also mirror console.log / console.info / console.debug (default false).
   */
  captureConsoleInfo?: boolean;
}
