# 2026-06-30 本机网络与代理端口诊断

## 结论

当前最明显的问题不是“某一个代理端口没开”，而是本机同时存在多套网络/代理组件，并且 shell、Git、npm 的代理配置不完全一致：

- 系统代理：`scutil --proxy` 返回空字典，说明当前系统代理表未配置 HTTP/HTTPS/SOCKS 代理。
- shell 代理：`~/.zshrc` 硬编码了 `http_proxy=http://127.0.0.1:7897`、`https_proxy=http://127.0.0.1:7897`、`all_proxy=socks5h://127.0.0.1:7897`。
- Clash Verge：配置里 `mixed-port: 7897`，`tun.enable: false`，`allow-lan: false`，本机 `verge-mih` 正在监听 `127.0.0.1:7897`。
- clashToClientIp：另一个 LaunchAgent 启动了独立 `mihomo`，监听 `127.0.0.1:19090` 和 `127.0.0.1:9001-9014`。
- Docker 也监听了 `*:9001` 和 `*:1080`，其中 `9001` 与 `mihomo` 的 `127.0.0.1:9001` 同时存在，后续排查端口时需要避免混淆。
- DNS 文件 `/etc/resolv.conf` 指向 Tailscale DNS：`100.100.100.100` 和 `fd7a:115c:a1e0::53`；同时 `ifconfig` 显示 Tailscale/utun4 有 `100.112.230.127`。
- 当前 Codex 执行环境本身受限，`route`、`ps`、`networksetup`、`curl/nc` 对本机端口和外网的连接测试不能直接代表桌面真实网络状态。

## 关键配置

### Shell

来源：`~/.zshrc`

```sh
export http_proxy=http://127.0.0.1:7897
export https_proxy=http://127.0.0.1:7897
export all_proxy=socks5h://127.0.0.1:7897
```

风险：没有设置 `no_proxy`，本地开发服务、localhost 检查、部分 CLI 工具可能被代理变量干扰。

### Git

```txt
http.proxy=http://127.0.0.1:7897
```

未观察到全局 `https.proxy` 输出。Git 的 HTTP/HTTPS 行为可能不一致，且仍会受到环境变量影响。

### npm

```txt
https-proxy = "http://127.0.0.1:7897"
registry = "http://registry.npm.taobao.org/"
```

风险：

- `proxy` 为 `null`，但 `https-proxy` 指向 `7897`，配置不对称。
- `registry.npm.taobao.org` 是旧淘宝源，容易造成安装慢、重定向或兼容问题。建议后续改为 `https://registry.npmmirror.com/` 或官方源。

## 当前监听端口

与代理相关：

- `verge-mih`: `127.0.0.1:7897`
- `clash-ver`: `127.0.0.1:33331`
- `mihomo`: `127.0.0.1:19090`
- `mihomo`: `127.0.0.1:9001-9014`
- `cliproxyapi`: `*:8317`
- `Docker`: `*:9001`, `*:1080`
- `clashToClientIp adapter`: `127.0.0.1:8088`

普通本地服务还包括 `3001`、`5173`、`64443-64447`、`55015-55016` 等。

## 诊断限制

本次在 Codex 的受限执行环境内执行，出现以下限制：

- `route -n get default` 返回 `Operation not permitted`
- `ps` 返回 `operation not permitted`
- `networksetup -listallnetworkservices` 返回 `AuthorizationCreate() failed: -60008`
- `scutil --dns` 返回 `No DNS configuration available`
- `curl`/`nc` 对 `127.0.0.1` 和公网地址连接失败

因此本次不能把 `curl`/`nc` 的连接失败直接判断为桌面网络故障。可靠结论主要来自：配置文件、环境变量、`lsof` 监听表、LaunchAgent 配置和已有运行日志。

## 建议处理顺序

1. 先统一 shell 代理变量：保留 `7897` 可以，但补上 `no_proxy`，至少包含 `localhost,127.0.0.1,::1`。
2. 清理 npm：把 `registry.npm.taobao.org` 改成 `https://registry.npmmirror.com/` 或官方源；同时确认是否需要 `proxy` 与 `https-proxy` 都走 `7897`。
3. 清理 Git：决定是否全局使用 `7897`；如果要用，建议同时设置 HTTP/HTTPS；如果不稳定，则取消全局代理，按命令临时加代理。
4. 区分两套代理：
   - Clash Verge 主代理：`7897`
   - clashToClientIp/mihomo 代理槽位：`9001-9014`
5. 注意 Docker 的 `9001/1080`，不要把 Docker 监听误认为 Clash/mihomo 代理。
6. 如果桌面真实网络也出现 DNS 问题，优先检查 Tailscale 状态，因为当前 resolv 文件指向 Tailscale DNS。

## 可选修复命令

以下命令本次未执行，只作为下一步候选：

```sh
# 只修当前 shell
export no_proxy="localhost,127.0.0.1,::1"

# npm 切换到 npmmirror
npm config set registry https://registry.npmmirror.com/

# 查看当前 git 代理
git config --global --get http.proxy
git config --global --get https.proxy

# 取消 git 全局代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```
