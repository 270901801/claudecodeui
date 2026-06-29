# CloudCLI 固定端口规则纠正

日期：2026-06-30

## 表述校正

用户说“为什么不遵循规则固定端口”是准确的。更工程化的表述是：“服务启动配置没有遵循项目定义的端口不变量，导致运行态与文档/脚本规则漂移。”

## 错误原因

上一轮处理时，我把“现有 `3002` 服务可用”误当成优先级，忽略了刚拉取代码里的固定端口规则：

```text
CloudCLI 固定端口：3001
LaunchAgent：com.local.cloudcli-lan
启动脚本：scripts/run-cloudcli-lan.sh
```

这导致两个问题：

1. 旧服务仍通过 `com.claudecodeui.cloudcli` 跑在 `3002`。
2. 项目规则要求的 `3001` 被 `com.project-manager.api` 占用，CloudCLI 没有接管固定端口。

## 修正过程

1. 构建当前工作区：

```bash
npm install --registry=https://registry.npmjs.org/
npm run build
```

2. 卸载并备份旧 `3002` LaunchAgent：

```text
/Users/hongsucao/Library/LaunchAgents/com.claudecodeui.cloudcli.plist.disabled-20260630030044
```

3. 发现 `Documents/temp/claudecodeui` 路径被 LaunchAgent 执行时触发 macOS 权限错误：

```text
Operation not permitted
```

因此把最新 `dist/`、`dist-server/`、`scripts/`、`package.json`、`package-lock.json`、`.nvmrc` 同步到可由 LaunchAgent 访问的运行目录：

```text
/Users/hongsucao/.local/share/claudecodeui-run
```

4. 写入固定端口 LaunchAgent：

```text
/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
```

关键配置：

```text
ProgramArguments = /Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh
WorkingDirectory = /Users/hongsucao/.local/share/claudecodeui-run
SERVER_PORT = 3001
HOST = 0.0.0.0
NODE_VERSION = 22
```

5. 发现 `com.project-manager.api` 会 KeepAlive 重启并抢回 `3001`，导致 CloudCLI 报：

```text
EADDRINUSE: address already in use 0.0.0.0:3001
```

按固定端口规则，禁用并备份该旧占用服务：

```text
/Users/hongsucao/Library/LaunchAgents/com.project-manager.api.plist.disabled-20260630030342
```

## 当前正确状态

```text
LaunchAgent: com.local.cloudcli-lan
state: running
pid: 42925
port: 3001
```

验证：

```text
GET http://127.0.0.1:3001/ -> 200
GET http://192.168.8.104:3001/ -> 200
GET http://127.0.0.1:3001/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

`3002` 当前没有 CloudCLI 监听。

## 后续注意

- 不要再把 `3002` 当作本项目 CloudCLI 的稳定入口。
- 如果后续需要恢复 project-manager，应先给它改端口，不能继续占用 `3001`。
- 如果要让 LaunchAgent 直接运行 Git 工作区，需要避开 macOS 对 `Documents` 路径的权限限制；当前更稳妥的方式是同步构建产物到 `~/.local/share/claudecodeui-run` 后启动。

