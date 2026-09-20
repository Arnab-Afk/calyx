# Calyx landing

Standalone public marketing site for Calyx. It is intentionally isolated from `apps/web`, which remains the authenticated product application.

## Development

```bash
pnpm install
NEXT_PUBLIC_CALYX_APP_URL=http://localhost:3000/auth pnpm dev
```

The landing site runs on `http://localhost:3001` by default. `NEXT_PUBLIC_CALYX_APP_URL` controls every sign-in/open-product link and should point at the deployed `apps/web` authentication URL.

## Validation

```bash
pnpm typecheck
pnpm build
pnpm audit --prod --audit-level moderate
```
