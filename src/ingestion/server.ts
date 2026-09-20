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
import { eventsRoute } from "./routes/v1/events.js";
import { internalAskRoute } from "./routes/v1/internal-ask.js";
import { internalWorkspaceLinkRoute } from "./routes/v1/internal-workspace-link.js";
import { remediationsRoute } from "./routes/v1/remediations.js";
import { codingJobsRoute } from "./routes/v1/coding-jobs.js";
import { closePool, getPool } from "../storage/client.js";
import { closeRedis, getRedis } from "./queue.js";
import { initAgent } from "../agent/index.js";

initAgent();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
});
await app.register(logsRoute);
await app.register(eventsRoute);
await app.register(askRoute);
await app.register(projectsRoute);
await app.register(githubWebhookRoute);
await app.register(vercelDrainRoute);
await app.register(cloudWatchDrainRoute);
await app.register(mcpCredentialsRoute);
await app.register(internalAskRoute);
await app.register(internalWorkspaceLinkRoute);
await app.register(remediationsRoute);
await app.register(codingJobsRoute);

app.get("/health", async () => ({ status: "ok" }));
app.get("/ready", async (_request, reply) => {
  try {
    await Promise.all([getPool().query("SELECT 1"), getRedis().ping()]);
    return { status: "ready" };
  } catch (error) {
    app.log.error(error, "readiness check failed");
    return reply.status(503).send({ status: "unavailable" });
  }
});

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
