#!/usr/bin/env node
// CLI — thin adapter over the tool registry, agent loop, and onboarding APIs.

import "dotenv/config";
import { Command } from "commander";
import { initAgent, executeTool, runAgent, getAllTools } from "../agent/index.js";
import type { ToolInput } from "../schemas/index.js";
import {
  apiFetch,
  loadConfig,
  prompt,
  resolveApiUrl,
  saveConfig,
} from "./config.js";

initAgent();

const program = new Command();
program
  .name("calyx")
  .description("AI-native observability CLI")
  .version("0.1.0");

function resolveTenant(explicit?: string): string {
  const tenant = explicit || process.env.CALYX_TENANT_ID || loadConfig().tenantId;
  if (!tenant) {
    throw new Error("Tenant required. Pass -t/--tenant or set CALYX_TENANT_ID / calyx login --tenant.");
  }
  return tenant;
}

function resolveProjectFlag(explicit?: string): string {
  const project = explicit || loadConfig().defaultProject;
  if (!project) {
    throw new Error("Project required. Pass --project <slug|id> or set default via onboard.");
  }
  return project;
}

// ── calyx login ───────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Store management API token for onboarding commands")
  .option("--token <token>", "Management token (calyx_mgmt_…)")
  .option("--api-url <url>", "Ingestion / management API base URL")
  .option("--tenant <id>", "Default tenant id")
  .action(async (opts: { token?: string; apiUrl?: string; tenant?: string }) => {
    const token = opts.token || (await prompt("Management token"));
    if (!token) {
      console.error("Token required.");
      process.exit(1);
    }
    const cfg = saveConfig({
      apiToken: token,
      ...(opts.apiUrl && { apiUrl: opts.apiUrl }),
      ...(opts.tenant && { tenantId: opts.tenant }),
    });
    console.log(`Logged in. Config → ~/.calyx/config.json`);
    console.log(`API URL: ${resolveApiUrl(cfg.apiUrl)}`);
    if (cfg.tenantId) console.log(`Tenant: ${cfg.tenantId}`);
  });

// ── calyx projects ────────────────────────────────────────────────────────────

const projects = program.command("projects").description("Manage Calyx projects");

projects
  .command("create")
  .argument("[name]", "Project name")
  .option("--env <environment>", "Environment", "production")
  .option("--slug <slug>", "URL-safe slug")
  .option("--json", "JSON output")
  .action(async (name: string | undefined, opts: { env: string; slug?: string; json?: boolean }) => {
    const projectName = name || (await prompt("Project name"));
    if (!projectName) {
      console.error("Name required.");
      process.exit(1);
    }
    const project = await apiFetch<{
      id: string;
      name: string;
      slug: string;
      environment: string;
      tenantId: string;
    }>("POST", "/v1/projects", {
      body: { name: projectName, environment: opts.env, slug: opts.slug },
    });
    saveConfig({ defaultProject: project.slug, tenantId: project.tenantId });
    if (opts.json) console.log(JSON.stringify(project, null, 2));
    else {
      console.log(`✓ Created project ${project.name}`);
      console.log(`  slug: ${project.slug}`);
      console.log(`  env:  ${project.environment}`);
      console.log(`  id:   ${project.id}`);
    }
  });

projects
  .command("list")
  .option("--json", "JSON output")
  .action(async (opts: { json?: boolean }) => {
    const data = await apiFetch<{
      projects: Array<{ name: string; slug: string; environment: string; id: string }>;
    }>("GET", "/v1/projects");
    if (opts.json) console.log(JSON.stringify(data, null, 2));
    else if (data.projects.length === 0) console.log("No projects yet. Run: calyx projects create");
    else {
      console.log(" Project                 Environment   Slug");
      for (const p of data.projects) {
        console.log(
          ` ${p.name.padEnd(22)} ${p.environment.padEnd(12)} ${p.slug}`
        );
      }
      console.log(`\n✓ ${data.projects.length} project(s)`);
    }
  });

// ── calyx sources ─────────────────────────────────────────────────────────────

const sources = program.command("sources").description("Connect frontend / backend log sources");

