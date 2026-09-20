# Tasks

**Updated:** 2026-09-20

## In progress

- [ ] Migrate Next.js authentication and workspace navigation from Convex to the Go API.

## Next

- [ ] Migrate channels, messages, uploads, and realtime updates from Convex to the Go API.
- [ ] Reconnect MCP credential administration through the Go workspace identity boundary.
- [ ] Add human-approved remediation and coding-agent pull-request handoff.
- [ ] Add GitHub App installation OAuth and automatic webhook provisioning.

## Backlog

- Additional telemetry connectors behind the normalized evidence model.
- Native MCP resource subscriptions for clients that expose them usefully.

## Done

- [x] Adapt Next.js message, thread, reaction, upload, trusted ask, and realtime paths to the feature-gated Go backend — 2026-09-20
- [x] Adapt Next.js workspace, channel, member, and conversation mutations to the feature-gated Go backend — 2026-09-20
- [x] Adapt Next.js workspace, channel, and member read paths to the feature-gated Go backend — 2026-09-20
- [x] Add typed Next.js Go clients for channels, messages, conversations, uploads, trusted asks, and realtime events — 2026-09-20
- [x] Add the typed Next.js Go API/session/workspace client foundation without storing browser bearer tokens — 2026-09-20
- [x] Complete Go API parity for bounded workspace-scoped image uploads — 2026-09-20
- [x] Add the trusted workspace-to-tenant web investigation boundary and retire caller-selected tenant asks — 2026-09-20
- [x] Add private direct-conversation and direct-message API parity — 2026-09-20
- [x] Add workspace/member administration and single-resource API parity — 2026-09-20
- [x] Harden and test the Go chat API identity, browser-session, WebSocket, and trusted-message boundaries — 2026-09-20
- [x] Persist GitHub commits/deployments and expose tenant-scoped change correlation — 2026-09-20
- [x] Add authenticated CloudWatch Logs subscription ingestion and onboarding — 2026-09-20
- [x] Publish the standalone `calyx-mcp@0.1.0` stdio bridge to npm — 2026-09-20
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
