# 任务日志：修正 CloudCLI 固定端口规则

日期：2026-06-30

## 用户反馈

用户指出没有遵循固定端口规则。

## 根因

- 我上一轮保留了旧 `3002` 服务，违背项目文档中 CloudCLI 固定 `3001` 的规则。
- 旧 `3002` 服务来自 `com.claudecodeui.cloudcli`，运行目录为 `/Users/hongsucao/.local/share/claudecodeui-run`。
- `3001` 被 `com.project-manager.api` 占用，并通过 KeepAlive 自动重启，导致 CloudCLI 启动时反复 `EADDRINUSE`。
- 新 LaunchAgent 第一次指向 `/Users/hongsucao/Documents/temp/claudecodeui/scripts/run-cloudcli-lan.sh`，被 macOS 对 Documents 路径的权限限制拦截，日志为 `Operation not permitted`。

## 执行动作

- 阅读固定端口文档 `doc/2026-06-30-cloudcli-fixed-port-startup.md`。
- 执行脚本语法检查。
- 执行 `npm install --registry=https://registry.npmjs.org/`。
- 执行 `npm run build`。
- 卸载并备份旧 CloudCLI LaunchAgent：

```text
/Users/hongsucao/Library/LaunchAgents/com.claudecodeui.cloudcli.plist.disabled-20260630030044
```

- 同步当前构建产物到：

```text
/Users/hongsucao/.local/share/claudecodeui-run
```

- 创建并加载：

```text
/Users/hongsucao/Library/LaunchAgents/com.local.cloudcli-lan.plist
```

- 卸载并备份占用 `3001` 的 project-manager LaunchAgent：

```text
/Users/hongsucao/Library/LaunchAgents/com.project-manager.api.plist.disabled-20260630030342
```

- 启动 `com.local.cloudcli-lan`。

## 验证

```text
launchctl: state = running
pid = 42925
lsof: node 42925 TCP *:3001 (LISTEN)
GET http://127.0.0.1:3001/ -> 200
GET http://192.168.8.104:3001/ -> 200
GET http://127.0.0.1:3001/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

`3002` 无 CloudCLI 监听。

## 未执行内容

- 未提交 git。
- 未恢复 project-manager。
- 未把 CloudCLI 切回 `3002`。
