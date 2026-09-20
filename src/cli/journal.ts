import { spawn } from "node:child_process";
import {
  listSystemdServices,
  runJournaldForwarder,
} from "../connectors/journald-forwarder.js";
import {
  apiFetch,
  loadConfig,
  prompt,
  resolveApiUrl,
  saveConfig,
} from "./config.js";

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // ignore — user can open manually
  }
}

async function selectFromList(
  title: string,
  items: string[],
  opts?: { allowCustom?: boolean; customLabel?: string }
): Promise<string> {
  if (items.length === 0) {
    if (opts?.allowCustom) {
      return prompt(opts.customLabel ?? "Enter value");
    }
    throw new Error(`No options available for: ${title}`);
  }

  console.log(`\n${title}`);
  items.forEach((item, i) => console.log(`  ${String(i + 1).padStart(2)}. ${item}`));
  if (opts?.allowCustom) {
    console.log(`  ${String(items.length + 1).padStart(2)}. Other (type name)`);
  }

  for (;;) {
    const answer = await prompt("Select number");
    const n = parseInt(answer, 10);
    if (Number.isFinite(n) && n >= 1 && n <= items.length) {
      return items[n - 1]!;
    }
    if (opts?.allowCustom && n === items.length + 1) {
      return prompt(opts.customLabel ?? "Enter value");
    }
    // allow typing the name directly
    if (items.includes(answer)) return answer;
    console.log("Invalid selection. Try again.");
  }
}

async function ensureAuth(opts: {
  apiUrl?: string;
  token?: string;
  skipBrowser?: boolean;
}): Promise<{ apiUrl: string; token: string; tenantId?: string; workspaceId?: string }> {
  if (opts.token || process.env.CALYX_API_TOKEN || loadConfig().apiToken) {
    const cfg = saveConfig({
      ...(opts.token && { apiToken: opts.token }),
      ...(opts.apiUrl && { apiUrl: opts.apiUrl }),
    });
    return {
      apiUrl: resolveApiUrl(opts.apiUrl ?? cfg.apiUrl),
      token: opts.token || process.env.CALYX_API_TOKEN || cfg.apiToken!,
      tenantId: cfg.tenantId,
    };
  }

  if (opts.skipBrowser) {
    const token = await prompt("Management token (calyx_mgmt_…)");
    if (!token) throw new Error("Token required");
    const cfg = saveConfig({
      apiToken: token,
      ...(opts.apiUrl && { apiUrl: opts.apiUrl }),
    });
    return { apiUrl: resolveApiUrl(opts.apiUrl ?? cfg.apiUrl), token };
  }

  console.log("\nAuthenticate this VM with Calyx (browser)…");
  const apiUrl = resolveApiUrl(opts.apiUrl);
  const started = await fetch(`${apiUrl}/v1/cli/device/code`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!started.ok) {
    throw new Error(`Could not start device login: ${started.status} ${await started.text()}`);
  }
  const device = (await started.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    interval: number;
    expires_in: number;
  };

  console.log(`\n  Open:  ${device.verification_uri_complete}`);
  console.log(`  Code:  ${device.user_code}`);
  console.log(`\nWaiting for browser approval…`);
  openBrowser(device.verification_uri_complete);

  const intervalMs = Math.max(2, device.interval || 3) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const poll = await fetch(
      `${apiUrl}/v1/cli/device/poll?device_code=${encodeURIComponent(device.device_code)}`,
      { headers: { Accept: "application/json" } }
    );
    const body = (await poll.json().catch(() => null)) as {
      status?: string;
      api_token?: string;
      api_url?: string;
      tenant_id?: string;
      workspace_id?: string;
      error?: string;
    } | null;

    if (!body) continue;
    if (body.status === "pending") continue;
    if (body.status === "expired") throw new Error("Device code expired. Run again.");
    if (body.status === "approved" && body.api_token) {
      const cfg = saveConfig({
        apiToken: body.api_token,
        apiUrl: body.api_url || apiUrl,
        tenantId: body.tenant_id || undefined,
      });
      console.log("✓ Authenticated");
      return {
        apiUrl: resolveApiUrl(cfg.apiUrl),
        token: body.api_token,
        tenantId: body.tenant_id ?? undefined,
        workspaceId: body.workspace_id ?? undefined,
      };
    }
    if (body.status === "consumed") {
      throw new Error("This login was already used. Run calyx journal again.");
    }
  }

  throw new Error("Timed out waiting for browser approval");
}

export async function runJournalCommand(opts: {
  apiUrl?: string;
  token?: string;
  project?: string;
  unit?: string;
  since?: string;
  skipBrowser?: boolean;
  yes?: boolean;
}): Promise<void> {
  const auth = await ensureAuth({
    apiUrl: opts.apiUrl,
    token: opts.token,
    skipBrowser: opts.skipBrowser,
  });

  const projects = await apiFetch<{
    projects: Array<{ id: string; name: string; slug: string; environment: string }>;
  }>("GET", "/v1/projects", { token: auth.token, apiUrl: auth.apiUrl });

  if (projects.projects.length === 0) {
    throw new Error("No projects found. Create one in the Calyx UI or: calyx projects create");
  }

  let projectSlug = opts.project;
  if (!projectSlug) {
    const labels = projects.projects.map(
      (p) => `${p.name}  (${p.slug} · ${p.environment})`
    );
    const picked = await selectFromList("Which project should receive these logs?", labels);
    const idx = labels.indexOf(picked);
    projectSlug = projects.projects[idx]!.slug;
  }

  saveConfig({ defaultProject: projectSlug, tenantId: auth.tenantId });

  let unit = opts.unit;
  if (!unit) {
    let services: string[] = [];
    try {
      services = await listSystemdServices();
    } catch (error) {
      console.warn(
        `Could not list systemd units (${error instanceof Error ? error.message : error}).`
      );
    }
    unit = await selectFromList("Which running service should we ship logs from?", services, {
      allowCustom: true,
      customLabel: "systemd unit name (without .service)",
    });
  }

  const serviceName = unit.replace(/\.service$/, "");
  if (!opts.yes) {
    const confirm = (
      await prompt(
        `Ship journalctl -u ${serviceName} → project ${projectSlug}? [y/N]`,
        "y"
      )
    ).toLowerCase();
    if (confirm !== "y" && confirm !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }

  console.log("\nCreating log source…");
  const created = await apiFetch<{
    source: { id: string; name: string; service: string };
    token?: string;
    intakeUrl?: string;
  }>("POST", `/v1/projects/${projectSlug}/sources`, {
    token: auth.token,
    apiUrl: auth.apiUrl,
    body: {
      name: `journald-${serviceName}`.slice(0, 80),
      role: "other",
      service: serviceName,
      provider: "http",
    },
  });

  if (!created.token) {
    throw new Error("Source created but write token was not returned");
  }

  const intakeUrl = created.intakeUrl || `${auth.apiUrl}/v1/logs`;
  console.log(`✓ Source ${created.source.name}`);
  console.log(`  Following journalctl -u ${serviceName}.service …`);
  console.log(`  Ctrl+C to stop.\n`);

  await runJournaldForwarder({
    intakeUrl,
    sourceToken: created.token,
    unit: serviceName,
    service: serviceName,
    since: opts.since,
    onBatch: (count) => {
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`[${ts}] forwarded ${count} line(s)`);
    },
    onError: (error) => {
      console.error("ship error:", error instanceof Error ? error.message : error);
    },
  });

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  console.log("\nStopped.");
}
