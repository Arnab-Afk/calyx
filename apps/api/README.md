# Calyx Chat API (Go) — replaces Convex for workspaces / channels / messages

Deployable REST + WebSocket backend. Observability (logs, ask, MCP) stays on the Node stack (`:13000` / `:13002`).

## Run locally

```bash
# Postgres (shared Calyx DB)
docker compose up -d postgres

cd apps/api
export DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx
export JWT_SECRET=change-me-in-prod
export ADDR=:14000
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

Use `Authorization: Bearer <token>` on all other routes.

## Core routes

| Method | Path |
|---|---|
| `GET` | `/health` |
| `POST` | `/v1/auth/register` |
| `POST` | `/v1/auth/login` |
| `GET` | `/v1/auth/me` |
| `GET/POST` | `/v1/workspaces` |
| `POST` | `/v1/workspaces/join` |
| `GET` | `/v1/workspaces/:id` |
| `POST` | `/v1/workspaces/:id/join-code` |
| `GET` | `/v1/workspaces/:id/members` |
| `GET/POST` | `/v1/workspaces/:id/channels` |
| `PATCH/DELETE` | `/v1/channels/:id` |
| `GET/POST` | `/v1/channels/:id/messages` |
| `PATCH/DELETE` | `/v1/messages/:id` |
| `POST` | `/v1/messages/:id/reactions` |
| `GET` | `/v1/workspaces/:id/ws` (WebSocket) |

## Env

| Var | Default | Notes |
|---|---|---|
| `ADDR` | `:14000` | Listen address |
| `DATABASE_URL` | local compose Postgres | Same DB as Node; tables prefixed `chat_*` |
| `JWT_SECRET` | dev default | **Required in production** |
| `JWT_TTL_HOURS` | `720` | Token lifetime |
| `CORS_ORIGINS` | `*` | Comma-separated |

## Deploy

Build and push the image from `apps/api`:

```bash
docker build -t calyx-chat-api ./apps/api
```

Set `DATABASE_URL` + `JWT_SECRET`, expose `14000`, point the Next app at `NEXT_PUBLIC_CALYX_CHAT_URL` (frontend switch from Convex is a follow-up).

## Smoke

```bash
./scripts/smoke-chat-api.sh   # or see README curl sequence above
```
