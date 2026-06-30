# 日志：OpenCode UI 模型显示检查被旧 dev 进程阻塞

日期：2026-06-30

## 用户选择

用户选择 A：继续检查重启后的 UI 是否显示 OpenCode 模型。

## 执行过程

1. 检查 3001/3002 监听端口。
2. 确认监听 PID 仍为上一轮旧进程：`24523`、`24585`。
3. 检查 `screen -ls`，确认当前没有 `cloudcli-npm-dev` screen 会话。
4. 尝试通过当前环境访问 `http://127.0.0.1:3001/api/providers/opencode/models?bypassCache=true`，Node fetch 返回 `fetch failed`。
5. 尝试连接内置浏览器工具，工具层返回 `sandbox-state-meta` 变体错误，未能用于页面验证。
6. 查看 dev 日志，确认旧进程仍在写入 `doc/log/artifacts/2026-06-30-npm-dev-start/npm-run-dev.log`。
7. 沿用上一轮结论：当前沙箱不能 `kill 24523 24585`，因此无法把 3001/3002 切换到修复后的后端代码。

## 结论

无法完成 UI 显示验证，因为当前服务没有重启到新代码。需要用户在本机终端停止旧 PID 并重新运行 `npm run dev`。

## 后续验证目标

重启后检查 OpenCode 模型列表是否包含：

```text
glm/glm-5.1
test111/glm5.1
```
