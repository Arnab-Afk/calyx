# `calyx-mcp`

Local stdio bridge for the hosted Calyx MCP endpoint. Use it when an IDE supports stdio MCP but cannot connect directly to Streamable HTTP.

```bash
CALYX_MCP_URL=https://mcp.example.com/mcp \
CALYX_API_KEY=calyx_sk_... \
npx -y calyx-mcp
```

Claude Code:

```bash
claude mcp add --scope user calyx --env CALYX_MCP_URL=https://mcp.example.com/mcp \
  --env CALYX_API_KEY="$CALYX_API_KEY" -- npx -y calyx-mcp
```

The bridge forwards tool discovery and calls. It does not connect to PostgreSQL and does not accept a tenant ID; the hosted bearer credential determines the tenant and scopes. Non-local endpoints must use HTTPS.
