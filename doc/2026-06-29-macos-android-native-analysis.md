# CloudCLI macOS / Android 原生化综合分析

日期：2026-06-29

## 结论

更准确的表述是：当前项目不是“一个已经能打包的 macOS / Android App”，而是“React/Vite Web 客户端 + Node/Express 本地服务 + PWA 基础 + 若干桌面配置残留”。要变成 macOS 和 Android 软件，不能只把页面套一层 WebView；必须处理本地 Node 服务、CLI 子进程、PTY、SQLite、文件系统、通知、后台连接和系统权限。

推荐路线：

1. macOS 先做 Electron 本地 App。仓库已有 Electron 依赖和 `electron-builder` 配置，但缺少 `electron/main.js`，所以最快是补齐 Electron 主进程，把现有 Node 服务作为本地 sidecar/子进程运行。
2. Android 第一阶段不要尝试本机跑完整 Node + CLI + PTY。更现实的是做远程客户端，连接 Mac/云端/局域网服务，用 FCM/原生通知、深链、分享入口和快捷操作增强体验。
3. 先把当前 Web/PWA 的可见能力稳定住：系统资源面板当前已接入 Quick Settings，但还需要补 i18n 和运行态验证；移动端 Shell 已开始处理触摸滚动，但构建仍有 CSS warning；Service Worker 注册有重复入口。

## 当前软件形态

### 前端

- 技术栈：React 18、Vite、Tailwind、CodeMirror、xterm.js。
- 入口：`src/main.jsx`、`src/App.tsx`、`src/components/app/AppContent.tsx`。
- 主要界面：
  - Chat：`src/components/chat/view/ChatInterface.tsx`
  - Shell：`src/components/shell/view/Shell.tsx`
  - 文件树 / 编辑器 / Git / TaskMaster / MCP / 设置 / 插件
  - Command Palette：`src/components/command-palette/CommandPalette.tsx`
  - Quick Settings：`src/components/quick-settings-panel/`
- 移动/PWA 基础：
  - `public/manifest.json`
  - `public/sw.js`
  - `src/hooks/useDeviceSettings.ts`
  - `src/index.css` 里已有 safe-area、PWA mode、移动触摸规则。

### 后端

- 技术栈：Node 22、Express、ws、better-sqlite3、node-pty、systeminformation、web-push。
- 入口：`server/index.js`。
- 核心职责：
  - HTTP API：项目、会话、Git、设置、通知、系统资源、插件。
  - WebSocket：`/ws` 聊天流、`/shell` PTY、`/plugin-ws/:pluginName`。
  - Provider 抽象：Claude、Codex、Cursor、Gemini、OpenCode。
  - 本地数据：用户、API key、通知偏好、push subscription、会话索引等 SQLite 表。

### 原生化现状

- `package.json` 有 `desktop`、`desktop:dev`、`desktop:dist:mac` 和 electron-builder 配置。
- 当前仓库没有 `electron/` 目录，也没有 `electron/main.js`，所以桌面 App 入口不可用。
- 当前仓库没有 `android/`、Capacitor、Tauri、React Native 或 Gradle 工程。
- 也就是说：macOS 和 Android 目前都还没有真实 App 工程。

## 对你提出的四类能力的评估

### 1. 通知功能

已有基础：

- Web Push：`src/hooks/useWebPush.ts`
- Service Worker push/click：`public/sw.js`
- VAPID key：`server/services/vapid-keys.js`
- 通知编排：`server/services/notification-orchestrator.js`
- 设置页：`src/components/settings/view/tabs/NotificationsSettingsTab.tsx`
- 数据库：`user_notification_preferences`、`push_subscriptions`、`vapid_keys`
- 触发事件：权限请求、运行停止、运行失败、agent notification。

缺口：

- 这是浏览器通知模型，不是 macOS Notification Center / Android FCM 原生模型。
- Web Push 依赖浏览器能力、HTTPS/localhost 条件、Service Worker 生命周期。
- 点击通知已能回到会话，但还没有原生通知动作，例如“停止任务”“继续会话”“打开 Shell”。

原生化建议：

- macOS：Electron `Notification` + tray badge + deep link `cloudcli://session/:id`。
- Android：FCM + notification channel + pending intent 打开会话；后续加通知动作。
- 服务端统一保留现有 `NotificationEvent` 结构，新增 native channel adapter，避免 Web Push 和原生推送各写一套业务逻辑。

