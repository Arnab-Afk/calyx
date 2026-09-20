# Next.js Go message adapters

**Date:** 2026-09-20

## Built

- Adapted channel, direct, and thread message reads to the Go API while preserving existing Convex-shaped component contracts.
- Adapted message create/edit/delete and reaction toggle mutations.
- Added Go image uploads to channel, direct-message, and thread composers.
- Routed Go-mode `/calyx` submissions through the trusted Go endpoint instead of browser-authored bot payloads.
- Added workspace WebSocket invalidation for remote message and reaction changes.
- Added reaction member IDs to Go message hydration so existing reaction UI can identify the current user's reactions.
- Added canonical chat asset URL resolution.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Go formatting, tests, and vet pass under Go 1.26.
- Chat API Docker build and existing smoke flow pass.
- Added manual reaction aggregation smoke coverage against PostgreSQL.
- Root suite: 199 passed, 3 provider-dependent skipped.

## Next

Run the complete browser UI with `NEXT_PUBLIC_CHAT_BACKEND=go`, fix remaining screen-level incompatibilities, then switch Go to the default backend.
