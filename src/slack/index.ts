import "dotenv/config";
import { createSlackApp } from "./adapter.js";

const app = createSlackApp();

const port = parseInt(process.env.SLACK_PORT ?? "3001", 10);
await app.start(port);
console.log(`⚡ Calyx Slack app running on port ${port}`);
