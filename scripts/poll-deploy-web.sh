#!/usr/bin/env bash
# Poll origin/main every 2 minutes: production-build Next.js web when watched paths change.
set -euo pipefail

ROOT="/vm-storage/projects/calyx"
WEB_DIR="$ROOT/apps/web"
BRANCH="${CALYX_WEB_BRANCH:-main}"
REMOTE="${CALYX_WEB_REMOTE:-origin}"
LOG_DIR="${CALYX_WEB_LOG_DIR:-$HOME/.local/share/calyx}"
LOGFILE="$LOG_DIR/web-deploy.log"
LOCKFILE="$LOG_DIR/web-deploy.lock"
LAST_FILE="$LOG_DIR/web-last-deployed.sha"
HEALTH_URL="${CALYX_WEB_HEALTH_URL:-http://127.0.0.1:3016/}"
WATCH_PATHS=("apps/web" "packages/logger")

export PATH="${HOME}/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$LOG_DIR"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "$(date -Is) skip: another web deploy running" >>"$LOGFILE"
  exit 0
fi
log() { echo "$(date -Is) $*" | tee -a "$LOGFILE"; }

cd "$ROOT"
log "check start"

# Serialize git fetch/merge with backend poller
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
    log "ERROR: ff-only merge failed"
    flock -u 8
    exit 1
  }
fi
flock -u 8

if [[ -z "$CHANGED" ]]; then
  echo "$REMOTE_SHA" >"$LAST_FILE"
  log "remote advanced but apps/web unchanged — skip rebuild"
  exit 0
fi

log "deploy needed ${LAST:0:7}→${REMOTE_SHA:0:7}"
log "changed:"$'\n'"$CHANGED"

cd "$WEB_DIR"

log "pnpm install"
if ! pnpm install >>"$LOGFILE" 2>&1; then
  log "ERROR: pnpm install failed"
  exit 1
fi

# Ensure linked logger package builds (prebuild also runs this)
if [[ -f "$ROOT/packages/logger/package.json" ]]; then
  log "build calyx-logger"
  (cd "$ROOT/packages/logger" && pnpm exec tsc -p tsconfig.json 2>/dev/null || npm run build) >>"$LOGFILE" 2>&1 || true
fi

log "pnpm build"
if ! pnpm build >>"$LOGFILE" 2>&1; then
  log "ERROR: build failed — not restarting"
  exit 1
fi

log "restart calyx-web"
systemctl --user restart calyx-web.service

ok=0
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    ok=1
    break
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  log "ERROR: health check failed after restart"
  systemctl --user status calyx-web.service --no-pager >>"$LOGFILE" 2>&1 || true
  exit 1
fi

echo "$REMOTE_SHA" >"$LAST_FILE"
log "deployed ${REMOTE_SHA:0:7} health=$(curl -sf -o /dev/null -w '%{http_code}' "$HEALTH_URL")"
exit 0
