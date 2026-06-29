# 2026-06-30 对话回答文件链接无法访问诊断

## 问题

在 claudecodeui 项目页面中，点击对话回答里的文件链接：

```text
http://192.168.8.104:3001/Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md
```

无法直接打开对应文档。

更准确的描述是：对话 Markdown 把本机绝对文件路径当成普通 HTTP 链接渲染，浏览器因此请求站点内的 `/Users/...` 路径；但 claudecodeui 后端没有把本机绝对路径暴露为静态 HTTP 文件。

## 结论

这不是文档文件不存在。文件实际存在于：

```text
/Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md
```

真正原因是前后端的文件访问通道不一致：

- 普通聊天 Markdown 链接在 `src/components/chat/view/subcomponents/Markdown.tsx` 中被原样渲染成 `<a href={href} target="_blank">`。
- 后端 `server/index.js` 只静态暴露 `public/` 和 `dist/`，没有静态暴露 `/Users/hongsucao/...`。
- 后端已有项目文件读取 API：`/api/projects/:projectId/file?filePath=...` 和 `/api/projects/:projectId/files/content?path=...`，而且会校验文件必须位于项目根目录下。
- 文件树、工具结果文件列表等交互会走 `onFileOpen` 打开内置编辑器；普通回答 Markdown 链接没有接入这个 `onFileOpen` 机制。

因此，点击这个链接时浏览器不是在“打开本地文件”，而是在请求 claudecodeui 服务器的一个普通 URL 路径：

```text
GET /Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md
```

该路径不属于 `public/`、`dist/`，也不是 `/api/projects/...`，所以不会返回文档内容。

## 关键证据

### 文件存在

已确认目标文件存在，且能从本机文件系统读取。

### Markdown 链接原样打开

`src/components/chat/view/subcomponents/Markdown.tsx` 的 `a` 渲染器只是把 `href` 原样放到 `<a>` 上：

```tsx
a: ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)
```

这说明普通回答里的 Markdown 链接没有经过“项目文件路径识别 -> 内置编辑器打开”的转换。

### 后端静态服务范围有限

`server/index.js` 只注册了：

```js
app.use(express.static(path.join(APP_ROOT, 'public')));
app.use(express.static(path.join(APP_ROOT, 'dist'), ...));
```

没有注册 `/Users`、项目根目录或 `doc/` 的静态文件服务。

### 正确的文件读取通道是项目 API

后端读项目文件的 API 会先通过 `projectId` 找项目根，再解析 `filePath`，并限制路径必须在项目根下面：

```js
app.get('/api/projects/:projectId/file', authenticateToken, async (req, res) => {
  const projectRoot = await projectsDb.getProjectPathById(projectId);
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectRoot, filePath);
  if (!resolved.startsWith(path.resolve(projectRoot) + path.sep)) {
    return res.status(403).json({ error: 'Path must be under project root' });
  }
  const content = await fsPromises.readFile(resolved, 'utf8');
  res.json({ content, path: resolved });
});
```

这个设计是合理的安全边界：不要把用户主目录直接作为 HTTP 静态目录暴露。

## 修复方向

推荐修复普通聊天 Markdown 链接的前端行为，而不是开放 `/Users/...` 静态目录。

可选方案：

1. 在聊天 Markdown 的 `a` 组件里识别当前项目根目录下的本机绝对路径。
2. 如果链接指向当前 `selectedProject.fullPath` 或 `selectedProject.path` 内的文件，则阻止默认跳转，调用 `onFileOpen(relativeOrAbsolutePath)`。
3. 只对当前项目根目录内的路径启用这个行为；外部 HTTP 链接仍按普通链接打开。
4. 显示文本可继续保留为文件名或相对路径，例如 `doc/2026-06-30-network-proxy-diagnosis.md`。

这样点击对话回答里的文件链接会打开 claudecodeui 内置代码编辑器，而不是让浏览器去请求 `/Users/...`。

## 不推荐方案

不建议新增类似下面的全局静态暴露：

```js
app.use('/Users', express.static('/Users'));
```

原因：

- 会把用户主目录文件暴露到 HTTP 服务上，安全风险很大。
- 绕过了已有的 `projectId`、认证和项目根路径校验。
- 与当前文件树、编辑器、图片预览等既有架构不一致。

