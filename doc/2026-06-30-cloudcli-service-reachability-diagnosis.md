# CloudCLI 服务可达性诊断

日期：2026-06-30

## 表述校正

“服务又挂了”更准确应拆成：“哪个入口不可达、哪个进程还在监听、页面是否实际渲染”。本次现象不是整个 CloudCLI 后端退出，而是旧的 dev 前端地址 `5180` 不再监听；稳定 Web 入口是 `http://127.0.0.1:3002`。

## 结论

- `3002` 后端和 Web 静态页面当前可达。
- `5180` 当前不可达，因为现在运行的是 `launchd` 托管的生产构建服务，不是 `npm run dev` 的 Vite 前端服务。
- `5173` 被另一个 personalOS Vite 服务占用，不属于本项目当前运行实例。
- 浏览器级验证显示 `http://127.0.0.1:3002` 能正常渲染 CloudCLI 登录页。
- 控制台里有未登录状态下的 `401 Unauthorized`，属于登录前访问插件和 TaskMaster API 的前端噪音，不是服务宕机。

## 关键证据

端口监听：

```text
node 13433 TCP *:3002 (LISTEN)
node 26168 TCP *:5173 (LISTEN)  # personalOS frontend
5180 未监听
```

当前 CloudCLI 后台服务：

```text
label = com.claudecodeui.cloudcli
state = running
pid = 13433
working directory = /Users/hongsucao/.local/share/claudecodeui-run
command = node dist-server/server/cli.js --port 3002
```

HTTP 验证：

```text
GET http://127.0.0.1:3002/ -> 200 OK
GET http://127.0.0.1:3002/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
GET http://127.0.0.1:5180/ -> connection refused
```

浏览器快照：

```text
Page URL: http://127.0.0.1:3002/
Page Title: CloudCLI UI
页面元素：Welcome Back、Username、Password、Sign In
```

## 根因判断

当前服务入口已经从早期的源码 dev 形态：

```text
frontend: http://127.0.0.1:5180
backend:  http://127.0.0.1:3002
```

切换为 `launchd` 托管的单端口生产构建形态：

```text
http://127.0.0.1:3002
```

因此如果继续访问 `5180`，表现会像“服务挂了”；但实际可用入口是 `3002`。

## 值得后续修的点

1. 登录页未认证状态下不应主动把插件和 TaskMaster API 的 `401` 打成明显控制台错误，否则容易把正常未登录状态误判成服务故障。
2. 当前后台运行目录是 `/Users/hongsucao/.local/share/claudecodeui-run`，不是工作区 `/Users/hongsucao/Documents/temp/claudecodeui`。如果改了当前仓库代码但不重建并同步到运行目录，页面不会体现最新修改。
3. 可以给项目补一个 `scripts/diagnose-cloudcli-service.sh`，固定检查 `launchd`、端口、运行目录、HTTP、浏览器可渲染状态，减少下次重复排查。

## 2026-06-30 重启记录

按用户要求执行了一次后台服务重启：

```bash
launchctl kickstart -k gui/$(id -u)/com.claudecodeui.cloudcli
```

重启前：

```text
pid = 13433
runs = 3
```

重启后：

```text
pid = 26869
runs = 4
GET http://127.0.0.1:3002/ -> 200
GET http://192.168.8.104:3002/ -> 200
GET http://127.0.0.1:3002/api/auth/status -> {"needsSetup":false,"isAuthenticated":false}
```

日志确认：

```text
CloudCLI Server - Ready
Server URL: http://localhost:3002
Installed at: /Users/hongsucao/.local/share/claudecodeui-run
```
