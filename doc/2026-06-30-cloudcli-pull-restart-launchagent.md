# CloudCLI 拉取代码与 LaunchAgent 重启记录

## 背景

本机 `com.local.cloudcli-lan` 原来监听 `3001`，但启动命令指向 npx 缓存目录：

```text
/Users/apple/.npm/_npx/5bbf27fdc7e904fa/node_modules/@cloudcli-ai/cloudcli/dist-server/server/cli.js
```

因此仅执行 `git pull` 或重启旧 LaunchAgent，不能让 `/Users/apple/code/claudecodeui` 中刚拉取的 fork 代码生效。

## 本次结论

- `git pull` 因全局 Git 代理 `127.0.0.1:7890` 当前不可用首次失败；使用临时空代理参数 `git -c http.proxy= -c https.proxy= pull --ff-only` 成功 fast-forward。
- 拉取后的 `npm install` 主要用于安装新增运行时依赖 `systeminformation`；耗时约 2 分钟，并报告既有 audit 漏洞，但没有阻断启动。
- `npm run build` 不是网络问题。前端 Vite 构建处理 `3551` 个模块，用时约 `2m 30s`；随后 server `tsc` 继续本地编译。
- 本地启动失败的根因是 Node ABI 不匹配：`better-sqlite3` 编译目标是 Node 22 的 `NODE_MODULE_VERSION 127`，而旧 LaunchAgent 使用 `/usr/local/bin/node`，实际是 Node 25 的 `NODE_MODULE_VERSION 141`。
- LaunchAgent 应固定使用仓库 `.nvmrc` 对应的 Node 22，例如：

```text
/Users/apple/.nvm/versions/node/v22.23.1/bin/node
```

## 当前服务配置

`~/Library/LaunchAgents/com.local.cloudcli-lan.plist` 已切换为：

```text
ProgramArguments:
  /Users/apple/code/claudecodeui/scripts/run-cloudcli-lan.sh

WorkingDirectory:
  /Users/apple/code/claudecodeui

EnvironmentVariables:
  SERVER_PORT=3001
  HOST=0.0.0.0
  CLAUDE_CLI_PATH=/Users/apple/.local/bin/reclaude
  CLOUDCLI_PLUGIN_NPM_REGISTRY=https://registry.npmjs.org/
  ELECTRON_SKIP_BINARY_DOWNLOAD=1
```

`scripts/run-cloudcli-lan.sh` 固定使用 `3001`，启动前会检查该端口监听进程，先 `TERM`，仍未释放时再 `KILL`，然后执行本地 `dist-server/server/cli.js`。

修改前 plist 备份：

```text
/tmp/com.local.cloudcli-lan.plist.20260630021517.bak
```

## 验证方式

```bash
launchctl print gui/$(id -u)/com.local.cloudcli-lan
lsof -nP -iTCP:3001 -sTCP:LISTEN
curl -fsS http://127.0.0.1:3001/api/auth/status
curl -fsS http://127.0.0.1:3001/ | grep 'assets/index-'
tail -80 /tmp/cloudcli-lan.log
```

期望信号：

- `launchctl` 显示 `state = running`
- `program` 为 Node 22 路径
- `working directory` 为 `/Users/apple/code/claudecodeui`
- `3001` 有 `node` 监听
- `/api/auth/status` 返回 JSON
- 日志中显示 `Installed at: /Users/apple/code/claudecodeui`
