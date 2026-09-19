import "dotenv/config";
import { Command } from "commander";
import { closePool } from "../storage/client.js";
import { linkWorkspaceToTenant } from "../storage/workspace-tenants.js";

const program = new Command();
program
  .name("workspace-link")
  .requiredOption("--workspace <id>", "Convex workspace ID")
  .requiredOption("--tenant <id>", "Calyx observability tenant ID")
  .action(async ({ workspace, tenant }: { workspace: string; tenant: string }) => {
    await linkWorkspaceToTenant(workspace, tenant);
    console.log(`Linked workspace ${workspace} to tenant ${tenant}.`);
  });

program.parseAsync().finally(closePool).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
