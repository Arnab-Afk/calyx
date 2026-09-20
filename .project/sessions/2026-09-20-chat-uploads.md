# Go chat image uploads

**Date:** 2026-09-20

## Built

- Added authenticated workspace-scoped image upload and retrieval endpoints.
- Bounded uploads to 5 MiB and detected JPEG/PNG/GIF/WebP from file bytes.
- Rejected SVG and arbitrary content types.
- Changed channel/direct-message creation to accept canonical `imageId` values rather than external URLs.
- Verified upload ownership against the message workspace.
- Protected reads with current workspace membership and private/no-sniff response headers.
- Extended the reusable API smoke test through upload, message attachment, authenticated retrieval, and cascade deletion.

## Decision

The first-party v1 stores bounded images in PostgreSQL. This keeps multi-instance correctness and tenant authorization without requiring another service during frontend migration. The API boundary permits moving blobs to S3/R2 before high-volume production use.

## Verification

- Go tests and `go vet` pass.
- Docker build/startup migration pass.
- Integration smoke: owner retrieval 200, cross-workspace attachment 400, outsider retrieval 404.
- Root and reusable smoke suites pass.

## Next

Migrate Next.js authentication and workspace navigation from Convex to the Go API.
