import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgres://calyx:calyx@localhost:5432/calyx",
      REDIS_URL: "redis://localhost:6379",
    },
    testTimeout: 30000,
  },
});
