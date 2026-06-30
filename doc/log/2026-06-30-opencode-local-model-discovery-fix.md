# 日志：OpenCode 本地配置模型发现修复

日期：2026-06-30

## 用户需求

用户询问 OpenCode 在当前 CloudCLI 服务里是否能使用，以及 OpenCode 下为什么看不到自己配置的模型。

## 执行过程

1. 检查项目 OpenCode provider、auth、models、前端 provider selection 相关代码。
2. 确认 `server/opencode-cli.js` 会通过 `opencode run --model <model>` 启动 OpenCode，会话能力本身存在。
3. 检查模型接口缓存逻辑，发现 OpenCode/Cursor/Codex 会写入 `~/.cloudcli/provider-models-cache.json`，TTL 为 3 天。
4. 读取当前缓存，确认 `opencode` 条目仍是内置 fallback 模型，不包含用户配置的 `glm/glm-5.1`、`test111/glm5.1`。
5. 检查 OpenCode 配置文件，确认 `~/.config/opencode/opencode.json` 中存在自定义 provider/model。
6. 在 Codex 沙箱直接执行 `opencode models` 时遇到 `FileSystem.open ~/.local/share/opencode/log/opencode.log`，原因是沙箱不能写真实 HOME 下的 OpenCode 日志。
7. 复制 OpenCode 配置和 auth 到 `/tmp/claudecodeui-opencode-home`，用隔离 HOME 复刻 CLI 行为。
8. 在隔离 HOME 下确认 `opencode models --pure` 能列出本地配置模型；普通 `opencode models` 会尝试请求 `models.dev`，受网络/插件链路影响。
9. 修改 `server/modules/providers/list/opencode/opencode-models.provider.ts`，优先使用 `opencode models --pure`，失败或无结果再回退普通 `opencode models`。
10. 新增 `server/modules/providers/tests/opencode-models.test.ts` 回归测试，覆盖普通发现失败时仍保留本地配置模型。
11. 运行聚焦单测和完整 typecheck。
12. 尝试重启 `cloudcli-npm-dev` 运行态，但旧 3001/3002 Node 进程无法由当前沙箱 `kill`，返回 `operation not permitted`。
13. 清理临时 OpenCode HOME：`/tmp/claudecodeui-opencode-home` 已删除。

## 修改文件

- `server/modules/providers/list/opencode/opencode-models.provider.ts`
- `server/modules/providers/tests/opencode-models.test.ts`
- `doc/2026-06-30-opencode-local-model-discovery-fix.md`
- `doc/log/2026-06-30-opencode-local-model-discovery-fix.md`

## 验证命令

```bash
node --test --import tsx server/modules/providers/tests/opencode-models.test.ts
npm run typecheck
HOME=/tmp/claudecodeui-opencode-home XDG_CONFIG_HOME=/tmp/claudecodeui-opencode-home/.config XDG_DATA_HOME=/tmp/claudecodeui-opencode-home/.local/share node --import tsx --eval "const { OpenCodeProviderModels } = await import('./server/modules/providers/list/opencode/opencode-models.provider.ts'); const models = await new OpenCodeProviderModels().getSupportedModels(); console.log(JSON.stringify({ default: models.DEFAULT, values: models.OPTIONS.map((option) => option.value) }, null, 2));"
```

## 验证结果

- OpenCode 模型单测：3 个通过。
- `npm run typecheck`：通过。
- 真实 OpenCode CLI 加配置副本：返回 `glm/glm-5.1`、`test111/glm5.1`。

## 未完成运行态

源码已修复，但当前 3001/3002 旧进程仍在运行：

```text
3001 -> PID 24523
3002 -> PID 24585
```

当前沙箱不能终止这些进程。需要用户在本机终端重启 `npm run dev`，然后通过模型刷新覆盖旧 fallback 缓存。
