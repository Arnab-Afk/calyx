# Durable remediation approvals

Calyx persists every proposed action and state transition in PostgreSQL. Callers cannot claim that a human approved an action and cannot supply replacement tenant/action parameters at approval time.

## Lifecycle

1. `proposeAction` resolves the registered action, performs its dry run, and writes a `remediation_requests` row plus a `proposed` event.
2. A failed dry run creates a terminal `failed` request and cannot be approved.
3. An authorized human approves or rejects the request by opaque request ID with a required reason.
4. Approval atomically changes `pending` to `executing`. Only one concurrent approver can claim it.
5. Execution uses the tenant, action, and parameters captured by the proposal. Its outcome and actor are appended to `remediation_events`.
6. Reversible executed requests can be claimed once for undo. Undo receives the captured execution result so it can restore the exact prior state.

Slack approval is fail-closed. `SLACK_REMEDIATION_APPROVER_IDS` contains a single-workspace allowlist. Multi-workspace deployments should use `SLACK_REMEDIATION_APPROVER_IDS_<TEAM_ID>`; a team-specific value takes precedence. An empty value authorizes nobody.

## Safety boundary

The current `flag_toggle` action is an in-memory integration stub. Durable approval is complete, but production infrastructure execution is not. A real customer-side operator must provide:

- provider authentication held outside the Calyx control plane;
- idempotency keyed by remediation request ID;
- bounded targets and tenant-specific policy;
- reconciliation for requests left in `executing` after process failure;
- tested exact undo semantics where the provider supports reversal.

Calyx deliberately does not retry an `executing` request automatically because the external side effect may have succeeded before a process crash.
