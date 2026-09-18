# Calyx Web

Slack-style workspace UI for Calyx. Chat stays familiar; Calyx AI replies can include Grafana-like charts from observability data.

## Run on any machine

### Prerequisites
- Node 20+ (or 24) and `pnpm`
- A Convex account ([dashboard.convex.dev](https://dashboard.convex.dev))
- Optional: Calyx backend reachable for `/calyx` asks (`CALYX_API_URL`)

### 1. Clone and install
```bash
git clone https://github.com/Arnab-Afk/calyx.git
cd calyx/apps/web
pnpm install
```

### 2. Link Convex (first time on this machine)
```bash
pnpm exec convex login
pnpm exec convex dev
```
When prompted, pick the existing project (**slacktry** / team **arnab-bhowmik**) or create a new one.  
This writes into `.env.local`:
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_SITE_URL`

Leave `convex dev` running in this terminal (or re-run it whenever you change `convex/`).

### 3. Auth keys (once per Convex deployment)
```bash
node node_modules/@convex-dev/auth/dist/bin.cjs \
  --skip-git-check \
  --web-server-url 'http://localhost:3000'

# If the UI is served on a public host instead:
# --web-server-url 'https://calyx.arnabbhowmik.in'
pnpm exec convex env set SITE_URL "http://localhost:3000"
```
Confirm: `pnpm exec convex env list` shows `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`.

### 4. App env
```bash
cat >> .env.local <<'EOF'
CALYX_API_URL=http://127.0.0.1:13000
NEXT_PUBLIC_CALYX_TENANT_ID=default
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```
Point `CALYX_API_URL` at wherever Calyx ingestion runs (local Docker or remote).

### 5. Start Next.js (second terminal)
```bash
pnpm dev
# http://localhost:3000
```

### 6. Sign up
Open `/auth` → **Sign up** with email + password (Google/GitHub optional).

Ask Calyx in a channel: `/calyx why are errors spiking?`

## Notes
- Do **not** commit `.env.local`.
- Same Convex project can be shared across machines via `convex login` + existing project.
- Charts register Chart.js scales before first paint; hard-refresh if an old tab still errors.