### 2. 便捷操作

已有基础：

- Command Palette 支持新会话、设置、切换 tab、Git fetch/pull/push、查会话、查文件、查 commit/branch。
- Quick Settings 支持外观、工具展示、视图选项、输入设置。
- 当前未提交改动新增了会话置顶和 Claude 会话 fork。
- Shell 移动端已有快捷键面板，已有触摸滚动改造雏形。

缺口：

- 便捷操作仍在 Web UI 内部，没有系统级入口。
- macOS 没有菜单栏、全局快捷键、Dock/tray 状态、系统分享入口。
- Android 没有 launcher shortcuts、分享 intent、通知动作、quick settings tile。
- 一些新能力缺少 i18n 文案，例如会话 pin/fork 的 tooltip/error fallback 依赖默认英文。

原生化建议：

- macOS 第一批：
  - 菜单栏/状态栏：运行中任务数、最近会话、打开当前会话、停止全部。
  - 全局快捷键：打开/隐藏、快速新建任务、打开 Command Palette。
  - Dock badge：运行中数量或待处理权限数量。
- Android 第一批：
  - Launcher shortcut：最近会话、新建任务。
  - Share intent：从其他 App 分享文本到当前项目/新会话。
  - 通知动作：停止、打开、继续输入。

### 3. 系统资源使用情况

已有基础：

- 后端采集：`server/services/system-metrics.service.ts`
- API：`GET /api/system/metrics`
- 前端 hook：`src/components/quick-settings-panel/hooks/useSystemMetrics.ts`
- 前端组件：`src/components/quick-settings-panel/view/SystemResourcesSection.tsx`
- `/status` 命令也已接入系统指标摘要。

明确缺口：

- `SystemResourcesSection` 当前已在 Quick Settings 中渲染，并通过面板打开状态控制 2 秒轮询；还需要运行态确认接口、认证和 UI 展示都正常。
- i18n 没有补 `quickSettings.sections.systemResources` 和 `quickSettings.systemResources.*`，现在靠 defaultValue。
- 当前采集的是运行后端那台主机的资源，不是 Android 手机本机资源。Android App 如果连接 Mac 服务，资源面板展示的应是“远端主机资源”，需要文案明确。

原生化建议：

- Web/PWA 先验证 Quick Settings 里的资源面板，并补齐文案、错误态和移动端布局。
- macOS Electron 可补本机菜单栏资源摘要，继续复用同一 API。
- Android 第一阶段显示远端主机资源；如需显示手机本机资源，再通过 Android native bridge 采集并单独标注。

### 4. 比 Web 端更丝滑流畅

已有基础：

- 已有 PWA safe area、移动布局、虚拟键盘适配、触摸规则。
- Shell 已增加单指拖动转 `terminal.scrollLines()`，并给移动端终端底部留出快捷栏空间。
- WebSocket 已有心跳、断线重连、会话事件 replay。

当前风险：

- `npm run build` 通过，但 CSS minify 报多条 `css-syntax-error` warning，集中在移动端 CSS 输出附近。它不阻断构建，但会降低后续稳定性判断。
- 前端主 bundle 仍大：`index` 约 2.70 MB，gzip 约 821 KB；CodeMirror、xterm 已分 chunk，但业务主包仍偏大。
- Quick Settings 当前用 2 秒轮询系统资源，打开时可接受，但长期应考虑 WebSocket/SSE 或降低刷新策略。
- 移动端 Shell 的真实体验仍需要设备级验证：长输出、滚动、输入法、下拉刷新、横竖屏。

提升路线：

1. 修 CSS warning，确认移动端样式不会被 minifier 错误丢弃。
2. 对 Chat、Git、Files、Tasks、Settings 做路由级懒加载。
3. Shell 移动端继续补 PageUp/PageDown、Home/End、Ctrl+C/D/L/R/Z、搜索/历史。
4. 原生 App 用系统键盘、通知、状态栏、触觉反馈、深链、后台恢复来补浏览器体验短板。

## macOS 推荐架构

推荐 Electron，而不是 Tauri/Swift 原生重写。

原因：

