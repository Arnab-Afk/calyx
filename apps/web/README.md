# Calyx Web

Slack-style workspace UI backed by the first-party Go chat API. The browser uses HTTP-only session cookies; workspace identity and observability tenant mapping are always resolved server-side.

## Prerequisites

- Node 20+ and `pnpm`
- PostgreSQL and the Go API from [`../api`](../api)
- Node ingestion service for trusted `/calyx` investigations and MCP credential administration

## Local setup

From the repository root:

```bash
docker compose up -d postgres redis
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx npm run migrate
docker compose --profile chat up -d --build chat-api
```

Configure the web app:

```bash
cd apps/web
cp .env.example .env.local
pnpm install
pnpm dev
```

The default values expect:

- Web: `http://localhost:3000`
- Go chat API: `http://localhost:14000`
- Hosted MCP: `http://localhost:13002/mcp`

## Go-to-Node trusted boundary

Configure the same server-only key on Go and Node:

```bash
CALYX_INTERNAL_API_KEY="$(openssl rand -hex 32)"
CALYX_ASK_URL=http://localhost:13000
```

Never expose `CALYX_INTERNAL_API_KEY` through a `NEXT_PUBLIC_` variable. Go verifies the user session and workspace-admin membership before proxying MCP credential operations. Node resolves the workspace's canonical observability tenant.

Before using `/calyx` or issuing connector credentials, link the Go workspace UUID to a tenant:

```bash
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  npm run mcp:workspace-link -- --workspace <workspace-uuid> --tenant <tenant-id>
```

## Validation

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src
NEXT_PUBLIC_CALYX_CHAT_URL=http://localhost:14000 pnpm build
```

Do not commit `.env.local` or service credentials.
