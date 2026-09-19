# MCP investigation tools

**Date:** 2026-09-19

## Shipped

- Added `ask`, scoped by `incidents:ask`, as a wrapper over the shared Calyx investigation loop.
- Returned evidence tool-call traces and chart hints to MCP clients.
- Prevented recursive `ask` calls and forced nested agent tool calls onto the authenticated run tenant.
- Added `list_services`, scoped by `logs:read`, backed by the canonical event store.
- Made empty tenants and unknown service filters return actionable guidance instead of ambiguous empty results.

## Verification

- Root Vitest suite: 165 passed, 3 provider-key-dependent skipped.
- Modified TypeScript slice has no errors; repository-wide typecheck retains unrelated pre-existing errors.
- Docker Compose configuration and diff checks pass.

## Next

Define a persisted alert-context contract shared by detection, Slack/web, and MCP before adding `get_alert_context`.
