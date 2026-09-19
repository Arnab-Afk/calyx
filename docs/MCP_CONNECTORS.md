# Calyx MCP connectors

Calyx exposes the same read-only observability tools to Claude Code, Codex, Pi, Cursor, VS Code, and any standard MCP client.

## Transports

- **Streamable HTTP (recommended):** `https://<calyx-host>/mcp`, authenticated with a scoped bearer token. Stateless mode is the horizontally safe default; stateful sessions remain available for affinity deployments.
- **stdio (local development):** starts `src/mcp/server.ts` as a child process and binds it to one tenant through the environment.

The current tools are:

| Tool | Purpose |
|---|---|
| `ask` | Run the same evidence-grounded Calyx investigation used by web, Slack, and CLI |
| `query_logs` | Query historical logs by service, level, and time range |
| `get_alert_context` | Continue an alert investigation by ID with nearby error evidence |
| `get_incident` | Retrieve a durable incident with linked alerts and evidence snapshots |
| `get_service_stats` | Compare service event counts and error rates |
| `list_services` | Discover which services have sent logs for the authenticated tenant |
| `list_incidents` | List durable incidents by status or service |
| `search_incidents` | Search durable incidents by title, summary, or service |
| `search_past_incidents` | Deprecated raw-log keyword compatibility search |
| `tail_logs` | Long-poll newly ingested events; pass `next_cursor` into the next call |

`search_past_incidents` is retained for existing clients but searches raw logs. New clients should use `search_incidents`; removal requires a versioned compatibility release rather than an in-place behavior change.

The authenticated tenant is injected by the server. `tenant_id` is intentionally absent from the public tool schemas and cannot be overridden by a client.

## Run the hosted connector locally

```bash
docker compose up -d postgres redis
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx npm run migrate

# Create a token. It is displayed once; only its SHA-256 hash is stored.
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  npm run mcp:key -- create --tenant default --name "local-agent" --scopes logs:read,incidents:read,incidents:ask

DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
MCP_PORT=13002 \
  npm run dev:mcp:http
```

The endpoint is `http://127.0.0.1:13002/mcp`. In Docker, use:

```bash
docker compose --profile mcp up --build
```

List and revoke credentials without exposing their token:

```bash
npm run mcp:key -- list --tenant default
npm run mcp:key -- revoke --tenant default --id <credential-uuid>
```

Workspace admins can create, copy once, list, and revoke credentials from **Preferences → Coding-agent connectors** after an operator establishes the canonical workspace mapping:

```bash
npm run mcp:workspace-link -- --workspace <convex-workspace-id> --tenant <calyx-tenant-id>
```

The browser never supplies a tenant ID or receives `CALYX_INTERNAL_API_KEY`. Convex verifies workspace-admin membership, sends only its authenticated workspace ID to the internal API, and Calyx resolves the tenant from `workspace_tenant_links`.

Always use HTTPS outside a local machine. Never commit a Calyx token.

Set `MCP_SESSION_MODE=stateless` for replicas without coordination. This accepts POST requests only and creates an isolated protocol server per request. `MCP_SESSION_MODE=stateful` enables GET/SSE and resumable in-process sessions, but every session must remain pinned to the instance that created it.

Hosted requests are limited per credential through PostgreSQL (`MCP_RATE_LIMIT_PER_MINUTE`, default 120). Invalid authentication attempts have a separate per-network-peer limit. Responses include standard limit, remaining, reset, and retry headers. Credential lifecycle, authentication outcomes, session access, HTTP requests, and tool calls are written to tenant-scoped `audit_events`; token values and tool arguments are never recorded.

## Browser OAuth for hosted clients

Calyx can act as an OAuth 2.0 protected resource while an existing OAuth 2.1/OIDC provider handles browser login, consent, client registration, authorization code + PKCE, refresh tokens, and revocation. Configure:

```bash
MCP_PUBLIC_URL=https://mcp.example.com/mcp
MCP_OAUTH_ISSUER=https://auth.example.com
MCP_OAUTH_INTROSPECTION_URL=https://auth.example.com/oauth2/introspect
MCP_OAUTH_CLIENT_ID=calyx-mcp
MCP_OAUTH_CLIENT_SECRET=...
```

