# Calyx Web

Slack-style workspace UI for Calyx. Chat stays familiar; Calyx AI replies can include Grafana-like charts from observability data.

## Run

```bash
pnpm install
cp .env.example .env.local   # or create with NEXT_PUBLIC_CONVEX_URL + CALYX_API_URL
pnpm exec convex dev         # terminal 1
pnpm dev                     # terminal 2 — http://localhost:3000
```

Ask Calyx in a channel: `/calyx why are errors spiking?`

`CALYX_API_URL` should point at the Calyx ingestion API (default `http://localhost:13000` or `3000`).
