#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3002}"
NODE_VERSION="${NODE_VERSION:-22}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
PLUGIN_REGISTRY="${CLOUDCLI_PLUGIN_NPM_REGISTRY:-https://registry.npmjs.org/}"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm install "$NODE_VERSION" >/dev/null
  nvm use "$NODE_VERSION" >/dev/null
fi

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  echo "Set CLAUDE_CLI_PATH to the reclaude executable path before starting." >&2
  exit 1
fi

cd "$ROOT_DIR"

export CLAUDE_CLI_PATH="$RECLAUDE_PATH"
export CLOUDCLI_PLUGIN_NPM_REGISTRY="$PLUGIN_REGISTRY"
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"
export npm_config_registry="$PLUGIN_REGISTRY"

npm install --registry="$PLUGIN_REGISTRY"
npm run build

exec node dist-server/server/cli.js --port "$PORT"
