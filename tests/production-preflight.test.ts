import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const valid = {
  DATABASE_URL: "postgresql://user:pass@db.example/calyx?sslmode=require",
  REDIS_URL: "rediss://user:pass@redis.example:6379",
  CALYX_INTERNAL_API_KEY: "a".repeat(64),
  JWT_SECRET: "b".repeat(64),
  CORS_ORIGINS: "https://app.example.com",
  CALYX_ASK_URL: "https://intake.example.com",
  CALYX_PUBLIC_URL: "https://intake.example.com",
  CALYX_INTAKE_URL: "https://intake.example.com",
  MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
  MCP_OAUTH_ISSUER: "https://id.example.com",
  MCP_OAUTH_INTROSPECTION_URL: "https://id.example.com/introspect",
  MCP_OAUTH_CLIENT_ID: "client",
  MCP_OAUTH_CLIENT_SECRET: "secret",
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "calyx",
  GITHUB_APP_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  CALYX_CODING_AGENT_URL: "https://agent.example.com/jobs",
  OBJECT_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  OBJECT_STORAGE_BUCKET: "uploads",
  OBJECT_STORAGE_ACCESS_KEY_ID: "access",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
  NEXT_PUBLIC_CALYX_CHAT_URL: "https://chat.example.com",
  CALYX_CHAT_URL: "https://chat.example.com",
  CALYX_API_URL: "https://intake.example.com",
  CALYX_MGMT_TOKEN: "calyx_mgmt_test",
  ANTHROPIC_API_KEY: "test",
  CALYX_NODE_IMAGE: "registry/node@sha256:" + "1".repeat(64),
  CALYX_CHAT_IMAGE: "registry/chat@sha256:" + "2".repeat(64),
};

function run(overrides: Record<string, string> = {}) {
  return execFileSync(process.execPath, ["scripts/production-preflight.mjs"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "", ...valid, ...overrides },
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe("production preflight", () => {
  it("accepts a complete TLS-only production configuration", () => {
    expect(run()).toContain("Production preflight passed");
  });

  it("rejects insecure public integration URLs", () => {
    expect(() =>
      run({ CALYX_CODING_AGENT_URL: "http://agent.example.com" }),
    ).toThrow();
  });

  it("rejects mutable image references", () => {
    expect(() => run({ CALYX_NODE_IMAGE: "registry/node:latest" })).toThrow();
  });
});
