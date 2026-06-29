# 2026-06-29 macOS / Android 原生化分析日志

## 用户需求

用户希望先综合分析当前 CloudCLI / Claude Code UI 软件，并评估如何把它变成 macOS 和 Android 软件，同时强化：

1. 通知功能；
2. 便捷操作；
3. 查看系统内存、CPU 等资源使用情况；
4. 比 Web 端更丝滑流畅。

## 执行过程

1. 读取项目结构、`package.json`、`README.md`、`vite.config.js`、`.env.example`。
2. 读取既有文档：
   - `doc/2026-06-28-shell-mobile-ux-analysis.md`
   - `doc/2026-06-28-reclaude-macos-install.md`
   - `doc/log/2026-06-28-reclaude-macos-install.md`
3. 分析前端入口：
   - `src/main.jsx`
   - `src/App.tsx`
   - `src/components/app/AppContent.tsx`
   - `src/components/chat/view/ChatInterface.tsx`
   - `src/components/command-palette/CommandPalette.tsx`
   - `src/components/quick-settings-panel/`
4. 分析后端入口和模块：
   - `server/index.js`
   - `server/modules/providers/README.md`
   - `server/modules/websocket/README.md`
   - `server/modules/websocket/services/*`
5. 分析通知相关代码：
   - `public/sw.js`
   - `src/hooks/useWebPush.ts`
   - `src/components/settings/view/tabs/NotificationsSettingsTab.tsx`
   - `server/services/notification-orchestrator.js`
   - `server/services/vapid-keys.js`
   - `server/routes/settings.js`
6. 分析系统资源相关未提交改动：
   - `server/routes/system.js`
   - `server/services/system-metrics.service.ts`
   - `src/components/quick-settings-panel/hooks/useSystemMetrics.ts`
   - `src/components/quick-settings-panel/view/SystemResourcesSection.tsx`
7. 分析便捷操作相关未提交改动：
   - 会话置顶
   - Claude 会话 fork
   - Command Palette
   - Quick Settings
8. 分析移动端 Shell 改动：
   - `src/components/shell/hooks/useShellTerminal.ts`
   - `src/components/shell/view/Shell.tsx`
   - `src/index.css`
9. 查证原生工程状态：
   - `electron/main.js` 不存在。
   - `android/` 不存在。
   - `capacitor.config.*` 不存在。
   - `src-tauri/tauri.conf.json` 不存在。
10. 执行验证命令：
    - `node -v`、`npm -v` 默认失败，原因是当前 shell 未加载 nvm。
    - `source ~/.nvm/nvm.sh && nvm use 22.22.3 >/dev/null && node -v` 返回 `v22.22.3`。
    - `source ~/.nvm/nvm.sh && nvm use 22.22.3 >/dev/null && npm -v` 返回 `10.9.8`。
    - `source ~/.nvm/nvm.sh && nvm use 22.22.3 >/dev/null && npm run typecheck` 通过。
    - `source ~/.nvm/nvm.sh && nvm use 22.22.3 >/dev/null && npm run build` 通过。
11. 最终状态核对时，工作区出现了 `QuickSettingsContent.tsx` 和 `QuickSettingsPanelView.tsx` 的新改动：系统资源面板已接入 Quick Settings，并用面板打开状态控制轮询。随后重新执行 typecheck 和 build，均通过。

## 关键发现

- 当前项目核心仍是 Web/PWA + Node 本地服务，不是已完成的 macOS / Android App。
- `package.json` 有 Electron 脚本和 builder 配置，但没有 Electron 主进程目录。
- Android 方向没有任何原生工程或 Capacitor/Tauri 配置。
- 通知功能已有 Web Push、Service Worker、VAPID、通知偏好和事件编排基础。
- 系统资源监控后端、hook、组件已写，当前工作区也已把组件接入 Quick Settings；仍需要补 i18n 和运行态验证。
- 便捷操作已有 Command Palette、Quick Settings、会话置顶、Claude fork 等基础，但还没有系统级快捷入口。
- 移动端 Shell 已有触摸滚动增强，但仍需要真机验证。
- build 通过，但有 CSS minify warning、Browserslist 旧数据 warning、主 bundle 过大 warning。

## 产出

- 新增分析文档：`doc/2026-06-29-macos-android-native-analysis.md`
- 新增执行日志：`doc/log/2026-06-29-macos-android-native-analysis.md`

## 建议下一步

优先做阶段 0：先稳定当前 Web/PWA 可见能力，包括系统资源面板运行态验证、i18n、CSS warning、重复 Service Worker 注册和移动端 Shell 真机验证。完成后再进入 macOS Electron 最小可用版。
