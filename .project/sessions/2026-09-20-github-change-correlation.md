# GitHub change correlation

**Date:** 2026-09-20

## Built

- Added durable tenant/project-scoped GitHub commit and deployment records.
- Made webhook retries idempotent through project/commit and project/deployment keys.
- Persisted signed push, deployment, and deployment-status evidence before enqueueing normalized events.
- Added `get_change_context` to correlate commits and deployments within an incident window.
- Exposed the tool through every shared agent transport and protected MCP access with `incidents:read`.
- Documented repository webhook events and the boundary with future GitHub App installation OAuth.

## Verification

- Full suite: 195 passed, 3 provider-dependent skipped.
- Production migration completed against local PostgreSQL.
- Modified-slice TypeScript diagnostics are clear.
- Compose and diff checks pass.

## Next

Build the human-approved remediation and coding-agent handoff slice. GitHub App OAuth remains a separate automatic-provisioning slice.
