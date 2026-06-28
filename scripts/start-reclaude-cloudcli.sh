#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
PORT="${PORT:-3002}"
NODE_VERSION="${NODE_VERSION:-22}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
NPM_REGISTRY="${NPM_REGISTRY:-${CLOUDCLI_PLUGIN_NPM_REGISTRY:-https://registry.npmjs.org/}}"
NODE_MIRROR="${NODE_MIRROR:-${NVM_NODEJS_ORG_MIRROR:-}}"
LOCAL_PROXY_URL="${LOCAL_PROXY_URL:-}"

if [[ "${USE_LOCAL_PROXY:-0}" == "1" && -z "$LOCAL_PROXY_URL" ]]; then
  for proxy_port in 7897 7890; do
    if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$proxy_port" >/dev/null 2>&1; then
      LOCAL_PROXY_URL="http://127.0.0.1:${proxy_port}"
      break
    fi
  done
fi

if [[ -n "$LOCAL_PROXY_URL" ]]; then
  export HTTP_PROXY="${HTTP_PROXY:-$LOCAL_PROXY_URL}"
  export HTTPS_PROXY="${HTTPS_PROXY:-$LOCAL_PROXY_URL}"
  export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}"
fi

if [[ -n "$NODE_MIRROR" ]]; then
  export NVM_NODEJS_ORG_MIRROR="$NODE_MIRROR"
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  if [[ "$(nvm version "$NODE_VERSION" 2>/dev/null || true)" == "N/A" ]]; then
    nvm install "$NODE_VERSION" >/dev/null
  fi
  nvm use "$NODE_VERSION" >/dev/null
fi

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  echo "Set CLAUDE_CLI_PATH to the reclaude executable path before starting." >&2
  exit 1
fi

cd "$ROOT_DIR"

export CLAUDE_CLI_PATH="$RECLAUDE_PATH"
export CLOUDCLI_PLUGIN_NPM_REGISTRY="$NPM_REGISTRY"
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"
export npm_config_registry="$NPM_REGISTRY"

npm install --registry="$NPM_REGISTRY"
npm run build

exec node dist-server/server/cli.js --port "$PORT"
