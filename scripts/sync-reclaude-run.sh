#!/usr/bin/env bash
#
# 一键：在本仓库构建前后端 → 同步到运行副本 → 重启 3001 LaunchAgent。
#
# 背景：3001 服务并非直接从本仓库运行，而是从一个独立安装副本
#   ~/.local/share/claudecodeui-run 运行（由 LaunchAgent com.local.cloudcli-lan 守护）。
#   因此只改/构建仓库不会生效，必须把构建产物同步到该副本并重启服务。
#
# 用法：
#   scripts/sync-reclaude-run.sh            # 构建 + 同步 + 重启
#   scripts/sync-reclaude-run.sh --deps     # 额外在副本里 npm install（依赖变更时用）
#   scripts/sync-reclaude-run.sh --no-build # 跳过构建，仅同步现有产物 + 重启
#   RUN_DIR=/path scripts/sync-reclaude-run.sh   # 覆盖运行副本路径
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$HOME/.local/share/claudecodeui-run}"
LABEL="${LAUNCH_LABEL:-com.local.cloudcli-lan}"
PORT="${PORT:-3001}"
NODE_VERSION="${NODE_VERSION:-22}"

DO_BUILD=1
DO_DEPS=0
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --deps)     DO_DEPS=1 ;;
    -h|--help)  sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;36m[sync]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[sync]\033[0m %s\n' "$*" >&2; }

[[ -d "$RUN_DIR" ]] || { err "运行副本不存在：$RUN_DIR"; exit 1; }

# 让构建用到正确的 Node 版本
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm use "$NODE_VERSION" >/dev/null 2>&1 || true
fi

# 1) 构建
if [[ "$DO_BUILD" == "1" ]]; then
  log "在仓库构建前后端（npm run build）…"
  ( cd "$REPO_DIR" && npm run build )
else
  log "跳过构建（--no-build）"
fi

[[ -f "$REPO_DIR/dist/index.html" ]]        || { err "缺少 dist/index.html，请先构建"; exit 1; }
[[ -f "$REPO_DIR/dist-server/server/cli.js" ]] || { err "缺少 dist-server/server/cli.js，请先构建"; exit 1; }

# 2) 同步到运行副本（逐目录 --delete，避免动到 node_modules / .env / .git）
log "同步产物与源码到运行副本：$RUN_DIR"
for d in dist dist-server src server; do
  rsync -a --delete "$REPO_DIR/$d/" "$RUN_DIR/$d/"
done
# package.json 同步，便于副本依赖对齐
cp "$REPO_DIR/package.json" "$RUN_DIR/package.json" 2>/dev/null || true

# 3) 依赖（按需）
if [[ "$DO_DEPS" == "1" ]]; then
  log "在运行副本安装依赖（npm install）…"
  ( cd "$RUN_DIR" && npm install )
fi

BUNDLE="$(grep -o 'index-[A-Za-z0-9_]*\.js' "$RUN_DIR/dist/index.html" | head -1)"
log "运行副本当前 bundle：$BUNDLE"

# 4) 重启 LaunchAgent
UID_NUM="$(id -u)"
if launchctl print "gui/$UID_NUM/$LABEL" >/dev/null 2>&1; then
  log "重启 LaunchAgent：$LABEL"
  launchctl kickstart -k "gui/$UID_NUM/$LABEL"
else
  err "LaunchAgent 未加载：$LABEL，尝试直接重启端口监听进程…"
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs || true)"
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
  err "请手动确认服务已由守护进程重新拉起。"
fi

# 5) 校验
log "等待服务重新监听 $PORT …"
for _ in $(seq 1 20); do
  served="$(curl -s "http://127.0.0.1:$PORT/index.html" 2>/dev/null | grep -o 'index-[A-Za-z0-9_]*\.js' | head -1 || true)"
  if [[ -n "$served" ]]; then
    if [[ "$served" == "$BUNDLE" ]]; then
      log "✅ 完成：3001 已提供新 bundle（$served）。手机端刷新即可。"
    else
      err "⚠️ 服务在跑，但返回的是 $served，期望 $BUNDLE。可能有缓存代理，稍后再试。"
    fi
    exit 0
  fi
  sleep 1
done
err "⚠️ 超时：未能确认 3001 已就绪，请手动检查服务状态。"
exit 1
