# 项目规则阅读日志

日期：2026-06-30

## 用户要求

用户在启动失败诊断过程中打断，并要求：“你先看下项目规则先”。

## 执行动作

1. 暂停继续启动诊断。
2. 阅读当前仓库规则文件：
   - `CLAUDE.md`
   - `CONTRIBUTING.md`
   - `README.md`
   - `README.zh-CN.md`
3. 补充阅读本机运行相关脚本：
   - `scripts/sync-reclaude-run.sh`
   - `scripts/run-cloudcli-lan.sh`
4. 用 `rg --files` 确认当前仓库没有 `AGENTS.md`，本机项目规则集中在 `CLAUDE.md`。
5. 记录本次规则阅读总结到 `doc/2026-06-30-project-rules-before-startup-diagnosis.md`。

## 关键发现

- 本项目稳定服务固定使用 `3001`，由 LaunchAgent `com.local.cloudcli-lan` 从 `~/.local/share/claudecodeui-run` 启动构建产物。
- 本仓库源码目录不是 `3001` 稳定服务的直接运行目录。
- 开发 HMR 不能由助手后台 Bash 工具长期托管；规则要求用户在自己的终端前台运行。
- 继续诊断“启动失败”前，需要先区分稳定服务失败还是开发 HMR 失败。

## 状态备注

在用户打断前，助手已执行一次 `launchctl bootstrap/enable/kickstart`，可能已经改变 `com.local.cloudcli-lan` 的加载状态。后续如果继续诊断，需要先重新采集当前状态。

