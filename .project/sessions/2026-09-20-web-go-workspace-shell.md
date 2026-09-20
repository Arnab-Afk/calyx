# Next.js Go workspace-shell read adapters

**Date:** 2026-09-20

## Built

- Added an abort-safe generic Go resource hook.
- Added explicit Go-to-existing-UI compatibility mappers for workspace, channel, member, and user records.
- Adapted workspace detail/info, channel list/detail, current member, member list, and member detail reads behind the backend switch.
- Skipped Convex queries entirely in Go mode rather than relying on missing Convex identity.
- Populated the Go current-member response with user data required by existing UI components.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Go tests and `go vet` pass.
- Root suite remains green.

## Next

Adapt channel/workspace/member mutations and then message rendering/mutations before enabling Go by default.
