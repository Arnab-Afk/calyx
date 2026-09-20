# Durable remediation approvals

**Date:** 2026-09-20

## Built

- Replaced process-local pending actions and execution audit snapshots with PostgreSQL remediation requests and immutable transition events.
- Removed caller-provided `human_approved`; approval now claims a persisted request by ID and executes its captured tenant, action, and parameters.
- Enforced successful dry runs, required approval/rejection/undo reasons, and atomic at-most-once approval claims.
- Added durable rejection, execution outcomes, and undo transitions with exact captured-before restoration for the flag stub.
- Initialized the action registry in Slack and moved Slack approve/reject handlers to durable requests.
- Added fail-closed global and team-specific Slack approver allowlists.
- Documented the remaining customer-side operator and idempotency boundary.

## Verification

- Migration passes against PostgreSQL.
- Root suite: 192 passed, 3 provider-dependent skipped.
- Remediation tests cover failed dry runs, required reasons, concurrent approvals, restart reinitialization, rejection, tenant isolation, and undo actor/reason persistence.
- Compose and diff checks pass.

## Next

Connect proposal creation to live incident recommendations and deliver approval cards, then implement a customer-side idempotent operator integration.
