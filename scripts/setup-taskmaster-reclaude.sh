#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
NODE_VERSION="${NODE_VERSION:-22}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org/}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
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
  nvm install "$NODE_VERSION" >/dev/null
  nvm use "$NODE_VERSION" >/dev/null
fi

export npm_config_registry="$NPM_REGISTRY"
if [[ "${FORCE_TASKMASTER_INSTALL:-0}" == "1" ]] || ! command -v task-master >/dev/null 2>&1 || ! command -v task-master-ai >/dev/null 2>&1; then
  npm install -g task-master-ai --registry="$NPM_REGISTRY"
else
  echo "task-master-ai already installed: $(task-master --version 2>/dev/null || true)"
fi

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  exit 1
fi

if "$RECLAUDE_PATH" mcp list 2>/dev/null | grep -q '^task-master-ai:'; then
  echo "task-master-ai MCP server already configured"
else
  "$RECLAUDE_PATH" mcp add task-master-ai --scope user --env TASK_MASTER_TOOLS=core -- "$(command -v task-master-ai)"
fi

"$RECLAUDE_PATH" mcp list
