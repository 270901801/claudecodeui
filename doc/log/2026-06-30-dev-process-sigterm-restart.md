# 2026-06-30 npm dev 进程 SIGTERM 退出恢复日志

## 时间

- 2026-06-30 11:46 CST

## 用户反馈

用户反馈“服务又挂了”。

更准确的问题拆解为：确认 `3001` 前端、`3002` 后端、`screen` 会话和 HTTP 健康接口哪个层面不可用。

## 检查记录

1. 检查监听：
   - `lsof -nP -iTCP:3001 -sTCP:LISTEN` 无输出。
   - `lsof -nP -iTCP:3002 -sTCP:LISTEN` 无输出。
2. 检查 `screen`：
   - `screen -ls` 显示没有 socket。
3. 检查 HTTP：
   - `curl http://127.0.0.1:3001/api/auth/status` 连接失败。
4. 检查旧 dev 日志：
   - 最后记录为 `npm run client exited with code 143`。
   - `concurrently` 随后发送 SIGTERM 停掉后端。
5. 检查 LaunchAgent：
   - `launchctl list | rg 'cloudcli|claudecodeui|com\\.local\\.cloudcli'` 无输出。
6. 检查当前进程：
   - 本仓库没有残留 `npm run dev`、Vite、server dev 进程。
   - 只发现另一个项目 personalOS 的 5173 Vite 进程，和本仓库无关。
7. 检查 macOS unified log：
   - 未找到能证明具体 SIGTERM 发送者的记录。

## 恢复记录

执行：

```bash
mkdir -p doc/log/artifacts/2026-06-30-npm-dev-restart-1050
screen -dmS cloudcli-npm-dev zsh -lc 'cd /Users/hongsucao/Documents/temp/claudecodeui && source ~/.nvm/nvm.sh && nvm use 22 && HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev >> doc/log/artifacts/2026-06-30-npm-dev-restart-1050/npm-run-dev.log 2>&1'
```

## 恢复后验证

恢复后 4 秒验证：

- `screen -ls`: `18341.cloudcli-npm-dev (Detached)`
- `3001`: `node` 监听 `*:3001`
- `3002`: `node` 监听 `*:3002`
- `http://127.0.0.1:3001/api/auth/status`: `HTTP/1.1 200 OK`

继续观察 12 秒后验证：

- `screen` 会话仍存在。
- `3001` 和 `3002` 仍监听。
- 本机接口仍返回 200。
- `http://192.168.8.104:3001/api/auth/status` 返回 200。

## 结论

这次服务不可用的直接原因是 dev 进程被 SIGTERM 终止，而不是应用代码异常崩溃。具体是谁发送 SIGTERM 暂无证据。服务已按最新规则恢复，入口为 `http://192.168.8.104:3001/`。
