# Shell 移动端体验分析

## 结论

当前 Shell 的核心不是“能不能打开”，而是移动端终端交互没有按终端产品单独设计。问题主要集中在三类：

1. 手势事件：终端区域没有隔离页面级 overscroll，移动端上滑/下拉容易触发浏览器刷新。
2. 滚动性能：xterm `scrollback=10000`、WebGL/WebLinks addon、prompt buffer 扫描叠加，在移动端容易卡。
3. 快捷键替代：底部快捷栏只覆盖 Esc、Tab、Shift-Tab、Ctrl、Alt、方向、Paste、ScrollDown，缺少 PageUp/PageDown、Home/End、Ctrl+C/D/L/R/Z、搜索/历史等常用终端操作。

## 现有实现

- 终端组件：`src/components/shell/view/Shell.tsx`
- xterm 初始化：`src/components/shell/hooks/useShellTerminal.ts`
- 移动端快捷栏：`src/components/shell/view/subcomponents/TerminalShortcutsPanel.tsx`
- xterm 参数：`src/components/shell/constants/constants.ts`
- 移动端 CSS：`src/index.css`

关键配置：

```ts
scrollback: 10000
nextTerminal.loadAddon(new WebLinksAddon())
nextTerminal.loadAddon(new WebglAddon())
```

移动端 CSS 里有全局规则：

```css
* { touch-action: manipulation; }
.overflow-y-auto, [data-scroll-container] { touch-action: pan-y; }
.xterm, .xterm .xterm-viewport { user-select: text; }
```

这些规则对普通页面没问题，但终端是一个高频输入/滚动控件，应该有独立触摸策略。

## 具体问题

### 1. 下拉刷新

移动端浏览器会在页面顶端响应 pull-to-refresh。当前 Shell 外层是普通 `overflow-hidden`，终端内部 viewport 能滚，但没有明确：

```css
overscroll-behavior: contain;
touch-action: none 或 pan-x/pan-y 的精细控制;
```

结果是用户在终端顶部附近翻页时，手势可能冒泡到浏览器视口，触发整页刷新。

### 2. 翻页卡顿

可能原因：

- xterm scrollback 高达 10000，移动端 DOM/canvas buffer 压力大。
- WebLinksAddon 会对输出链接做检测，长日志场景增加处理成本。
- WebglAddon 在部分移动浏览器上未必比 canvas 稳，失败 fallback 也不代表性能最佳。
- 每次输出都会触发 `onOutputRef`，再 debounce 扫描 buffer 查 CLI prompt；长输出时仍会产生额外工作。
- 底部固定快捷栏和 terminal viewport 同时响应横向/纵向手势，可能造成滚动竞争。

### 3. 快捷键不够

移动端没有物理键盘，Ctrl/Alt 只作为一次性 modifier 存在，但快捷栏缺少常用组合：

- Ctrl+C：中断当前命令
- Ctrl+D：EOF/退出
- Ctrl+L：清屏
- Ctrl+R：历史搜索
- Ctrl+Z：挂起
- PageUp/PageDown：翻页
- Home/End：行首/行尾
- Cmd/Ctrl+K：清行
- 软键盘隐藏/聚焦切换

这会导致移动端 Shell 看起来能开，但实际很难高效操作。

## 建议改造

### 第一阶段：止血

- 给 Shell 根容器加 `data-shell-terminal`。
- 在 CSS 中对 `[data-shell-terminal]`、`.xterm-viewport` 设置 `overscroll-behavior: contain`。
- 移动端 Shell 禁止页面级 pull-to-refresh 透传。
- 移动端降低 scrollback，例如 2000。
- 移动端默认不加载 WebLinksAddon，或者只在桌面加载。

### 第二阶段：移动端快捷键补齐

- 快捷栏改成分组：基础、Ctrl、导航、翻页。
- 添加 Ctrl+C/D/L/R/Z、PageUp/PageDown、Home/End。
- 增加“长按 Ctrl 锁定”和“一次性 Ctrl”两种状态。
- 提供一个小型命令面板，不让所有快捷键挤在单行横滑条里。

### 第三阶段：性能验证

- 用移动端视口压测输出：`yes | head -n 5000`、`cat large.log`。
- 记录滚动 FPS、输入延迟、下拉刷新是否触发。
- 分别对比 scrollback 10000/2000、WebLinks on/off、WebGL/canvas。

## 推荐优先级

先做第一阶段，因为它能直接解决“移动端容易刷新页面”和“翻页卡”的主观痛点。第二阶段再补快捷键，避免先把快捷栏做复杂但底层滚动仍然难用。
