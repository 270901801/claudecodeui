# 停用旧 LaunchAgent 并启动 npm run dev

日期：2026-06-30

## 表述校正

“停掉旧 CloudCLI LaunchAgent，释放 3001，然后按最新规则启动”更准确地说是：

> 停用旧的稳定服务守护进程，释放浏览器入口端口 `3001`，再从当前源码仓库启动快速迭代期 dev server：前端 Vite 监听 `3001`，后端 API 监听 `3002`。

## 执行结果

旧 LaunchAgent 已停止：

```text
launchctl bootout gui/$(id -u)/com.local.cloudcli-lan -> bootout_ok
launchctl print gui/$(id -u)/com.local.cloudcli-lan -> Could not find service
```

当前 dev server 已启动在 `screen` 会话：

```text
23653.cloudcli-npm-dev (Detached)
```

启动命令：

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

实际运行环境：

```text
Node: v22.22.3
npm: 10.9.8
```

## 验证

监听端口：

```text
*:3001 -> node node_modules/.bin/vite
*:3002 -> node server/index.js via tsx
```

本机 HTTP 验证：

```text
GET http://127.0.0.1:3001/ -> 200
GET http://127.0.0.1:3001/api/auth/status -> 200 {"needsSetup":false,"isAuthenticated":false}
GET http://127.0.0.1:3002/api/auth/status -> 200 {"needsSetup":false,"isAuthenticated":false}
```

Vite 日志给出的访问地址：

```text
http://localhost:3001/
http://192.168.8.104:3001/
```

注意：从本机 curl `http://192.168.8.104:3001/` 本次超时，尚未确认 LAN 路径真实可用；本机 `127.0.0.1:3001` 和 API 代理已验证通过。

## 运行日志

启动日志：

```text
doc/log/artifacts/2026-06-30-npm-dev-start/npm-run-dev.log
```

## 停止方式

停止本次 dev server：

```bash
screen -S cloudcli-npm-dev -X quit
```

如果只想查看日志：

```bash
tail -f doc/log/artifacts/2026-06-30-npm-dev-start/npm-run-dev.log
```

## 备注

- 本次没有恢复 LaunchAgent。
- 本次没有使用运行副本 `~/.local/share/claudecodeui-run`。
- Vite 输出 `Browserslist: browsers data ... is 6 months old`，这是依赖数据提醒，不影响本次启动。

