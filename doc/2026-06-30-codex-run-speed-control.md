# Codex 1.5x speed / fast tier 实现记录

## 背景

用户要实现的是 Codex 面板上的 `1.5x speed` 和推理强度选项。更准确的技术表述是：为 Codex provider 增加两个独立运行参数，`fast` service tier 控制 `1.5x speed`，`modelReasoningEffort` 控制推理强度；这不是语音播放倍速，也不是前端流式文本刷新速度。

## 关键证据

- 本机 `@openai/codex-sdk` 的 `CodexOptions` 支持 `config`，SDK 会把它转换成 Codex CLI 的 `--config key=value`。
- 本机 `@openai/codex-sdk` 的 `ThreadOptions` 支持 `modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh"`。
- 本机 Codex App 二进制能检索到 `service_tier`、`additional_speed_tiers`、`fast-mode`、`toggle_fast_mode` 等字段。
- `~/.codex/models_cache.json` 中 `gpt-5.5` 和 `gpt-5.4` 都有 `additional_speed_tiers: ["fast"]`，并支持 `low / medium / high / xhigh` 推理强度。
- `~/.codex/config.toml` 中已有 `model_reasoning_effort = "xhigh"`，并有注释说明新版 Codex 接受 `fast/flex` 这类 `service_tier` 值。

## 本次实现

- 移除了错误的 `useAgentRunSpeed` 前端播放速度方案，`useChatRealtimeHandlers` 恢复固定 `100ms` 流式刷新。
- 在 Codex provider 的输入工具栏增加 `1x / 1.5x` 切换按钮，只在 provider 为 `codex` 时显示。
- 用 `localStorage` 持久化 `codex-service-tier`，仅保存 `fast`；默认态不写配置。
- 发送 `chat.send` 时，如果当前 provider 是 Codex 且按钮处于 `1.5x`，在 `options` 中带上 `serviceTier: "fast"`。
- 后端 `server/openai-codex.js` 校验 `serviceTier`，只接受 `fast` / `flex`，并在创建 `new Codex(...)` 时透传为 `config: { service_tier: "fast" }`。
- 如果模型名本身已经是 `*-fast`，前端不会重复发送 `serviceTier: "fast"`，避免双重 fast 配置。
- 在 Codex provider 的输入工具栏增加推理强度按钮，循环 `auto / low / medium / high / xhigh`。
- 用 `localStorage` 持久化 `codex-reasoning-effort`，默认 `auto` 不写覆盖值。
- 发送 `chat.send` 时，如果当前 provider 是 Codex 且推理强度不是 `auto`，在 `options` 中带上 `reasoningEffort`。
- 后端 `server/openai-codex.js` 校验 `reasoningEffort`，并在 `startThread` / `resumeThread` 的 `threadOptions` 中传 `modelReasoningEffort`。

## 结论

这个项目里实现 Codex `1.5x speed` 的正确位置不是 `ActivityIndicator` 的播放速度，而是 Codex SDK 初始化配置。UI 上显示 `1.5x`，请求层传 `serviceTier: "fast"`，SDK 层落到 `service_tier=fast`。推理强度走另一条 thread option：UI 选择 `low / medium / high / xhigh`，请求层传 `reasoningEffort`，SDK 层落到 `modelReasoningEffort`。

## 验证

- 已搜索确认 `src/` 和 `server/` 中没有 `useAgentRunSpeed`、`runSpeed`、`Playback speed` 等错误实现残留；这些词只在文档中作为已撤销方案记录。
- `node` 解析英文/中文 `chat.json` 成功。
- `npm run typecheck` 通过。
- `npm run build:client` 通过。Vite 仍输出既有 CSS minify 与 chunk size warning，但未失败。

## 推理强度追加验证

- `node` 解析英文/中文 `chat.json` 成功。
- 搜索确认 `reasoningEffort`、`modelReasoningEffort` 链路存在。
- `git diff --check` 通过。
- `npm run typecheck` 通过。
- `npm run build:client` 通过。Vite 仍输出既有 CSS minify 与 chunk size warning，但未失败。
