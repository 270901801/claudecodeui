# 2026-06-30 Codex 1.5x speed / fast tier 日志

## 用户需求

用户询问本项目如何实现 Codex 面板里的 `1.5x speed` 选项，并指出当前项目没有该选项。后续明确纠正：`-FAST` / fast 才是 Codex 面板 `1.5x speed` 的实际含义；随后指出还缺 Codex 推理强度。

## 过程

1. 起初误判为语音播放倍速，随后又误判为前端运行展示速度。
2. 按前端展示速度做过一版错误实现：`useAgentRunSpeed`、`ActivityIndicator` 按钮、`useChatRealtimeHandlers` 刷新间隔倍率。
3. 用户进一步纠正后，重新核对本机 Codex 机制：
   - `@openai/codex-sdk` 支持 `CodexOptions.config`。
   - Codex App 二进制包含 `service_tier`、`additional_speed_tiers`、`fast-mode`、`toggle_fast_mode` 等字段。
   - `~/.codex/models_cache.json` 中 `gpt-5.5`、`gpt-5.4` 支持 `additional_speed_tiers: ["fast"]`。
   - `~/.codex/config.toml` 注释说明新版 Codex 接受 `fast/flex`。
4. 撤销错误的前端播放速度实现，改为 Codex provider 专用 fast tier：
   - 前端按钮显示 `1x / 1.5x`。
   - `1.5x` 发送 `serviceTier: "fast"`。
   - 后端创建 Codex SDK 实例时传 `config: { service_tier: "fast" }`。
5. 用户指出还缺推理强度后，核对 SDK 类型：
   - `ThreadOptions` 支持 `modelReasoningEffort`。
   - 当前模型缓存支持 `low / medium / high / xhigh`。
6. 补齐 Codex 推理强度：
   - 前端按钮循环 `auto / low / medium / high / xhigh`。
   - 非 `auto` 时发送 `reasoningEffort`。
   - 后端校验后传给 `threadOptions.modelReasoningEffort`。
7. 用户问“怎么报错了”：本轮 `npm run typecheck` 复现检查通过；如果指最后的 `AudioQueueStart failed (-66680)`，那是 macOS 完成提示音播放失败，不是项目编译错误。
8. 保留已有工作区脏改动，不回滚用户或其他任务已有修改。

## 改动文件

- `server/openai-codex.js`
- `src/components/chat/types/types.ts`
- `src/components/chat/hooks/useChatProviderState.ts`
- `src/components/chat/hooks/useChatComposerState.ts`
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- `src/components/chat/view/ChatInterface.tsx`
- `src/components/chat/view/subcomponents/ChatComposer.tsx`
- `src/components/chat/view/subcomponents/ActivityIndicator.tsx`
- `src/i18n/locales/en/chat.json`
- `src/i18n/locales/zh-CN/chat.json`
- `doc/2026-06-30-codex-run-speed-control.md`
- `doc/log/2026-06-30-codex-run-speed-control.md`

## 验证

- 搜索确认 `src/` 和 `server/` 中没有 `useAgentRunSpeed`、`runSpeed`、`Playback speed` 等错误实现残留；这些词只在文档中作为已撤销方案记录。
- `node` 解析英文/中文 `chat.json` 成功。
- `npm run typecheck` 通过。
- `npm run build:client` 通过。Vite 仍输出既有 CSS minify 与 chunk size warning，但未失败。

## 追加验证

- `node` 解析英文/中文 `chat.json` 成功。
- 搜索确认 `reasoningEffort` / `modelReasoningEffort` 链路存在。
- `git diff --check` 通过。
- `npm run typecheck` 通过。
- `npm run build:client` 通过。Vite 仍输出既有 CSS minify 与 chunk size warning，但未失败。

## 注意

工作区在本次改动前已有未提交修改，包括调度/配额后端文件、`ChatInterface.tsx`、`ChatComposer.tsx` 和 `RunDurationIndicator.tsx` 删除等。本次没有回滚这些既有改动。
