# Go chat workspace API parity

**Date:** 2026-09-20

## Built

- Added authenticated workspace info, rename, and owner-only deletion endpoints.
- Added current-member and single-member lookups.
- Added admin role management with owner-demotion protection.
- Added member removal limited to admins or self, with workspace-owner protection.
- Added tenant-safe single-channel and single-message lookups.
- Extended the reusable smoke test to exercise the new lookup/update/delete flow.

## Verification

- Go tests and `go vet` pass.
- Docker build runs the Go test suite.
- Two-user integration smoke verified joining, non-admin denial, admin promotion, resource lookups, and owner deletion.
- Standard smoke verifies workspace update and cascade deletion.

## Next

Add direct-conversation endpoints and complete message parity before migrating Next.js hooks.
