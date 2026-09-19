#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import {
  createMgmtKey,
  listMgmtKeys,
  MGMT_SCOPES,
  revokeMgmtKey,
} from "./auth.js";
import { closePool } from "../storage/client.js";

const program = new Command()
  .name("calyx-mgmt-key")
  .description("Manage API keys for CLI onboarding / project management");

program
  .command("create")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .requiredOption("-n, --name <name>", "Credential name")
  .option(
    "-s, --scopes <scopes>",
    `Comma-separated scopes (${MGMT_SCOPES.join(", ")})`,
    MGMT_SCOPES.join(",")
  )
  .action(async (options: { tenant: string; name: string; scopes: string }) => {
    const created = await createMgmtKey({
      tenantId: options.tenant,
      name: options.name,
      scopes: options.scopes.split(",").map((s) => s.trim()),
    });
    console.log(JSON.stringify(created, null, 2));
    console.error("Save the token now. Calyx stores only its hash.");
  });

program
  .command("list")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .action(async (options: { tenant: string }) => {
    console.log(JSON.stringify(await listMgmtKeys(options.tenant), null, 2));
  });

program
  .command("revoke")
  .requiredOption("-t, --tenant <id>", "Tenant ID")
  .requiredOption("--id <credential-id>", "Credential UUID")
  .action(async (options: { tenant: string; id: string }) => {
    const revoked = await revokeMgmtKey(options.id, options.tenant);
    if (!revoked) process.exitCode = 1;
    console.log(revoked ? "Credential revoked." : "Active credential not found.");
  });

program
  .parseAsync(process.argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
