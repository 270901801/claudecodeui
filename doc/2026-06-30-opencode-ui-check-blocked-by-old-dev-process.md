# OpenCode UI 模型显示检查：被旧 dev 进程阻塞

日期：2026-06-30

## 表述校正

选择 “A：继续检查重启后的 UI 是否显示 OpenCode 模型” 更准确应拆成两步：

> 先确认当前 3001/3002 是否已经运行修复后的后端代码，再检查 UI 的 OpenCode 模型分组是否显示本地配置模型。

如果后端仍是旧进程，UI 检查没有判定价值。

## 当前检查结果

当前监听仍是旧 PID：

```text
3001 -> node PID 24523
3002 -> node PID 24585
```

`screen -ls` 显示没有 `cloudcli-npm-dev` 会话：

```text
No Sockets found
```

这说明之前的 dev server 进程仍在后台监听，但不再由当前 `screen` 会话管理。

## 阻塞点

当前 Codex 沙箱不能终止这两个旧 Node 进程：

```text
kill 24523 failed: operation not permitted
kill 24585 failed: operation not permitted
```

同时，当前沙箱内对 `127.0.0.1:3001` 的 HTTP 请求返回连接失败，因此无法在此环境里直接通过 API 或浏览器确认 UI 显示。

## 判断

这不是 OpenCode 模型修复失败，而是运行态尚未切换到新代码。上一轮修复已经通过单测、typecheck 和真实 OpenCode CLI 配置副本验证。

## 需要的本机操作

在本机终端停止旧 PID 后重启：

```bash
kill 24523 24585
cd /Users/hongsucao/Documents/temp/claudecodeui
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

重启后再刷新 UI 模型列表，或请求：

```text
/api/providers/opencode/models?bypassCache=true
```

预期 OpenCode 分组应至少包含：

```text
glm/glm-5.1
test111/glm5.1
```
