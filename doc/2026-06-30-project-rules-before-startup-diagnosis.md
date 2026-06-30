# 项目规则阅读：启动诊断前置边界

日期：2026-06-30

> 后续更新：快速迭代期规则已调整为只使用源码目录前台 `npm run dev`。本文记录的是调整前的规则阅读结果；当前默认启动策略以 `CLAUDE.md` 和 `doc/2026-06-30-npm-run-dev-only-iteration-rule.md` 为准。

## 表述校正

“启动失败”在本项目里需要先拆成两种不同问题：

- 稳定服务是否启动失败：看 `3001`、LaunchAgent `com.local.cloudcli-lan`、运行副本 `~/.local/share/claudecodeui-run`。
- 开发 HMR 是否启动失败：看本仓库源码目录、`npm run dev`、`VITE_PORT` / `SERVER_PORT`、Node 22，以及是否由用户终端前台运行。

这两种形态的入口、端口和验证方式不同，不能混在一起判断。

## 已阅读规则

- `CLAUDE.md`
- `CONTRIBUTING.md`
- `README.md`
- `README.zh-CN.md`
- `scripts/sync-reclaude-run.sh`
- `scripts/run-cloudcli-lan.sh`

当前仓库未发现 `AGENTS.md` 文件，项目本机规则集中在 `CLAUDE.md`。

## 关键规则

### 稳定服务

- 固定端口：`3001`
- 守护入口：LaunchAgent `com.local.cloudcli-lan`
- 实际运行目录：`~/.local/share/claudecodeui-run`
- 启动脚本：`~/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh`
- 运行命令：`node dist-server/server/cli.js start --port 3001`
- 服务内容：已构建的 `dist/` 静态文件，没有 HMR。
- 停止方式：必须用 `launchctl bootout gui/$(id -u)/com.local.cloudcli-lan`，不能直接 `kill`。
- 恢复方式：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.cloudcli-lan.plist`。

### 开发模式

项目规则要求迭代前端时使用 HMR，不要每次都走 `sync-reclaude-run.sh`，因为构建同步太重，且曾出现 `npm run build` OOM 被 kill，exit 137。

开发模式有两种：

1. 保留 `3001` 稳定服务，只启动前端 HMR 到 `5180`：

```bash
npx vite --host 0.0.0.0 --port 5180 --strictPort
```

2. 用户选择的 HMR 占用 `3001` 方式：

```bash
launchctl bootout gui/$(id -u)/com.local.cloudcli-lan 2>/dev/null
cd /Users/hongsucao/Documents/temp/claudecodeui
export PATH="$HOME/.local/bin:$PATH"
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

规则明确写明：这些 dev server 命令需要用户在自己的终端运行；助手通过后台 Bash 工具启动长时进程会被回收，不应尝试用 Bash 工具后台启动 dev server。

## 对启动诊断的影响

后续继续查“启动失败”时，先问清或直接用证据区分：

- 如果用户访问的是 `http://127.0.0.1:3001` 或手机访问 `http://192.168.8.104:3001`，优先按稳定服务诊断。
- 如果用户预期热更新或正在改前端，优先按开发 HMR 诊断。
- `com.reclaude.daemon` 只是 `reclaude _daemon`，不能等同于 CloudCLI Web 服务已启动。
- 本仓库源码目录改动不会自动影响 `3001` 稳定服务，除非构建并同步到运行副本。
- 需要 Node.js 22 或更高；当前 shell 默认 Node 如果低于 22，应先切换 Node，而不是继续排查业务代码。

## 本次中断前的状态说明

在用户要求“先看项目规则”之前，已经执行过一次：

```bash
launchctl bootstrap gui/$(id -u) /Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
launchctl enable gui/$(id -u)/com.local.cloudcli-lan
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan
```

因此后续如果检查到 `3001` 已恢复监听，需要把它归因到这次已执行的启动项加载，而不是误认为它原本一直正常。
