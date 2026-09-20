# Incident remediation operator

**Date:** 2026-09-20

## Built

- Added a tenant-owned remediation operator action with HTTPS enforcement, per-tenant HMAC signing, operation allowlists, bounded payloads/responses, request timeouts, redirect rejection, and provider idempotency keys.
- Bound dry run and execution to the same preallocated remediation request ID and linked proposals to tenant-owned active incidents.
- Added the guarded `propose_remediation` agent tool; generic MCP `ask` cannot reach it.
- Propagated server-derived Slack actor identity into proposal audit history.
- Added a durable retrying outbox for Slack approval cards and delivery from the scheduled detector process.
- Rebased onto the four incoming `origin/main` commits without overwriting the new web control-center or deployment work.
- Updated the MCP route test to match the incoming server-side default workspace provisioning behavior and clean up its generated mapping.

## Verification

- Migration passes against PostgreSQL.
- Root suite: 195 passed, 3 provider-dependent skipped.
- Operator tests verify HMAC signatures, stable idempotency keys, incident linkage, actor attribution, allowlist rejection, and durable card delivery.

## Next

Replace the visual-only web approval card with authenticated, tenant-scoped list/approve/reject APIs. Do not proxy these through the current global management token without first enforcing Go session membership and workspace-admin authorization.
