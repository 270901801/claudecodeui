# 2026-06-30 对话文件链接打开内置编辑器修复

## 背景

此前对话回答中的文件链接会被渲染成普通 `<a href target="_blank">`。当链接形如：

```text
http://192.168.8.104:3001/Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md
```

浏览器会请求站点下的 `/Users/...` 路径，而不是调用 claudecodeui 的项目文件读取能力。

## 修复内容

新增 `src/components/chat/utils/fileLinkRouting.ts`：

- 识别当前项目根目录内的文件链接。
- 支持同源 HTTP URL，例如 `http://192.168.8.104:3001/Users/.../project/doc/a.md`。
- 支持绝对路径 href，例如 `/Users/.../project/doc/a.md`。
- 拒绝外部 HTTP 链接，即使其 pathname 看起来像本机路径。
- 拒绝项目根目录外的路径，以及同前缀但不在项目边界内的路径。

更新 `src/components/chat/view/subcomponents/Markdown.tsx`：

- `Markdown` 支持可选 `projectRoot` 和 `onFileOpen`。
- 当前项目内文件链接会拦截普通左键点击，调用 `onFileOpen(filePath)` 打开内置编辑器。
- 外部链接仍保持原来的新标签打开行为。

更新调用链：

- `MessageComponent` 将 `selectedProject.fullPath || selectedProject.path` 和 `onFileOpen` 传给普通回答、思考内容、工具展示文本、工具错误输出中的 Markdown。
- `MarkdownContent` 和 `ToolRenderer` 的 markdown 分支也接入同一套文件链接处理。

## 为什么不开放静态目录

没有新增 `/Users` 或项目根目录静态服务。原因是：

- 直接暴露用户目录风险过高。
- 会绕过已有 `projectId`、认证、项目根路径校验。
- 当前编辑器和文件树已经具备安全的项目内文件打开通道。

## 验证

已执行：

```sh
node --test --import tsx src/components/chat/utils/fileLinkRouting.test.ts
npx eslint src/components/chat/view/subcomponents/Markdown.tsx src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/tools/ToolRenderer.tsx src/components/chat/tools/components/ContentRenderers/MarkdownContent.tsx src/components/chat/utils/fileLinkRouting.ts src/components/chat/utils/fileLinkRouting.test.ts
npm run typecheck
npm run build:client
```

结果：

- 新增 5 个路径解析测试通过。
- 本次触达文件 ESLint 通过。
- 前后端 TypeScript 类型检查通过。
- 前端 Vite 生产构建通过。

构建时仍有既有提示：

- Browserslist 数据过期。
- CSS minify 对既有 CSS 片段报若干 warning。
- bundle chunk size warning。

这些提示未阻断构建，且不是本次文件链接修复引入的问题。

## 当前边界

本轮没有通过 in-app Browser 实际点击页面，因为当前工具搜索没有暴露 Browser 工具；已用单元测试、类型检查、ESLint 和 Vite 构建覆盖可执行验证。

