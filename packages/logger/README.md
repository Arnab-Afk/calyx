# `calyx-logger`

Ship **frontend** and **backend** logs to Calyx with env vars — no Vercel Pro drain required.

## Install

```bash
npm i calyx-logger
```

## Frontend (browser)

```bash
calyx sources create --project my-app --role frontend --service web
```

```env
NEXT_PUBLIC_CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
NEXT_PUBLIC_CALYX_SOURCE_TOKEN=calyx_src_…   # frontend write token
NEXT_PUBLIC_CALYX_SERVICE=web
```

```ts
'use client'
import { init } from 'calyx-logger/browser'
init()
```

Captures `console.error` / `warn`, `window.onerror`, unhandled rejections; flushes on tab hide.

```ts
import { error, info, captureException } from 'calyx-logger/browser'
info('checkout opened')
captureException(err)
```

## Backend (Node / Next server / workers)

```bash
calyx sources create --project my-app --role backend --service api
```

```env
CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
CALYX_SOURCE_TOKEN=calyx_src_…   # backend write token (NOT NEXT_PUBLIC_)
CALYX_SERVICE=api
```

```ts
// instrumentation.ts, server.ts, or worker entry — once at startup
import { init, error, captureException } from 'calyx-logger'

init()
error('payment failed', { orderId: '…' })
captureException(err)
```

That turns on:

- `console.error` / `console.warn` → Calyx
- `uncaughtException` + `unhandledRejection`
- flush on `beforeExit` / `SIGTERM` / `SIGINT`

Manual client without global hooks:

```ts
import { createClient } from 'calyx-logger'

const log = createClient()
log.error('job failed', { jobId: '…' })
await log.flush()
```

Use **separate** source tokens for frontend vs backend.

## Next.js (both)

| Surface | Import | Env |
|---|---|---|
| Client components | `calyx-logger/browser` | `NEXT_PUBLIC_CALYX_*` |
| Server / route handlers / `instrumentation.ts` | `calyx-logger` | `CALYX_*` |

## Security

Frontend tokens are public in the bundle — use write-only `calyx_src_…` only. Never put management or MCP keys in `NEXT_PUBLIC_*`.

## Publish (maintainers)

```bash
cd packages/logger
npm run build
npm publish --access public
```
