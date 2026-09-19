# Hosted MCP rate limits and audit

**Date:** 2026-09-19

## Built

- Added shared PostgreSQL fixed-window limits per MCP credential.
- Added a separate anonymous network-peer limit for invalid or missing authentication.
- Added response limit/reset/retry headers and automatic old-window cleanup.
- Added structured audit events for credential creation/revocation, authentication failures, rate limiting, session access, HTTP requests, and tool outcomes.
- Excluded token values and tool arguments from audit metadata.

## Verification

- Migration applied successfully to local PostgreSQL.
- Root Vitest suite after integrating teammate onboarding/logger changes: 182 passed, 3 provider-key-dependent skipped.
- Logger package suite: 7 passed.
- Integration coverage verifies shared limits, anonymous limits, lifecycle audit rows, HTTP request/tool audit rows, and argument redaction.

## Next

Define the canonical Convex workspace-to-observability-tenant mapping, then resume the preserved self-service credential implementation.
