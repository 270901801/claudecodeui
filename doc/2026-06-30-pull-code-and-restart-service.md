# 拉取代码后重启 CloudCLI 服务

日期：2026-06-30

## 表述校正

“拉代码后重启”更准确应拆成两步验证：先确认当前工作区是否能安全 `git pull`，再确认实际运行中的 LaunchAgent 是否真的换进程并恢复 HTTP 可达。因为本机服务运行目录是 `/Users/hongsucao/.local/share/claudecodeui-run`，不是当前 Git 工作区，不能只看 `git pull` 成功就等同于线上服务代码已更新。

## 本次执行结果

- 当前分支：`codex/reclaude-install-hardening`
- 远端：`origin/codex/reclaude-install-hardening`
- 拉取方式：`git pull --ff-only origin codex/reclaude-install-hardening`
- 拉取结果：从 `13e6a46` 快进到 `d8a6bc9`
- 远端提交：`d8a6bc9 chore: fix CloudCLI fixed-port startup`

本次远端提交改动范围：

```text
doc/2026-06-28-reclaude-macos-install.md
doc/2026-06-30-cloudcli-fixed-port-startup.md
doc/2026-06-30-cloudcli-pull-restart-launchagent.md
doc/log/2026-06-30-cloudcli-fixed-port-startup.md
doc/log/2026-06-30-cloudcli-pull-restart-launchagent.md
scripts/bootstrap-reclaude-cloudcli-macos.sh
scripts/run-cloudcli-lan.sh
scripts/start-reclaude-cloudcli.sh
```

没有改到 `src/`、`server/` 或构建产物。本机当前 LaunchAgent 仍按既有配置运行 `3002`，未切换到新脚本默认的 `3001`。

## 重启结果

执行：

```bash
launchctl kickstart -k gui/$(id -u)/com.claudecodeui.cloudcli
```

重启前：

```text
pid = 26869
runs = 4
```

重启后：

```text
pid = 31247
runs = 5
state = running
```

验证：

```text
GET http://127.0.0.1:3002/ -> 200
GET http://192.168.8.104:3002/ -> 200
GET http://127.0.0.1:3002/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

日志确认：

```text
CloudCLI Server - Ready
Server URL: http://localhost:3002
Installed at: /Users/hongsucao/.local/share/claudecodeui-run
```

## 注意点

`/Users/hongsucao/.local/share/claudecodeui-run` 没有 `.git`，所以它不能直接执行 `git pull`。这次远端提交主要是文档和启动脚本，对当前 `3002` 服务运行代码没有直接影响。后续如果要让服务直接运行当前工作区最新源码，应单独调整 LaunchAgent 的 `WorkingDirectory` 和启动命令。

## 纠正：固定端口规则

上一段“未切换到新脚本默认的 `3001`”是错误处理。项目规则已经明确 CloudCLI 固定端口为 `3001`，并且 LaunchAgent 应使用 `com.local.cloudcli-lan` 与 `scripts/run-cloudcli-lan.sh`。正确状态已经在后续修正中完成：

```text
LaunchAgent: com.local.cloudcli-lan
Port: 3001
Program: /Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh
WorkingDirectory: /Users/hongsucao/.local/share/claudecodeui-run
```

旧的 `com.claudecodeui.cloudcli` 3002 配置已禁用备份。原本占用 `3001` 的 `com.project-manager.api` 会与固定端口规则冲突，也已禁用备份。

