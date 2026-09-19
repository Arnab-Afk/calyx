import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CalyxConfig {
  apiToken?: string;
  apiUrl?: string;
  tenantId?: string;
  defaultProject?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".calyx");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): CalyxConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as CalyxConfig;
  } catch {
    return {};
  }
}

export function saveConfig(patch: CalyxConfig): CalyxConfig {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function resolveApiUrl(override?: string): string {
  return (
    override ||
    process.env.CALYX_API_URL ||
    loadConfig().apiUrl ||
    "http://127.0.0.1:13000"
  ).replace(/\/$/, "");
}

export function resolveToken(override?: string): string {
  const token = override || process.env.CALYX_API_TOKEN || loadConfig().apiToken;
  if (!token) {
    throw new Error(
      "Not logged in. Run: calyx login --token <mgmt_token>\nOr set CALYX_API_TOKEN."
    );
  }
  return token;
}

export async function apiFetch<T>(
  method: string,
  pathname: string,
  opts?: { body?: unknown; token?: string; apiUrl?: string }
): Promise<T> {
  const url = `${resolveApiUrl(opts?.apiUrl)}${pathname}`;
  const token = resolveToken(opts?.token);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data as { error?: string; detail?: string };
    throw new Error(err.error || err.detail || `HTTP ${res.status}: ${text}`);
  }
  return data as T;
}

export function prompt(question: string, fallback?: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = fallback ? ` [${fallback}]` : "";
    process.stdout.write(`${question}${suffix}: `);
    const onData = (buf: Buffer) => {
      const line = buf.toString("utf8").trim();
      process.stdin.off("data", onData);
      if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
      resolve(line || fallback || "");
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}
