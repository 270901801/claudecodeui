#!/usr/bin/env bash
set -euo pipefail

RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
CLAUDE_ALIAS_PATH="${CLAUDE_ALIAS_PATH:-$HOME/.local/bin/claude}"
CLAUDE_BACKUP_PATH="${CLAUDE_BACKUP_PATH:-$HOME/.local/bin/claude-original}"
PATH_MARKER="cloudcli-reclaude-path"
ALIAS_MARKER="cloudcli-reclaude-alias"

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$CLAUDE_ALIAS_PATH")"

if [[ -e "$CLAUDE_ALIAS_PATH" || -L "$CLAUDE_ALIAS_PATH" ]]; then
  if grep -q "$ALIAS_MARKER" "$CLAUDE_ALIAS_PATH" 2>/dev/null; then
    :
  elif [[ "$(readlink "$CLAUDE_ALIAS_PATH" 2>/dev/null || true)" == "$RECLAUDE_PATH" ]]; then
    :
  else
    if [[ ! -e "$CLAUDE_BACKUP_PATH" && ! -L "$CLAUDE_BACKUP_PATH" ]]; then
      mv "$CLAUDE_ALIAS_PATH" "$CLAUDE_BACKUP_PATH"
      echo "Backed up existing claude command to $CLAUDE_BACKUP_PATH"
    else
      rm -f "$CLAUDE_ALIAS_PATH"
      echo "Removed existing claude command because backup already exists at $CLAUDE_BACKUP_PATH"
    fi
  fi
fi

cat > "$CLAUDE_ALIAS_PATH" <<EOF
#!/usr/bin/env bash
# $ALIAS_MARKER
if [[ "\${RECLAUDE_ALIAS_DEPTH:-0}" == "1" && -x "$CLAUDE_BACKUP_PATH" ]]; then
  exec "$CLAUDE_BACKUP_PATH" "\$@"
fi
export RECLAUDE_ALIAS_DEPTH=1
exec "$RECLAUDE_PATH" "\$@"
EOF
chmod +x "$CLAUDE_ALIAS_PATH"

ensure_local_bin_path() {
  local profile_file="$1"
  touch "$profile_file"
  if ! grep -q "$PATH_MARKER" "$profile_file"; then
    {
      echo ""
      echo "# >>> $PATH_MARKER >>>"
      echo 'export PATH="$HOME/.local/bin:$PATH"'
      echo "# <<< $PATH_MARKER <<<"
    } >> "$profile_file"
  fi
}

ensure_local_bin_path "$HOME/.zprofile"
ensure_local_bin_path "$HOME/.zshrc"

echo "claude now resolves to: $CLAUDE_ALIAS_PATH"
"$CLAUDE_ALIAS_PATH" mcp list
