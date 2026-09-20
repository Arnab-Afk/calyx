# Web operations authorization boundary

**Date:** 2026-09-20

## Fixed

The newly landed Next.js Control Center proxy used a server-wide management token without authenticating the browser or binding the selected workspace to that token’s tenant.

- Every operations request now requires the HTTP-only Go session cookie.
- Go must confirm the caller is an admin of the requested workspace.
- Node must confirm the management credential tenant matches the workspace’s immutable tenant link.
- The browser supplies only the workspace ID; management and internal credentials remain server-only.
- `workspaceId` is removed before forwarding to management routes.
- Missing credentials, membership, admin role, tenant mismatch, and upstream failures fail closed.

## Verification

- Root suite: 200 passed, 3 provider-dependent skipped.
- Next.js production build passes.
- Added route tests for missing session, non-admin denial, tenant authorization, credential isolation, and query stripping.
- Added Node integration tests for matching and cross-tenant management credentials.
