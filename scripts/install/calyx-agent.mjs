#!/usr/bin/env node
/**
 * Standalone Calyx agent (no npm deps).
 * Served from https://calyx-intake.arnabbhowmik.in/install/calyx-agent.mjs
 *
 * Interactive setup installs a background systemd (or nohup) shipper so the
 * terminal can close while logs keep flowing.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API_URL = "https://calyx-intake.arnabbhowmik.in";
const CONFIG_DIR = path.join(os.homedir(), ".calyx");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const SHIPPERS_DIR = path.join(CONFIG_DIR, "shippers");
const LOGS_DIR = path.join(CONFIG_DIR, "logs");
const AGENT_PATH = fileURLToPath(import.meta.url);

/** Interactive input must use the real TTY — stdin is the curl pipe under `curl | bash`. */
function openPromptInput() {
  if (process.stdin.isTTY) return { stream: process.stdin, close: () => {} };
  try {
    const fd = fs.openSync("/dev/tty", "r");
    const stream = fs.createReadStream("", { fd, autoClose: true });
    return {
      stream,
      close: () => {
        try {
          stream.destroy();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return { stream: process.stdin, close: () => {} };
  }
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

function resolveApiUrl(override) {
  return (
    override ||
    process.env.CALYX_API_URL ||
    loadConfig().apiUrl ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

function prompt(question, fallback) {
  return new Promise((resolve, reject) => {
    const suffix = fallback ? ` [${fallback}]` : "";
    process.stdout.write(`${question}${suffix}: `);
    const { stream, close } = openPromptInput();
    const rl = createInterface({
      input: stream,
      terminal: Boolean(stream.isTTY || process.stdout.isTTY),
    });
    let settled = false;
    const finish = (line) => {
      if (settled) return;
      settled = true;
      try {
        rl.close();
      } catch {
        /* ignore */
      }
      close();
      resolve((line || "").trim() || fallback || "");
    };
    rl.once("line", finish);
    rl.once("error", (err) => {
      if (settled) return;
      settled = true;
      close();
      reject(err);
    });
  });
}

async function selectFromList(title, items, opts = {}) {
  if (items.length === 0) {
    if (opts.allowCustom) return prompt(opts.customLabel || "Enter value");
    throw new Error(`No options for: ${title}`);
  }
  console.log(`\n${title}`);
  items.forEach((item, i) => console.log(`  ${String(i + 1).padStart(2)}. ${item}`));
  if (opts.allowCustom) {
    console.log(`  ${String(items.length + 1).padStart(2)}. Other (type name)`);
  }
  for (;;) {
    const answer = await prompt("Select number");
    const n = parseInt(answer, 10);
    if (Number.isFinite(n) && n >= 1 && n <= items.length) return items[n - 1];
    if (opts.allowCustom && n === items.length + 1) {
      return prompt(opts.customLabel || "Enter value");
    }
    if (items.includes(answer)) return answer;
    console.log("Invalid selection. Try again.");
  }
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}

function which(cmd) {
  try {
    return execFileSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function nodeBin() {
  return process.execPath || which("node") || "node";
}

async function apiFetch(method, pathname, { body, token, apiUrl } = {}) {
  const base = resolveApiUrl(apiUrl);
  const auth = token || process.env.CALYX_API_TOKEN || loadConfig().apiToken;
  if (!auth) throw new Error("Not authenticated");
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.detail || `HTTP ${res.status}: ${text}`);
  }
  return data;
}

async function ensureAuth({ apiUrl, token, skipBrowser } = {}) {
  if (token || process.env.CALYX_API_TOKEN || loadConfig().apiToken) {
    const cfg = saveConfig({
      ...(token && { apiToken: token }),
      ...(apiUrl && { apiUrl }),
    });
    return {
      apiUrl: resolveApiUrl(apiUrl || cfg.apiUrl),
      token: token || process.env.CALYX_API_TOKEN || cfg.apiToken,
      tenantId: cfg.tenantId,
    };
  }

  if (skipBrowser) {
    const pasted = await prompt("Management token (calyx_mgmt_…)");
    if (!pasted) throw new Error("Token required");
    const cfg = saveConfig({ apiToken: pasted, ...(apiUrl && { apiUrl }) });
    return { apiUrl: resolveApiUrl(apiUrl || cfg.apiUrl), token: pasted };
  }

  console.log("\nAuthenticate this machine with Calyx (browser)…");
  const base = resolveApiUrl(apiUrl);
  const started = await fetch(`${base}/v1/cli/device/code`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!started.ok) {
    throw new Error(`Could not start device login: ${started.status} ${await started.text()}`);
  }
  const device = await started.json();
  console.log(`\n  Open:  ${device.verification_uri_complete}`);
  console.log(`  Code:  ${device.user_code}`);
  console.log(`\nWaiting for browser approval…`);
  openBrowser(device.verification_uri_complete);

  const intervalMs = Math.max(2, device.interval || 3) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const poll = await fetch(
      `${base}/v1/cli/device/poll?device_code=${encodeURIComponent(device.device_code)}`,
      { headers: { Accept: "application/json" } }
    );
    const body = await poll.json().catch(() => null);
    if (!body || body.status === "pending") continue;
    if (body.status === "expired") throw new Error("Device code expired. Run again.");
    if (body.status === "approved" && body.api_token) {
      const cfg = saveConfig({
        apiToken: body.api_token,
        apiUrl: body.api_url || base,
        tenantId: body.tenant_id || undefined,
      });
      console.log("✓ Authenticated");
      return {
        apiUrl: resolveApiUrl(cfg.apiUrl),
        token: body.api_token,
        tenantId: body.tenant_id,
        workspaceId: body.workspace_id,
      };
    }
    if (body.status === "consumed") {
      throw new Error("This login was already used. Run again.");
    }
  }
  throw new Error("Timed out waiting for browser approval");
}

function priorityToLevel(priority) {
  if (priority === undefined || Number.isNaN(priority)) return "info";
  if (priority <= 2) return "fatal";
  if (priority === 3) return "error";
  if (priority === 4) return "warn";
  if (priority >= 7) return "debug";
  return "info";
}

function usecToIso(usec) {
  if (!usec) return new Date().toISOString();
  const ms = Number(BigInt(usec) / 1000n);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function mapJournalLine(raw, fallbackService) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
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
  return {
    timestamp: usecToIso(
      typeof parsed.__REALTIME_TIMESTAMP === "string" ? parsed.__REALTIME_TIMESTAMP : undefined
    ),
    service: fallbackService,
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

function mapDockerLine(line, service, container) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/);
  const timestamp = m
    ? new Date(m[1].replace(/(\.\d{3})\d+Z$/, "$1Z")).toISOString()
    : new Date().toISOString();
  const message = (m ? m[2] : trimmed).slice(0, 4000);
  if (!message) return null;
  return {
    timestamp: Number.isNaN(Date.parse(timestamp)) ? new Date().toISOString() : timestamp,
    service,
    level: /error|fatal|panic/i.test(message) ? "error" : /warn/i.test(message) ? "warn" : "info",
    message,
    attributes: { source: "docker", container },
  };
}

async function postBatch(intakeUrl, sourceToken, events) {
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
  if (!res.ok) throw new Error(`Calyx ingest failed: ${res.status} ${await res.text()}`);
}

function listSystemdServices() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "systemctl",
      ["list-units", "--type=service", "--state=running", "--no-legend", "--no-pager", "--plain"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `systemctl exited ${code}`));
        return;
      }
      resolve(
        stdout
          .split("\n")
          .map((line) => line.trim().split(/\s+/)[0] || "")
          .filter((u) => u.endsWith(".service"))
          .map((u) => u.replace(/\.service$/, ""))
          .sort((a, b) => a.localeCompare(b))
      );
    });
  });
}

