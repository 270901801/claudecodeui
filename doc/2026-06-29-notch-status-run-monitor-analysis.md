# macOS 顶栏与 Android 挖孔状态监控分析

日期：2026-06-29

## 表述校正

你说的“正在工作的绘画”更准确应叫“正在运行的任务 / 会话 / Agent Run”。如果后续要产品化，建议统一成 `Run Activity` 或“运行活动”，因为它可以覆盖 Claude/Codex/Gemini/OpenCode 等不同 provider，而不是绑定到某一种“绘画”或“聊天”形态。

“挖孔控制栏”在 macOS 上不是一个公开可占用的系统区域。更准确的目标是：“在 macOS 菜单栏 / notch 附近做一个运行状态入口，鼠标悬停或点击展开详情面板”。Android 上也要分清：系统通知栏是公共能力；ColorOS 那种胶囊 / 流体云是厂商能力；普通悬浮窗只是近似效果，不等于真正接入系统挖孔区域。

## 本轮结论

1. macOS 第一阶段应该做“菜单栏运行监控器”，而不是直接追求真正占用 notch。
2. Android 基础版应该做“前台服务 + 常驻通知”，这是标准 Android 路线。
3. OnePlus / ColorOS 的高级胶囊效果，真正接近系统能力的是 OPPO Fluid Cloud / Intent Sharing / OPPO Push，不是普通 Android 公共 API。
4. 当前代码已经有运行中会话的基础数据源，但数据太薄，需要抽象一个统一的 `RunActivity` 层，供 macOS、Android 通知、ColorOS Fluid Cloud、Web 侧状态标识共用。

## 当前代码基础

已有能力：

- `server/modules/websocket/services/chat-run-registry.service.ts` 维护 live run。
- `chatRunRegistry.listRunningRuns()` 当前返回 `sessionId`、`provider`、`startedAt`、`lastSeq`。
- `server/modules/providers/services/sessions.service.ts` 暴露 `listRunningSessions()`。
- `server/modules/providers/provider.routes.ts` 已有 `GET /api/providers/sessions/running`。

现有限制：

- 当前状态只有 `running` / `completed`，不足以表达“正在结束”“等待授权”“失败”“刚完成”等系统 UI 需要的状态。
- 运行列表没有项目名、会话标题、最近输出摘要、可执行动作、注意力等级。
- macOS 顶栏、Android 通知、ColorOS Fluid Cloud 如果直接消费现在的接口，会很快分叉出多套状态逻辑。

推荐新增概念：

```ts
type RunActivityStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_permission'
  | 'stopping'
  | 'ending'
  | 'completed'
  | 'failed';

type RunActivity = {
  runId: string;
  sessionId: string;
  provider: string;
  projectId: string | null;
  projectName: string;
  title: string;
  status: RunActivityStatus;
  attention: 'normal' | 'needs_action' | 'error';
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  lastSeq: number;
  lastMessageSummary: string;
  actions: Array<'open' | 'stop' | 'approve' | 'mute'>;
};
```

## macOS 端方案

### 推荐路线：Menu Bar Run Monitor

用 Electron 的 `Tray` / macOS menu bar extra 做常驻入口。Electron 官方文档明确 macOS tray 图标位于右上角 menu bar extras 区域，适合当前项目的 Electron 路线。

交互建议：

- 常态：一个小胶囊或图标，显示运行中数量、待处理数量、状态色。
- Hover：展开一个轻量详情面板。
- Click：固定面板，允许操作。
- 右键：显示设置、暂停通知、退出。

面板结构：

- 正在运行：项目名、provider、运行时长、最近输出摘要。
- 正在结束：用户已点停止、provider 正在收尾、等待 complete event。
- 需要处理：权限请求、确认继续、错误恢复。
- 刚完成：短时间保留，方便快速回看。

技术形态：

- Electron main process 维护 `Tray`。
- 用 frameless / transparent / always-on-top `BrowserWindow` 做 hover panel。
- 面板通过 REST + WebSocket 订阅 `RunActivity`。
- 点击 action 走 backend idempotent action API，例如 `POST /api/run-activities/:id/actions/stop`。

需要注意：

- 不建议第一阶段做“真正贴进 MacBook notch 的自绘 overlay”。macOS 没有稳定的第三方 notch system API，overlay 对多屏、全屏、Spaces、菜单栏自动隐藏都敏感。
- 可视觉上“靠近 notch / 顶栏”，但产品描述应避免承诺“占用系统挖孔区域”。

## Android 基础版

### 推荐路线：RunMonitorForegroundService

Android 官方文档对 Foreground Service 的定位是：用于用户可感知、正在前台执行的任务，并显示 status bar notification。因此“固定显示在下拉通知栏中”应走前台服务 + ongoing notification。

交互建议：

- 常驻通知标题：`3 个任务正在运行`。
- 展开通知：显示前 3-5 个任务。
- 通知动作：
  - 打开
  - 停止当前任务
  - 静音本轮
  - 设置
- 有多个任务时用 grouped notification 或 summary notification。

运行策略：

- 只有存在 active run 或用户开启“始终监控”时启动前台服务。
- App 前台时走 WebSocket 实时更新。
- App 后台 / 被系统回收时走 FCM 或厂商 Push 触发同步。
- 不要把远端任务误写成手机本机任务，通知文案应表达为“远端主机上的任务”。

