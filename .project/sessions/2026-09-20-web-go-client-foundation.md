# Next.js Go client foundation

**Date:** 2026-09-20

## Built

- Added a typed browser client for Go authentication and workspace endpoints.
- Sent every request with credentials for HTTP-only session-cookie authentication.
- Added structured API errors without exposing or persisting bearer tokens in browser storage.
- Added a Go session provider with bootstrap, login, registration, logout, and refresh operations.
- Added reusable workspace list/create/rename/delete hooks with abort-safe initial loading.
- Mounted the provider alongside Convex without changing active screens, allowing incremental migration.
- Added the chat API public URL to web environment documentation.

## Verification

- Web TypeScript passes.
- Modified files pass project Prettier formatting.
- Existing Convex behavior remains active; no screen cutover occurs in this slice.

## Next

Switch the auth screen and middleware/session routing to Go, then cut workspace navigation over to the typed hooks.
