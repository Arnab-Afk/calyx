import Redis from "ioredis";
import type { Event } from "../schemas/index.js";

export const STREAM_NAME = "calyx:events";
export const CONSUMER_GROUP = "calyx:workers";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

// Enqueue events onto the Redis Stream. Returns the IDs assigned by Redis.
export async function enqueueEvents(events: Event[]): Promise<string[]> {
  const redis = getRedis();
  const ids: string[] = [];

  for (const e of events) {
    // XADD stores each event as a single field "payload" containing JSON
    const id = await redis.xadd(STREAM_NAME, "*", "payload", JSON.stringify(e));
    ids.push(id as string);
  }

  return ids;
}

// Ensure the consumer group exists (idempotent).
export async function ensureConsumerGroup(): Promise<void> {
  const redis = getRedis();
  try {
    await redis.xgroup("CREATE", STREAM_NAME, CONSUMER_GROUP, "$", "MKSTREAM");
  } catch (err: unknown) {
    // BUSYGROUP = group already exists — expected on restart
    if (
      !(err instanceof Error) ||
      !err.message.includes("BUSYGROUP")
    ) {
      throw err;
    }
  }
}
