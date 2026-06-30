# 2026-06-30 执行日志：OpenCode CLI 路径与模型选择折叠

## 用户目标

- 配置 `opencode` 到 `claudecodeui`
- 模型选择时把 `Google/Gemini` 与 `Cursor` 分组折叠
- 先分析，确认后执行；本轮用户选择 `C`，即同时落地两项

## 执行过程

1. 只读分析现有 provider 架构，确认 `opencode` 已存在完整后端接入，但 CLI 路径依赖裸命令。
2. 只读确认本机状态：
   - `opencode` 二进制位于 `/opt/homebrew/bin/opencode`
   - 当前 shell 裸命令解析不到 `opencode`
   - OpenCode 配置与认证文件存在
   - CloudCLI 模型缓存中的 `opencode` 仍是 fallback 模型集合
3. 采用 TDD 方式先补红灯：
   - `server/shared/tests/opencode-cli-path.test.ts`
   - `src/components/chat/view/subcomponents/providerSelectionGroups.test.ts`
4. 实现后端 `OPENCODE_CLI_PATH` 统一解析与接入点替换。
5. 实现空状态模型选择器默认折叠逻辑与搜索自动展开逻辑。
6. 补充 `.env.example` 与 `cloudcli status/help` 可见性。
7. 修复校验过程中的边界规则问题：
   - `eslint.config.js` 中补充 `server/shared/opencode-cli-path.ts` 的 shared util 分类
8. 运行验证命令，全部通过。

## 修改文件

- `server/shared/opencode-cli-path.ts`
- `server/shared/tests/opencode-cli-path.test.ts`
- `server/modules/providers/list/opencode/opencode-auth.provider.ts`
- `server/modules/providers/list/opencode/opencode-models.provider.ts`
- `server/opencode-cli.js`
- `server/modules/websocket/services/shell-websocket.service.ts`
- `server/cli.js`
- `.env.example`
- `src/components/chat/view/subcomponents/providerSelectionGroups.ts`
- `src/components/chat/view/subcomponents/providerSelectionGroups.test.ts`
- `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx`
- `eslint.config.js`

## 验证结果

- OpenCode 路径 helper 测试通过
- provider 分组折叠 helper 测试通过
- 前后端 `typecheck` 通过
- 改动文件的窄范围 `eslint` 通过

## 未执行项

- 未提交 git commit
- 未补 `zh-CN` 的 `opencode` 文案
- 未给空状态模型选择器增加“刷新模型”按钮
