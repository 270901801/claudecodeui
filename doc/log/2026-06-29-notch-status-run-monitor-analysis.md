# 任务日志：macOS 顶栏与 Android 挖孔状态监控分析

日期：2026-06-29

## 用户需求

用户要求本轮不要开始实现，继续分析：

1. macOS 顶部控制栏 / 挖孔屏位置显示运行状态，鼠标悬停展开详情面板，展示哪些任务正在运行、哪些正在结束。
2. Android 基础功能固定显示在下拉通知栏。
3. Android 进阶设置可像 macOS 一样在挖孔控制栏附近悬浮显示，点击查看所有正在进行的项目。
4. 参考一加 / ColorOS 已有类似效果，研究其实现逻辑和可用接口。

## 执行动作

- 对齐上一轮 `doc/2026-06-29-macos-android-native-analysis.md`。
- 检查当前工作区状态，确认已有大量未提交改动，未触碰业务代码。
- 搜索并阅读当前代码中的运行状态基础：
  - `server/modules/websocket/services/chat-run-registry.service.ts`
  - `server/modules/providers/services/sessions.service.ts`
  - `server/modules/providers/provider.routes.ts`
- 确认现有 `GET /api/providers/sessions/running` 只返回较薄的 running session 状态。
- 查询平台资料：
  - Electron Tray / Menu Bar 文档。
  - Android Foreground Service 文档。
  - Android `WindowManager.LayoutParams` overlay / display cutout 文档。
  - OPPO / ColorOS Fluid Cloud 与 OPPO Push 文档。
- 输出分析文档：`doc/2026-06-29-notch-status-run-monitor-analysis.md`。

## 关键判断

- macOS 不应承诺真正占用 notch；应先做菜单栏运行监控器。
- Android 基础版应走 Foreground Service + ongoing notification。
- ColorOS 高级胶囊效果应优先验证 OPPO Fluid Cloud，而不是用普通悬浮窗冒充系统能力。
- 普通 Android overlay 只能作为 fallback，且不能覆盖关键系统窗口。
- 当前项目需要先抽象 `RunActivity`，否则后续 macOS、Android、ColorOS 会出现多套状态逻辑。

## 未执行内容

- 未修改业务代码。
- 未新增 Electron / Android 工程。
- 未运行构建或测试，因为本轮范围是分析与文档沉淀。
- 未提交 git。
