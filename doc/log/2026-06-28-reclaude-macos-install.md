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

## 新 Mac SSH 记录

历史记录中可复用的新 Mac 目标：

```text
apple@192.168.8.105
```

本次用户提供的登录信息是 `apple / 1234`。
