# 2026-06-30 Mac Finder/文件夹加载卡顿排查日志

## 时间

- 开始：2026-06-30 07:26 CST
- 结束：2026-06-30 07:30 CST

## 用户问题

用户询问当前机器是否很卡，以及为什么“找文件夹”会卡到加载不出。

## 执行过程

1. 按照项目要求，先纠正问题边界：把“找文件夹卡”拆成 Finder 打开目录卡顿、文件选择器枚举目录卡顿、Finder/Spotlight 搜索卡顿。
2. 读取本地诊断和 macOS 存储审计技能说明，确认本次只做只读排查。
3. 检查系统版本、uptime 和 load average。
4. 检查 CPU、内存、磁盘、Spotlight、Time Machine、Finder、FileProvider/iCloud、PersonalOS 相关后台服务。
5. 启动过一次只读存储审计，但发现深扫 `du` 会增加 I/O 压力，随后终止本次由我触发的审计进程。
6. 写入本总结和日志文档。

## 关键观察

- macOS：14.5，Apple Silicon，8 核，16GiB 内存。
- uptime：约 1 天 8 小时，4 个用户会话。
- load average：从约 `4.42 4.83 4.80` 上升到约 `5.41 5.10 4.91`。
- Data 卷：`/System/Volumes/Data` 已用约 `373GiB/460GiB`，可用约 `48GiB`，容量 `89%`。
- 当前内存压力不是最高风险，`memory_pressure` 显示空闲比例约 `48%-51%`。
- `/System/Volumes/VM` 约 `21G`，说明虚拟内存占用不小。
- `replayd` 持续高 CPU：约 `75%-86%`。
- `personalos.worker` 持续高 CPU：多次采样约 `85%-96%`。
- `personalos.backend`、`personalos.frontend`、`personalos.worker` 都处于 LaunchAgent 启用状态。
- `mdutil` 显示 `/` 和 `/System/Volumes/Data` 的 Spotlight 索引均已启用。
- Finder 进程本身没有显示为高 CPU；Time Machine 当前 `Running = 0`。
- 本项目目录 `/Users/hongsucao/Documents/temp/claudecodeui` 本身约 `1.0G`，`node_modules` 约 `981M`，不是当前全机卡顿的主因。

## 影响判断

当前 Finder/文件夹加载慢的直接风险排序：

1. `personalos.worker` 和 `replayd` 持续高 CPU。
2. 浏览器、Codex、Virtualization、Docker、iStat 等叠加占用。
3. Data 卷可用空间只有约 `48GiB`，磁盘余量偏紧。
4. Spotlight/iCloud/FileProvider 元数据服务在活动，可能拖慢搜索或云目录加载。

## 本次变更

- 新增 `doc/2026-06-30-mac-finder-lag-diagnosis.md`。
- 新增 `doc/log/2026-06-30-mac-finder-lag-diagnosis.md`。
- 未修改代码。
- 未清理文件。
- 未停止用户已有服务。
