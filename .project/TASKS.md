# Tasks

**Updated:** 2026-09-19

## In progress

- [ ] Add CloudWatch telemetry ingestion behind the normalized event model.

## Next

- [ ] Publish the prepared `calyx-mcp` stdio bridge package when npm credentials are available.

## Backlog

- CloudWatch and additional telemetry connectors behind the normalized evidence model.
- GitHub repository/deployment correlation.
- Human-approved remediation and coding-agent pull-request handoff.
- Native MCP resource subscriptions for clients that expose them usefully.

## Done

- [x] Package the standalone `calyx-mcp` stdio-to-hosted bridge so clients need no repository checkout — 2026-09-19
- [x] Default hosted MCP to horizontally safe stateless mode while retaining explicit affinity-based stateful mode — 2026-09-19
- [x] Publish `calyx-logger@0.2.0` for browser and Node telemetry — 2026-09-19 (teammate)
- [x] Add standards-based external browser OAuth protected-resource support while retaining API keys — 2026-09-19
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
