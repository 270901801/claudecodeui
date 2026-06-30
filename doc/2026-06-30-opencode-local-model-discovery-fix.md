# OpenCode 本地配置模型发现修复

日期：2026-06-30

## 表述校正

“open code 在这个服务里面能不能使用、我配置的模型能不能使用”更准确地说是：

> 检查 CloudCLI 的 OpenCode provider 是否能调用本机 OpenCode CLI，并且模型列表接口是否能读取 OpenCode 本地配置里的自定义 provider/model。

这样区分了两个问题：OpenCode 会话能否启动，以及 UI 模型 catalog 是否能发现并展示本地配置模型。

## 结论

OpenCode provider 本身可以使用。`server/opencode-cli.js` 启动 OpenCode 时会把选中的模型作为 `--model <provider/model>` 传给 `opencode run`。

本次“OpenCode 下面没有我配置的模型”的直接原因是模型发现链路：旧实现只执行 `opencode models`。在当前环境里这条命令会尝试请求 `https://models.dev/api.json`，失败或超时后服务端静默回退到内置 fallback 列表，导致 UI 只看到默认的 Claude/OpenAI/Gemini 模型。

## 现场证据

- 本机 OpenCode CLI 存在：`/opt/homebrew/bin/opencode`，版本 `1.17.11`。
- OpenCode 配置中有自定义 provider/model：
  - `glm/glm-5.1`
  - `test111/glm5.1`
- `~/.cloudcli/provider-models-cache.json` 里的 `opencode` 条目是 fallback 列表，不包含上述自定义模型。
- 隔离 HOME 下执行 `opencode models --pure` 能返回本地配置模型：
  - `glm/glm-5.1`
  - `test111/glm5.1`
- 隔离 HOME 下普通 `opencode models` 日志显示会先尝试拉取 `models.dev`，失败信息为 `Failed to fetch models.dev`。

## 修复

修改 `server/modules/providers/list/opencode/opencode-models.provider.ts`：

- 优先执行 `opencode models --pure`。
- 如果 pure 模式能解析出模型，直接用这些模型构建 UI catalog。
- 如果 pure 模式失败或没有模型，再回退到旧的 `opencode models`。

这个策略让本地 OpenCode 配置模型不再依赖外部插件加载或 `models.dev` 网络请求。

## 验证

已通过：

```bash
node --test --import tsx server/modules/providers/tests/opencode-models.test.ts
npm run typecheck
```

真实 OpenCode CLI 加配置副本验证结果包含：

```text
opencode/big-pickle
opencode/deepseek-v4-flash-free
opencode/mimo-v2.5-free
opencode/nemotron-3-ultra-free
opencode/north-mini-code-free
deepseek/deepseek-chat
deepseek/deepseek-reasoner
deepseek/deepseek-v4-flash
deepseek/deepseek-v4-pro
glm/glm-5.1
test111/glm5.1
```

## 运行态说明

当前 3001/3002 仍有旧 dev 进程在监听：

```text
3001 -> PID 24523
3002 -> PID 24585
```

本次 Codex 沙箱尝试终止旧进程时返回 `operation not permitted`，因此源码已修复并验证，但当前浏览器里的旧服务进程尚未被我重启。需要在本机终端停止旧 dev 进程后重新启动：

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

重启后在 UI 里对模型列表执行刷新，或请求 `/api/providers/opencode/models?bypassCache=true`，即可让旧 fallback 缓存被新结果覆盖。
