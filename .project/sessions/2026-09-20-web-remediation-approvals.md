# Authenticated web remediation approvals

**Date:** 2026-09-20

## Built

- Added management API routes to list/get/approve/reject tenant-scoped remediation requests under `integrations:write`.
- Required non-empty decision reasons and preserved the durable single-use transition semantics.
- Extended the secured Next.js operations proxy to derive the member ID from Go and forward a `web:<workspace>:<member>` actor only under the internal service credential.
- Node rejects browser-forged actor headers without the internal credential and falls back to the management credential identity for direct management clients.
- Replaced the ApprovalCard’s fake local dry-run/run/undo transitions with durable request loading and authenticated approve/reject calls.
- Go now passes a server-derived member actor into trusted web investigations; successful remediation proposals return a real `approval-card` with the persisted request ID.
- Initialized the shared agent/action registry in the ingestion service so trusted web investigations have the same tools as Slack and MCP.
- Cards without a real remediation request ID are display-only.

## Verification

- Route tests cover tenant isolation, scope/auth requirements, required reasons, forged actors, rejection, execution, and durable actor attribution.
- Next proxy tests verify server-derived actor forwarding.
- Next.js typecheck passes; production build and full root suite are run before merge.
