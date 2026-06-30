# npm run dev 端口预检

日期：2026-06-30

## 表述校正

“检查端口占用，准备手动跑 `npm run dev`”更准确地说是：

> 在不停止进程的前提下，确认 `npm run dev` 默认需要的后端端口和前端端口是否可用，并给出手动启动前的处理建议。

## 检查结果

本次预检最初按裸 `npm run dev` 的默认端口检查：

- 后端：`SERVER_PORT || 3001`
- 前端 Vite：`VITE_PORT || 5173`

后续已按用户确认修正：快速迭代期浏览器入口只用 `3001`。因此实际手动启动命令应显式设置：

```bash
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

在这条规则下，后续预检重点应是：

- `3001`：前端 Vite / 浏览器入口
- `3002`：后端 API 内部端口

本次 `.env` 没有发现 `SERVER_PORT`、`PORT`、`VITE_PORT`、`HOST`、`CLAUDE_CLI_PATH` 覆盖项。

当前端口占用：

```text
3001 -> node dist-server/server/cli.js start --port 3001
5173 -> /Users/hongsucao/code/antigravity/personalOS/personalOS/app/frontend/node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort
```

对应判断：

- `3001` 是旧的 CloudCLI LaunchAgent `com.local.cloudcli-lan` 恢复起来的稳定服务。
- `5173` 是另一个 PersonalOS 项目的 Vite 前端。
- 当前 shell 默认 Node 是 `v20.20.1`，不满足项目 `.nvmrc` 的 `v22`。
- 本机 nvm 下存在 Node `v22.22.3`，可用于运行本项目。

## 启动前建议

如果坚持快速迭代期“浏览器只用 3001”的路径：

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

则手动启动前需要先处理：

1. 停掉旧 CloudCLI LaunchAgent，释放 `3001`。
2. 确认 `3002` 没有被占用。

`5173` 是裸 Vite 默认端口；在显式设置 `VITE_PORT=3001` 后，不应再把 `5173` 作为本项目快速迭代期的目标端口。

