# CloudCLI 固定端口启动规则

## 目标

本机 CloudCLI 服务以后固定使用 `3001`。无论手动启动还是 LaunchAgent 启动，如果 `3001` 已经被占用，启动入口都要先停止占用进程，再启动 CloudCLI。

## 当前规则

- 固定端口：`3001`
- 手动构建启动入口：`scripts/start-reclaude-cloudcli.sh`
- LaunchAgent 轻量启动入口：`scripts/run-cloudcli-lan.sh`
- LaunchAgent：`~/Library/LaunchAgents/com.local.cloudcli-lan.plist`
- 当前 LaunchAgent 已指向 `scripts/run-cloudcli-lan.sh`

`scripts/start-reclaude-cloudcli.sh` 负责：

1. 使用 Node 22。
2. 安装依赖。
3. 构建前端和后端。
4. 交给 `scripts/run-cloudcli-lan.sh` 启动服务。

`scripts/run-cloudcli-lan.sh` 负责：

1. 固定 `PORT=3001`。
2. 确认 Node 22 和 `reclaude` 可用。
3. 确认 `dist-server/server/cli.js` 已存在。
4. 检查 `3001` 上的监听进程。
5. 如果有占用，先 `kill`，等待释放；仍未释放时执行 `kill -9`。
6. 执行本地构建产物：

```bash
node dist-server/server/cli.js start --port 3001
```

## 验证

```bash
bash -n scripts/start-reclaude-cloudcli.sh
bash -n scripts/run-cloudcli-lan.sh
bash -n scripts/bootstrap-reclaude-cloudcli-macos.sh

launchctl print gui/$(id -u)/com.local.cloudcli-lan
lsof -nP -iTCP:3001 -sTCP:LISTEN
curl -fsS http://127.0.0.1:3001/api/auth/status
```

期望：

- `launchctl` 显示服务 `state = running`
- `3001` 有 CloudCLI `node` 进程监听
- API 返回 JSON

## 已验证行为

2026-06-30 已用临时 Python HTTP 服务占用 `127.0.0.1:3001`，随后加载 LaunchAgent。`scripts/run-cloudcli-lan.sh` 成功停止占用进程，并启动 CloudCLI 到 `*:3001`。
