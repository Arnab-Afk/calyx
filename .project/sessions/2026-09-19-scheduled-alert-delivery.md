# Scheduled detection and durable Slack delivery

**Date:** 2026-09-19

## Built

- Added a long-running detector process that scans recently active tenant/service pairs on a configurable interval.
- Added a tenant-routed PostgreSQL delivery outbox with deduplication, worker leases, stale-lease recovery, exponential retry, and attempt limits.
- Added Slack delivery using stable persisted alert IDs and the existing alert card presentation.
- Restricted single-channel fallback routing to an exact `CALYX_TENANT_ID` match; multi-tenant deployments use an explicit JSON tenant/channel map.
- Kept web delivery disabled until a secure workspace notification target exists.

## Verification

- Migration applied successfully to local PostgreSQL.
- Root Vitest suite: 170 passed, 3 provider-key-dependent skipped.
- Modified TypeScript slice has no errors; repository-wide typecheck retains unrelated pre-existing errors.
- Base and detector-profile Compose configurations pass.

## Next

Replace process-local Slack acknowledgement/resolution state with canonical PostgreSQL alert and incident lifecycle updates.
