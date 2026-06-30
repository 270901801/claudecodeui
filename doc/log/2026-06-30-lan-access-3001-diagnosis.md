# 3001 LAN 访问诊断日志

日期：2026-06-30

## 用户选择

用户选择 A：继续排查 `192.168.8.104:3001` LAN 访问超时。

## 执行动作

1. 使用 `curl --noproxy '*'` 分别检查：
   - `http://127.0.0.1:3001/`
   - `http://localhost:3001/`
   - `http://0.0.0.0:3001/`
   - `http://192.168.8.104:3001/`
   - `http://100.112.230.127:3001/`
2. 检查 `3001/3002` 监听状态。
3. 检查 `192.168.8.104` 和 `100.112.230.127` 的本机路由。
4. 检查 macOS Application Firewall：
   - `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`
   - `/usr/libexec/ApplicationFirewall/socketfilterfw --getblockall`
5. 连续请求 `http://192.168.8.104:3001/` 和 `http://192.168.8.104:3001/api/auth/status`。
6. 检查 ADB 设备列表，确认没有已连接手机可用于外部视角验证。
7. 检查当前 Wi-Fi IP 和 SSID。

## 结果

- `3001` 监听 `*`。
- `3002` 监听 `*`。
- `192.168.8.104:3001/` 本机连续返回 200。
- `192.168.8.104:3001/api/auth/status` 本机连续返回 200。
- macOS Application Firewall 关闭。
- ADB 没有连接设备。
- 当前无法证明手机侧外部入站链路是否可用。

## 过程备注

一次验证脚本中误用 `path` 作为 zsh 变量名，导致 zsh 的命令搜索路径被覆盖，出现 `seq` / `cat` 找不到。已改用 `url_path` 重新执行，服务验证结果正常。

## 未执行动作

- 未修改源码。
- 未重启 dev server。
- 未改防火墙。
- 未改路由器或 Wi-Fi 设置。

