# 3001 LAN 访问诊断

日期：2026-06-30

## 表述校正

“排查 `192.168.8.104:3001` LAN 访问超时”更准确应拆成两层：

- 本机访问自己的 LAN IP 是否能命中 dev server。
- 手机/平板等外部设备从 Wi-Fi 进入这台 Mac 是否能命中 dev server。

这两者不是同一个证明，因为 macOS 访问自己的 `192.168.8.104` 会路由到本机 `lo0`。

## 当前结论

本机侧 `192.168.8.104:3001` 超时已经不可复现。当前服务状态正常：

```text
*:3001 -> node node_modules/.bin/vite
*:3002 -> node server/index.js via tsx
```

连续检查结果：

```text
http://192.168.8.104:3001/ -> 5/5 返回 200
http://192.168.8.104:3001/api/auth/status -> 5/5 返回 200
last_body={"needsSetup":false,"isAuthenticated":false}
```

防火墙状态：

```text
Application Firewall: disabled
Block all: disabled
```

当前 Wi-Fi：

```text
IP: 192.168.8.104
SSID: FHCPE-6qNX-5G
```

## 重要限制

`route -n get 192.168.8.104` 显示访问本机自己的 LAN IP 走 `lo0`：

```text
route to: 192.168.8.104
interface: lo0
flags: <UP,HOST,DONE,LLINFO,WASCLONED,LOCAL,IFSCOPE,IFREF>
```

所以本机 curl 成功只能证明服务绑定和本机地址路径可用，不能完全证明手机从 Wi-Fi 入站也可用。

## 对之前超时的判断

之前的 `192.168.8.104:3001` 超时目前无法复现。结合当时后端 API 也曾短暂超时、随后恢复，较可能是 dev server 初始启动/插件同步期间的瞬时阻塞；当前没有证据显示 Vite host 配置、防火墙或端口绑定仍有问题。

## 如果手机仍打不开

下一步应从外部设备路径查，而不是优先改 Vite 配置：

1. 确认手机连接同一个 Wi-Fi：`FHCPE-6qNX-5G`。
2. 在手机浏览器打开 `http://192.168.8.104:3001/`，注意是 `http` 不是 `https`。
3. 如果手机超时，本机继续查路由器 AP 隔离、访客网络隔离、VPN/代理、或用抓包确认是否有外部 SYN 到达 `3001`。
4. 当前没有 ADB 设备连接，无法从手机侧自动发起验证。

## 运行状态

dev server 仍在运行：

```bash
screen -ls | rg cloudcli-npm-dev
```

停止命令：

```bash
screen -S cloudcli-npm-dev -X quit
```

