# Coding-agent pull-request handoff

**Date:** 2026-09-20

## Built

- Added tenant/incident/project-scoped durable coding jobs and append-only lifecycle events.
- Require a GitHub App installation before launch and store only callback capability hashes.
- Dispatch jobs to a configured external coding agent with a single-job callback capability.
- Added bounded installation-token-backed code search and file reads without exposing GitHub tokens.
- Added atomic single-use patch submission with 1–50 files and a 512 KiB total limit.
- Create Git blobs, tree, commit, a `calyx/<job-id>` branch, and a draft pull request.
- Persist branch, PR number/URL, failures, launch actor, and incident linkage.
- Added no merge or deployment API.

## Verification

- Migration passes against PostgreSQL.
- Storage tests cover tenant isolation, installation requirements, hashed capabilities, atomic submission, PR linkage, and lifecycle events.
- GitHub client tests verify draft PR creation and absence of merge calls.
- Root suite and static checks are run before merge.

## Next

Implement GitHub App installation OAuth, repository selection, installation validation, and automatic webhook provisioning so `installation_id` cannot be supplied manually.
