# 2026-06-30 npm dev 进程 SIGTERM 退出与恢复

## 现象

用户反馈服务再次不可用。现场检查结果：

- `3001` 无监听。
- `3002` 无监听。
- `screen -ls` 没有 `cloudcli-npm-dev` 会话。
- `curl http://127.0.0.1:3001/api/auth/status` 连接失败。

## 日志证据

旧 dev 日志最后显示：

```text
[Plugin:cloudcli-claude-watch] [claude-watch] received SIGTERM, shutting down
[1] npm run client exited with code 143
--> Sending SIGTERM to other processes..
[0] npm run server:dev exited with code 0
```

`143` 通常表示进程收到 `SIGTERM` 后退出。这里不是前端编译报错、后端异常栈、端口冲突或 `useRef` 白屏问题，而是 dev 进程被终止。由于 `npm run dev` 使用 `concurrently --kill-others`，任一子进程退出会触发另一个子进程一起停止，所以前端 Vite 退出后后端也被停掉。

macOS unified log 没有查到能指向具体发送者的记录，因此目前只能确认退出类型，不能确认是谁发出的 SIGTERM。

## 恢复方式

按当前快速迭代规则恢复，不使用 LaunchAgent，不使用 5173：

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

实际恢复时放入 `screen` 会话：

```bash
screen -dmS cloudcli-npm-dev zsh -lc 'cd /Users/hongsucao/Documents/temp/claudecodeui && source ~/.nvm/nvm.sh && nvm use 22 && HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev >> doc/log/artifacts/2026-06-30-npm-dev-restart-1050/npm-run-dev.log 2>&1'
```

## 当前状态

恢复后验证：

- `screen`: `18341.cloudcli-npm-dev (Detached)`
- `3001`: `node` 监听 `*:3001`
- `3002`: `node` 监听 `*:3002`
- 本机接口：`http://127.0.0.1:3001/api/auth/status` 返回 200
- 局域网接口：`http://192.168.8.104:3001/api/auth/status` 返回 200
- Vite 显示可访问地址：`http://192.168.8.104:3001/`

## 注意

恢复后的日志中仍可能出现：

```text
WebSocket token verification error: JsonWebTokenError: jwt malformed
```

这是旧浏览器标签或测试会话持有错误 token 时产生的 WebSocket 认证噪音。当前观察中它没有导致服务退出。