## Android 高级版：ColorOS / OnePlus 胶囊

### 真正接近系统效果的路线：OPPO Fluid Cloud

根据阿里云 EMAS 的 OPPO Fluid Cloud 文档，接入前需要：

- 集成 Android SDK 和 OPPO channel。
- 根据 OPPO 的 access preparation 明确需求并联系 OPPO 确认。
- 获取 `client_id` 和 `client_secret`，并在推送平台配置。
- 支持本地 active 进程用 `ContentProviderClient` 创建、更新、结束 Fluid Cloud。
- 支持远程通过 Push / MassPush API 创建、更新、结束 Fluid Cloud。
- 使用 `AndroidOppoIntelligentIntent` 结构，其中 `actionStatus = 0/1/2` 分别表示创建、更新、结束。
- `TASK` 是与当前需求最接近的场景类型。

适配到本项目：

```text
RunActivity created/running
  -> actionStatus = 0
  -> entityName = TASK
  -> capsule.rightText = "2 running" / provider 状态
  -> primary.title = 项目名或会话名
  -> secondaryData = 进度 / 阶段 / 最近状态

RunActivity updated
  -> actionStatus = 1
  -> 更新运行数量、最近状态、attention

RunActivity ending/completed/failed
  -> actionStatus = 2 或 AndroidOppoDeleteIntentData
  -> 销卡
```

关键限制：

- Fluid Cloud 文档写的是 ColorOS 15+。
- OPPO Push 文档显示 OPPO Push 支持 OPPO、OnePlus、realme 生态设备，但 Fluid Cloud 是否可用仍取决于系统版本、地区、账号审核、应用包名和 OPPO 开放平台配置。
- ColorOS 15 的 capsule 有系统显示时长限制，文档示例写到最长 5 分钟，具体还可能随系统版本变化。
- 这不是 Play Store / AOSP 标准能力，不能作为 Android 通用方案承诺。

### 备选路线：普通悬浮窗

如果 OPPO Fluid Cloud 暂时拿不到资格，可以做 Android overlay 近似效果：

- 申请 `SYSTEM_ALERT_WINDOW`。
- 用 `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` 创建悬浮小胶囊。
- 靠近屏幕顶部 / 挖孔区域摆放。
- 点击打开项目列表。

但这个能力有明显边界：

- Android 官方说明 `TYPE_APPLICATION_OVERLAY` 位于 activity 窗口之上，但低于 status bar / IME 等关键系统窗口。
- 系统可随时调整 overlay 的位置、大小或可见性以减少视觉混乱。
- 它不是真正的系统状态栏胶囊，也不能稳定覆盖系统挖孔。
- 权限敏感，用户会看到“显示在其他应用上层”的授权，部分系统会限制后台悬浮。

因此普通悬浮窗只能作为高级设置里的 fallback，不能替代 ColorOS Fluid Cloud。

## 建议阶段

### 阶段 1：统一运行活动模型

- 在 backend 增加 `RunActivityService`。
- 基于 `chatRunRegistry`、sessions DB、projects DB 聚合 richer state。
- 增加 REST：`GET /api/run-activities`。
- 增加 WebSocket event：`run_activity_updated`。
- 增加 action API：open / stop / approve / mute。

### 阶段 2：macOS 菜单栏面板

- Electron `Tray` 入口。
- Hover/click 面板。
- 只展示 `RunActivity`，不直接读 provider。
- 第一版只实现 open / stop / settings。

### 阶段 3：Android 常驻通知

- `RunMonitorForegroundService`。
- ongoing notification + notification actions。
- FCM / OPPO Push token 接入。
- 点击 deep link 到 session/project。

### 阶段 4：ColorOS Fluid Cloud 可行性验证

- 确认手机系统版本、地区、是否 ColorOS 15+。
- 注册 OPPO 开放平台应用。
- 申请 OPPO Push / Fluid Cloud 权限。
- 用 staging environment 做一个 `TASK` demo。
- 通过后再接入真实 `RunActivity`。

### 阶段 5：悬浮窗 fallback

- 仅在用户主动开启时启用。
- 明确提示权限和边界。
- 不遮挡状态栏、输入法、系统手势区域。

## 开放问题

1. “正在结束”的定义：用户点击停止后、provider 已收到 abort、还是 complete event 落库前？
2. 通知动作里的“停止”是否必须立即杀 provider 子进程？是否要二次确认？
3. Android 显示的是“远端 Mac 运行任务”，还是也要展示手机本机资源？
4. ColorOS 目标是一加哪款机型、当前系统版本、国内版 ColorOS 还是海外 OxygenOS？
5. 这个 App 是否准备公开分发？如果公开分发，macOS 签名公证和 Android 厂商审核都要纳入计划。

## 参考资料

- Electron Tray / Menu Bar： https://www.electronjs.org/docs/latest/tutorial/tray
- Android Foreground Services： https://developer.android.com/develop/background-work/services/fgs
- Android WindowManager.LayoutParams： https://developer.android.com/reference/android/view/WindowManager.LayoutParams
- OPPO Fluid Cloud Push Guide： https://help.aliyun.com/en/document_detail/2997310.html
- OPPO Push integration： https://www.alibabacloud.com/help/en/mobile-platform-as-a-service/latest/integrate-oppo-push
