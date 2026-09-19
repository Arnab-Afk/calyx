# Durable alert context

**Date:** 2026-09-19

## Built

- Added tenant-scoped `alert_contexts` storage for detector anomalies.
- Deduplicated active alerts by detector type and service while retaining occurrence counts; resolved alerts can later reopen as new records.
- Made the detection runner persist every emitted anomaly independently from notification dispatch.
- Added `get_alert_context` under `incidents:read`, returning the durable detector record and nearby error/fatal events.
- Verified that an alert ID cannot be retrieved with a different tenant context.

## Verification

- Migration applied successfully to local PostgreSQL.
- Root Vitest suite: 166 passed, 3 provider-key-dependent skipped.
- Modified TypeScript slice has no errors; repository-wide typecheck retains unrelated pre-existing errors.
- Docker Compose configuration and diff checks pass.

## Next

Create the real incident/evidence model that groups one or more alert contexts, then replace the aspirational log-keyword implementation behind `search_past_incidents`.
