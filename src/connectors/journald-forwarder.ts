// journald → Calyx forwarder
// Follows `journalctl -u <unit> -f -o json` and POSTs batches to /v1/logs.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { EventLevel } from "../schemas/index.js";

export type JournalShipperConfig = {
  intakeUrl: string;
  sourceToken: string;
  unit: string;
  service?: string;
  since?: string;
  batchSize?: number;
  flushMs?: number;
  onBatch?: (count: number) => void;
  onError?: (error: unknown) => void;
};

type JournalEvent = {
  timestamp: string;
  service: string;
  level: EventLevel;
  message: string;
  attributes: Record<string, unknown>;
};

function priorityToLevel(priority: number | undefined): EventLevel {
  if (priority === undefined || Number.isNaN(priority)) return "info";
  if (priority <= 2) return "fatal";
  if (priority === 3) return "error";
  if (priority === 4) return "warn";
  if (priority >= 7) return "debug";
  return "info";
}

function usecToIso(usec: string | undefined): string {
  if (!usec) return new Date().toISOString();
  const ms = Number(BigInt(usec) / 1000n);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function mapJournalLine(raw: string, fallbackService: string): JournalEvent | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const message = String(parsed.MESSAGE ?? parsed.message ?? "").trim();
  if (!message) return null;

  const priority =
    typeof parsed.PRIORITY === "string"
      ? parseInt(parsed.PRIORITY, 10)
      : typeof parsed.PRIORITY === "number"
        ? parsed.PRIORITY
        : undefined;

  const unit = String(
    parsed._SYSTEMD_UNIT ?? parsed.UNIT ?? parsed.SYSLOG_IDENTIFIER ?? fallbackService
  ).replace(/\.service$/, "");

  const realtime =
    typeof parsed.__REALTIME_TIMESTAMP === "string"
      ? parsed.__REALTIME_TIMESTAMP
      : undefined;

  return {
    timestamp: usecToIso(realtime),
    service: fallbackService || unit,
    level: priorityToLevel(priority),
    message: message.slice(0, 4000),
    attributes: {
      source: "journald",
      unit: String(parsed._SYSTEMD_UNIT ?? parsed.UNIT ?? fallbackService),
      hostname: parsed._HOSTNAME,
      syslog_identifier: parsed.SYSLOG_IDENTIFIER,
      pid: parsed._PID,
      priority,
    },
  };
}

async function postBatch(
  intakeUrl: string,
  sourceToken: string,
  events: JournalEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const url = intakeUrl.replace(/\/$/, "").endsWith("/v1/logs")
    ? intakeUrl.replace(/\/$/, "")
    : `${intakeUrl.replace(/\/$/, "")}/v1/logs`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sourceToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    throw new Error(`Calyx ingest failed: ${res.status} ${await res.text()}`);
  }
}

export function listSystemdServices(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "systemctl",
      ["list-units", "--type=service", "--state=running", "--no-legend", "--no-pager", "--plain"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `systemctl exited ${code}`));
        return;
      }
      const units = stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0] ?? "")
        .filter((u) => u.endsWith(".service"))
        .map((u) => u.replace(/\.service$/, ""))
        .sort((a, b) => a.localeCompare(b));
      resolve(units);
    });
  });
}

export async function runJournaldForwarder(
  config: JournalShipperConfig
): Promise<ChildProcessWithoutNullStreams> {
  const batchSize = config.batchSize ?? 50;
  const flushMs = config.flushMs ?? 2000;
  const service = config.service ?? config.unit.replace(/\.service$/, "");
  const args = [
    "-u",
    config.unit.endsWith(".service") ? config.unit : `${config.unit}.service`,
    "-o",
    "json",
    "--no-pager",
    "-f",
  ];
  if (config.since) {
    args.push("--since", config.since);
  } else {
    args.push("-n", "0"); // follow only new lines after start
  }

  const child = spawn("journalctl", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const buffer: JournalEvent[] = [];
  let flushing: Promise<void> | null = null;

  const flush = async () => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      for (let i = 0; i < batch.length; i += 200) {
        await postBatch(config.intakeUrl, config.sourceToken, batch.slice(i, i + 200));
      }
      config.onBatch?.(batch.length);
    } catch (error) {
      config.onError?.(error);
      // put back so we retry next flush (best-effort)
      buffer.unshift(...batch);
    }
  };

  const scheduleFlush = () => {
    if (flushing) return;
    flushing = flush().finally(() => {
      flushing = null;
    });
  };

  const timer = setInterval(scheduleFlush, flushMs);

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const event = mapJournalLine(line, service);
    if (!event) return;
    buffer.push(event);
    if (buffer.length >= batchSize) scheduleFlush();
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (text) config.onError?.(new Error(text));
  });

  child.on("close", async () => {
    clearInterval(timer);
    await flush();
  });

  return child;
}
