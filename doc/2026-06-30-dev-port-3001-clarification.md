# 开发端口规则澄清：浏览器只用 3001

日期：2026-06-30

## 表述校正

“只用 3001”更准确应表述为：

> 浏览器和手机访问入口只用 `3001`；`npm run dev` 内部仍需要一个后端 API 端口，当前使用 `3002`。

原因是 `npm run dev` 同时启动两个服务：

- Vite 前端服务：负责页面、HMR、代理转发。
- 后端 API 服务：负责 `/api`、WebSocket、Shell、插件等后端能力。

两个服务不能同时监听同一个端口。因此要让用户只访问 `3001`，就应该让 Vite 监听 `3001`，后端监听 `3002`。

## 当前命令

```bash
cd /Users/hongsucao/Documents/temp/claudecodeui
nvm use 22
HOST=0.0.0.0 VITE_PORT=3001 SERVER_PORT=3002 CLAUDE_CLI_PATH="$HOME/.local/bin/reclaude" npm run dev
```

访问地址：

```text
http://127.0.0.1:3001
http://192.168.8.104:3001
```

## 对 5173 的说明

`5173` 只是 Vite 在没有显式 `VITE_PORT` 时的默认端口。此前预检它，是因为上一版规则写成裸 `npm run dev`。按当前规则，不再把 `5173` 作为本项目快速迭代期目标端口。

后续启动前只需要重点检查：

- `3001` 是否可作为浏览器入口。
- `3002` 是否可作为后端内部端口。

