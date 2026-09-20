# Calyx Chat API (Go) — replaces Convex for workspaces / channels / messages

Deployable REST + WebSocket backend. Observability (logs, ask, MCP) stays on the Node stack (`:13000` / `:13002`).

## Run locally

```bash
# Postgres (shared Calyx DB)
docker compose up -d postgres

cd apps/api
export DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx
export JWT_SECRET=dev-only-change-me-calyx-chat-api
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
| `GET/PATCH/DELETE` | `/v1/members/:id` |
| `GET/POST` | `/v1/workspaces/:id/channels` |
| `GET/PATCH/DELETE` | `/v1/channels/:id` |
| `GET/POST` | `/v1/channels/:id/messages` |
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
| `APP_ENV` | `development` | Set to `production` to require secure cookies and fail-closed config |
| `JWT_SECRET` | dev default | At least 32 characters; **required in production** |
| `JWT_ISSUER` | `calyx-chat-api` | Validated token issuer |
| `JWT_AUDIENCE` | `calyx-web` | Validated token audience |
| `JWT_TTL_HOURS` | `24` | Access/session lifetime; range 1–720 hours |
| `CORS_ORIGINS` | local Next.js origins | Comma-separated; wildcard rejected in production |

## Deploy

Build and push the image from `apps/api`:

```bash
docker build -t calyx-chat-api ./apps/api
```

Set `APP_ENV=production`, `DATABASE_URL`, a random `JWT_SECRET`, and explicit HTTPS `CORS_ORIGINS`; expose `14000`, then point Next.js at `NEXT_PUBLIC_CALYX_CHAT_URL`. The frontend switch from Convex is a follow-up.

## Smoke

```bash
bash ./scripts/smoke-chat-api.sh   # or see README curl sequence above
```
