# 快速迭代期启动规则调整日志

日期：2026-06-30

## 用户要求

用户要求：

> 这两个方式都不用，把 launchagent 这个步骤去掉，以后都npm run dev，在这个快速迭代的时期先简单用这个进行

## 执行动作

1. 将表述整理为：快速迭代期统一从源码目录前台运行 `npm run dev`。
2. 更新 `CLAUDE.md`：
   - 移除默认启动路径里的 LaunchAgent/运行副本/同步部署叙述。
   - 设置当前默认启动命令为 `nvm use 22` + `npm run dev`。
   - 标记 LaunchAgent、运行副本和同步脚本为当前暂停使用的旧链路。
3. 给上一份规则阅读文档补充“已被后续规则替代”的说明。
4. 新增 `doc/2026-06-30-npm-run-dev-only-iteration-rule.md` 记录本次决策。

## 未执行动作

- 未停止或卸载当前 LaunchAgent。
- 未删除 `scripts/sync-reclaude-run.sh` 或 `scripts/run-cloudcli-lan.sh`。
- 未修改源码运行逻辑。
- 未启动 `npm run dev`。

## 后续注意

如果当前机器上此前已经加载了 `com.local.cloudcli-lan`，它仍可能占用 `3001`。后续启动 `npm run dev` 前应先只读检查端口占用；如需停止旧服务，应由用户明确确认是否执行一次性清理。

