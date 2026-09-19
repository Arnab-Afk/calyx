# `calyx-logger`

Ship frontend and backend logs to Calyx.

## Next.js plugin (recommended)

```bash
npm i calyx-logger
```

```env
NEXT_PUBLIC_CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
NEXT_PUBLIC_CALYX_SOURCE_TOKEN=calyx_src_…   # frontend write token
NEXT_PUBLIC_CALYX_SERVICE=web
```

```js
// next.config.mjs
import { withCalyxLogger } from 'calyx-logger/next'

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withCalyxLogger(nextConfig)
```

That’s it — no providers, no layout edits. Captures `console.error` / `warn`, window errors, and unhandled rejections.

Create the token with:
```bash
calyx sources create --project my-app --role frontend --service web
```

## Backend (Node)

Separate source token (not `NEXT_PUBLIC_`):

```env
CALYX_INTAKE_URL=https://your-calyx-host/v1/logs
CALYX_SOURCE_TOKEN=calyx_src_…
CALYX_SERVICE=api
```

```ts
import { init } from 'calyx-logger'
init()
```

## Manual browser (non-Next)

```ts
import { init } from 'calyx-logger/browser'
init({
  intakeUrl: import.meta.env.VITE_CALYX_INTAKE_URL,
  token: import.meta.env.VITE_CALYX_SOURCE_TOKEN,
})
```

## Security

Frontend tokens are visible in the bundle — use write-only `calyx_src_…` only.
