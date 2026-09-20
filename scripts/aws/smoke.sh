#!/usr/bin/env bash
set -euo pipefail

TF_DIR="${TF_DIR:-infra/aws}"
urls=$(terraform -chdir="$TF_DIR" output -json urls)
WEB=$(jq -r .web <<<"$urls")
CHAT=$(jq -r .chat <<<"$urls")
INTAKE=$(jq -r .intake <<<"$urls")
MCP=$(jq -r .mcp <<<"$urls")

curl --fail --silent --show-error "$WEB/" >/dev/null
curl --fail --silent --show-error "$CHAT/ready" | jq -e '.status == "ready"'
curl --fail --silent --show-error "$INTAKE/ready" | jq -e '.status == "ready"'
curl --fail --silent --show-error "${MCP%/mcp}/health" | jq -e '.status == "ok"'
curl --fail --silent --show-error "${MCP%/mcp}/.well-known/oauth-protected-resource/mcp" | jq -e '.resource != null'

CALYX_CHAT_URL="$CHAT" ./scripts/smoke-chat-api.sh

if [[ -n "${CALYX_SOURCE_TOKEN:-}" && -n "${CALYX_LOGS_URL:-}" ]]; then
  marker="aws-smoke-$(date +%s)"
  curl --fail --silent --show-error -X POST "$CALYX_LOGS_URL" \
    -H "Authorization: Bearer $CALYX_SOURCE_TOKEN" \
    -H 'Content-Type: application/json' \
    --data "{\"events\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"$marker\",\"service\":\"aws-smoke\"}]}" >/dev/null
  echo "Submitted telemetry marker $marker"
fi

echo "AWS public smoke passed."
