# CloudCLI 固定端口启动规则执行日志

## 目标

落实用户要求：CloudCLI 服务以后固定使用 `3001`，如果端口被占用，启动前先停止占用进程。

## 变更

1. `scripts/start-reclaude-cloudcli.sh`
   - 默认端口从 `3002` 改为固定 `3001`。
   - 构建后不再直接执行 `dist-server/server/cli.js`，改为交给 `scripts/run-cloudcli-lan.sh`。
2. 新增 `scripts/run-cloudcli-lan.sh`
   - 固定 `3001`。
   - 启动前检查 `3001` 监听进程。
   - 先执行普通 `kill`，等待端口释放。
   - 仍未释放时执行 `kill -9`。
   - 使用 Node 22 启动本地构建产物。
3. `scripts/bootstrap-reclaude-cloudcli-macos.sh`
   - 默认端口改为固定 `3001`。
   - 端口占用清理增加等待和强制 kill。
   - 启动前设置 `scripts/run-cloudcli-lan.sh` 可执行权限。
4. 文档更新
   - 更新安装文档中的端口示例为 `3001`。
   - 记录固定端口和启动前清理端口占用的规则。

## 验证计划

1. 静态脚本检查：
   - `bash -n scripts/start-reclaude-cloudcli.sh`
   - `bash -n scripts/run-cloudcli-lan.sh`
   - `bash -n scripts/bootstrap-reclaude-cloudcli-macos.sh`
2. 行为验证：
   - 停止现有 LaunchAgent。
   - 启动一个临时进程占用 `3001`。
   - 重新加载 LaunchAgent。
   - 确认 runner 杀掉临时占用进程并成功启动 CloudCLI。
3. HTTP 验证：
   - `curl -fsS http://127.0.0.1:3001/api/auth/status`

## 验证结果

时间：2026-06-30 02:50:15 CST

已完成：

- 固定端口静态断言通过：
  - `scripts/start-reclaude-cloudcli.sh` 使用 `readonly PORT=3001`
  - `scripts/run-cloudcli-lan.sh` 使用 `readonly PORT=3001`
  - `scripts/bootstrap-reclaude-cloudcli-macos.sh` 使用 `readonly PORT=3001`
- Shell 语法检查通过：
  - `bash -n scripts/start-reclaude-cloudcli.sh`
  - `bash -n scripts/run-cloudcli-lan.sh`
  - `bash -n scripts/bootstrap-reclaude-cloudcli-macos.sh`
- LaunchAgent 已切换到：

```text
/Users/apple/code/claudecodeui/scripts/run-cloudcli-lan.sh
```

- 修改前 LaunchAgent 备份：

```text
/tmp/com.local.cloudcli-lan.plist.fixed-port.20260630024836.bak
```

- 行为验证通过：
  - 先停止 `com.local.cloudcli-lan`
  - 用 `python3 -m http.server 3001 --bind 127.0.0.1` 创建临时占用者，PID 为 `87439`
  - 重新加载 LaunchAgent
  - runner 日志显示 `Stopping existing listener(s) on fixed CloudCLI port 3001: 87439`
  - 临时占用者已被停止：`dummy_killed=yes`
  - CloudCLI 新 PID：`87455`
  - `lsof` 显示 `node` 监听 `*:3001`
- API 验证通过：

```json
{"needsSetup":false,"isAuthenticated":false}
```