sources
  .command("create")
  .requiredOption("-p, --project <slug>", "Project slug or id")
  .option("--role <role>", "frontend | backend | other")
  .option("--service <name>", "Service name stamped on events")
  .option("--name <name>", "Human-readable source name")
  .option("--provider <name>", "http (default) | vercel")
  .option("--json", "JSON output")
  .action(
    async (opts: {
      project: string;
      role?: string;
      service?: string;
      name?: string;
      provider?: string;
      json?: boolean;
    }) => {
      const provider =
        opts.provider === "vercel" || opts.provider === "http" ? opts.provider : "http";
      let role = opts.role;
      if (!role) {
        const answer = (await prompt("Role (frontend/backend/other)", "backend")).toLowerCase();
        role = ["frontend", "backend", "other"].includes(answer) ? answer : "backend";
      }
      const service =
        opts.service ||
        (await prompt(
          "Service name",
          provider === "vercel" ? "vercel" : role === "frontend" ? "web" : "api"
        ));
      const name =
        opts.name ||
        (await prompt(
          "Source name",
          provider === "vercel" ? `${service}-vercel` : `${service}-${role}`
        ));

      const created = await apiFetch<{
        source: { id: string; service: string; role: string; name: string; provider?: string };
        token?: string;
        intakeUrl?: string;
        drainUrl?: string;
        drainSecret?: string | null;
        nextSteps: string[];
        curlExample?: string;
      }>("POST", `/v1/projects/${opts.project}/sources`, {
        body: { name, role, service, provider },
      });

      if (opts.json) console.log(JSON.stringify(created, null, 2));
      else if (provider === "vercel") {
        console.log(`✓ Created Vercel drain source ${created.source.name}`);
        console.log(`  role:    ${created.source.role}`);
        console.log(`  service: ${created.source.service}`);
        console.log(`\nDrain URL:`);
        console.log(`  ${created.drainUrl}`);
        console.log(`\nSignature secret (paste into Vercel; shown once):`);
        console.log(`  ${created.drainSecret}`);
        console.log(`\nNext steps:`);
        for (const step of created.nextSteps) console.log(`  ${step}`);
        console.log();
      } else {
        console.log(`✓ Created log source ${created.source.name}`);
        console.log(`  role:    ${created.source.role}`);
        console.log(`  service: ${created.source.service}`);
        console.log(`\nSave this write token now (shown once):`);
        console.log(`  ${created.token}`);
        console.log(`\nNext steps:`);
        for (const step of created.nextSteps) console.log(`  ${step}`);
        if (created.curlExample) console.log(`\nExample:\n${created.curlExample}\n`);
      }
    }
  );

sources
  .command("list")
  .requiredOption("-p, --project <slug>", "Project slug or id")
  .option("--json", "JSON output")
  .action(async (opts: { project: string; json?: boolean }) => {
    const data = await apiFetch<{
      sources: Array<{
        name: string;
        role: string;
        service: string;
        provider?: string;
        status: string;
        lastEventAt: string | null;
        drainUrl?: string;
      }>;
    }>("GET", `/v1/projects/${opts.project}/sources`);
    if (opts.json) console.log(JSON.stringify(data, null, 2));
    else {
      for (const s of data.sources) {
        const age = s.lastEventAt
          ? `last event ${s.lastEventAt}`
          : "waiting for first event";
        const provider = (s.provider ?? "http").padEnd(7);
        console.log(
          `  [${s.status.padEnd(9)}] ${provider} ${s.role.padEnd(9)} ${s.service.padEnd(12)} ${s.name} — ${age}`
        );
        if (s.drainUrl) console.log(`             drain: ${s.drainUrl}`);
      }
    }
  });

