#!/usr/bin/env node
// CLI — thin adapter over the tool registry and agent loop.
// No tool logic lives here.

import "dotenv/config";
import { Command } from "commander";
import { initAgent, executeTool, runAgent, getAllTools } from "../agent/index.js";
import type { ToolInput } from "../schemas/index.js";

initAgent();

const program = new Command();
program
  .name("calyx")
  .description("AI-native observability CLI")
  .version("0.1.0");

// ── calyx ask ─────────────────────────────────────────────────────────────────

program
  .command("ask <question>")
  .description("Ask Calyx a natural-language question about your system")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .option("--json", "Output raw JSON")
  .option(
    "--provider <name>",
    "anthropic (on-call default) or nvidia (Nemotron spare)"
  )
  .action(
    async (
      question: string,
      opts: { tenant: string; json?: boolean; provider?: string }
    ) => {
    const provider =
      opts.provider === "nvidia" || opts.provider === "anthropic"
        ? opts.provider
        : undefined;
    const response = await runAgent(
      opts.tenant,
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
  });

// ── calyx logs ─────────────────────────────────────────────────────────────────

program
  .command("logs")
  .description("Query log events")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .option("-s, --service <name>", "Filter by service")
  .option("-l, --level <level>", "Filter by level (debug|info|warn|error|fatal)")
  .option("--from <iso>", "Start of time range (ISO 8601)")
  .option("--to <iso>", "End of time range (ISO 8601)")
  .option("-n, --limit <n>", "Max results", "20")
  .option("--json", "Output raw JSON")
  .action(
    async (opts: {
      tenant: string;
      service?: string;
      level?: string;
      from?: string;
      to?: string;
      limit: string;
      json?: boolean;
    }) => {
      const input: ToolInput = {
        tenant_id: opts.tenant,
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
        const rows = result.output.data as { timestamp: string; level: string; service: string; message: string }[];
        for (const r of rows) {
          const time = new Date(r.timestamp).toLocaleString();
          console.log(`  [${time}] [${r.level.toUpperCase().padEnd(5)}] ${r.service}: ${r.message}`);
        }
      }
    }
  );

// ── calyx stats ────────────────────────────────────────────────────────────────

program
  .command("stats")
  .description("Get service health statistics")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .option("-s, --service <name>", "Filter to one service")
  .option("--json", "Output raw JSON")
  .action(async (opts: { tenant: string; service?: string; json?: boolean }) => {
    const input: ToolInput = {
      tenant_id: opts.tenant,
      ...(opts.service && { service: opts.service }),
    };
    const result = await executeTool("get_service_stats", input);
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    if (opts.json) {
      console.log(JSON.stringify(result.output, null, 2));
    } else {
      console.log(result.output.summary);
    }
  });

// ── calyx search ───────────────────────────────────────────────────────────────

program
  .command("search <keywords...>")
  .description("Search past incidents by keyword")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .option("-n, --limit <n>", "Max results", "10")
  .option("--json", "Output raw JSON")
  .action(async (keywords: string[], opts: { tenant: string; limit: string; json?: boolean }) => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: opts.tenant,
      keywords,
      limit: parseInt(opts.limit, 10),
    });
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    if (opts.json) {
      console.log(JSON.stringify(result.output, null, 2));
    } else {
      console.log(result.output.summary);
    }
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

program.parse(process.argv);
