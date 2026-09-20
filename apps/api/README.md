# Calyx Chat API (Go) — replaces Convex for workspaces / channels / messages

Deployable REST + WebSocket backend. Observability (logs, ask, MCP) stays on the Node stack (`:13000` / `:13002`).

## Run locally

```bash
# Shared Postgres and Redis
docker compose up -d postgres redis

cd apps/api
export DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx
export REDIS_URL=redis://localhost:16379
export JWT_SECRET=dev-only-change-me-calyx-chat-api
go run ./cmd/migrate
go run ./cmd/server
```

Or via compose:

```bash
docker compose --profile chat up --build chat-api
# → http://localhost:14000/health
```

## Auth

```bash
curl -s -X POST http://localhost:14000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"password123","name":"You"}'

curl -s -X POST http://localhost:14000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'
# → { "token": "...", "user": {...} }
```

Registration and login return a bearer token for CLI clients and also set an HTTP-only `calyx_session` cookie for the browser and authenticated WebSocket connection. Use `Authorization: Bearer <token>` from non-browser clients. `POST /v1/auth/logout` clears the browser session.

## Core routes

| Method | Path |
|---|---|
| `GET` | `/health` |
| `POST` | `/v1/auth/register` |
| `POST` | `/v1/auth/login` |
| `POST` | `/v1/auth/logout` |
| `GET` | `/v1/auth/me` |
| `GET/POST` | `/v1/workspaces` |
| `POST` | `/v1/workspaces/join` |
| `GET/PATCH/DELETE` | `/v1/workspaces/:id` |
| `GET` | `/v1/workspaces/:id/info` |
| `POST` | `/v1/workspaces/:id/join-code` |
| `GET` | `/v1/workspaces/:id/members` and `/v1/workspaces/:id/members/me` |
| `POST` | `/v1/workspaces/:id/uploads` (multipart `file`, images up to 5 MiB) |
| `GET` | `/v1/uploads/:id` (workspace-member authenticated) |
| `GET/PATCH/DELETE` | `/v1/members/:id` |
| `GET/POST` | `/v1/workspaces/:id/channels` |
| `GET/PATCH/DELETE` | `/v1/channels/:id` |
| `GET/POST` | `/v1/channels/:id/messages` |
| `POST` | `/v1/channels/:id/calyx` (trusted server-side investigation) |
| `POST` | `/v1/workspaces/:id/conversations` (idempotent create/get) |
| `GET` | `/v1/conversations/:id` |
| `GET/POST` | `/v1/conversations/:id/messages` |
| `GET/PATCH/DELETE` | `/v1/messages/:id` |
| `POST` | `/v1/messages/:id/reactions` |
| `GET` | `/v1/workspaces/:id/ws` (WebSocket) |

## Env

| Var | Default | Notes |
|---|---|---|
| `ADDR` | `:14000` | Listen address |
| `DATABASE_URL` | local compose Postgres | Same DB as Node; tables prefixed `chat_*` |
| `REDIS_URL` | `redis://localhost:16379` | Shared realtime pub/sub; **required in production** |
| `OBJECT_STORAGE_ENDPOINT` | local MinIO | S3-compatible endpoint; use the account-specific R2 S3 endpoint in production |
| `OBJECT_STORAGE_REGION` | `auto` | R2 uses `auto`; local MinIO uses `us-east-1` |
| `OBJECT_STORAGE_BUCKET` | `calyx-uploads` locally | Private upload bucket |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | local development value | Server-only S3/R2 access key |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | local development value | Server-only S3/R2 secret |
| `OBJECT_STORAGE_PATH_STYLE` | `false` | Set `true` for local MinIO |
| `APP_ENV` | `development` | Set to `production` to require secure cookies and fail-closed config |
| `JWT_SECRET` | dev default | At least 32 characters; **required in production** |
| `JWT_ISSUER` | `calyx-chat-api` | Validated token issuer |
| `JWT_AUDIENCE` | `calyx-web` | Validated token audience |
| `JWT_TTL_HOURS` | `24` | Access/session lifetime; range 1–720 hours |
| `CORS_ORIGINS` | local Next.js origins | Comma-separated (spaces trimmed); wildcard rejected in production |
| `COOKIE_SAMESITE` | `none` in production (no domain), else `lax` | Use `none` when web and API are on different sites (e.g. Vercel → API host) |
| `COOKIE_DOMAIN` | unset | Optional parent domain for sibling subdomains, e.g. `.arnabbhowmik.in` |
| `CALYX_ASK_URL` | unset | Node ingestion origin, for example `http://ingestion:3000` |
| `CALYX_INTERNAL_API_KEY` | unset | Shared server-only key; must be configured with `CALYX_ASK_URL` |
| `CALYX_DEFAULT_TENANT` | `default` | Auto-linked when a workspace is created |

## Image uploads

Upload JPEG, PNG, GIF, or WebP files as authenticated multipart requests. The API detects content from bytes, caps files at 5 MiB, and stores them under the canonical workspace. Message creation accepts `imageId`; arbitrary external image URLs and cross-workspace IDs are rejected. Reads require current workspace membership.

Images are private S3-compatible objects (Cloudflare R2 in production, MinIO locally). PostgreSQL stores only ownership, immutable object key, content metadata, and lifecycle state. Reads stream through the authenticated Go endpoint; bucket credentials and public object URLs are never exposed.

Database cascades and message deletion enqueue object keys in `chat_object_deletions`. Every API replica safely competes for cleanup work with `SKIP LOCKED`; deletion is idempotent and retried after failures. Stale pending uploads are reconciled automatically.

After applying migration `0002`, move legacy PostgreSQL bytes before deployment:

```bash
/app/calyx-backfill-uploads
```

The command uses deterministic keys, is safe to rerun, and clears `chat_uploads.data` only after the object write succeeds. Keep the compatibility column until production backfill verification is complete.

## Trusted Calyx investigations

`POST /v1/channels/:id/calyx` accepts only a query and optional thread parent. The Go API authenticates workspace membership, calls Node through the internal service key, and persists both the question and trusted Calyx response. The browser cannot supply tenant IDs or `calyxData`.

Workspace → tenant linking is automatic on workspace create (and on first ask if missing). Manual override:

```bash
npm run mcp:workspace-link -- --workspace <go-workspace-uuid> --tenant <tenant-id>
```

Configure the same `CALYX_INTERNAL_API_KEY` on Go and Node, and set Go's `CALYX_ASK_URL` to the Node ingestion origin. See [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

## Deploy

Build and push the image from `apps/api`:

```bash
docker build -t calyx-chat-api ./apps/api
```

Run `/app/calyx-migrate`, then `/app/calyx-backfill-uploads`, as release jobs before starting API replicas. Migrations are ordered, checksummed, transactional, and protected by a PostgreSQL advisory lock. Never edit an applied migration; add the next numbered SQL file.

Set `APP_ENV=production`, `DATABASE_URL`, `REDIS_URL`, a random `JWT_SECRET`, and explicit HTTPS `CORS_ORIGINS`; expose `14000`, then point Next.js at `NEXT_PUBLIC_CALYX_CHAT_URL`. Every API replica subscribes to the same Redis channel, so WebSocket clients receive events created on any replica.

## Smoke

```bash
bash ./scripts/smoke-chat-api.sh   # or see README curl sequence above
```
