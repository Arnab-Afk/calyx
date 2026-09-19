# Durable incidents and evidence

**Date:** 2026-09-19

## Built

- Added tenant-scoped incidents, incident-to-alert links, and immutable evidence snapshots.
- Made alert persistence transactional with automatic incident creation and evidence capture.
- Added `list_incidents`, `get_incident`, and `search_incidents` under `incidents:read`.
- Kept `search_past_incidents` as an explicitly deprecated raw-log compatibility tool instead of changing its behavior silently.
- Verified incident and evidence retrieval cannot cross tenant boundaries.

## Verification

- Migration applied successfully to local PostgreSQL.
- Root Vitest suite: 166 passed, 3 provider-key-dependent skipped.
- Modified TypeScript slice has no errors; repository-wide typecheck retains unrelated pre-existing errors.
- Docker Compose configuration and diff checks pass.

## Next

Run detection on a schedule for active tenant services and dispatch stable alert IDs to Slack/web while keeping presentation outside the detector.
