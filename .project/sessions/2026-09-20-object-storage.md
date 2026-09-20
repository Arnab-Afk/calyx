# Private object storage

**Date:** 2026-09-20

## Built

- Added a provider-neutral object store and S3-compatible implementation for Cloudflare R2.
- New uploads retain byte-sniffed JPEG/PNG/GIF/WebP validation and the 5 MiB bound, then write to deterministic private workspace keys.
- PostgreSQL stores ownership, content metadata, object key, and lifecycle state; new bytes are not stored in PostgreSQL.
- Authenticated reads re-check workspace membership and stream through Go without exposing object credentials or public URLs.
- Added migration `0002` with legacy compatibility, message/upload linkage, and durable deletion queue triggers.
- Message, thread, member, and workspace cascades enqueue object cleanup; replicas drain with `SKIP LOCKED`, idempotent deletes, and retry delay.
- Stale pending/failed uploads are reconciled.
- Added `/app/calyx-backfill-uploads`, which uses deterministic keys and clears legacy bytes only after successful object writes.
- Added local MinIO and bucket initialization to the chat Compose profile.

## Verification

- Full Go suite passes.
- Migration `0002` applies through the release migration job.
- Docker image builds API, migration, and backfill binaries.
- Chat smoke uploads and reads a private object through the authenticated API.
- Workspace deletion cleanup drains the queue and removes the MinIO object.
- Legacy backfill moved two existing rows and left zero `data IS NOT NULL` rows.
- Root suite: 215 passed, 3 provider-dependent skipped.
- Web TypeScript and Compose validation pass.

## Next

Run real production deployment and recovery smoke tests with managed PostgreSQL, Redis, R2, TLS, OAuth, GitHub App, Slack, and coding-agent configuration.
