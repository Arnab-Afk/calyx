# Go-only web cutover

**Date:** 2026-09-20

## Built

- Removed active Convex client/server providers, middleware, auth hooks, queries, mutations, upload actions, and trusted-ask routes from the Next.js runtime.
- Made the Go HTTP-only session provider and client-side route gate the sole web authentication path.
- Converted all workspace, channel, member, conversation, message, reaction, upload, realtime, and trusted `/calyx` UI paths to Go-only calls.
- Added a shared mutation hook with correct pending, success, error, callback, and optional rethrow behavior.
- Removed the obsolete backend feature flag and Convex production-deploy command.
- Updated local setup and architecture documentation for the Go-backed web app.
- Fixed local logger linking/prebuild behavior and changed logger environment access to a bundler-supported `import.meta.env` property access.

## Verification

- Next.js production build passes with no Convex environment configured.
- Web TypeScript, targeted ESLint, and Prettier pass.
- Headless Chrome smoke passed registration, HTTP-only cookie session use, workspace/channel navigation, and rendered message retrieval through the Go API.
- Root suite: 199 passed, 3 provider-dependent skipped.
- Checked GitHub after the user's merge warning: `origin/main` remains at PR #27 with no remote-only commits or open PRs.

## Next

Implement durable human-approved remediation requests and coding-agent pull-request handoff.
