# Go chat API hardening

**Date:** 2026-09-20

## Built

- Made production configuration fail closed without a 32+ character JWT secret or with wildcard CORS.
- Added JWT issuer, audience, not-before, and required-expiry validation.
- Reduced the default session lifetime from 30 days to 24 hours while retaining a bounded override.
- Added HTTP-only browser session cookies and logout while retaining bearer tokens for CLI clients.
- Reused the authenticated cookie for browser WebSockets and restricted upgrade origins to configured web hosts.
- Added 1 MiB request-body limits plus server read, write, and idle timeouts.
- Prevented user message requests from supplying trusted Calyx response metadata.
- Required thread parents to belong to the same workspace and channel and rejected empty message edits.
- Added Go auth/config/HTTP boundary tests and made Docker builds run the Go suite.
- Fixed the portable smoke script and reconciled project/web/API documentation.

## Verification

- Go tests and `go vet` pass through the Go 1.26 toolchain.
- Chat Docker image builds and runs its test suite.
- End-to-end register → workspace → channel → message smoke passes.
- HTTP-only cookie authentication succeeds; user-supplied `calyxData` is rejected.
- Root suite: 195 passed, 3 provider-dependent skipped.
- Compose and diff checks pass.

## Next

Complete API parity needed by the current Next.js UI, then migrate the frontend off Convex in vertical slices.
