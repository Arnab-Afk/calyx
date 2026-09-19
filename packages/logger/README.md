# `calyx-logger`

Ship frontend (and Node) logs to Calyx with env vars — no Vercel Pro drain required.

## Install

```bash
npm i calyx-logger
```

## 1. Create a frontend source

```bash
# from the Calyx repo / CLI
calyx sources create --project my-app --role frontend --service web
```

Copy the `calyx_src_…` token (shown once).

## 2. Env

**Next.js**

```env
NEXT_PUBLIC_CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
NEXT_PUBLIC_CALYX_SOURCE_TOKEN=calyx_src_…
NEXT_PUBLIC_CALYX_SERVICE=web
```

**Vite**

```env
VITE_CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
VITE_CALYX_SOURCE_TOKEN=calyx_src_…
```

## 3. Init once (browser)

```ts
// app/instrumentation-client.ts  (Next.js 15+)
// or app/layout.tsx / a client providers file
'use client'
import { init } from 'calyx-logger/browser'

init()
```

That turns on:

- `console.error` / `console.warn` → Calyx
- `window.onerror` + `unhandledrejection`
- batched `POST` to `/v1/logs` with your source token
- flush on `pagehide` / tab hidden

Manual logs:

```ts
import { error, info, captureException } from 'calyx-logger/browser'

info('checkout opened')
error('payment failed', { orderId: '…' })
captureException(err)
```

## Node / server (no DOM hooks)

```ts
import { createClient } from 'calyx-logger'

const log = createClient() // reads CALYX_INTAKE_URL + CALYX_SOURCE_TOKEN
log.error('job failed', { jobId: '…' })
await log.flush()
```

Use a **separate** backend source token (not `NEXT_PUBLIC_`) for servers.

## Security

The frontend token is visible in the browser bundle. It must be a **write-only** Calyx source token (`calyx_src_…`). Do not put management or MCP keys in `NEXT_PUBLIC_*`.

## Publish (maintainers)

```bash
cd packages/logger
npm login
npm run build
npm publish --access public
```

## Local link (before publish)

```bash
cd packages/logger && npm run build && npm link
# in your Next app
npm link calyx-logger
```
