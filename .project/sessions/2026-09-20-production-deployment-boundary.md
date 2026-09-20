# Production deployment boundary

**Date:** 2026-09-20

## Built

- Replaced the Node development-runtime image with a multi-stage compiled production image running without development dependencies.
- Added compiled start commands for intake, consumer, detector, hosted MCP, Slack, Loki forwarding, and migration.
- Added dependency-aware `/ready` probes for Node (PostgreSQL/Redis) and Go (PostgreSQL/Redis/object storage), while retaining lightweight liveness.
- Added a production Compose specification with immutable images, release migrations, upload backfill, loopback-only ports, health gates, and optional Slack.
- Added fail-closed production preflight validation for HTTPS/TLS, secret separation, OAuth, GitHub App, R2, coding-agent dispatcher, Slack, web boundaries, and image digests.
- Added an executable deployment script and production environment template.
- Added acceptance, backup/restore, Redis/R2 outage, ambiguous-side-effect reconciliation, rollback, monitoring, and ownership runbooks.
- Added pull-request CI for Node tests/build/audit/image, Next.js type/build, Go format/tests/image, and deployment configuration validation.
- Updated vulnerable production transitive dependencies; `npm audit --omit=dev` reports zero vulnerabilities.

## Verification

- Node production compilation and multi-stage image build pass.
- Compiled intake and consumer run through Compose; intake dependency readiness passes.
- Preflight pass/failure tests cover complete config, insecure dispatch URL, and mutable image tags.
- Production and local Compose configurations validate.
- Go tests and dependency readiness compilation pass.
- Chat image rebuild and authenticated smoke, including `/ready`, pass.
- Root suite: 218 passed, 3 provider-dependent skipped.
- Next.js production build passes.

## Blocked externally

Actual production deployment and recovery drills require managed service credentials, immutable registry image digests, DNS/TLS control, external OAuth registration, GitHub App credentials, Slack credentials, remediation operator endpoint, and coding-agent dispatcher.
