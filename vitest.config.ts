import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgres://calyx:calyx@localhost:15432/calyx",
      REDIS_URL: "redis://localhost:16379",
    },
    testTimeout: 30000,
  },
});
