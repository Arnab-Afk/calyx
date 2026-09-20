# Go direct-conversation parity

**Date:** 2026-09-20

## Built

- Added idempotent one-to-one conversation creation for workspace members.
- Added participant-only conversation lookup and direct-message listing/creation.
- Added thread replies constrained to the same conversation.
- Added a canonical unique member-pair index to prevent duplicate conversations under races.
- Prevented other members of the same workspace from reading or reacting to private direct messages.
- Published direct-message events through the existing workspace realtime hub.

## Verification

- Go tests and `go vet` pass.
- Docker build and startup migration pass.
- Three-user integration smoke verified pair idempotency, participant messaging, and outsider denial for conversation, message, and reaction access.

## Next

Finish upload/trusted-Calyx-message API boundaries, then begin the Next.js auth/workspace migration from Convex.
