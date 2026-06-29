# 2026-06-30 Mac Finder/文件夹加载卡顿排查

## 问题表述修正

用户原始描述是“当前这个机器是不是很卡，为什么我找文件夹都卡的加载不出”。更准确的技术表述可以拆成：

- Finder 打开目录或文件选择器枚举目录卡顿。
- Finder/Spotlight 搜索文件夹时加载不出或响应慢。

这两类问题都可能表现为“找文件夹卡”，但根因分别偏向系统负载、磁盘空间、Spotlight 索引、iCloud/FileProvider、外接/网络盘、文件数量和具体目录结构。

## 当前结论

当前机器确实处于明显高负载状态，不是 Finder 单进程自身卡死。

主要证据：

- 采样时 load average 约 `4.4-5.4`，持续不低。
- Data 卷 `/System/Volumes/Data` 已用约 `373GiB/460GiB`，容量 `89%`，可用约 `48GiB`。这属于偏紧状态，容易放大索引、缓存、交换和文件枚举延迟。
- `memory_pressure` 显示当前内存空闲比例约 `48%-51%`，不是立即内存耗尽；但 `/System/Volumes/VM` 约 `21G`，历史 `Swapins/Swapouts` 很高，说明这台机器近期经历过大量内存压缩/交换。
- `replayd` 持续接近一核满载，约 `75%-86% CPU`。`replayd` 是 macOS 屏幕录制/回放相关系统进程，常见于录屏、屏幕共享、采集或某些自动化/会议类场景。
- `personalos.worker` 多次采样接近一核满载，约 `85%-96% CPU`，且 PID 会变化，说明 PersonalOS 后台 worker 正在被拉起执行重任务或循环任务。
- PersonalOS 相关 LaunchAgent 处于启用状态：`personalos.backend`、`personalos.frontend`、`personalos.worker`。
- Codex、Headless Chrome、Edge、Virtualization、Docker、iStat Menus 等也同时占用资源。
- Finder 本身 CPU 不高，Time Machine 当前未在备份；Spotlight 索引开启，并且有 `mds/mdworker/mdbulkimport`、`fileproviderd`、`bird/cloudd` 等相关服务活动。

因此当前最可能的解释是：

1. CPU 被多个后台任务持续占用，Finder/文件选择器响应被拖慢。
2. Spotlight/iCloud/FileProvider 正在参与文件元数据和云文件状态处理，搜索文件夹时更容易卡。
3. 磁盘可用空间偏紧，系统缓存、索引和虚拟内存空间的缓冲变小，导致体感更差。

## 高优先级处理建议

建议先处理低风险、立刻能验证的项：

1. 确认是否正在录屏、屏幕共享、会议共享、自动化截图或采集；如果没有，优先重启相关应用或重启机器，让 `replayd` 退出高 CPU 状态。
2. 如果当前不需要 PersonalOS 后台任务，暂停或卸载 `personalos.worker`，再观察 Finder 是否恢复。
3. 关闭不需要的浏览器/Edge 标签页、虚拟机和 Docker 后再测一次 Finder。
4. 释放一部分磁盘空间，建议把 Data 卷可用空间提升到至少 `80-100GiB`，再观察 Spotlight 和 Finder。
5. 如果问题集中在搜索，而不是打开普通目录，再单独诊断 Spotlight 索引状态。

## 本次没有做的事

- 没有清理文件。
- 没有停止 PersonalOS、Docker、Codex、浏览器或系统服务。
- 一开始启动过一次只读存储审计，发现深扫会增加 I/O 压力后，已终止本次由排查触发的 `audit_macos_storage.sh` 和 `du -sh ...` 进程。

## 关键命令

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
sw_vers
uptime
df -h / /System/Volumes/Data
memory_pressure
vm_stat
ps -axo pid,ppid,%cpu,%mem,stat,etime,command -r | head -40
mdutil -s / /System/Volumes/Data
tmutil status
launchctl list | grep -Ei 'personal|cloud|claude|codex|reclaude|uvicorn|python'
pgrep -lf 'app.worker|uvicorn app.main:app --host 127.0.0.1 --port 8000|personalOS'
```