function listDockerContainers() {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["ps", "--format", "{{.Names}}"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `docker exited ${code}`));
        return;
      }
      resolve(
        stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );
    });
  });
}

function listPm2Apps() {
  if (!which("pm2")) throw new Error("pm2 not found on PATH");
  const result = spawnSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "pm2 jlist failed").trim());
  }
  const apps = JSON.parse(result.stdout || "[]");
  if (!Array.isArray(apps)) return [];
  return [...new Set(apps.map((a) => String(a.name || a.pm_id || "")).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function listK8sPods(namespace) {
  if (!which("kubectl")) throw new Error("kubectl not found on PATH");
  const args = ["get", "pods", "-o", "jsonpath={range .items[*]}{.metadata.namespace}/{.metadata.name}{\"\\n\"}{end}"];
  if (namespace) args.splice(2, 0, "-n", namespace);
  else args.splice(2, 0, "-A");
  const result = spawnSync("kubectl", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "kubectl get pods failed").trim());
  }
  return (result.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function mapPlainLine(line, service, source, extra = {}) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Strip common PM2 / timestamp prefixes when present.
  const withoutPm2 = trimmed.replace(/^[^|]*\|\s*/, "");
  const m = withoutPm2.match(/^(\d{4}-\d{2}-\d{2}[T ]\S+)\s+(.*)$/);
  let timestamp = new Date().toISOString();
  let message = withoutPm2;
  if (m) {
    const parsed = new Date(m[1].replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) {
      timestamp = parsed.toISOString();
      message = m[2];
    }
  }
  message = message.slice(0, 4000);
  if (!message) return null;
  return {
    timestamp,
    service,
    level: /error|fatal|panic|exception/i.test(message)
      ? "error"
      : /warn/i.test(message)
        ? "warn"
        : "info",
    message,
    attributes: { source, ...extra },
  };
}

function slugifyId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "shipper";
}

