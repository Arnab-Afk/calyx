// Loki → Calyx forwarder
// Polls Eventio Loki and POSTs events to Calyx's /v1/logs intake.

import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { EventLevel } from "../schemas/index.js";

const LOKI_URL = (process.env.LOKI_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const CALYX_URL = (process.env.CALYX_INGEST_URL ?? "http://127.0.0.1:13000").replace(/\/$/, "");
const TENANT = process.env.CALYX_TENANT_ID ?? "eventio";
const QUERY = process.env.LOKI_QUERY ?? '{job=~"eventio|npm"}';
const POLL_MS = parseInt(process.env.LOKI_POLL_MS ?? "5000", 10);
const BATCH_LIMIT = parseInt(process.env.LOKI_BATCH_LIMIT ?? "200", 10);
const LOOKBACK_MS = parseInt(process.env.LOKI_LOOKBACK_MS ?? String(5 * 60 * 1000), 10);
const POSITION_FILE =
  process.env.LOKI_POSITION_FILE ?? "/tmp/calyx-loki-forwarder-position.json";

type LokiStream = {
  stream: Record<string, string>;
  values: [string, string][];
};

type Position = { lastNs: string };

function bunyanLevel(n: number): EventLevel {
  if (n >= 60) return "fatal";
  if (n >= 50) return "error";
  if (n >= 40) return "warn";
  if (n >= 30) return "info";
  return "debug";
}

function statusLevel(status: string | undefined): EventLevel {
  if (!status) return "info";
  const code = parseInt(status, 10);
  if (code >= 500) return "error";
  if (code >= 400) return "warn";
  return "info";
}

function nsToIso(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toISOString();
}

function mapLine(
  stream: Record<string, string>,
  ns: string,
  line: string
): {
  tenant_id: string;
  timestamp: string;
  service: string;
  level: EventLevel;
  message: string;
  trace_id?: string;
  attributes: Record<string, unknown>;
} {
  const job = stream.job ?? "unknown";
  const service =
    stream.service ??
    stream.container ??
    stream.host ??
    (job === "npm" ? "npm" : "eventio");

  // Bunyan / JSON app logs
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (typeof parsed.msg === "string" || typeof parsed.message === "string") {
      const levelNum =
        typeof parsed.level === "number"
          ? parsed.level
          : typeof parsed.level === "string"
            ? undefined
            : 30;
      const level: EventLevel =
        levelNum !== undefined
          ? bunyanLevel(levelNum)
          : statusLevel(String(parsed.level ?? ""));

      const msg = String(parsed.msg ?? parsed.message);
      const req = parsed.req as { method?: string; url?: string } | undefined;
      const res = parsed.res as { statusCode?: number } | undefined;
      const enriched =
        req?.method && req?.url
          ? `${msg} ${req.method} ${req.url}${res?.statusCode ? ` → ${res.statusCode}` : ""}`
          : msg;

      return {
        tenant_id: TENANT,
        timestamp: typeof parsed.time === "string" ? parsed.time : nsToIso(ns),
        service: String(parsed.name ?? service),
        level:
          res?.statusCode !== undefined
            ? statusLevel(String(res.statusCode))
            : level,
        message: enriched.slice(0, 4000),
        trace_id:
          typeof parsed.req_id === "string" ? parsed.req_id : undefined,
        attributes: {
          source: "loki",
          job,
          ...stream,
          duration: parsed.duration,
          hostname: parsed.hostname,
        },
      };
    }
  } catch {
    // not JSON — fall through
  }

  return {
    tenant_id: TENANT,
    timestamp: nsToIso(ns),
    service,
    level: statusLevel(stream.status),
    message: line.slice(0, 4000),
    attributes: {
      source: "loki",
      job,
      ...stream,
    },
  };
}

async function loadPosition(): Promise<Position> {
  try {
    const raw = await readFile(POSITION_FILE, "utf8");
    return JSON.parse(raw) as Position;
  } catch {
    const startNs = String(BigInt(Date.now() - LOOKBACK_MS) * 1_000_000n);
    return { lastNs: startNs };
  }
}

async function savePosition(pos: Position): Promise<void> {
  await mkdir(dirname(POSITION_FILE), { recursive: true });
  await writeFile(POSITION_FILE, JSON.stringify(pos), "utf8");
}

async function queryLoki(startNs: string, endNs: string): Promise<LokiStream[]> {
  const url = new URL(`${LOKI_URL}/loki/api/v1/query_range`);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("start", startNs);
  url.searchParams.set("end", endNs);
  url.searchParams.set("limit", String(BATCH_LIMIT));
  url.searchParams.set("direction", "forward");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Loki query failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    status: string;
    data?: { result?: LokiStream[] };
  };
  return body.data?.result ?? [];
}

async function postToCalyx(
  events: ReturnType<typeof mapLine>[]
): Promise<void> {
  if (events.length === 0) return;
  const res = await fetch(`${CALYX_URL}/v1/logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT,
    },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    throw new Error(`Calyx ingest failed: ${res.status} ${await res.text()}`);
  }
}

async function tick(pos: Position): Promise<Position> {
  const endNs = String(BigInt(Date.now()) * 1_000_000n);
  // Exclusive start: lastNs + 1
  const startNs = String(BigInt(pos.lastNs) + 1n);

  if (BigInt(startNs) >= BigInt(endNs)) return pos;

  const streams = await queryLoki(startNs, endNs);
  const events: ReturnType<typeof mapLine>[] = [];
  let maxNs = pos.lastNs;

  for (const s of streams) {
    for (const [ns, line] of s.values) {
      if (BigInt(ns) > BigInt(maxNs)) maxNs = ns;
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = mapLine(s.stream, ns, trimmed);
      if (!event.message.trim()) {
        event.message = `(empty log line from ${event.service})`;
      }
      events.push(event);
    }
  }

  // Dedup within batch by content-ish key is handled by Calyx content_hash;
  // still avoid huge bursts of empty noise.
  if (events.length > 0) {
    // Calyx accepts max 1000; chunk at 200
    for (let i = 0; i < events.length; i += 200) {
      await postToCalyx(events.slice(i, i + 200));
    }
    console.log(
      `Forwarded ${events.length} events → tenant=${TENANT} (through ${maxNs})`
    );
  }

  return { lastNs: maxNs };
}

async function main(): Promise<void> {
  console.log(
    `Loki→Calyx forwarder starting\n  Loki: ${LOKI_URL}\n  Calyx: ${CALYX_URL}\n  Query: ${QUERY}\n  Tenant: ${TENANT}`
  );
  let pos = await loadPosition();
  console.log(`Position: lastNs=${pos.lastNs}`);

  for (;;) {
    try {
      pos = await tick(pos);
      await savePosition(pos);
    } catch (err) {
      console.error("Forward tick failed:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
