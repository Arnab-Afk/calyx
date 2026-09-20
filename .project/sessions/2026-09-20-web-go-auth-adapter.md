# Feature-gated Go web authentication adapter

**Date:** 2026-09-20

## Built

- Added `NEXT_PUBLIC_CHAT_BACKEND` as an explicit migration switch, defaulting to Convex.
- Added client-side Go session route protection because API-host cookies are intentionally not readable by Next middleware.
- Adapted sign-in, registration, logout, current-user, workspace listing, and workspace creation to Go when enabled.
- Disabled unavailable social-login controls in Go mode rather than presenting broken OAuth actions.
- Preserved Convex behavior by default and skipped unnecessary Go workspace loading in Convex mode.

## Migration safety

A standalone auth cutover would break channel/message screens because Go users have no Convex identity. This slice makes auth and initial workspace flows testable behind a flag but does not change the production default. Full activation waits for workspace-shell adapters.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Root tests remain green.

## Next

Adapt workspace/channel navigation and channel message rendering, then change the default backend to Go and remove the Convex auth gate.
