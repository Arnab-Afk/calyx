# GitHub App installation provisioning

**Date:** 2026-09-20

## Built

- Replaced caller-supplied installation IDs and manual webhook secrets with a GitHub App setup flow.
- Added random, hashed, expiring, single-use installation state bound to tenant/project/repository.
- Validate the callback installation through GitHub’s repository-installation API.
- Automatically create or update push/deployment webhooks with a server-generated secret.
- Persist repository/installation only after validation and webhook provisioning succeed.
- Updated the Control Center to redirect to GitHub’s installation page.
- Added disconnect handling that removes the webhook where possible and clears stale local state after revocation.

## Verification

- Tests cover state hashing, expiry, replay rejection, ignored caller installation IDs, repository validation failure, webhook payloads, and persistence ordering.
- Root suite, migration, Next.js build, and static checks run before merge.

## Next

Production infrastructure work: shared Go realtime pub/sub, versioned migrations, and object storage.
