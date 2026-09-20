import "dotenv/config";
import { initAgent } from "../agent/index.js";
import { createSlackApp } from "./adapter.js";
import { initExecution } from "../execution/index.js";

initAgent();
initExecution();

const app = createSlackApp();

const port = parseInt(process.env.SLACK_PORT ?? "3001", 10);
await app.start(port);
console.log(`⚡ Calyx Slack app running on port ${port}`);
console.log(
  "Listening for @mentions, thread replies (no @ needed), and DMs. Subscribe the Slack app to message.channels, message.groups, and message.im.",
);
