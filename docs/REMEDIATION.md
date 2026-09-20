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

## Customer-side operator

Configure a tenant-specific operator through the server-only `CALYX_OPERATOR_CONFIG` JSON object. Every tenant entry contains an HTTPS `url`, a signing `secret` of at least 32 characters, and a non-empty `allowed_operations` array. Calyx rejects operations outside that allowlist before making a request.

The `operator_webhook` action sends the same remediation request ID during dry run and execution. Requests include:

```json
{
  "version": 1,
  "request_id": "uuid",
  "tenant_id": "tenant-a",
  "phase": "dry_run",
  "operation": "service.scale",
  "target": "checkout-api",
  "input": { "replicas": 4 }
}
```

The operator must validate:

- `X-Calyx-Timestamp` is recent;
- `X-Calyx-Signature` equals `sha256=<hex HMAC-SHA256>` over `<timestamp>.<exact request body>`;
- `Idempotency-Key` is processed once (`<request_id>:<phase>`);
- the operation, target, and provider credentials comply with customer policy.

It returns JSON containing `success`, `message`, and optional `before`/`after` values. Provider credentials remain in the customer operator and are never sent to Calyx.

Agent recommendations can call `propose_remediation` only for an active tenant-owned incident. This performs the operator dry run, persists the request, and durably queues a Slack approval card. The general MCP `ask` wrapper excludes the mutation tool, and it is not exposed as a scoped MCP tool.

## Safety boundary

The original `flag_toggle` action remains an in-memory test adapter. Calyx deliberately does not retry an `executing` request automatically because the external side effect may have succeeded before a process crash. Customer operators must reconcile these requests using the request ID and their idempotency ledger. Exact undo remains action-specific and is not offered by the generic operator webhook.
