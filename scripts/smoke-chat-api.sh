#!/usr/bin/env bash
set -euo pipefail
BASE="${CALYX_CHAT_URL:-http://127.0.0.1:14000}"

echo "health: $(curl -sf "$BASE/health")"

EMAIL="smoke-$(date +%s)@example.com"
REG=$(curl -sf -X POST "$BASE/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"name\":\"Smoke\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "registered $EMAIL"

WS=$(curl -sf -X POST "$BASE/v1/workspaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-ws"}')
WS_ID=$(echo "$WS" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])")
echo "workspace $WS_ID"

CHS=$(curl -sf "$BASE/v1/workspaces/$WS_ID/channels" -H "Authorization: Bearer $TOKEN")
CH_ID=$(echo "$CHS" | python3 -c "import sys,json; print(json.load(sys.stdin)['channels'][0]['id'])")
echo "channel $CH_ID"

MSG=$(curl -sf -X POST "$BASE/v1/channels/$CH_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"hello from smoke"}')
echo "message $(echo "$MSG" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"
echo "OK"
