#!/usr/bin/env node

const errors = [];
const warnings = [];
const required = [
  "DATABASE_URL",
  "REDIS_URL",
  "CALYX_INTERNAL_API_KEY",
  "JWT_SECRET",
  "CORS_ORIGINS",
  "CALYX_ASK_URL",
  "CALYX_PUBLIC_URL",
  "CALYX_INTAKE_URL",
  "MCP_PUBLIC_URL",
  "MCP_OAUTH_ISSUER",
  "MCP_OAUTH_INTROSPECTION_URL",
  "MCP_OAUTH_CLIENT_ID",
  "MCP_OAUTH_CLIENT_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "CALYX_CODING_AGENT_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_CALYX_CHAT_URL",
  "CALYX_CHAT_URL",
  "CALYX_API_URL",
  "CALYX_MGMT_TOKEN",
];

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}

function requireURL(name, protocols = ["https:"]) {
  const value = process.env[name];
  if (!value) return;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol))
      errors.push(`${name} must use ${protocols.join(" or ")}`);
    if (url.username || url.password)
      warnings.push(
        `${name} embeds credentials; prefer platform secret fields`,
      );
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

for (const name of [
  "CALYX_ASK_URL",
  "CALYX_PUBLIC_URL",
  "CALYX_INTAKE_URL",
  "MCP_PUBLIC_URL",
  "MCP_OAUTH_ISSUER",
  "MCP_OAUTH_INTROSPECTION_URL",
  "CALYX_CODING_AGENT_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "NEXT_PUBLIC_CALYX_CHAT_URL",
  "CALYX_CHAT_URL",
  "CALYX_API_URL",
])
  requireURL(name);
requireURL("DATABASE_URL", ["postgres:", "postgresql:"]);
requireURL("REDIS_URL", ["redis:", "rediss:"]);

if ((process.env.JWT_SECRET?.length ?? 0) < 32)
  errors.push("JWT_SECRET must contain at least 32 characters");
if ((process.env.CALYX_INTERNAL_API_KEY?.length ?? 0) < 32)
  errors.push("CALYX_INTERNAL_API_KEY must contain at least 32 characters");
if (process.env.CALYX_INTERNAL_API_KEY === process.env.JWT_SECRET)
  errors.push("JWT_SECRET and CALYX_INTERNAL_API_KEY must be different");
if (
  !process.env.GITHUB_APP_PRIVATE_KEY?.includes("BEGIN") ||
  !process.env.GITHUB_APP_PRIVATE_KEY?.includes("PRIVATE KEY")
) {
  errors.push("GITHUB_APP_PRIVATE_KEY must be a PEM private key");
}
if (process.env.CORS_ORIGINS?.includes("*"))
  errors.push("CORS_ORIGINS must not contain a wildcard");
for (const origin of (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .filter(Boolean)) {
  requireURLValue("CORS_ORIGINS entry", origin.trim());
}
if (!/^calyx_mgmt_/.test(process.env.CALYX_MGMT_TOKEN ?? ""))
  errors.push("CALYX_MGMT_TOKEN has an invalid prefix");
if (!process.env.ANTHROPIC_API_KEY && !process.env.NVIDIA_API_KEY)
  errors.push("ANTHROPIC_API_KEY or NVIDIA_API_KEY is required");
if (
  process.env.REDIS_URL?.startsWith("redis://") &&
  process.env.ALLOW_PRIVATE_PLAINTEXT_REDIS !== "true"
) {
  errors.push(
    "REDIS_URL must use rediss:// unless ALLOW_PRIVATE_PLAINTEXT_REDIS=true for a private network",
  );
}
if (
  process.env.DATABASE_URL &&
  !/[?&]sslmode=(require|verify-ca|verify-full)/.test(
    process.env.DATABASE_URL,
  ) &&
  process.env.DATABASE_TLS_ASSURED !== "true"
) {
  errors.push(
    "DATABASE_URL must require TLS unless DATABASE_TLS_ASSURED=true is set for a platform-enforced private connection",
  );
}
for (const name of ["CALYX_NODE_IMAGE", "CALYX_CHAT_IMAGE"]) {
  const value = process.env[name];
  if (!value) errors.push(`${name} is required`);
  else if (!value.includes("@sha256:"))
    errors.push(`${name} must be pinned by sha256 digest`);
}
if (process.env.REQUIRE_SLACK === "true") {
  for (const name of ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"]) {
    if (!process.env[name])
      errors.push(`${name} is required when REQUIRE_SLACK=true`);
  }
}

function requireURLValue(name, value) {
  try {
    if (new URL(value).protocol !== "https:")
      errors.push(`${name} must use https:`);
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

async function probe(name, url) {
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      errors.push(`${name} probe returned HTTP ${response.status}`);
  } catch (error) {
    errors.push(
      `${name} probe failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (process.argv.includes("--probe") && errors.length === 0) {
  await Promise.all([
    probe("intake", `${process.env.CALYX_PUBLIC_URL.replace(/\/$/, "")}/ready`),
    probe("MCP", new URL("/health", process.env.MCP_PUBLIC_URL).href),
    probe("chat", `${process.env.CALYX_CHAT_URL.replace(/\/$/, "")}/ready`),
    probe(
      "web",
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.CORS_ORIGINS.split(",")[0],
    ),
  ]);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) {
  console.error(`Preflight failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log("Production preflight passed.");
