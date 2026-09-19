# Tasks

**Updated:** 2026-09-19

## In progress

- [ ] Replace the aspirational `search_past_incidents` behavior with a real durable incident/evidence model and explicit compatibility plan.

## Next

- [ ] Define and persist a canonical Convex workspace-to-observability-tenant mapping before resuming self-service MCP credential management.
- [ ] Add standards-based browser OAuth for remote MCP clients while retaining API keys for machine-to-machine use.
- [ ] Add durable incident/evidence schemas and MCP incident tools; a coding agent can retrieve and question one persisted incident.
- [ ] Add rate limits, audit events, and deployment-safe session storage for the hosted MCP endpoint.
- [ ] Package the stdio connector so clients do not require a Calyx repository checkout.

## Backlog

- CloudWatch and additional telemetry connectors behind the normalized evidence model.
- GitHub repository/deployment correlation.
- Human-approved remediation and coding-agent pull-request handoff.
- Native MCP resource subscriptions for clients that expose them usefully.

## Done

- [x] Persist tenant-scoped detector alerts and expose `get_alert_context` with nearby error evidence — 2026-09-19
- [x] Add tenant-scoped MCP `list_services` and actionable empty-tenant/filter guidance — 2026-09-19
- [x] Add the scoped MCP `ask` wrapper over the shared Calyx investigation loop — 2026-09-19
- [x] Ship scoped MCP stdio and authenticated Streamable HTTP with cursor-based live logs, client documentation, and end-to-end tests — 2026-09-19
- [x] Establish the initial product scope and MCP transport/auth decisions — 2026-09-19
- [x] Build the original ingestion, agent, Slack, CLI, detection, execution, and web skeleton — 2026-09-19
