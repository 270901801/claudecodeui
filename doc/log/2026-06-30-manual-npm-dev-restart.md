# 2026-06-30 手动重启 npm dev 日志

## 时间

- 2026-06-30 14:09 CST

## 用户请求

用户要求：“重启”。

## 执行记录

1. 按项目规则解释本次重启边界：
   - 重启本仓库 `npm run dev` 开发进程。
   - 不使用 LaunchAgent。
   - 不使用 5173。
   - 访问入口继续使用 `3001`。
2. 重启前检查：
   - `screen -ls` 无 `cloudcli-npm-dev`。
   - `lsof -nP -iTCP:3001 -sTCP:LISTEN` 无输出。
   - `lsof -nP -iTCP:3002 -sTCP:LISTEN` 无输出。
3. 启动新会话：

```bash
mkdir -p doc/log/artifacts/2026-06-30-manual-npm-dev-restart
screen -dmS cloudcli-npm-dev zsh -lc 'cd /Users/hongsucao/Documents/temp/claudecodeui && source ~/.nvm/nvm.sh && nvm use 22 && HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev >> doc/log/artifacts/2026-06-30-manual-npm-dev-restart/npm-run-dev.log 2>&1'
```

4. 启动后验证：
   - `screen -ls`: `83951.cloudcli-npm-dev (Detached)`。
   - `3001`: `node` 监听 `*:3001`。
   - `3002`: `node` 监听 `*:3002`。
   - `http://127.0.0.1:3001/api/auth/status`: `HTTP/1.1 200 OK`。
   - `http://192.168.8.104:3001/api/auth/status`: `HTTP/1.1 200 OK`。

## 结论

已按最新规则恢复 `npm run dev`。当前可访问入口为：

```text
http://192.168.8.104:3001/
```

## 遗留观察

日志中仍看到部分 `JsonWebTokenError: jwt malformed` 和 Vite `EPIPE`，应来自旧标签或测试会话的坏 WebSocket token。当前未影响服务启动和健康接口。
