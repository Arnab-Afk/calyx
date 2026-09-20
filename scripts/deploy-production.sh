#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production}"
COMPOSE_FILE="deploy/compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing production env file: $ENV_FILE" >&2
  exit 1
fi

export CALYX_ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
node --env-file="$CALYX_ENV_FILE" scripts/production-preflight.mjs

docker compose --env-file "$CALYX_ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$CALYX_ENV_FILE" -f "$COMPOSE_FILE" pull

services=(intake consumer detector mcp chat-api)
if [[ "${REQUIRE_SLACK:-$(node --env-file="$CALYX_ENV_FILE" -p 'process.env.REQUIRE_SLACK ?? "false"')}" == "true" ]]; then
  services+=(slack)
fi

docker compose --env-file "$CALYX_ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans --wait "${services[@]}"
node --env-file="$CALYX_ENV_FILE" scripts/production-preflight.mjs --probe

echo "Production services are ready. Deploy the web image separately, then run the end-to-end runbook."
