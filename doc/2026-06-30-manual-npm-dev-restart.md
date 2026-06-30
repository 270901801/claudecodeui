# 2026-06-30 手动重启 npm dev

## 背景

用户要求“重启”。当前项目规则仍然是快速迭代期间只使用 `npm run dev`，浏览器和手机访问入口固定为 `3001`，不使用 LaunchAgent，也不使用 5173。

## 重启前状态

检查结果：

- `screen -ls`: 没有 `cloudcli-npm-dev` 会话。
- `3001`: 无监听。
- `3002`: 无监听。

因此本次没有可停止的旧 dev 会话，直接启动新的 `screen` 会话。

## 启动命令

```bash
screen -dmS cloudcli-npm-dev zsh -lc 'cd /Users/hongsucao/Documents/temp/claudecodeui && source ~/.nvm/nvm.sh && nvm use 22 && HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev >> doc/log/artifacts/2026-06-30-manual-npm-dev-restart/npm-run-dev.log 2>&1'
```

## 验证结果

启动后验证：

- `screen`: `83951.cloudcli-npm-dev (Detached)`
- 前端：`node` 监听 `*:3001`
- 后端：`node` 监听 `*:3002`
- 本机健康接口：`http://127.0.0.1:3001/api/auth/status` 返回 200
- 局域网健康接口：`http://192.168.8.104:3001/api/auth/status` 返回 200

当前访问入口：

```text
http://192.168.8.104:3001/
```

## 注意

日志里仍有旧浏览器标签或测试会话触发的 `JsonWebTokenError: jwt malformed` 和 Vite `EPIPE` 噪音，但同一日志中也有正常的：

```text
[OK] WebSocket authenticated for user: admin
```

本次验证中这些噪音没有影响 `3001/3002` 监听和健康接口。
