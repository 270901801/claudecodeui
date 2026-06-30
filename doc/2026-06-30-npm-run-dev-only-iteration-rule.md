# 快速迭代期启动规则：统一使用 npm run dev

日期：2026-06-30

## 表述校正

“这两个方式都不用，把 LaunchAgent 这个步骤去掉”更准确的规则表述是：

> 快速迭代期统一从源码目录前台运行 `npm run dev`；浏览器访问入口固定为 `3001`；LaunchAgent、运行副本和构建同步链路暂不作为默认启动、诊断或部署路径。

这样表达能避免把“暂时不用稳定服务链路”误解成“永久删除脚本或服务配置”。

## 当前决策

当前阶段只使用：

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

说明：`npm run dev` 会同时启动前端 Vite 和后端 API。为了让浏览器只访问 `3001`，前端 Vite 绑定 `3001`，后端 API 绑定内部端口 `3002`，由 Vite 代理 `/api`、`/ws`、`/shell`、`/plugin-ws`。

## 已从默认路径移除

以下内容不再作为快速迭代期默认步骤：

- `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.cloudcli-lan.plist`
- `launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan`
- `launchctl bootout gui/$(id -u)/com.local.cloudcli-lan` 作为常规开发启动前置动作
- `scripts/sync-reclaude-run.sh`
- `scripts/run-cloudcli-lan.sh`
- 运行副本 `~/.local/share/claudecodeui-run`

## 后续诊断规则

以后排查启动失败时：

1. 先让用户在自己的终端前台执行 `npm run dev`。
2. 以 `npm run dev` 的真实输出为准定位问题。
3. 如果 `3001` 或 `3002` 端口冲突，报告真实占用进程和端口。
4. 不再自动把问题切换到 LaunchAgent、运行副本或同步部署链路。
5. 只有用户明确要求恢复稳定服务时，才重新评估 LaunchAgent 方案。

## 影响范围

本次只调整项目规则文档，不删除现有脚本、不卸载 LaunchAgent plist、不修改运行副本。
