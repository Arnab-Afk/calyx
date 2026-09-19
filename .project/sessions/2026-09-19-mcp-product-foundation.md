# 2026-09-19 — MCP product foundation

**Goal.** Replace the non-starting MCP skeleton with production-shaped connectors for coding agents and live logs.

**Landed.**
- Added tenant-scoped stdio and bearer-authenticated stateful Streamable HTTP MCP transports.
- Added hashed, scoped, expiring, revocable API keys and create/list/revoke CLI management.
- Added duplicate-resistant `tail_logs` long polling over opaque ingestion cursors.
- Added Docker service and verified a real SDK client can list and call tools remotely.
- Documented exact Claude Code, Codex, Pi, shared MCP, and local stdio setup.
- Added auth, tenant-isolation, live-tail, and HTTP transport integration tests; full suite is 160 passed, 3 provider-dependent skipped.

**Didn't land.**
- Browser OAuth and web self-service credential management require a canonical web-workspace-to-backend tenant identity boundary.

**Learned.**
- The prior `npm run dev:mcp` exited immediately because the entrypoint never called `startMcpServer`.
- Portable tool long polling is more broadly useful to coding agents than relying on optional MCP resource/log notification rendering.

**Open.**
- Choose and implement the authenticated Convex workspace to Calyx backend identity exchange before exposing credential issuance in the web app.
