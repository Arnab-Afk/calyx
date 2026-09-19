# Tasks

**Updated:** 2026-09-19

## In progress

- [ ] Add self-service MCP credential management to the authenticated web workspace; users can create, list, and revoke only their workspace credentials.

## Next

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

- [x] Ship scoped MCP stdio and authenticated Streamable HTTP with cursor-based live logs, client documentation, and end-to-end tests — 2026-09-19
- [x] Establish the initial product scope and MCP transport/auth decisions — 2026-09-19
- [x] Build the original ingestion, agent, Slack, CLI, detection, execution, and web skeleton — 2026-09-19
