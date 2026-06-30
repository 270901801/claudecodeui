# 2026-06-30 OpenCode CLI 路径与模型选择折叠

## 背景

本次改动解决两个实际问题：

1. `opencode` 已经作为 provider 接入 CloudCLI，但服务端多处直接调用裸命令 `opencode`。在当前机器上真实二进制位于 `/opt/homebrew/bin/opencode`，而运行环境的 `PATH` 不一定包含该目录，导致模型列表和会话启动可能回退或失败。
2. 新建会话时的模型选择器会一次性展开所有 provider 的所有模型，`Google/Gemini` 和 `Cursor` 对当前使用场景噪音较大，希望默认折叠，但仍可展开选择。

## 本次实现

### 1. OpenCode CLI 路径配置

- 新增共享 helper：`server/shared/opencode-cli-path.ts`
- 支持通过 `OPENCODE_CLI_PATH` 显式指定 OpenCode CLI 路径
- 统一接入以下路径消费点：
  - OpenCode 安装检查
  - OpenCode 模型列表读取
  - OpenCode 会话运行
  - OpenCode Shell 恢复/启动命令
- 更新 `.env.example`
- 更新 `cloudcli status` 与 `cloudcli help` 的环境变量展示

### 2. 模型选择器默认折叠

- 新增前端纯函数 helper：`src/components/chat/view/subcomponents/providerSelectionGroups.ts`
- 新建会话的模型选择器中：
  - `Gemini`
  - `Cursor`

  默认折叠
- 当前活跃 provider 不会保持折叠状态
- 搜索模型时，即使默认折叠，也会自动展开对应分组，避免搜索结果被隐藏

## 验证

- `node --import tsx --test server/shared/tests/opencode-cli-path.test.ts`
- `node --import tsx --test src/components/chat/view/subcomponents/providerSelectionGroups.test.ts`
- `npm run typecheck`
- `npx eslint ...`（针对本次改动文件的窄范围校验）

以上均通过。

## 备注

- 本次未处理中文 `opencode` 文案和空状态中的“刷新模型”入口；这属于后续可选增强，不在本次授权范围内。
