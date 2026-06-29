#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${CLOUDCLI_REPO_URL:-https://github.com/270901801/claudecodeui.git}"
BRANCH="${CLOUDCLI_BRANCH:-main}"
INSTALL_DIR="${CLOUDCLI_INSTALL_DIR:-$HOME/code/claudecodeui}"
readonly PORT=3001
NODE_VERSION="${NODE_VERSION:-22}"
USE_CN_MIRROR="${USE_CN_MIRROR:-1}"
USE_LOCAL_PROXY="${USE_LOCAL_PROXY:-1}"
RECLAUDE_PATH="${CLAUDE_CLI_PATH:-$HOME/.local/bin/reclaude}"
SCREEN_NAME="${CLOUDCLI_SCREEN_NAME:-cloudcli-reclaude-$PORT}"
ADMIN_USERNAME="${CLOUDCLI_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${CLOUDCLI_ADMIN_PASSWORD:-123456}"
REGISTER_ADMIN="${CLOUDCLI_REGISTER_ADMIN:-1}"

if [[ "$USE_CN_MIRROR" == "1" ]]; then
  export NODE_MIRROR="${NODE_MIRROR:-https://npmmirror.com/mirrors/node}"
  export NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com/}"
else
  export NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org/}"
fi

export USE_LOCAL_PROXY
export CLAUDE_CLI_PATH="$RECLAUDE_PATH"
export NODE_VERSION
export PORT

if [[ ! -x "$RECLAUDE_PATH" ]]; then
  echo "reclaude not found or not executable: $RECLAUDE_PATH" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v screen >/dev/null 2>&1; then
  echo "screen is required" >&2
  exit 1
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  if [[ -n "${NODE_MIRROR:-}" ]]; then
    export NVM_NODEJS_ORG_MIRROR="$NODE_MIRROR"
  fi
  if [[ "$(nvm version "$NODE_VERSION" 2>/dev/null || true)" == "N/A" ]]; then
    nvm install "$NODE_VERSION"
  fi
  nvm use "$NODE_VERSION"
else
  node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
  if [[ -z "$node_major" || "$node_major" -lt 22 ]]; then
    echo "Node 22+ or nvm is required. Install nvm or put Node 22+ on PATH." >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

chmod +x scripts/setup-reclaude-claude-alias.sh \
  scripts/setup-taskmaster-reclaude.sh \
  scripts/start-reclaude-cloudcli.sh \
  scripts/run-cloudcli-lan.sh

./scripts/setup-reclaude-claude-alias.sh
./scripts/setup-taskmaster-reclaude.sh

screen -S "$SCREEN_NAME" -X quit >/dev/null 2>&1 || true
existing_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$existing_pids" ]]; then
  echo "Stopping existing listener(s) on port $PORT: $existing_pids"
  # shellcheck disable=SC2086
  kill $existing_pids 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Force stopping existing listener(s) on port $PORT: $existing_pids"
    # shellcheck disable=SC2086
    kill -9 $existing_pids 2>/dev/null || true
    sleep 1
  fi
fi

start_script="$(mktemp -t cloudcli-reclaude-start.XXXXXX)"
cat > "$start_script" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$INSTALL_DIR"
export USE_LOCAL_PROXY="$USE_LOCAL_PROXY"
export NODE_VERSION="$NODE_VERSION"
export PORT="$PORT"
export CLAUDE_CLI_PATH="$RECLAUDE_PATH"
export NPM_REGISTRY="$NPM_REGISTRY"
export CLOUDCLI_PLUGIN_NPM_REGISTRY="$NPM_REGISTRY"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
EOF

if [[ -n "${NODE_MIRROR:-}" ]]; then
  echo "export NODE_MIRROR=\"$NODE_MIRROR\"" >> "$start_script"
fi

cat >> "$start_script" <<'EOF'
./scripts/start-reclaude-cloudcli.sh
EOF
chmod +x "$start_script"

log_file="$HOME/${SCREEN_NAME}.log"
: > "$log_file"
screen -dmS "$SCREEN_NAME" /bin/bash -lc "$start_script >> '$log_file' 2>&1"

echo "Waiting for CloudCLI on port $PORT..."
for _ in {1..30}; do
  if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "CloudCLI did not start on port $PORT. Last log lines:" >&2
  tail -160 "$log_file" >&2 || true
  exit 1
fi

if [[ "$REGISTER_ADMIN" == "1" ]]; then
  python3 - "$PORT" "$ADMIN_USERNAME" "$ADMIN_PASSWORD" <<'PY'
import json
import sys
import urllib.error
import urllib.request

port, username, password = sys.argv[1:4]
base = f"http://127.0.0.1:{port}"
status = json.loads(urllib.request.urlopen(f"{base}/api/auth/status", timeout=10).read().decode())
if status.get("needsSetup"):
    data = json.dumps({"username": username, "password": password}).encode()
    req = urllib.request.Request(
        f"{base}/api/auth/register",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        result = json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
        print(f"Registered admin user: {result.get('user', {}).get('username', username)}")
    except urllib.error.HTTPError as exc:
        print(exc.read().decode(), file=sys.stderr)
        raise
else:
    print("Admin setup already exists")
PY
fi

echo "CloudCLI is running:"
echo "  Local:  http://127.0.0.1:$PORT"
ip_address="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -n "$ip_address" ]]; then
  echo "  LAN:    http://$ip_address:$PORT"
fi
echo "  Log:    $log_file"