sources
  .command("status")
  .requiredOption("-p, --project <slug>", "Project slug or id")
  .option("--wait <seconds>", "Poll until sources receive events", "0")
  .action(async (opts: { project: string; wait: string }) => {
    const waitSec = parseInt(opts.wait, 10) || 0;
    const deadline = Date.now() + waitSec * 1000;
    for (;;) {
      const data = await apiFetch<{
        sources: Array<{
          name: string;
          role: string;
          service: string;
          status: string;
          lastEventAt: string | null;
        }>;
      }>("GET", `/v1/projects/${opts.project}/sources`);

      let allReceiving = data.sources.length > 0;
      for (const s of data.sources) {
        const ok = s.status === "receiving";
        allReceiving = allReceiving && ok;
        console.log(
          `  ${ok ? "✓" : "…"} ${s.role}/${s.service} — ${
            s.lastEventAt ? `last event ${s.lastEventAt}` : "waiting"
          }`
        );
      }
      if (allReceiving) {
        console.log("\n✓ All sources receiving events");
        return;
      }
      if (Date.now() >= deadline) {
        if (waitSec > 0) console.error("\nTimed out waiting for events.");
        process.exitCode = waitSec > 0 ? 1 : 0;
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
      console.log("—");
    }
  });

// ── calyx github ──────────────────────────────────────────────────────────────

const github = program.command("github").description("Connect a GitHub repository");

github
  .command("connect")
  .option("-p, --project <slug>", "Project slug or id")
  .option("--repo <owner/name>", "GitHub repository")
  .option("--json", "JSON output")
  .action(async (opts: { project?: string; repo?: string; json?: boolean }) => {
    const project = resolveProjectFlag(opts.project);
    const repo =
      opts.repo ||
      (await prompt("GitHub repo (owner/name)", "acme/my-app"));
    const result = await apiFetch<{
      github: { repo: string };
      webhookUrl: string;
      webhookSecret: string;
      nextSteps: string[];
    }>("POST", `/v1/projects/${project}/github`, { body: { repo } });

    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`✓ Connected GitHub ${result.github.repo}`);
      console.log(`\nWebhook URL:\n  ${result.webhookUrl}`);
      console.log(`\nWebhook secret (save now):\n  ${result.webhookSecret}`);
      console.log(`\nNext steps:`);
      for (const s of result.nextSteps) console.log(`  ${s}`);
    }
  });

// ── calyx slack ───────────────────────────────────────────────────────────────

const slack = program.command("slack").description("Bind a Slack alert channel");

slack
  .command("connect")
  .option("-p, --project <slug>", "Project slug or id")
  .option("--channel-id <id>", "Slack channel ID (C…)")
  .option("--channel <name>", "Channel display name")
  .option("--bot-token <token>", "Bot token (xoxb-…)")
  .option("--team-id <id>", "Slack team / workspace ID")
  .option("--json", "JSON output")
  .action(
    async (opts: {
      project?: string;
      channelId?: string;
      channel?: string;
      botToken?: string;
      teamId?: string;
      json?: boolean;
    }) => {
      const project = resolveProjectFlag(opts.project);
      console.log(`
Slack setup (v1 — paste credentials after creating a Slack app):
  1. https://api.slack.com/apps → Create New App → From scratch
  2. OAuth scopes: chat:write, chat:write.public
  3. Install to workspace → copy Bot User OAuth Token
  4. Invite the bot to your alerts channel
  5. Channel ID: open channel details → copy Channel ID
`);
      const botToken = opts.botToken || (await prompt("Bot token (xoxb-…)"));
      const channelId = opts.channelId || (await prompt("Channel ID (C…)" ));
      const channelName = opts.channel || (await prompt("Channel name", "#incidents"));
      const teamId = opts.teamId || (await prompt("Team ID (optional)", ""));

      const result = await apiFetch<{
        slack: { channelId: string; channelName: string | null };
        nextSteps: string[];
      }>("POST", `/v1/projects/${project}/slack`, {
        body: {
          botToken,
          channelId,
          channelName,
          ...(teamId && { teamId }),
        },
      });

      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`✓ Slack bound to ${result.slack.channelName ?? result.slack.channelId}`);
        for (const s of result.nextSteps) console.log(`  ${s}`);
      }
    }
  );

slack
  .command("test")
  .option("-p, --project <slug>", "Project slug or id")
  .option("--json", "JSON output")
  .action(async (opts: { project?: string; json?: boolean }) => {
    const project = resolveProjectFlag(opts.project);
    const result = await apiFetch<{ ok: boolean; ts?: string; channel?: string }>(
      "POST",
      `/v1/projects/${project}/slack/test`
    );
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`✓ Test alert posted (ts=${result.ts})`);
  });

