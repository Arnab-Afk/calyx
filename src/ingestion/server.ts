import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { logsRoute } from "./routes/v1/logs.js";
import { askRoute } from "./routes/v1/ask.js";
import { projectsRoute } from "./routes/v1/projects.js";
import { githubWebhookRoute } from "./routes/v1/github-webhook.js";
import { vercelDrainRoute } from "./routes/v1/vercel-drain.js";
import { cloudWatchDrainRoute } from "./routes/v1/cloudwatch-drain.js";
import { mcpCredentialsRoute } from "./routes/v1/mcp-credentials.js";
import { internalAskRoute } from "./routes/v1/internal-ask.js";
import { closePool } from "../storage/client.js";
import { closeRedis } from "./queue.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
});
await app.register(logsRoute);
await app.register(askRoute);
await app.register(projectsRoute);
await app.register(githubWebhookRoute);
await app.register(vercelDrainRoute);
await app.register(cloudWatchDrainRoute);
await app.register(mcpCredentialsRoute);
await app.register(internalAskRoute);

app.get("/health", async () => ({ status: "ok" }));

async function start(): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  await app.listen({ port, host: "0.0.0.0" });
}

async function shutdown(): Promise<void> {
  await app.close();
  await closePool();
  await closeRedis();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
