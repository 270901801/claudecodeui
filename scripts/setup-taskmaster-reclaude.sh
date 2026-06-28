#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org/}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm install "$NODE_VERSION" >/dev/null
  nvm use "$NODE_VERSION" >/dev/null
fi

npm install -g task-master-ai --registry="$NPM_REGISTRY"

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
