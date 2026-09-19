#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { createApiKey, listApiKeys, MCP_SCOPES, revokeApiKey } from "./auth.js";
import { closePool } from "../storage/client.js";

const program = new Command()
  .name("calyx-mcp-key")
  .description("Manage scoped API keys for MCP clients");

program
  .command("create")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .requiredOption("-n, --name <name>", "Credential name, such as saish-claude-code")
  .option("-s, --scopes <scopes>", `Comma-separated scopes (${MCP_SCOPES.join(", ")})`, "logs:read")
  .option("--expires-in-days <days>", "Optional lifetime in days")
  .action(async (options: { tenant: string; name: string; scopes: string; expiresInDays?: string }) => {
    const days = options.expiresInDays ? Number.parseInt(options.expiresInDays, 10) : undefined;
    if (days !== undefined && (!Number.isFinite(days) || days < 1)) {
      throw new Error("--expires-in-days must be a positive integer");
    }
    const created = await createApiKey({
      tenantId: options.tenant,
      name: options.name,
      scopes: options.scopes.split(",").map((scope) => scope.trim()),
      ...(days && { expiresAt: new Date(Date.now() + days * 86_400_000) }),
    });
    console.log(JSON.stringify(created, null, 2));
    console.error("Save the token now. Calyx stores only its hash and cannot display it again.");
  });

program
  .command("list")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .action(async (options: { tenant: string }) => {
    console.log(JSON.stringify(await listApiKeys(options.tenant), null, 2));
  });

program
  .command("revoke")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .requiredOption("--id <credential-id>", "Credential UUID")
  .action(async (options: { tenant: string; id: string }) => {
    const revoked = await revokeApiKey(options.id, options.tenant);
    if (!revoked) process.exitCode = 1;
    console.log(revoked ? "Credential revoked." : "Active credential not found.");
  });

program.parseAsync(process.argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
