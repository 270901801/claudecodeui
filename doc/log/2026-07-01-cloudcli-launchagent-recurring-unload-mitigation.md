# 任务日志：处理 CloudCLI 再次不可达

日期：2026-07-01

## 用户反馈

用户反馈：“怎么又挂了”。

## 诊断动作

- 使用系统化调试流程，先检查 LaunchAgent、端口、HTTP、日志。
- 发现 `com.local.cloudcli-lan` 不在用户域：

```text
Could not find service "com.local.cloudcli-lan" in domain for user gui: 501
```

- 发现 `3001` 和 `3002` 均无监听。
- 访问 `http://127.0.0.1:3001/` 返回 connection refused。
- 确认 plist、脚本、构建产物仍存在。

## 恢复动作

执行：

```bash
launchctl bootstrap gui/$(id -u) /Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan
```

恢复后主服务：

```text
state = running
pid = 49792
SERVER_PORT = 3001
GET http://127.0.0.1:3001/ -> 200
```

## 新增自愈动作

- 新增 `scripts/ensure-cloudcli-lan-launchagent.sh`。
- 同步到 `/Users/hongsucao/.local/share/claudecodeui-run/scripts/ensure-cloudcli-lan-launchagent.sh`。
- 新增 `/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.ensure.plist`。
- 加载并启动 `com.local.cloudcli-lan.ensure`。

验证结果：

```text
com.local.cloudcli-lan.ensure
run interval = 60 seconds
runs = 2
last exit code = 0
```

`/tmp/cloudcli-lan-ensure.log` 记录：

```text
healthy on port 3001
```

## 受控自愈测试

第一次测试发现 ensure 脚本等待时间不足，已修正为 bootstrap/load 后等待服务进入 launchd 域，并最多等待 30 秒健康检查。

随后执行：

```bash
launchctl bootout gui/$(id -u)/com.local.cloudcli-lan
launchctl kickstart -k gui/$(id -u)/com.local.cloudcli-lan.ensure
```

验证通过：

```text
primary_unloaded=ok
self_heal=ok
state = running
pid = 59914
node 59914 TCP *:3001 (LISTEN)
```

## 判断

本次直接原因是主 LaunchAgent 未加载，不是端口冲突。已通过定时 ensure job 增加自愈能力。

## 未执行内容

- 未恢复 project-manager。
- 未切回 `3002`。
- 未提交 git。