- 仓库已经有 Electron 依赖、electron-builder 配置和协议声明。
- 现有后端是 Node 生态，Electron 主进程天然适合管理 Node sidecar、端口、日志、重启。
- node-pty、better-sqlite3、CLI 子进程、文件系统访问都更容易在 Electron 里落地。

目标架构：

```text
CloudCLI.app
  Electron main process
    - 启动 / 停止本地 Node server
    - 管理 tray / menu / notification / deep link
    - 监听 server 健康状态
  Renderer
    - 加载现有 React UI
  Node server sidecar
    - 复用 server/index.js
    - 继续提供 API / WebSocket / SQLite / provider runtime
```

第一阶段必须补：

- `electron/main.js`
- dev/prod server 启动策略
- 随机或固定本地端口与健康检查
- native notification bridge
- tray / menu / reopen behavior
- code signing / notarization / auto update 评估
- native modules 打包与 rebuild：`node-pty`、`better-sqlite3`

## Android 推荐架构

推荐 Android 先做远程客户端，不做本机完整后端。

原因：

- 当前后端依赖 Node、PTY、本地 CLI、SQLite、本地文件系统和桌面 agent CLI。
- 在 Android 本机跑 Claude/Codex/Cursor/Gemini CLI 的前置条件复杂，不适合作为第一阶段。
- 用户真正想要的移动价值更像“随时看任务、接通知、快速回复、停止/继续任务”，这些可以通过连接远端服务完成。

第一阶段架构：

```text
Android App
  Native shell / WebView 或 Capacitor
    - 登录 / 服务器发现
    - 加载现有移动 Web UI
    - FCM 通知
    - 深链打开 session
    - 分享入口 / launcher shortcuts

Remote CloudCLI Server
  - 跑在 Mac / 云主机 / Tailscale 网络内
  - 提供 API / WebSocket / 系统资源 / agent runtime
```

Android 第一阶段要明确：

- 资源面板展示的是远端主机，不是手机本机。
- 后台任务在远端机器上跑，手机只负责控制和查看。
- 需要安全连接方案：HTTPS、Tailscale、反代、短期 token、设备绑定。

## 推荐阶段计划

### 阶段 0：补齐当前 Web/PWA 可见能力

- 验证 Quick Settings 中的 `SystemResourcesSection` 运行态展示。
- 补齐中英文 i18n。
- 修 build CSS warning。
- 清理重复 Service Worker 注册。
- 对移动端 Shell 做一次真实设备验证。

### 阶段 1：macOS Electron 最小可用版

- 补 Electron 主进程。
- 打包现有 React + Node server。
- 本地通知、tray、deep link、全局快捷键。
- 启动/退出/更新/日志路径/崩溃恢复。

### 阶段 2：Android 远程客户端

- 选择 Capacitor 或 Kotlin WebView 壳。
- 服务器连接配置、登录、设备 token。
- FCM 推送、通知点击回会话。
- Android 分享入口、launcher shortcuts。

### 阶段 3：统一原生桥接能力

- 抽象 notification channel：webPush / macOS / Android。
- 抽象 native actions：open session / stop run / new task / quick reply。
- 抽象 device metrics：host metrics 与 device metrics 分开展示。

## 需要提前决策的问题

1. macOS App 是只给自己用，还是要公开分发？公开分发会牵涉签名、公证、更新、AGPL 源码义务。
2. Android App 是只连自己 Mac，还是也要连 CloudCLI Cloud？这决定登录、通知和服务器发现方案。
3. 资源面板默认展示“运行 agent 的主机”，还是同时展示“当前设备”？两个概念必须分清。
4. 通知是否要支持操作按钮？如果支持，服务端要有可幂等的 action API。
5. 是否接受 Electron 体积，换取最快落地？如果不能接受，再评估 Tauri sidecar，但成本更高。

## 本次验证证据

- `node` / `npm` 默认不在当前 shell PATH，需显式 `source ~/.nvm/nvm.sh && nvm use 22.22.3`。
- Node 版本：`v22.22.3`。
- npm 版本：`10.9.8`。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- build warning：
  - Browserslist 数据较旧。
  - CSS minify 报多条 `css-syntax-error` warning。
  - 主业务 bundle 仍超过 1000 kB warning。
- `electron/main.js` 不存在。
- `android/`、Capacitor、Tauri 配置不存在。
