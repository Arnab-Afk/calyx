# Go-backed MCP credential administration

**Date:** 2026-09-20

## Built

- Added authenticated Go workspace routes to list, create, and revoke MCP credentials.
- Enforced workspace-admin authorization in Go before any connector-management request reaches Node.
- Proxied only server-derived workspace IDs through the existing internal-key boundary.
- Kept credential scopes server-selected and validated credential names and expiry bounds.
- Replaced the web MCP modal's Convex actions with the typed Go session client.
- Continued to return new plaintext connector tokens only once while Node stores hashes.

## Verification

- Web TypeScript, targeted ESLint, and Prettier pass.
- Go formatting, tests, vet, and Docker build pass.
- Root suite: 199 passed, 3 provider-dependent skipped.

## Next

Remove the remaining active Convex auth/data providers, make Go the sole/default web backend, and run the complete browser flow.
