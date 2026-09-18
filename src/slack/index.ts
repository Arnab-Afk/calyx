import "dotenv/config";
import { initAgent } from "../agent/index.js";
import { createSlackApp } from "./adapter.js";

initAgent();

const app = createSlackApp();

const port = parseInt(process.env.SLACK_PORT ?? "3001", 10);
await app.start(port);
console.log(`⚡ Calyx Slack app running on port ${port}`);
