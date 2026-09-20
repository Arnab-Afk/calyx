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
curl -sf "$BASE/v1/workspaces/$WS_ID/info" -H "Authorization: Bearer $TOKEN" >/dev/null
curl -sf "$BASE/v1/workspaces/$WS_ID/members/me" -H "Authorization: Bearer $TOKEN" >/dev/null
curl -sf -X PATCH "$BASE/v1/workspaces/$WS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-renamed"}' >/dev/null

CHS=$(curl -sf "$BASE/v1/workspaces/$WS_ID/channels" -H "Authorization: Bearer $TOKEN")
CH_ID=$(echo "$CHS" | python3 -c "import sys,json; print(json.load(sys.stdin)['channels'][0]['id'])")
echo "channel $CH_ID"
curl -sf "$BASE/v1/channels/$CH_ID" -H "Authorization: Bearer $TOKEN" >/dev/null

MSG=$(curl -sf -X POST "$BASE/v1/channels/$CH_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"hello from smoke"}')
MSG_ID=$(echo "$MSG" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "message $MSG_ID"
curl -sf "$BASE/v1/messages/$MSG_ID" -H "Authorization: Bearer $TOKEN" >/dev/null

PNG=$(mktemp)
trap 'rm -f "$PNG"' EXIT
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' | base64 -d > "$PNG"
UPLOAD=$(curl -sf -X POST "$BASE/v1/workspaces/$WS_ID/uploads" \
  -H "Authorization: Bearer $TOKEN" -F "file=@$PNG;type=image/png")
UPLOAD_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
UPLOAD_URL=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
curl -sf -X POST "$BASE/v1/channels/$CH_ID/messages" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"body\":\"image smoke\",\"imageId\":\"$UPLOAD_ID\"}" >/dev/null
curl -sf "$BASE$UPLOAD_URL" -H "Authorization: Bearer $TOKEN" >/dev/null

curl -sf -X DELETE "$BASE/v1/workspaces/$WS_ID" -H "Authorization: Bearer $TOKEN" >/dev/null
echo "OK"