// ── calyx onboard ─────────────────────────────────────────────────────────────

program
  .command("onboard")
  .description("Guided setup: project → FE/BE logs → GitHub → Slack")
  .option("--skip-github", "Skip GitHub connect")
  .option("--skip-slack", "Skip Slack connect")
  .option("--skip-verify", "Do not wait for first log events")
  .action(async (opts: { skipGithub?: boolean; skipSlack?: boolean; skipVerify?: boolean }) => {
    console.log(`
Calyx onboard
─────────────
Connect FE + BE logs, GitHub, and Slack so Calyx can alert and debug.
API: ${resolveApiUrl()}
`);

    const projectName = await prompt("Project name", "my-app");
    const env = await prompt("Environment", "production");
    const project = await apiFetch<{
      id: string;
      name: string;
      slug: string;
      tenantId: string;
    }>("POST", "/v1/projects", { body: { name: projectName, environment: env } });
    saveConfig({ defaultProject: project.slug, tenantId: project.tenantId });
    console.log(`✓ Project ${project.slug}\n`);

    async function createSource(role: "frontend" | "backend", defaultService: string) {
      const service = await prompt(`${role} service name`, defaultService);
      const created = await apiFetch<{
        source: { name: string; service: string };
        token: string;
        curlExample: string;
      }>("POST", `/v1/projects/${project.slug}/sources`, {
        body: {
          name: `${service}-${role}`,
          role,
          service,
        },
      });
      console.log(`✓ ${role} source → service=${created.source.service}`);
      console.log(`  token: ${created.token}`);
      console.log(`  ${created.curlExample.split("\n")[0]}…\n`);
      return created;
    }

    await createSource("frontend", "web");
    await createSource("backend", "api");

    if (!opts.skipVerify) {
      console.log("Waiting up to 60s for first events (send curl samples in another terminal)…");
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const data = await apiFetch<{
          sources: Array<{ status: string; role: string; service: string }>;
        }>("GET", `/v1/projects/${project.slug}/sources`);
        const ok = data.sources.length >= 2 && data.sources.every((s) => s.status === "receiving");
        for (const s of data.sources) {
          console.log(`  ${s.status === "receiving" ? "✓" : "…"} ${s.role}/${s.service}`);
        }
        if (ok) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      console.log("");
    }

    if (!opts.skipGithub) {
      const repo = await prompt("GitHub repo (owner/name)", "acme/my-app");
      const gh = await apiFetch<{
        webhookUrl: string;
        webhookSecret: string;
      }>("POST", `/v1/projects/${project.slug}/github`, { body: { repo } });
      console.log(`✓ GitHub connected`);
      console.log(`  webhook: ${gh.webhookUrl}`);
      console.log(`  secret:  ${gh.webhookSecret}\n`);
    }

    if (!opts.skipSlack) {
      console.log("Slack: create an app with chat:write, install, invite bot, then paste:");
      const botToken = await prompt("Bot token (xoxb-…)");
      const channelId = await prompt("Channel ID (C…)");
      const channelName = await prompt("Channel name", "#incidents");
      if (botToken && channelId) {
        await apiFetch("POST", `/v1/projects/${project.slug}/slack`, {
          body: { botToken, channelId, channelName },
        });
        console.log(`✓ Slack connected`);
        const test = await prompt("Post a test alert now? (y/N)", "y");
        if (test.toLowerCase().startsWith("y")) {
          await apiFetch("POST", `/v1/projects/${project.slug}/slack/test`);
          console.log("✓ Test alert sent\n");
        }
      } else {
        console.log("Skipped Slack (missing token or channel).\n");
      }
    }

    console.log(`Ready.
  calyx sources status --project ${project.slug}
  calyx ask -t ${project.tenantId} "any errors in the last hour?"
  calyx slack test --project ${project.slug}
`);
  });

// ── calyx ask ─────────────────────────────────────────────────────────────────