function shipperPath(id) {
  return path.join(SHIPPERS_DIR, `${id}.json`);
}

function saveShipper(shipper) {
  fs.mkdirSync(SHIPPERS_DIR, { recursive: true });
  fs.writeFileSync(shipperPath(shipper.id), JSON.stringify(shipper, null, 2), { mode: 0o600 });
  return shipper;
}

function loadShipper(id) {
  const file = shipperPath(id);
  if (!fs.existsSync(file)) throw new Error(`Unknown shipper: ${id}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listShippers() {
  if (!fs.existsSync(SHIPPERS_DIR)) return [];
  return fs
    .readdirSync(SHIPPERS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SHIPPERS_DIR, f), "utf8")));
}

function unitNameFor(id) {
  return `calyx-ship-${id}.service`;
}

function userUnitPath(id) {
  return path.join(os.homedir(), ".config/systemd/user", unitNameFor(id));
}

function writeSystemdUserUnit(shipper) {
  const unitDir = path.join(os.homedir(), ".config/systemd/user");
  fs.mkdirSync(unitDir, { recursive: true });
  const unitFile = userUnitPath(shipper.id);
  const desc =
    shipper.mode === "docker"
      ? `Calyx docker logs (${shipper.target})`
      : shipper.mode === "pm2"
        ? `Calyx PM2 logs (${shipper.target})`
        : shipper.mode === "file"
          ? `Calyx file logs (${shipper.target})`
          : shipper.mode === "k8s"
            ? `Calyx k8s logs (${shipper.target})`
            : `Calyx journalctl (${shipper.target})`;
  const content = `[Unit]
Description=${desc}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodeBin()} ${AGENT_PATH} ship --id ${shipper.id}
Restart=always
RestartSec=5
WorkingDirectory=${CONFIG_DIR}
Environment=HOME=${os.homedir()}
StandardOutput=append:${path.join(LOGS_DIR, `${shipper.id}.log`)}
StandardError=append:${path.join(LOGS_DIR, `${shipper.id}.log`)}

[Install]
WantedBy=default.target
`;
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(unitFile, content, { mode: 0o644 });
  return unitFile;
}

function trySystemdUser(shipper) {
  if (!which("systemctl")) return { ok: false, reason: "systemctl not found" };
  writeSystemdUserUnit(shipper);
  const unit = unitNameFor(shipper.id);

  const reload = spawnSync("systemctl", ["--user", "daemon-reload"], { encoding: "utf8" });
  if (reload.status !== 0) {
    return { ok: false, reason: reload.stderr || reload.stdout || "daemon-reload failed" };
  }

  // Survive logout so shipping continues after closing SSH.
  spawnSync("loginctl", ["enable-linger", os.userInfo().username], { encoding: "utf8" });

  const enable = spawnSync("systemctl", ["--user", "enable", "--now", unit], { encoding: "utf8" });
  if (enable.status !== 0) {
    return { ok: false, reason: enable.stderr || enable.stdout || "enable --now failed" };
  }

  return {
    ok: true,
    kind: "systemd-user",
    unit,
    statusCmd: `systemctl --user status ${unit}`,
    logsCmd: `journalctl --user -u ${unit} -f`,
    stopCmd: `systemctl --user stop ${unit}`,
    fileLogs: path.join(LOGS_DIR, `${shipper.id}.log`),
  };
}

function startNohup(shipper) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `${shipper.id}.log`);
  const pidFile = path.join(SHIPPERS_DIR, `${shipper.id}.pid`);
  if (fs.existsSync(pidFile)) {
    const oldPid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (Number.isFinite(oldPid)) {
      try {
        process.kill(oldPid, 0);
        process.kill(oldPid, "SIGTERM");
      } catch {
        /* not running */
      }
    }
  }

  const out = fs.openSync(logFile, "a");
  const child = spawn(nodeBin(), [AGENT_PATH, "ship", "--id", shipper.id], {
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, HOME: os.homedir() },
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
  return {
    ok: true,
    kind: "nohup",
    pid: child.pid,
    statusCmd: `ps -p ${child.pid}`,
    logsCmd: `tail -f ${logFile}`,
    stopCmd: `kill ${child.pid}`,
    fileLogs: logFile,
  };
}

function installBackground(shipper) {
  const systemd = trySystemdUser(shipper);
  if (systemd.ok) return systemd;
  console.warn(`systemd user service unavailable (${systemd.reason}). Falling back to background process.`);
  return startNohup(shipper);
}

function stopBackground(id) {
  const unit = unitNameFor(id);
  const unitFile = userUnitPath(id);
  if (fs.existsSync(unitFile) && which("systemctl")) {
    spawnSync("systemctl", ["--user", "disable", "--now", unit], { encoding: "utf8" });
  }
  const pidFile = path.join(SHIPPERS_DIR, `${id}.pid`);
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    fs.unlinkSync(pidFile);
  }
}

async function runLineShipper({ cmd, args, mapLine, intakeUrl, sourceToken, service }) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  const buffer = [];
  const batchSize = 50;
  const flushMs = 2000;
  let flushing = null;

  const flush = async () => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      for (let i = 0; i < batch.length; i += 200) {
        await postBatch(intakeUrl, sourceToken, batch.slice(i, i + 200));
      }
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`[${ts}] forwarded ${batch.length} line(s)`);
    } catch (error) {
      console.error("ship error:", error instanceof Error ? error.message : error);
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
    const event = mapLine(line, service);
    if (!event) return;
    buffer.push(event);
    if (buffer.length >= batchSize) scheduleFlush();
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) console.error(text);
  });
  child.on("close", async (code) => {
    clearInterval(timer);
    await flush();
    process.exitCode = code || 0;
  });

  await new Promise((resolve) => {
    const stop = () => resolve();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("close", stop);
  });
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

async function pickProject(auth, explicit) {
  const projects = await apiFetch("GET", "/v1/projects", {
    token: auth.token,
    apiUrl: auth.apiUrl,
  });
  if (!projects.projects?.length) {
    throw new Error("No projects found. Create one in the Calyx UI first.");
  }
  if (explicit) return explicit;
  const labels = projects.projects.map(
    (p) => `${p.name}  (${p.slug} · ${p.environment})`
  );
  const picked = await selectFromList("Which project should receive these logs?", labels);
  return projects.projects[labels.indexOf(picked)].slug;
}

async function createSource(auth, projectSlug, serviceName, namePrefix) {
  console.log("\nCreating log source…");
  const created = await apiFetch("POST", `/v1/projects/${projectSlug}/sources`, {
    token: auth.token,
    apiUrl: auth.apiUrl,
    body: {
      name: `${namePrefix}-${serviceName}`.slice(0, 80),
      role: "other",
      service: serviceName,
      provider: "http",
    },
  });
  if (!created.token) throw new Error("Source created but write token was not returned");
  return {
    token: created.token,
    intakeUrl: created.intakeUrl || `${auth.apiUrl}/v1/logs`,
    name: created.source?.name || serviceName,
  };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--api-url") args.apiUrl = argv[++i];
    else if (a === "--token") args.token = argv[++i];
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--unit" || a === "--container" || a === "--app" || a === "--path" || a === "--pod") {
      args.target = argv[++i];
    } else if (a === "--namespace" || a === "-n") args.namespace = argv[++i];
    else if (a === "--id") args.id = argv[++i];
    else if (a === "--skip-browser") args.skipBrowser = true;
    else if (a === "--foreground" || a === "-f") args.foreground = true;
    else if (a === "-y" || a === "--yes") args.yes = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-")) args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`Calyx agent

Usage:
  calyx journal [options]   systemd / journalctl (background)
  calyx pm2     [options]   PM2 process logs (background)
  calyx docker  [options]   Docker container logs (background)
  calyx file    [options]   Tail a log file (background)
  calyx k8s     [options]   Kubernetes pod logs (background)
  calyx status              List background shippers
  calyx stop <id>           Stop a background shipper
  calyx ship --id <id>      Run a saved shipper (used by systemd)
  calyx --help

Options:
  --api-url <url>        Intake URL (default: ${DEFAULT_API_URL})
  --token <token>        Management token (skip browser)
  --project <slug>       Project slug
  --unit <name>          systemd unit (journal)
  --app <name>           PM2 app name
  --container <name>     Docker container
  --path <file>          Log file path
  --pod <ns/name>        Kubernetes pod (namespace/name)
  --namespace <ns>       Kubernetes namespace filter
  --skip-browser         Paste a token instead of browser auth
  --foreground           Keep shipping in this terminal
  -y, --yes              Skip confirmation
`);
}

async function finishSetup(shipper, opts) {
  saveShipper(shipper);
  if (opts.foreground) {
    console.log(`✓ Source ready — shipping in foreground (Ctrl+C to stop)\n`);
    await runShipper(shipper);
    return;
  }

  console.log("✓ Source ready — installing background shipper…");
  const bg = installBackground(shipper);
  if (!bg.ok) throw new Error("Could not start background shipper");

  console.log(`✓ Shipping in background (${bg.kind})`);
  console.log(`  id:     ${shipper.id}`);
  console.log(`  target: ${shipper.target}`);
  if (bg.unit) console.log(`  unit:   ${bg.unit}`);
  if (bg.pid) console.log(`  pid:    ${bg.pid}`);
  console.log(`\n  Status: ${bg.statusCmd}`);
  console.log(`  Logs:   ${bg.logsCmd}`);
  console.log(`  Stop:   calyx stop ${shipper.id}`);
  console.log(`\nYou can close this terminal. Logs keep flowing.`);
}

async function runShipper(shipper) {
  if (shipper.mode === "docker") {
    await runLineShipper({
      cmd: "docker",
      args: ["logs", "-f", "--timestamps", shipper.target],
      mapLine: (line, service) => mapDockerLine(line, service, shipper.target),
      intakeUrl: shipper.intakeUrl,
      sourceToken: shipper.sourceToken,
      service: shipper.service,
    });
    return;
  }

  if (shipper.mode === "pm2") {
    await runLineShipper({
      cmd: "pm2",
      args: ["logs", shipper.target, "--raw", "--lines", "0"],
      mapLine: (line, service) => mapPlainLine(line, service, "pm2", { app: shipper.target }),
      intakeUrl: shipper.intakeUrl,
      sourceToken: shipper.sourceToken,
      service: shipper.service,
    });
    return;
  }

  if (shipper.mode === "file") {
    await runLineShipper({
      cmd: "tail",
      args: ["-n", "0", "-F", shipper.target],
      mapLine: (line, service) => mapPlainLine(line, service, "file", { path: shipper.target }),
      intakeUrl: shipper.intakeUrl,
      sourceToken: shipper.sourceToken,
      service: shipper.service,
    });
    return;
  }

  if (shipper.mode === "k8s") {
    const [ns, name] = shipper.target.includes("/")
      ? shipper.target.split("/", 2)
      : [shipper.namespace || "default", shipper.target];
    await runLineShipper({
      cmd: "kubectl",
      args: ["logs", "-f", "-n", ns, name, "--all-containers=true", "--prefix=true"],
      mapLine: (line, service) =>
        mapPlainLine(line, service, "k8s", { pod: name, namespace: ns }),
      intakeUrl: shipper.intakeUrl,
      sourceToken: shipper.sourceToken,
      service: shipper.service,
    });
    return;
  }

  const unit = shipper.target.endsWith(".service") ? shipper.target : `${shipper.target}.service`;
  await runLineShipper({
    cmd: "journalctl",
    args: ["-u", unit, "-o", "json", "--no-pager", "-f", "-n", "0"],
    mapLine: mapJournalLine,
    intakeUrl: shipper.intakeUrl,
    sourceToken: shipper.sourceToken,
    service: shipper.service,
  });
}

async function runJournal(opts) {
  const auth = await ensureAuth(opts);
  const projectSlug = await pickProject(auth, opts.project);
  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let unit = opts.target;
  if (!unit) {
    let services = [];
    try {
      services = await listSystemdServices();
    } catch (error) {
      console.warn(`Could not list systemd units (${error.message}).`);
    }
    unit = await selectFromList("Which running service should we ship logs from?", services, {
      allowCustom: true,
      customLabel: "systemd unit name (without .service)",
    });
  }
  const serviceName = unit.replace(/\.service$/, "");
  if (!opts.yes) {
    const confirm = (
      await prompt(`Ship journalctl -u ${serviceName} → project ${projectSlug} (background)? [y/N]`, "y")
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  const source = await createSource(auth, projectSlug, serviceName, "journald");
  const id = slugifyId(`journal-${serviceName}`);
  await finishSetup(
    {
      id,
      mode: "journal",
      target: serviceName,
      service: serviceName,
      projectSlug,
      intakeUrl: source.intakeUrl,
      sourceToken: source.token,
      sourceName: source.name,
      createdAt: new Date().toISOString(),
    },
    opts
  );
}

async function runDocker(opts) {
  const auth = await ensureAuth(opts);
  const projectSlug = await pickProject(auth, opts.project);
  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let container = opts.target;
  if (!container) {
    let containers = [];
    try {
      containers = await listDockerContainers();
    } catch (error) {
      console.warn(`Could not list containers (${error.message}).`);
    }
    container = await selectFromList("Which container should we ship logs from?", containers, {
      allowCustom: true,
      customLabel: "container name",
    });
  }

  const serviceName = container.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) || "docker";
  if (!opts.yes) {
    const confirm = (
      await prompt(`Ship docker logs -f ${container} → project ${projectSlug} (background)? [y/N]`, "y")
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  const source = await createSource(auth, projectSlug, serviceName, "docker");
  const id = slugifyId(`docker-${serviceName}`);
  await finishSetup(
    {
      id,
      mode: "docker",
      target: container,
      service: serviceName,
      projectSlug,
      intakeUrl: source.intakeUrl,
      sourceToken: source.token,
      sourceName: source.name,
      createdAt: new Date().toISOString(),
    },
    opts
  );
}

async function runPm2(opts) {
  const auth = await ensureAuth(opts);
  const projectSlug = await pickProject(auth, opts.project);
  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let app = opts.target;
  if (!app) {
    let apps = [];
    try {
      apps = listPm2Apps();
    } catch (error) {
      console.warn(`Could not list PM2 apps (${error.message}).`);
    }
    app = await selectFromList("Which PM2 app should we ship logs from?", apps, {
      allowCustom: true,
      customLabel: "PM2 app name",
    });
  }

  const serviceName = app.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) || "pm2";
  if (!opts.yes) {
    const confirm = (
      await prompt(`Ship pm2 logs ${app} → project ${projectSlug} (background)? [y/N]`, "y")
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  const source = await createSource(auth, projectSlug, serviceName, "pm2");
  const id = slugifyId(`pm2-${serviceName}`);
  await finishSetup(
    {
      id,
      mode: "pm2",
      target: app,
      service: serviceName,
      projectSlug,
      intakeUrl: source.intakeUrl,
      sourceToken: source.token,
      sourceName: source.name,
      createdAt: new Date().toISOString(),
    },
    opts
  );
}

async function runFile(opts) {
  const auth = await ensureAuth(opts);
  const projectSlug = await pickProject(auth, opts.project);
  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let filePath = opts.target;
  if (!filePath) {
    console.log("\nExamples: /var/log/nginx/error.log  ~/.pm2/logs/app-error.log  /var/log/supervisor/app.log");
    filePath = await prompt("Log file path");
  }
  filePath = filePath.replace(/^~(?=$|\/)/, os.homedir());
  if (!filePath) throw new Error("Log file path required");

  const base = path.basename(filePath).replace(/\.(log|txt)$/i, "") || "file";
  const serviceName = base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) || "file";
  if (!opts.yes) {
    const confirm = (
      await prompt(`Ship tail -F ${filePath} → project ${projectSlug} (background)? [y/N]`, "y")
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  const source = await createSource(auth, projectSlug, serviceName, "file");
  const id = slugifyId(`file-${serviceName}`);
  await finishSetup(
    {
      id,
      mode: "file",
      target: filePath,
      service: serviceName,
      projectSlug,
      intakeUrl: source.intakeUrl,
      sourceToken: source.token,
      sourceName: source.name,
      createdAt: new Date().toISOString(),
    },
    opts
  );
}

async function runK8s(opts) {
  const auth = await ensureAuth(opts);
  const projectSlug = await pickProject(auth, opts.project);
  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let pod = opts.target;
  if (!pod) {
    let pods = [];
    try {
      pods = listK8sPods(opts.namespace);
    } catch (error) {
      console.warn(`Could not list pods (${error.message}).`);
    }
    pod = await selectFromList("Which pod should we ship logs from?", pods, {
      allowCustom: true,
      customLabel: "pod as namespace/name",
    });
  }

  const short = pod.includes("/") ? pod.split("/", 2)[1] : pod;
  const serviceName = short.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) || "k8s";
  if (!opts.yes) {
    const confirm = (
      await prompt(`Ship kubectl logs -f ${pod} → project ${projectSlug} (background)? [y/N]`, "y")
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  const source = await createSource(auth, projectSlug, serviceName, "k8s");
  const id = slugifyId(`k8s-${serviceName}`);
  await finishSetup(
    {
      id,
      mode: "k8s",
      target: pod,
      namespace: opts.namespace,
      service: serviceName,
      projectSlug,
      intakeUrl: source.intakeUrl,
      sourceToken: source.token,
      sourceName: source.name,
      createdAt: new Date().toISOString(),
    },
    opts
  );
}

function printStatus() {
  const shippers = listShippers();
  if (shippers.length === 0) {
    console.log("No shippers configured. Run: calyx journal");
    return;
  }
  for (const s of shippers) {
    const unit = unitNameFor(s.id);
    const unitFile = userUnitPath(s.id);
    let state = "unknown";
    if (fs.existsSync(unitFile) && which("systemctl")) {
      const st = spawnSync("systemctl", ["--user", "is-active", unit], { encoding: "utf8" });
      state = (st.stdout || st.stderr || "inactive").trim();
    } else {
      const pidFile = path.join(SHIPPERS_DIR, `${s.id}.pid`);
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
        try {
          process.kill(pid, 0);
          state = `running (pid ${pid})`;
        } catch {
          state = "stopped";
        }
      } else {
        state = "stopped";
      }
    }
    console.log(`  ${s.id.padEnd(28)} ${s.mode.padEnd(8)} ${s.target.padEnd(24)} ${state}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts._[0] || "help";
  if (opts.help || cmd === "help" || cmd === "--help") {
    printHelp();
    return;
  }
  if (cmd === "journal" || cmd === "journald") {
    await runJournal(opts);
    return;
  }
  if (cmd === "docker") {
    await runDocker(opts);
    return;
  }
  if (cmd === "pm2") {
    await runPm2(opts);
    return;
  }
  if (cmd === "file" || cmd === "log" || cmd === "logs") {
    await runFile(opts);
    return;
  }
  if (cmd === "k8s" || cmd === "kubernetes" || cmd === "kubectl") {
    await runK8s(opts);
    return;
  }
  if (cmd === "ship") {
    const id = opts.id || opts._[1];
    if (!id) throw new Error("Usage: calyx ship --id <id>");
    await runShipper(loadShipper(id));
    return;
  }
  if (cmd === "status") {
    printStatus();
    return;
  }
  if (cmd === "stop") {
    const id = opts.id || opts._[1];
    if (!id) throw new Error("Usage: calyx stop <id>");
    stopBackground(id);
    console.log(`✓ Stopped ${id}`);
    return;
  }
  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
