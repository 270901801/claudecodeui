# CloudCLI LaunchAgent 反复未加载的缓解方案

日期：2026-07-01

## 表述校正

“又挂了”这次更准确地说是：“固定端口服务的 LaunchAgent 从用户域中消失，导致 `3001` 无监听”。不是 `3001` 被其他服务抢占，也不是 CloudCLI 进程在 `3001` 上返回异常。

## 故障证据

故障时：

```text
launchctl print gui/501/com.local.cloudcli-lan
-> Could not find service "com.local.cloudcli-lan" in domain for user gui: 501

lsof -nP -iTCP:3001 -iTCP:3002 -sTCP:LISTEN
-> 无监听

curl http://127.0.0.1:3001/
-> connection refused
```

同时以下文件仍存在：

```text
/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
/Users/hongsucao/.local/share/claudecodeui-run/scripts/run-cloudcli-lan.sh
/Users/hongsucao/.local/share/claudecodeui-run/dist-server/server/cli.js
```

因此本次问题不是配置文件丢失，而是 LaunchAgent 没有加载到当前 `gui/501` 域。

## 恢复动作

手动恢复：

```bash
launchctl bootstrap gui/$(id -u) /Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan
```

恢复后：

```text
LaunchAgent: com.local.cloudcli-lan
state: running
pid: 49792
SERVER_PORT: 3001
GET http://127.0.0.1:3001/ -> 200
```

## 新增自愈机制

新增脚本：

```text
scripts/ensure-cloudcli-lan-launchagent.sh
/Users/hongsucao/.local/share/claudecodeui-run/scripts/ensure-cloudcli-lan-launchagent.sh
```

新增 LaunchAgent：

```text
/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.ensure.plist
```

行为：

- `RunAtLoad = true`
- `StartInterval = 60`
- 每 60 秒检查主服务是否加载。
- 如果 `com.local.cloudcli-lan` 不在用户域中，自动 `bootstrap`。
- 如果 `3001` 没有监听或 `/api/auth/status` 不健康，自动 `kickstart`。

## 当前状态

主服务：

```text
com.local.cloudcli-lan
state = running
pid = 59914
port = 3001
```

自愈服务：

```text
com.local.cloudcli-lan.ensure
state = not running
runs = 2
last exit code = 0
run interval = 60 seconds
```

`ensure` 是定时任务，所以平时 `not running` 是正常状态；它每 60 秒醒一次，执行检查后退出。

## 自愈验证

已执行受控验证：

```bash
launchctl bootout gui/$(id -u)/com.local.cloudcli-lan
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan.ensure
```

结果：

```text
primary_unloaded=ok
self_heal=ok
com.local.cloudcli-lan state = running
pid = 59914
node 59914 TCP *:3001 (LISTEN)
```

这证明 `com.local.cloudcli-lan.ensure` 可以在主 LaunchAgent 被卸载后重新拉起固定端口服务。

## 仍未完全确认的点

目前没有拿到是谁执行了 `bootout` 或为什么 `com.local.cloudcli-lan` 会从用户域消失的系统日志证据。已经加了自愈层，后续如果再次发生，优先看：

```bash
tail -120 /tmp/cloudcli-lan-ensure.log
tail -120 /tmp/cloudcli-lan.log
launchctl print gui/$(id -u)/com.local.cloudcli-lan
launchctl print gui/$(id -u)/com.local.cloudcli-lan.ensure
```
