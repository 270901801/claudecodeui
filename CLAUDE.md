# claudecodeui — 项目规则

## 运行策略（快速迭代期必读）

当前快速迭代期只使用源码目录前台开发服务，不再默认走 LaunchAgent、运行副本、构建同步链路。浏览器访问入口固定使用 `3001`。

### 当前默认启动方式

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

- 默认从本仓库源码目录启动。
- 默认使用 `npm run dev` 同时启动前端 Vite 和后端服务。
- 浏览器和手机只访问 `3001`；后端 API 使用内部端口 `3002`，由 Vite 代理转发。
- 调试“启动失败”时，先复现并读取 `npm run dev` 的真实终端日志。
- 如果 `3001` 或 `3002` 被占用，先报告真实占用进程和端口，不要自动切回 LaunchAgent 方案。
- 这些命令需要用户在自己的终端前台运行；助手通过后台 Bash 工具启动的长时 dev server 会被回收，不应尝试后台托管。

### 暂停使用的旧链路

以下链路在当前快速迭代期不作为默认启动、诊断或部署路径：

- LaunchAgent `com.local.cloudcli-lan`
- 运行副本 `~/.local/share/claudecodeui-run`
- `scripts/sync-reclaude-run.sh`
- `scripts/run-cloudcli-lan.sh`
- `launchctl bootstrap` / `launchctl kickstart` / `launchctl bootout` 作为常规启动步骤

只有用户明确要求恢复稳定服务或部署构建产物时，才重新评估这些链路。

### LAN 信息

- 服务器 LAN IP：`192.168.8.104`
- 手机：OnePlus / ColorOS（无 Google Play / FCM）

---

## 开发工作流

### 类型检查

```bash
npm run typecheck   # 前端（tsconfig.json）+ 后端（server/tsconfig.json）同时检查
```

提交前必须通过。

### Lint

```bash
npm run lint:fix    # 自动修复 import 顺序等 eslint 问题
```

### 构建（仅稳定期部署前）

```bash
npm run build:client   # 仅前端，速度快
npm run build          # 前端 + 后端
```

---

## 代码约定

- **WebSocket 单例**：全局共享 `WebSocketContext`（`src/contexts/WebSocketContext.tsx`），用 `subscribe(listener)` 和 `sendMessage(msg)` 访问。
- **运行会话真源**：`useSessionProtection()` 的 `processingSessions: Map<sessionId, {...}>`，每 5s 由 `/api/providers/sessions/running` 同步。
- **权限应答只认 requestId**：服务端 `resolveToolApproval(requestId, decision)` 不绑定会话，任意 socket 均可代应答。
- **chat.subscribe 跳过重放**：发 `lastSeq: Number.MAX_SAFE_INTEGER` 可获取 `chat_subscribed` ack（含当前 `pendingPermissions`）而不触发历史事件重放。
