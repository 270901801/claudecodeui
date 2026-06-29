# CloudCLI LaunchAgent 未加载故障诊断

日期：2026-06-30

## 表述校正

“又挂了”更准确应拆成：固定端口 `3001` 是否有监听、监听进程是否是 CloudCLI、HTTP 是否返回可用页面、LaunchAgent 是否仍加载。本次故障不是 `3001` 被抢占，也不是 CloudCLI 进程崩溃后反复失败，而是 `com.local.cloudcli-lan` 这个 LaunchAgent 没有加载在当前用户域里。

## 现象

故障时检查结果：

```text
launchctl print gui/501/com.local.cloudcli-lan
-> Could not find service "com.local.cloudcli-lan" in domain for user gui: 501

lsof -nP -iTCP:3001 -iTCP:3002 -sTCP:LISTEN
-> 无监听

curl http://127.0.0.1:3001/
-> connection refused
```

plist、脚本和构建产物仍然存在：

```text
/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
/Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh
/Users/hongsucao/.local/share/claudecodeui-run/dist-server/server/cli.js
```

## 处理

重新把 LaunchAgent 加载进用户域：

```bash
launchctl bootstrap gui/$(id -u) /Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan
launchctl enable gui/$(id -u)/com.local.cloudcli-lan
```

## 当前状态

```text
LaunchAgent: com.local.cloudcli-lan
state: running
pid: 63250
program: /Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh
working directory: /Users/hongsucao/.local/share/claudecodeui-run
SERVER_PORT: 3001
```

验证：

```text
node 63250 TCP *:3001 (LISTEN)
GET http://127.0.0.1:3001/ -> 200
GET http://127.0.0.1:3001/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

## 判断

这次根因是“启动项没有加载”，不是固定端口规则本身失效。日志中能看到 CloudCLI 插件收到 `SIGTERM` 后停止，但系统统一日志没有返回足够证据说明是谁执行了 unload。后续如果再次出现同样问题，应先查：

```bash
launchctl print gui/$(id -u)/com.local.cloudcli-lan
launchctl list | rg -i 'cloudcli|claudecodeui'
lsof -nP -iTCP:3001 -sTCP:LISTEN
tail -120 /tmp/cloudcli-lan.log
```

## 后续建议

- 做一个 `scripts/ensure-cloudcli-lan-launchagent.sh`，封装 `plist 校验 -> bootstrap -> enable -> kickstart -> HTTP 验证`。
- 做一个健康检查脚本，失败时输出是“未加载”“未监听”“非 CloudCLI 占用”“HTTP 异常”中的哪一种。

