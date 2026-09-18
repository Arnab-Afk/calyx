import "dotenv/config";
import { EventSchema } from "../schemas/index.js";
import { insertEvents } from "../storage/events.js";
import {
  getRedis,
  closeRedis,
  ensureConsumerGroup,
  STREAM_NAME,
  CONSUMER_GROUP,
} from "./queue.js";
import { closePool } from "../storage/client.js";

const CONSUMER_NAME = `worker-${process.pid}`;
const BATCH_SIZE = 100;
const BLOCK_MS = 2000;

async function processEntry(id: string, payload: string): Promise<void> {
  const parsed = JSON.parse(payload);
  const event = EventSchema.parse(parsed);
  await insertEvents([event]);
}

async function run(): Promise<void> {
  const redis = getRedis();
  await ensureConsumerGroup();
  console.log(`Consumer ${CONSUMER_NAME} started on stream ${STREAM_NAME}`);

  // First: claim any pending messages from a previous crashed worker
  const pending = await redis.xpending(
    STREAM_NAME,
    CONSUMER_GROUP,
    "-",
    "+",
    BATCH_SIZE
  );
  if (Array.isArray(pending) && pending.length > 0) {
    const pendingIds = pending.map((p: unknown[]) => p[0] as string);
    await redis.xclaim(
      STREAM_NAME,
      CONSUMER_GROUP,
      CONSUMER_NAME,
      0,
      ...pendingIds
    );
  }

  while (true) {
    const results = await redis.xreadgroup(
      "GROUP",
      CONSUMER_GROUP,
      CONSUMER_NAME,
      "COUNT",
      BATCH_SIZE,
      "BLOCK",
      BLOCK_MS,
      "STREAMS",
      STREAM_NAME,
      ">"
    );

    if (!results) continue;

    for (const [, entries] of results as [string, [string, string[]][]][]) {
      for (const [id, fields] of entries) {
        const payloadIdx = fields.indexOf("payload");
        if (payloadIdx === -1) {
          await redis.xack(STREAM_NAME, CONSUMER_GROUP, id);
          continue;
        }
        const payload = fields[payloadIdx + 1];
        try {
          await processEntry(id, payload);
          await redis.xack(STREAM_NAME, CONSUMER_GROUP, id);
        } catch (err) {
          console.error(`Failed to process entry ${id}:`, err);
          // Leave un-acked so it can be reclaimed on restart
        }
      }
    }
  }
}

async function shutdown(): Promise<void> {
  await closeRedis();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run().catch((err) => {
  console.error("Consumer crashed:", err);
  process.exit(1);
});
