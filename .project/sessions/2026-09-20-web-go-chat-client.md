# Next.js Go chat client layer

**Date:** 2026-09-20

## Built

- Expanded the typed Go client across members, channels, messages, threads, reactions, conversations, trusted Calyx asks, and uploads.
- Added credentialed multipart image uploads without overriding browser multipart boundaries.
- Added cookie-authenticated workspace WebSocket connection support.
- Added a channel hook with abort-safe loading, optimistic deduplication, and realtime create/update/delete reconciliation.

## Migration safety

The existing screens remain on Convex. Activating Go auth before channel/message migration would leave Go users without a Convex identity and break the workspace UI, so client dependencies are being completed before one coordinated cutover.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Root tests remain green.

## Next

Add workspace/channel adapters and switch the complete authenticated workspace shell from Convex to Go in one coherent cutover.
