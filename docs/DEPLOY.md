# Deploy Calyx end-to-end (web + Go chat + Node intake)

Deploy these three services against the **same Postgres and Redis**. Redis backs both log intake and cross-replica Go realtime delivery.

| Service | Role | Typical URL |
|---|---|---|
| Next.js `apps/web` | UI | `https://app.arnabbhowmik.in` or Vercel |
| Go `apps/api` | Chat auth, workspaces, `/calyx` proxy | `https://calyx-api.arnabbhowmik.in` |
| Node intake + consumer | Logs, projects, ask, MCP | `https://calyx-intake.arnabbhowmik.in` |

## 1. Postgres migrate (Node schema)

```bash
DATABASE_URL='postgresql://…/calyx?sslmode=require' npm run migrate
```

Creates `events`, `projects`, `mgmt_api_keys`, `workspace_tenant_links`, etc.

Run the Go image's migration binary as a release job before API replicas start:

```bash
DATABASE_URL='postgresql://…/calyx?sslmode=require' /app/calyx-migrate
```

Go migrations under `apps/api/internal/db/migrations` are ordered, checksummed, transactional, and serialized with an advisory lock. The API no longer mutates schema at startup.

## 2. Mint Control Center token

```bash
DATABASE_URL='…' npm run mgmt:key -- create -t default -n web-control-center
# → save calyx_mgmt_… once
```

## 3. Shared internal key

```bash
openssl rand -hex 32   # → CALYX_INTERNAL_API_KEY
```

Set the **same** value on Go and Node.

## 4. Go chat API env

```bash
APP_ENV=production
DATABASE_URL=…
REDIS_URL=…
JWT_SECRET=<≥32 chars>
CORS_ORIGINS=https://YOUR_WEB_ORIGIN
# Cross-origin web (e.g. Vercel → api subdomain): leave COOKIE_DOMAIN empty.
# Production defaults COOKIE_SAMESITE=none (Secure cookies).
# Sibling subdomains only: COOKIE_SAMESITE=lax and COOKIE_DOMAIN=.arnabbhowmik.in
CALYX_ASK_URL=https://YOUR_INTAKE_ORIGIN
CALYX_INTERNAL_API_KEY=…
CALYX_DEFAULT_TENANT=default
ADDR=:14000
```

Every Go replica must use the same Redis deployment so WebSocket events fan out across replicas. Production startup fails closed when `REDIS_URL` is missing.

Creating a workspace **auto-links** it to `CALYX_DEFAULT_TENANT` via Node
`POST /v1/internal/workspaces/:id/link`.

## 5. Node intake + consumer env

```bash
DATABASE_URL=…
REDIS_URL=…
PORT=3000
CALYX_INTERNAL_API_KEY=…          # same as Go
ANTHROPIC_API_KEY=…
CALYX_PUBLIC_URL=https://YOUR_INTAKE_ORIGIN
CALYX_INTAKE_URL=https://YOUR_INTAKE_ORIGIN
```

Run **both**:
- `npm run start` / `dev:ingestion` (HTTP)
- `npm run dev:consumer` (Redis → Postgres)

Without Redis + consumer, log POSTs fail or never become queryable for `/calyx`.

## 6. Next.js web env

```bash
NEXT_PUBLIC_CALYX_CHAT_URL=https://YOUR_GO_API_ORIGIN
NEXT_PUBLIC_CALYX_MCP_URL=https://YOUR_MCP_ORIGIN/mcp
CALYX_CHAT_URL=https://YOUR_GO_API_ORIGIN
CALYX_API_URL=https://YOUR_INTAKE_ORIGIN
CALYX_MGMT_TOKEN=calyx_mgmt_…
CALYX_INTERNAL_API_KEY=<same value configured on Go and Node>
```

The Control Center fails closed unless the browser has a valid Go session, the user is a workspace admin, and the workspace’s immutable tenant link matches `CALYX_MGMT_TOKEN`.

## 7. Smoke

1. Open web → register → create workspace  
2. Settings → Projects & logs → create project → FE/BE sources  
3. `curl -X POST $INTAKE/v1/logs -H "Authorization: Bearer calyx_src_…" -d '…'`  
4. In `#general`: `/calyx any errors?`  
5. Members / invite code from Settings  

## Existing workspaces (pre-fix)

If a workspace was created before auto-link:

```bash
DATABASE_URL=… npm run mcp:workspace-link -- --workspace <uuid> --tenant default
```

Or:

```bash
curl -X POST "$INTAKE/v1/internal/workspaces/<uuid>/link" \
  -H "X-Calyx-Internal-Key: $CALYX_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"default"}'
```
