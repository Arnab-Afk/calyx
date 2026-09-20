# Go production infrastructure

**Date:** 2026-09-20

## Built

- Added Redis pub/sub fan-out between Go API replicas while retaining immediate local delivery.
- Origin-tagged envelopes prevent duplicate delivery to the publishing replica.
- Workspace filtering remains local and slow clients cannot block publishers.
- Production configuration now requires `REDIS_URL` and startup verifies connectivity/subscription.
- Replaced startup DDL with ordered embedded SQL migrations, an immutable checksum ledger, transactional application, and a PostgreSQL advisory lock.
- Added `/app/calyx-migrate` as a standalone release binary and Compose migration job.
- API replicas no longer mutate schema during startup.

## Verification

- Cross-instance fan-out and workspace isolation test passes with two hubs.
- Full Go test suite passes.
- Migration command succeeds twice against the same PostgreSQL database.
- Chat image builds both API and migration binaries.
- Compose waits for migration and Redis health before API startup.
- Full chat API smoke passes.

## Next

Move authenticated workspace image storage from PostgreSQL bytea to S3/R2.