program
  .command("ask <question>")
  .description("Ask Calyx a natural-language question about your system")
  .option("-t, --tenant <id>", "Tenant ID")
  .option("-p, --project <slug>", "Project (sets default; tenant from login config)")
  .option("--json", "Output raw JSON")
  .option("--provider <name>", "anthropic (on-call default) or nvidia (Nemotron spare)")
  .action(
    async (
      question: string,
      opts: { tenant?: string; project?: string; json?: boolean; provider?: string }
    ) => {
      if (opts.project) saveConfig({ defaultProject: opts.project });
      const tenant = resolveTenant(opts.tenant);
      const provider =
        opts.provider === "nvidia" || opts.provider === "anthropic" ? opts.provider : undefined;
      const response = await runAgent(
        tenant,
        question,
        undefined,
        undefined,
        4096,
        provider ? { provider } : undefined
      );
      if (opts.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log(response.answer);
        if (response.toolCallsMade.length > 0) {
          const tools = [...new Set(response.toolCallsMade.map((t) => t.toolName))];
          console.error(`\n[tools used: ${tools.join(", ")}]`);
        }
      }
    }
  );

// ── calyx logs ─────────────────────────────────────────────────────────────────

program
  .command("logs")
  .description("Query log events")
  .option("-t, --tenant <id>", "Tenant ID")
  .option("-s, --service <name>", "Filter by service")
  .option("-l, --level <level>", "Filter by level (debug|info|warn|error|fatal)")
  .option("--from <iso>", "Start of time range (ISO 8601)")
  .option("--to <iso>", "End of time range (ISO 8601)")
  .option("-n, --limit <n>", "Max results", "20")
  .option("--json", "Output raw JSON")
  .action(
    async (opts: {
      tenant?: string;
      service?: string;
      level?: string;
      from?: string;
      to?: string;
      limit: string;
      json?: boolean;
    }) => {
      const input: ToolInput = {
        tenant_id: resolveTenant(opts.tenant),
        ...(opts.service && { service: opts.service }),
        ...(opts.level && { level: opts.level }),
        ...(opts.from && { from: opts.from }),
        ...(opts.to && { to: opts.to }),
        limit: parseInt(opts.limit, 10),
      };
      const result = await executeTool("query_logs", input);
      if (!result.ok) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(result.output, null, 2));
      } else {
        console.log(result.output.summary);
        const rows = result.output.data as {
          timestamp: string;
          level: string;
          service: string;
          message: string;
        }[];
        for (const r of rows) {
          const time = new Date(r.timestamp).toLocaleString();
          console.log(
            `  [${time}] [${r.level.toUpperCase().padEnd(5)}] ${r.service}: ${r.message}`
          );
        }
      }
    }
  );

// ── calyx stats ────────────────────────────────────────────────────────────────

program
  .command("stats")
  .description("Get service health statistics")
  .option("-t, --tenant <id>", "Tenant ID")
  .option("-s, --service <name>", "Filter to one service")
  .option("--json", "Output raw JSON")
  .action(async (opts: { tenant?: string; service?: string; json?: boolean }) => {
    const input: ToolInput = {
      tenant_id: resolveTenant(opts.tenant),
      ...(opts.service && { service: opts.service }),
    };
    const result = await executeTool("get_service_stats", input);
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    if (opts.json) console.log(JSON.stringify(result.output, null, 2));
    else console.log(result.output.summary);
  });

// ── calyx search ───────────────────────────────────────────────────────────────

program
  .command("search <keywords...>")
  .description("Search past incidents by keyword")
  .option("-t, --tenant <id>", "Tenant ID")
  .option("-n, --limit <n>", "Max results", "10")
  .option("--json", "Output raw JSON")
  .action(async (keywords: string[], opts: { tenant?: string; limit: string; json?: boolean }) => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: resolveTenant(opts.tenant),
      keywords,
      limit: parseInt(opts.limit, 10),
    });
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    if (opts.json) console.log(JSON.stringify(result.output, null, 2));
    else console.log(result.output.summary);
  });

// ── calyx tools ────────────────────────────────────────────────────────────────

program
  .command("tools")
  .description("List available tools")
  .action(() => {
    const tools = getAllTools();
    for (const t of tools) {
      console.log(`  ${t.name.padEnd(25)} ${t.description.slice(0, 80)}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
