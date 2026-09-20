import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://calyx:calyx@localhost:15432/calyx",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:16379",
    },
    testTimeout: 30000,
  },
});
