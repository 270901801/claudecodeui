# ReClaude + CloudCLI macOS 安装排坑记录

## 目标

让另一台 Mac 安装 CloudCLI Web 形态时，少踩这次遇到的坑：

- Claude Shell/恢复会话入口要能走 `reclaude`
- 插件安装不要被旧 npm mirror 卡住
- TaskMaster 要装到 CloudCLI 实际使用的 Node 版本里
- TaskMaster 新版空项目要能被 CloudCLI 识别为已配置

## 推荐环境

- macOS
- Node 22 或更高，建议用 nvm 管理
- `reclaude` 可执行文件位于 `~/.local/bin/reclaude`
- npm 插件安装 registry 使用 `https://registry.npmjs.org/`
- Web 形态建议设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，避免源码安装时卡在 Electron 下载

## 启动方式

从源码启动：

```bash
git clone https://github.com/270901801/claudecodeui.git
cd claudecodeui
git checkout codex/reclaude-install-hardening
chmod +x scripts/start-reclaude-cloudcli.sh scripts/setup-taskmaster-reclaude.sh
./scripts/setup-taskmaster-reclaude.sh
PORT=3002 ./scripts/start-reclaude-cloudcli.sh
```

启动脚本会设置：

```text
CLAUDE_CLI_PATH=$HOME/.local/bin/reclaude
CLOUDCLI_PLUGIN_NPM_REGISTRY=https://registry.npmjs.org/
npm_config_registry=https://registry.npmjs.org/
ELECTRON_SKIP_BINARY_DOWNLOAD=1
```

## 坑 1：Shell 入口仍调用 claude

现象：普通聊天已经能通过 `reclaude` 发消息，但 Shell/恢复会话入口仍执行 `claude --resume ...`。

原因：Shell WebSocket 默认命令里硬编码了 `claude`。

修复：默认 Claude 命令读取 `CLAUDE_CLI_PATH`，没有配置时才回退到 `claude`。

## 坑 2：插件安装只显示 exit code 1

现象：

```text
npm install for cloudcli-plugin-starter failed (exit code 1)
```

真实原因：本机 npm registry 指向旧 taobao mirror，安装 `@types/node` 时被 npmmirror 返回 `400 Bad Request`。

修复：

- 插件安装默认使用 `https://registry.npmjs.org/`
- 可通过 `CLOUDCLI_PLUGIN_NPM_REGISTRY` 覆盖
- 安装失败时返回 npm stderr，避免只看到 exit code

## 坑 2.5：Web 形态安装被 Electron 下载拖慢或超时

现象：`npm install` 时卡在 Electron 二进制下载，或者因为网络超时失败。

原因：项目同时支持桌面形态，依赖安装阶段可能触发 Electron 相关下载；但只运行 Web 服务时不需要 Electron 二进制。

修复：启动脚本默认设置：

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1
```

如果以后要打包桌面版，再显式关闭这个环境变量并重新安装依赖。

## 坑 3：TaskMaster 已安装但 UI 仍提示未安装

现象：用户确认装过 `task-master-ai`，但设置页仍提示未安装。

原因：TaskMaster 安装在 Node 20 下，而 CloudCLI 服务运行在 Node 22 下。CloudCLI 检测执行的是当前进程 PATH 里的：

```text
which task-master
task-master --version
```

修复：在 CloudCLI 使用的 Node 版本下安装：

```bash
nvm use 22
npm install -g task-master-ai --registry=https://registry.npmjs.org/
```

然后通过 `reclaude` 添加 MCP：

```bash
reclaude mcp add task-master-ai --scope user --env TASK_MASTER_TOOLS=core -- "$(command -v task-master-ai)"
```

## 坑 4：TaskMaster init 后 CloudCLI 仍显示 not-configured

现象：`task-master init -y` 成功，但 CloudCLI 项目状态仍是 `not-configured`。

原因：TaskMaster `0.43.1` 默认只生成 `.taskmaster/config.json` 和 `.taskmaster/state.json`，不预创建 `.taskmaster/tasks/tasks.json`。旧检测逻辑把 `tasks/tasks.json` 当作必需文件。

修复：项目级检测只把 `config.json` 当作初始化必需文件；没有任务文件时按空任务集处理。

## 验证命令

```bash
task-master --version
reclaude mcp list
curl --noproxy '*' http://127.0.0.1:3002/api/auth/status
```

登录后验证：

```text
/api/taskmaster/installation-status -> isReady=true
/api/plugins -> project-stats/serverRunning=true
```

## 安全注意

`admin / 123456` 只适合本机或可信局域网临时验证。只要监听 `0.0.0.0` 或暴露到公网，就必须换强密码并加访问控制。
