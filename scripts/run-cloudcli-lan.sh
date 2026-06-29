#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PORT=3001
NODE_VERSION="${NODE_VERSION:-22}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
NPM_REGISTRY="${NPM_REGISTRY:-${CLOUDCLI_PLUGIN_NPM_REGISTRY:-https://registry.npmjs.org/}}"

export PATH="$HOME/.local/bin:$PATH"

stop_existing_port_listener() {
  local existing_pids
  existing_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs || true)"
  if [[ -z "$existing_pids" ]]; then
    return 0
  fi

  echo "Stopping existing listener(s) on fixed CloudCLI port $PORT: $existing_pids"
  # shellcheck disable=SC2086
  kill $existing_pids 2>/dev/null || true

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Force stopping listener(s) on fixed CloudCLI port $PORT: $existing_pids" >&2
  # shellcheck disable=SC2086
  kill -9 $existing_pids 2>/dev/null || true
  sleep 1

  if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is still occupied after kill attempts:" >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
    exit 1
  fi
}

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  if [[ "$(nvm version "$NODE_VERSION" 2>/dev/null || true)" == "N/A" ]]; then
    nvm install "$NODE_VERSION" >/dev/null
  fi
  nvm use "$NODE_VERSION" >/dev/null
else
  node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
  if [[ -z "$node_major" || "$node_major" -lt 22 ]]; then
    echo "Node 22+ or nvm is required. Install nvm or put Node 22+ on PATH." >&2
    exit 1
  fi
fi

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  echo "Set CLAUDE_CLI_PATH to the reclaude executable path before starting." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -f dist-server/server/cli.js ]]; then
  echo "Missing dist-server/server/cli.js. Run npm run build before starting." >&2
  exit 1
fi

stop_existing_port_listener

export SERVER_PORT="$PORT"
export HOST="${HOST:-0.0.0.0}"
export CLAUDE_CLI_PATH="$RECLAUDE_PATH"
export CLOUDCLI_PLUGIN_NPM_REGISTRY="$NPM_REGISTRY"
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"

exec node dist-server/server/cli.js start --port "$PORT"
