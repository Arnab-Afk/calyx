# Durable alert lifecycle

**Date:** 2026-09-19

## Built

- Replaced process-local Slack alert state with canonical PostgreSQL lifecycle fields.
- Added Slack acknowledgement controls to active alert cards.
- Authorized acknowledge/resolve actions by matching the alert to a successfully delivered Slack channel.
- Updated linked incidents transactionally: acknowledgement starts investigation and resolution closes the incident with actor, timestamp, and notes.
- Fixed live-log initial cursors to use the PostgreSQL clock, avoiding host/database clock skew.

## Verification

- Migration applied successfully to local PostgreSQL.
- Root Vitest suite: 170 passed, 3 provider-key-dependent skipped.
- Lifecycle integration covers correct-channel acknowledgement, wrong-channel rejection, and transactional resolution.

## Next

Add hosted MCP rate limiting and audit events before external deployment.
