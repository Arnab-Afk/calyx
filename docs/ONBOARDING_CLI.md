# Calyx CLI onboarding

Connect a project’s **frontend + backend logs**, **GitHub repo**, and **Slack alert channel** from the terminal (Sazabi-style).

## Prerequisites

```bash
docker compose up -d postgres redis
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx npm run migrate
PORT=13000 npm run dev:ingestion
# optional: npm run dev:consumer   # persists events from Redis → Postgres
```

Create a management token (shown once):

```bash
DATABASE_URL=postgres://calyx:calyx@localhost:15432/calyx \
  npm run mgmt:key -- create -t default -n "local-cli"
```

## Login

```bash
npm run cli -- login --token calyx_mgmt_… --api-url http://127.0.0.1:13000 --tenant default
```

Config is stored at `~/.calyx/config.json`.

## Guided wizard

```bash
npm run cli -- onboard
```

Creates a project, FE + BE log sources (prints write tokens), optionally waits for first events, connects GitHub webhook, binds Slack, and can post a test alert.

Skip steps:

```bash
npm run cli -- onboard --skip-verify --skip-github --skip-slack
```

## Stepwise commands

```bash
npm run cli -- projects create my-app --env production
npm run cli -- sources create --project my-app --role frontend --service web
npm run cli -- sources create --project my-app --role backend --service api
npm run cli -- sources status --project my-app --wait 60

npm run cli -- github connect --project my-app --repo owner/repo
# Add the printed webhook URL + secret in GitHub → Settings → Webhooks (push)

npm run cli -- slack connect --project my-app
npm run cli -- slack test --project my-app
```

## Sending logs (source write token)

After `sources create`, Calyx prints a `calyx_src_…` token (once).

```bash
curl -X POST http://127.0.0.1:13000/v1/logs \
  -H "Authorization: Bearer $CALYX_SOURCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-09-19T12:00:00.000Z","level":"error","message":"checkout 500","attributes":{}}'
```

`service` defaults to the source’s configured service. Legacy `X-Tenant-ID` ingest still works without a source token.

## Vercel Log Drain (from zero)

Vercel ships logs to Calyx over HTTPS — no SDK in your Next app. Requires a **public HTTPS** intake URL (`CALYX_PUBLIC_URL` or `CALYX_INTAKE_URL`) and a Vercel plan that supports [Drains](https://vercel.com/docs/drains).

```bash
# 1. Create a Vercel-backed source (prints drain URL + signature secret once)
npm run cli -- sources create \
  --project my-app \
  --provider vercel \
  --role frontend \
  --service web \
  --name vercel-prod

# 2. In Vercel → Team Settings → Drains → Add → Custom Endpoint
#    Endpoint URL:          <drainUrl from CLI>
#    Format:                JSON
#    Signature secret:      <drainSecret from CLI>
#    Log sources:           lambda, edge  (+ build optional)
#    Environments:          production

# 3. Wait for first delivery
npm run cli -- sources status --project my-app --wait 60
```

Local tunnel example (intake must be reachable by Vercel):

```bash
# terminal A
CALYX_PUBLIC_URL=https://abc123.ngrok-free.app PORT=13000 npm run dev:ingestion

# terminal B — after creating the vercel source, point Vercel at:
#   https://abc123.ngrok-free.app/v1/drains/vercel/<sourceId>
```

Calyx handles the `x-vercel-verify` handshake and verifies `x-vercel-signature` (HMAC-SHA1) against the stored drain secret. Batches may be JSON arrays or NDJSON.

Simulate a signed delivery without Vercel:

```bash
SECRET='<drainSecret>'
BODY='[{"id":"1","deploymentId":"dpl_x","source":"lambda","host":"app.vercel.app","timestamp":1710000000000,"projectId":"prj_x","level":"error","message":"checkout failed","statusCode":500}]'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha1',process.env.SECRET).update(process.env.BODY).digest('hex'))" )
# PowerShell: set SECRET/BODY then compute SIG similarly

curl -X POST "http://127.0.0.1:13000/v1/drains/vercel/<sourceId>" \
  -H "Content-Type: application/json" \
  -H "x-vercel-signature: $SIG" \
  -d "$BODY"
```

## Ask after connect

```bash
npm run cli -- ask -t default "any errors in the last hour?"
```

## API surface

| Method | Path |
|---|---|
| `POST` | `/v1/projects` |
| `GET` | `/v1/projects` |
| `GET` | `/v1/projects/:id` |
| `POST` | `/v1/projects/:id/sources` (`provider`: `http` \| `vercel`) |
| `GET` | `/v1/projects/:id/sources` |
| `POST` | `/v1/projects/:id/github` |
| `POST` | `/v1/projects/:id/slack` |
| `POST` | `/v1/projects/:id/slack/test` |
| `POST` | `/v1/webhooks/github/:projectId` |
| `POST` | `/v1/drains/vercel/:sourceId` |
| `POST` | `/v1/logs` (Bearer source token **or** `X-Tenant-ID`) |

Management routes require `Authorization: Bearer calyx_mgmt_…`.

## Not in v1

- Web onboarding UI
- Full GitHub App OAuth
- Published `@calyx/logger` SDK
- Autonomous detector → Slack loop (use `slack test` for connectivity)
- Auto-provisioning drains via Vercel API (dashboard paste of URL + secret for now)
