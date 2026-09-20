#!/usr/bin/env bash
# Poll origin/main every 2 minutes: rebuild compose backends when watched paths change.
set -euo pipefail

ROOT="/vm-storage/projects/calyx"
BRANCH="${CALYX_CHAT_BRANCH:-main}"
REMOTE="${CALYX_CHAT_REMOTE:-origin}"
LOG_DIR="${CALYX_CHAT_LOG_DIR:-$HOME/.local/share/calyx}"
LOGFILE="$LOG_DIR/chat-api-deploy.log"
LOCKFILE="$LOG_DIR/chat-api-deploy.lock"
LAST_FILE="$LOG_DIR/chat-api-last-deployed.sha"
WATCH_PATHS=("apps/api" "src" "Dockerfile" "docker-compose.yml" "package.json" "package-lock.json")

mkdir -p "$LOG_DIR"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "$(date -Is) skip: another deploy running" >>"$LOGFILE"
  exit 0
fi
log() { echo "$(date -Is) $*" | tee -a "$LOGFILE"; }

cd "$ROOT"
log "check start"

# Serialize git fetch/merge with web poller
exec 8>"$LOG_DIR/repo.lock"
flock 8

git fetch --prune --quiet "$REMOTE" "$BRANCH" || { log "ERROR: fetch failed"; exit 1; }

REMOTE_SHA="$(git rev-parse "${REMOTE}/${BRANCH}")"
LAST=""
[[ -f "$LAST_FILE" ]] && LAST="$(tr -d '[:space:]' < "$LAST_FILE")"
if [[ -z "$LAST" ]]; then
  echo "$REMOTE_SHA" >"$LAST_FILE"
  log "baseline ${REMOTE_SHA:0:7}"
  flock -u 8
  exit 0
fi
if [[ "$REMOTE_SHA" == "$LAST" ]]; then
  log "up to date ${REMOTE_SHA:0:7}"
  flock -u 8
  exit 0
fi

CHANGED="$(git diff --name-only "$LAST" "$REMOTE_SHA" -- "${WATCH_PATHS[@]}" || true)"
LOCAL="$(git rev-parse HEAD)"
if [[ "$LOCAL" != "$REMOTE_SHA" ]]; then
  git merge --ff-only "${REMOTE}/${BRANCH}" >>"$LOGFILE" 2>&1 || {
    log "ERROR: ff-only failed"
    flock -u 8
    exit 1
  }
fi
flock -u 8

if [[ -z "$CHANGED" ]]; then
  echo "$REMOTE_SHA" >"$LAST_FILE"
  log "remote advanced but watched paths unchanged"
  exit 0
fi

log "deploy ${LAST:0:7}→${REMOTE_SHA:0:7}"
log "changed:"$'\n'"$CHANGED"

docker compose --profile chat up -d minio >>"$LOGFILE" 2>&1 || true
docker compose --profile chat up --build -d redis ingestion consumer >>"$LOGFILE" 2>&1 || {
  log "ERROR: compose up (intake/consumer) failed"
  exit 1
}
docker compose --profile chat run --rm --no-deps chat-migrate >>"$LOGFILE" 2>&1 || {
  log "ERROR: chat-migrate failed"
  exit 1
}
docker compose --profile chat up --build -d chat-api >>"$LOGFILE" 2>&1 || {
  log "ERROR: chat-api up failed"
  exit 1
}

ok=0
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:14000/health >/dev/null && curl -sf http://127.0.0.1:13100/health >/dev/null; then
    ok=1; break
  fi
  sleep 1
done
[[ "$ok" -eq 1 ]] || { log "ERROR: health failed"; exit 1; }

echo "$REMOTE_SHA" >"$LAST_FILE"
log "deployed ${REMOTE_SHA:0:7}"
