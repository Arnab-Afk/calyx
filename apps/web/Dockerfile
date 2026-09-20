# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
ENV CI=true
WORKDIR /repo
RUN corepack enable
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./apps/web/
COPY packages/logger ./packages/logger
RUN cd apps/web && pnpm install --frozen-lockfile
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_CALYX_CHAT_URL
ARG NEXT_PUBLIC_CALYX_MCP_URL
ENV NEXT_PUBLIC_CALYX_CHAT_URL=$NEXT_PUBLIC_CALYX_CHAT_URL
ENV NEXT_PUBLIC_CALYX_MCP_URL=$NEXT_PUBLIC_CALYX_MCP_URL
RUN apps/web/node_modules/.bin/tsc -p packages/logger/tsconfig.json --typeRoots apps/web/node_modules/@types
RUN cd apps/web && pnpm exec next build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
