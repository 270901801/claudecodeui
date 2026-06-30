# npm run dev 端口预检日志

日期：2026-06-30

## 用户选择

用户选择 A：检查端口占用，准备手动跑 `npm run dev`。

## 执行动作

1. 只读检查监听端口：`3001`、`5173`、`3002`、`5180`。
2. 检查当前 shell Node / npm 版本与 `.nvmrc`。
3. 检查 nvm 下 Node 22 是否可用。
4. 检查 `com.local.cloudcli-lan` LaunchAgent 状态。
5. 检查 `.env` 是否覆盖端口相关变量。
6. 对照 `server/index.js` 和 `vite.config.js` 确认默认端口。

## 结果

- `3001` 被旧 CloudCLI LaunchAgent 进程占用。
- `5173` 被 PersonalOS 前端 Vite 占用。
- `.env` 没有端口覆盖项。
- 当前 shell 默认 Node 为 `v20.20.1`。
- nvm 可用 Node 为 `v22.22.3`。

## 未执行动作

- 未停止 LaunchAgent。
- 未停止 PersonalOS 前端。
- 未启动 `npm run dev`。
- 未改源码。

