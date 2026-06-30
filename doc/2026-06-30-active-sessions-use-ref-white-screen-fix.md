# 2026-06-30 ActiveSessionsCapsule 白屏修复

## 背景

页面在桌面端和手机端都能返回 HTTP 200，但进入页面后先闪过图标，然后变成空白。用户提供的浏览器控制台报错为：

```text
ActiveSessionsCapsule.tsx:123 Uncaught ReferenceError: useRef is not defined
```

这类问题不是端口、反向代理或后端接口连通性问题。HTTP 200 只能证明 HTML/资源入口能返回，不能证明 React 运行时渲染成功。

## 根因

`src/components/active-sessions/ActiveSessionsCapsule.tsx` 中新增逻辑调用了 `useRef(0)`：

```ts
const prevNeedsInputRef = useRef(0);
```

但当时 React import 中没有引入 `useRef`，导致组件渲染时在浏览器运行时直接抛出 `ReferenceError`。由于该组件位于主界面渲染路径上，异常会导致整页白屏。

## 修复

在 `ActiveSessionsCapsule.tsx` 中恢复 `useRef` import：

```ts
import { useEffect, useRef, useState } from 'react';
```

同时只做了一个缩进修正，不改动已有交互行为和无关文件。

## 验证

已执行：

```bash
source ~/.nvm/nvm.sh
nvm use 22 >/dev/null
npx tsc --noEmit -p tsconfig.json --pretty false
```

结果：通过，无输出，退出码 0。

已通过 Vite dev server 直接读取浏览器实际会加载的模块：

```bash
curl --noproxy '*' -sS http://127.0.0.1:3001/src/components/active-sessions/ActiveSessionsCapsule.tsx
```

结果：编译后的模块中已经包含：

```js
const useRef = __vite__cjsImport3_react["useRef"];
```

说明当前 `3001` dev server 实际返回的前端代码已经不再缺失 `useRef`。

还确认：

```bash
curl --noproxy '*' -sS -I http://127.0.0.1:3001/session/54168495-7d1f-404b-99ea-b60fb94e80c6
```

结果：`HTTP/1.1 200 OK`。

## 注意

- 前面看到的 `jwt malformed` / `401` 是测试登录态生成方式错误造成的验证噪音，不是本次白屏根因。
- Playwright CLI 做干净会话验证时出现会话卡住，已中断并清理测试会话进程。
- Playwright CLI 生成的临时 `.playwright-cli/` 目录已检查无 token 后删除。
- 如果手机或浏览器仍显示旧白屏，优先强刷页面或关闭旧标签重新进入 `http://<Mac局域网IP>:3001/`，因为这次是前端模块热更新/缓存路径上的运行时代码修复。
