# 停旧 LaunchAgent 并启动 npm run dev 执行日志

日期：2026-06-30

## 用户要求

用户要求：

> 停掉旧 CloudCLI LaunchAgent，释放 3001。然后按最新规则启动

## 执行动作

1. 执行 `launchctl bootout gui/$(id -u)/com.local.cloudcli-lan`。
2. 验证 `com.local.cloudcli-lan` 已不在当前用户域。
3. 验证 `3001` 和 `3002` 初始为空闲。
4. 用 `screen` 启动当前源码目录的 `npm run dev`：
   - `HOST=0.0.0.0`
   - `VITE_PORT=3001`
   - `SERVER_PORT=3002`
   - `CLAUDE_CLI_PATH=$HOME/.local/bin/reclaude`
5. 将启动输出写入 `doc/log/artifacts/2026-06-30-npm-dev-start/npm-run-dev.log`。
6. 验证本机入口和 API：
   - `http://127.0.0.1:3001/`
   - `http://127.0.0.1:3001/api/auth/status`
   - `http://127.0.0.1:3002/api/auth/status`

## 结果

- 旧 LaunchAgent 已停止。
- `screen` 会话 `cloudcli-npm-dev` 正在运行。
- 前端监听 `3001`。
- 后端监听 `3002`。
- 本机页面入口返回 200。
- API 代理返回 200。

## 未完成/未确认

- `http://192.168.8.104:3001/` 从本机 curl 超时，LAN 路径未确认通过。
- 未用浏览器做视觉验证。
- 未执行类型检查或 lint。

## 后续常用命令

查看运行会话：

```bash
screen -ls | rg cloudcli-npm-dev
```

停止 dev server：

```bash
screen -S cloudcli-npm-dev -X quit
```

查看日志：

```bash
tail -f doc/log/artifacts/2026-06-30-npm-dev-start/npm-run-dev.log
```

