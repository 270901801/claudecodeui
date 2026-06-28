# ReClaude + CloudCLI fork 改造日志

## 目标

把本机调试 CloudCLI Web、ReClaude、插件安装、TaskMaster 期间遇到的坑固化成 fork 里的文档、脚本和源码补丁，方便另一台 Mac 安装。

## 主要改动

1. Shell WebSocket 的 Claude 默认命令读取 `CLAUDE_CLI_PATH`，支持 `reclaude`。
2. 插件安装默认使用官方 npm registry，并在失败时返回 npm stderr。
3. TaskMaster 项目检测兼容 `task-master-ai@0.43.1` 初始化后的空任务项目。
4. 新增 `scripts/start-reclaude-cloudcli.sh`。
5. 新增 `scripts/setup-taskmaster-reclaude.sh`。
6. 新增安装排坑文档 `doc/2026-06-28-reclaude-macos-install.md`。
7. Web 启动脚本默认设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，规避 Web 形态源码安装时 Electron 下载超时。
8. 远程新 Mac 诊断发现 git 配了代理但 npm 未配代理或镜像；脚本新增 `USE_LOCAL_PROXY`、`LOCAL_PROXY_URL`、`NODE_MIRROR`、`NPM_REGISTRY`，用于国内网络下快速安装。

## 新 Mac 实测

- 直连 `registry.npmjs.org` 下载 npm 包出现 SSL timeout。
- `registry.npmmirror.com` 下载同一包约 1.47 秒。
- 走本机 Clash 端口 `127.0.0.1:7897` 或 `127.0.0.1:7890` 访问官方 npm 可以恢复到约 1.5 秒。
- 使用 `NPM_REGISTRY=https://registry.npmmirror.com/` 和 `USE_LOCAL_PROXY=1` 后，`task-master-ai@0.43.1` 在约 3 分钟内完成全局安装。
- `reclaude mcp list` 已显示 `task-master-ai` connected。
- 新 Mac 上 CloudCLI Web 已在 `3002` 端口启动，`/api/taskmaster/installation-status` 返回 `isReady=true`。
- 追加系统级 `claude -> reclaude` 对齐：新增 `scripts/setup-reclaude-claude-alias.sh`，备份原 `~/.local/bin/claude` 并创建 wrapper，同时把 `~/.local/bin` 写入 zsh PATH。
- 直接把 `claude` 无条件指向 `reclaude` 会导致 ReClaude 内部同步递归并持续输出“同步配置…”。wrapper 已加入 `RECLAUDE_ALIAS_DEPTH` 保护，递归调用会落回 `claude-original`。
- 新增 `scripts/bootstrap-reclaude-cloudcli-macos.sh`，用于新 Mac 一键 clone/pull、配置 ReClaude alias、安装 TaskMaster、启动 screen 服务并注册默认 admin。
- 新增 Shell 移动端体验分析文档 `doc/2026-06-28-shell-mobile-ux-analysis.md`。
- 真实重跑 bootstrap 时发现 `setup-taskmaster-reclaude.sh` 会重复执行全局 `npm install -g task-master-ai`。已改为当前 Node 下已有 `task-master` 和 `task-master-ai` 时跳过，必要时用 `FORCE_TASKMASTER_INSTALL=1` 强制重装。
- raw GitHub 脚本下载本身也可能被网络卡住，文档补充 `HTTP_PROXY/HTTPS_PROXY` 用法。nvm 子脚本改为已安装目标 Node 时直接 `nvm use`，避免镜像源下重复解析 `22` 别名失败。
- 中断过全局 TaskMaster 安装后，npm 可能在全局 node_modules 留下半截 `task-master-ai` 目录并报 `ENOTEMPTY rename`。安装脚本新增失败后定向清理 `task-master-ai` 残留并重试。

## 新 Mac SSH 记录

历史记录中可复用的新 Mac 目标：

```text
apple@192.168.8.105
```

本次用户提供的登录信息是 `apple / 1234`。