The issuer's RFC 7662 introspection response must include `active: true`, `sub`, a server-issued `tenant_id`, an `aud` matching `MCP_PUBLIC_URL`, and a space-delimited `scope` containing supported Calyx scopes. Calyx publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and includes that URL in `WWW-Authenticate` responses. Tenant identity is accepted only from the trusted introspection response, never an MCP request.

API keys remain supported for machine-to-machine clients. Always use HTTPS for the resource and issuer in production.

## Claude Code

Remote connector:

```bash
claude mcp add --scope project --transport http calyx https://<calyx-host>/mcp \
  --header "Authorization: Bearer $CALYX_API_KEY"
```

Local stdio connector from this repository:

```bash
claude mcp add --scope project calyx \
  -e CALYX_TENANT_ID=default \
  -e DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  -- npm run dev:mcp
```

## Codex

Remote connector (the token is read from the environment, not copied into config):

```bash
codex mcp add calyx --url https://<calyx-host>/mcp \
  --bearer-token-env-var CALYX_API_KEY
```

Local stdio connector:

```bash
codex mcp add calyx \
  --env CALYX_TENANT_ID=default \
  --env DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  -- npm run dev:mcp
```

## Pi

Pi requires the `pi-mcp-adapter` package. Put the remote connector in the project `.mcp.json`:

```json
{
  "mcpServers": {
    "calyx": {
      "url": "https://<calyx-host>/mcp",
      "auth": "bearer",
      "bearerTokenEnv": "CALYX_API_KEY",
      "lifecycle": "keep-alive",
      "requestTimeoutMs": 30000
    }
  }
}
```

For local stdio development:

```json
{
  "mcpServers": {
    "calyx": {
      "command": "npm",
      "args": ["run", "dev:mcp"],
      "cwd": "/absolute/path/to/calyx",
      "env": {
        "CALYX_TENANT_ID": "default",
        "DATABASE_URL": "postgres://calyx:calyx@localhost:15432/calyx"
      }
    }
  }
}
```

Run `/mcp reconnect calyx`, then search for a tool with `mcp({ search: "live logs", server: "calyx" })`.

## Cursor, VS Code, and other clients

Clients that understand the shared `.mcp.json` format can use:

```json
{
  "mcpServers": {
    "calyx": {
      "url": "https://<calyx-host>/mcp",
      "headers": {
        "Authorization": "Bearer ${CALYX_API_KEY}"
      }
    }
  }
}
```

If a client does not interpolate environment variables in headers, use its secure credential setting rather than putting the token in a committed file. Any client supporting MCP Streamable HTTP can connect to `/mcp`; any client supporting stdio can launch `npm run dev:mcp`.

## Following live logs

`tail_logs` is a bounded long-poll operation so it works in clients that do not render unsolicited MCP notifications.

1. Call `tail_logs` with optional `service`, `level`, and `wait_ms` filters.
2. Read `next_cursor` from the structured response.
3. Call `tail_logs` again with that cursor.
4. Stop when enough evidence has been collected or the user cancels.

A cursor is opaque and tenant-bound by the query. Events are ordered by `(ingested_at, id)`, preventing duplicates when multiple events have the same application timestamp.

## Security model

- API keys use the `calyx_sk_` prefix and 256 bits of random secret material.
- PostgreSQL stores only a SHA-256 digest and a non-secret lookup prefix.
- Keys have tenant, name, scopes, optional expiry, last-used time, and revocation time.
- Every HTTP request is re-authenticated; a stateful MCP session cannot switch credentials.
- Stateless mode stores no protocol session state and can run across replicas without affinity.
- Tool inputs cannot select a tenant.
- The first production scope is read-only: `logs:read`.
- Hosted deployment must terminate TLS and rate-limit `/mcp` at the edge.

Interactive browser OAuth and self-service token issuance from the web app are planned on top of this credential model. API-key authentication is the supported machine-to-machine path today.
