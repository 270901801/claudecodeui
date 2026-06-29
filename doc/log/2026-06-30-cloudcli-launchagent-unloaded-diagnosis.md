# 任务日志：诊断 CloudCLI 又不可达

日期：2026-06-30

## 用户反馈

用户反馈：“怎么又挂了”。

## 执行动作

- 按系统化调试流程先取证，没有直接重启。
- 检查 `com.local.cloudcli-lan`：

```text
Could not find service "com.local.cloudcli-lan" in domain for user gui: 501
```

- 检查端口：

```text
3001 无监听
3002 无监听
```

- 检查 HTTP：

```text
http://127.0.0.1:3001/ connection refused
```

- 确认配置文件和运行文件仍存在：
  - `/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist`
  - `/Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh`
  - `/Users/hongsucao/.local/share/claudecodeui-run/dist-server/server/cli.js`
- 重新加载并启动 LaunchAgent：

```bash
launchctl bootstrap gui/$(id -u) /Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan
launchctl enable gui/$(id -u)/com.local.cloudcli-lan
```

## 验证

```text
launchctl state = running
pid = 63250
node 63250 TCP *:3001 (LISTEN)
GET http://127.0.0.1:3001/ -> 200
GET http://127.0.0.1:3001/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

## 判断

本次不可达原因是 LaunchAgent 未加载，不是 `3001` 被 project-manager 抢占，也不是 CloudCLI 仍跑在 `3002`。目前服务已恢复到固定端口 `3001`。

## 未执行内容

- 未改业务代码。
- 未恢复 project-manager。
- 未切回 `3002`。
- 未提交 git。
