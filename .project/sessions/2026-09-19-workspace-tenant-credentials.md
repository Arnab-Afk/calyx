# Workspace tenant mapping and web MCP credentials

**Date:** 2026-09-19

## Built

- Added immutable PostgreSQL mappings from Convex workspace IDs to observability tenant IDs.
- Added an operator CLI for establishing idempotent links and auditing them.
- Added internal create/list/revoke credential routes that accept only workspace IDs and resolve tenants server-side.
- Added Convex actions that require authenticated workspace-admin membership and keep the internal service key off the browser.
- Added a workspace Preferences UI for one-time token display, listing, copying, and revocation.
- Preserved teammate project/source, Vercel drain, GitHub webhook, and logger changes while integrating the route.

## Verification

- Root suite: 186 passed, 3 provider-key-dependent skipped.
- Web TypeScript and targeted ESLint checks pass.
- Next production build with repository-wide lint disabled compiled, typechecked, and generated all pages.
- Migration, Compose, diff, mapping immutability, credential isolation, and internal-auth tests pass.

## Next

Add standards-based browser OAuth for hosted MCP while retaining API keys for machine-to-machine clients.
