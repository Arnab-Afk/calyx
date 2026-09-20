# Trusted workspace investigation boundary

**Date:** 2026-09-20

## Built

- Added an internal-key-authenticated Node ask endpoint keyed by workspace ID.
- Resolved the observability tenant exclusively from immutable PostgreSQL workspace links.
- Retired the legacy caller-selected `X-Tenant-ID` ask endpoint with HTTP 410.
- Reused one timing-safe internal authentication implementation for asks and MCP credentials.
- Added a Go channel endpoint that verifies membership, calls Node server-to-server, and transactionally persists the question plus trusted Calyx response.
- Prevented browsers from supplying trusted `calyxData`; chart/tool evidence is created only from the internal response.
- Updated the temporary Convex/Next route to verify workspace membership and use the same trusted internal endpoint without a public tenant variable.

## Verification

- Internal route tests cover missing credentials, missing workspace links, attacker tenant input, canonical tenant resolution, and legacy endpoint retirement.
- Mock Node → Go end-to-end smoke persisted two messages and trusted chart/tool metadata.
- Root suite: 199 passed, 3 provider-dependent skipped.
- Go tests, `go vet`, web TypeScript, modified Node TypeScript, Compose, and diff checks pass.

## Next

Finish upload handling, then migrate Next.js auth/workspace and chat hooks from Convex to Go.
