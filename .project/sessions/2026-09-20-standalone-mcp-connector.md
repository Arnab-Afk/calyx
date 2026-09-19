# Standalone MCP stdio connector

**Date:** 2026-09-20

## Built

- Added the publishable `calyx-mcp` package with a `calyx-mcp` binary.
- Bridged stdio tool discovery/calls to hosted authenticated Streamable HTTP.
- Required HTTPS outside localhost and accepted no tenant argument.
- Added `npx -y calyx-mcp` setup documentation and package tests.
- Verified `calyx-logger@0.2.0` is published on npm.

## Verification

- Package TypeScript build passes.
- Package tests pass.
- Root tests and connector documentation checks pass.

## Blocked

Publishing `calyx-mcp` requires npm credentials; the package name is currently available.

## Next

Implement CloudWatch ingestion behind the normalized event model while a teammate publishes the prepared package.
