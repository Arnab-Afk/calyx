# Next.js Go workspace-shell mutations

**Date:** 2026-09-20

## Built

- Adapted workspace rename/delete/join/join-code rotation to Go mode.
- Adapted channel create/rename/delete to Go mode.
- Adapted member role update/removal to Go mode.
- Adapted direct-conversation create/get to Go mode.
- Preserved every existing hook contract so current components require no backend-specific branches.
- Added mutation invalidation events so Go read adapters refresh after writes instead of relying on Convex subscriptions.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Root tests remain green.
- Convex remains the default while message rendering/mutations are completed.

## Next

Adapt message query/create/update/delete, reactions, threads, uploads, and trusted asks in the existing component contracts.
