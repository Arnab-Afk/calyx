# Tasks

**Updated:** 2026-09-19

## In progress

- [ ] Add standards-based browser OAuth for remote MCP clients while retaining API keys for machine-to-machine use.

## Next

- [ ] Add deployment-safe session storage for the hosted MCP endpoint.
- [ ] Package the stdio connector so clients do not require a Calyx repository checkout.

## Backlog

- CloudWatch and additional telemetry connectors behind the normalized evidence model.
- GitHub repository/deployment correlation.
- Human-approved remediation and coding-agent pull-request handoff.
- Native MCP resource subscriptions for clients that expose them usefully.

## Done

- [x] Add immutable workspace-to-tenant links and admin-only web MCP credential self-service — 2026-09-19
- [x] Add shared hosted MCP rate limits and tenant-scoped security/tool audit events — 2026-09-19
- [x] Persist Slack acknowledge/resolve lifecycle transactionally and authorize actions through the delivered channel — 2026-09-19
- [x] Schedule detection across active tenant/services and deliver Slack alerts through a durable retrying outbox — 2026-09-19
- [x] Add durable incidents/evidence with `list_incidents`, `get_incident`, and `search_incidents`; deprecate the raw-log compatibility tool explicitly — 2026-09-19
- [x] Persist tenant-scoped detector alerts and expose `get_alert_context` with nearby error evidence — 2026-09-19
- [x] Add tenant-scoped MCP `list_services` and actionable empty-tenant/filter guidance — 2026-09-19
- [x] Add the scoped MCP `ask` wrapper over the shared Calyx investigation loop — 2026-09-19
- [x] Ship scoped MCP stdio and authenticated Streamable HTTP with cursor-based live logs, client documentation, and end-to-end tests — 2026-09-19
- [x] Establish the initial product scope and MCP transport/auth decisions — 2026-09-19
- [x] Build the original ingestion, agent, Slack, CLI, detection, execution, and web skeleton — 2026-09-19
