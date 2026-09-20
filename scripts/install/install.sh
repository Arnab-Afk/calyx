#!/usr/bin/env bash
# Calyx installer — curl -fsSL https://calyx-intake.arnabbhowmik.in/install | bash
set -euo pipefail

CALYX_HOME="${CALYX_HOME:-$HOME/.calyx}"
BIN_DIR="${CALYX_BIN_DIR:-$HOME/.local/bin}"
INTAKE_URL="${CALYX_API_URL:-https://calyx-intake.arnabbhowmik.in}"
INTAKE_URL="${INTAKE_URL%/}"
AGENT_URL="${CALYX_AGENT_URL:-$INTAKE_URL/install/calyx-agent.mjs}"
WEB_URL="${CALYX_WEB_URL:-https://calyx.arnabbhowmik.in}"

# Always write UI to the real TTY so `$(…)` capture never swallows prompts/menus.
ui() { printf '%s\n' "$*" >/dev/tty; }
bold() { printf '\033[1m%s\033[0m\n' "$*" >/dev/tty; }
dim() { printf '\033[2m%s\033[0m\n' "$*" >/dev/tty; }
ok() { printf '✓ %s\n' "$*" >/dev/tty; }
die() { printf 'Error: %s\n' "$*" >/dev/tty; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [ "${major:-0}" -ge 18 ]; then
      ok "Node $(node -v)"
      return
    fi
    die "Node 18+ required (found $(node -v)). Install from https://nodejs.org and re-run."
  fi
  die "Node.js 18+ is required. Install it, then re-run this installer."
}

prompt_choice() {
  local prompt="$1"
  local default="${2:-}"
  local answer=""
  if [ -n "$default" ]; then
    printf '%s [%s]: ' "$prompt" "$default" >/dev/tty
  else
    printf '%s: ' "$prompt" >/dev/tty
  fi
  # Read from the real TTY even when stdin is the curl pipe.
  IFS= read -r answer </dev/tty || true
  if [ -z "$answer" ]; then
    answer="$default"
  fi
  printf '%s' "$answer"
}

# Prints ONLY the machine type on stdout (for capture). All UI → /dev/tty.
select_machine_type() {
  if [ -n "${CALYX_MACHINE_TYPE:-}" ]; then
    printf '%s' "$CALYX_MACHINE_TYPE"
    return
  fi

  bold ""
  bold "How are apps hosted on this machine?"
  cat >/dev/tty <<EOF
  1) systemd / journalctl  — Linux services (nginx, node as a unit, …)
  2) PM2                  — Node apps via pm2
  3) Docker               — containers on this host
  4) Log file             — tail a file (supervisor, custom apps, …)
  5) Kubernetes           — kubectl logs on this cluster context
  6) Install CLI only     — install \`calyx\`, configure later
EOF
  local choice
  choice="$(prompt_choice "Select number" "1")"
  case "$choice" in
    1|linux|journal|journald|vm|systemd) printf 'linux' ;;
    2|pm2) printf 'pm2' ;;
    3|docker) printf 'docker' ;;
    4|file|log|logs) printf 'file' ;;
    5|k8s|kubernetes|kubectl) printf 'k8s' ;;
    6|cli|only) printf 'cli' ;;
    *) die "Unknown selection: $choice" ;;
  esac
}

install_agent() {
  mkdir -p "$CALYX_HOME/bin" "$BIN_DIR"
  local dest="$CALYX_HOME/bin/calyx-agent.mjs"
  local wrapper="$CALYX_HOME/bin/calyx"

  bold "Downloading Calyx agent…"
  dim "  $AGENT_URL"
  curl -fsSL "$AGENT_URL" -o "$dest"
  chmod 644 "$dest"

  cat >"$wrapper" <<EOF
#!/usr/bin/env bash
exec node "$dest" "\$@"
EOF
  chmod 755 "$wrapper"

  ln -sfn "$wrapper" "$BIN_DIR/calyx"
  ok "Installed calyx → $BIN_DIR/calyx"

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      bold ""
      bold "Add to your PATH (new shells):"
      cat >/dev/tty <<EOF
  echo 'export PATH="\$HOME/.local/bin:\$PATH"' >> ~/.bashrc
  # or: echo 'export PATH="\$HOME/.local/bin:\$PATH"' >> ~/.zshrc
EOF
      export PATH="$BIN_DIR:$PATH"
      ;;
  esac
}

run_setup() {
  local machine="$1"
  local calyx_bin="$BIN_DIR/calyx"

  if [ ! -x "$calyx_bin" ]; then
    die "calyx binary missing at $calyx_bin"
  fi

  case "$machine" in
    linux|journal|journald|vm|systemd)
      bold ""
      bold "Starting journald setup (browser login → project → service)…"
      exec "$calyx_bin" journal || "$calyx_bin" journal
      ;;
    pm2)
      bold ""
      bold "Starting PM2 setup…"
      exec "$calyx_bin" pm2 || "$calyx_bin" pm2
      ;;
    docker)
      bold ""
      bold "Starting Docker log setup…"
      exec "$calyx_bin" docker || "$calyx_bin" docker
      ;;
    file|log|logs)
      bold ""
      bold "Starting log-file setup…"
      exec "$calyx_bin" file || "$calyx_bin" file
      ;;
    k8s|kubernetes|kubectl)
      bold ""
      bold "Starting Kubernetes log setup…"
      exec "$calyx_bin" k8s || "$calyx_bin" k8s
      ;;
    cli|only)
      bold ""
      ok "CLI ready. Next:"
      cat >/dev/tty <<EOF
  calyx journal     # systemd / journalctl
  calyx pm2         # PM2 apps
  calyx docker      # Docker containers
  calyx file        # tail a log file
  calyx k8s         # kubectl logs
  calyx status
  calyx --help
EOF
      ;;
    *)
      die "Unknown machine type: $machine"
      ;;
  esac
}

main() {
  bold "Calyx install"
  dim "Intake: $INTAKE_URL"
  dim "App:    $WEB_URL"
  need_cmd curl
  ensure_node

  local machine
  machine="$(select_machine_type | tr -d '[:space:]')"
  [ -n "$machine" ] || die "No machine type selected"
  ok "Machine type: $machine"

  install_agent
  run_setup "$machine"
}

main "$@"
