# 本地开发

## 自定义端口

```bash
tldraw-cli start --port 9000 --ws-port 9001
```

默认 HTTP 8787 / WS 8788，自定义端口在多实例或端口冲突时使用。

## 生产模式 vs 开发模式

|           | 生产模式                                     | 开发模式                                 |
| --------- | -------------------------------------------- | ---------------------------------------- |
| 启动方式  | `tldraw-cli start`                           | 三个终端分别启动                         |
| 前端来源  | Host 从 `dist/client/` serve 静态文件 (8787) | Vite dev server 提供 HMR 热更新 (8789)   |
| Host 来源 | `dist/host.mjs` (构建产物)                   | `tsx host/HostProcess.ts` (源码直接运行) |
| CLI 来源  | `dist/cli.mjs` (构建产物)                    | `tsx cli/main.ts` (源码直接运行)         |
| 适用场景  | 最终用户、LLM skill 调用                     | 开发调试、修改代码                       |

## 开发调试流程

```bash
# 一键拉起（Host + Vite dev server + 打开浏览器）
npm run dev

# 用 CLI 操作画布
npm run cli -- status
npm run cli -- canvas list
npm run cli -- canvas snapshot
echo '{"commands":[...]}' | npm run cli -- command apply

# 关闭
npm run cli -- stop
```

浏览器自动打开 `http://localhost:8789/`（Vite HMR 热更新），改前端代码即时生效。
Host 运行在 8787（HTTP）/ 8788（WS），改 host/ 代码后需 stop + 重新 dev。

如需分别控制各进程（如单独调试 Host），可用 `npm run dev:host` + `npm run dev:client` 分终端启动。

## 脚本

| 脚本                   | 说明                                                     |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | 一键启动 Host + Vite dev server + 打开浏览器（= `tldraw-cli start --dev`） |
| `npm run dev:client`     | 单独启动 Vite dev server (8789)，需配合 `npm run dev:host`   |
| `npm run dev:host`         | 单独启动 Host (HTTP 8787 / WS 8788)                     |
| `npm run cli -- <cmd>` | tsx 直接跑 CLI 源码                                      |
| `npm run build`        | 一次构建前端 + CLI + Host                                |
| `npm run build:client` | 只构建前端                                               |
| `npm run build:cli`    | 只构建 CLI + Host                                        |
| `npm run test`         | vitest run                                               |
| `npm run test:watch`   | vitest watch                                             |

## 测试

```bash
npm run test                   # 全量
npx vitest run cli             # CLI 层
npx vitest run host            # Host 层
npx vitest run shared/rpc      # 协议契约
npx vitest run __tests__/e2e   # 端到端
```

## 构建与分发

```bash
npm run build
# 产出：
#   dist/client/    前端静态文件（Host 在生产模式自动 serve）
#   dist/cli.mjs    CLI 入口（含 #!/usr/bin/env node）
#   dist/host.mjs   Host 入口
#
# package.json 的 bin 字段注册 tldraw-cli
# npm link 或全局 npm install 后可直接使用 tldraw-cli 命令
```

## 技术栈

TypeScript 5.8 / `@stricli/core`（CLI）/ Vite 8 + rolldown（构建）/ `ws`（Node WebSocket）/ `react` + `tldraw`（浏览器 runtime）/ `zod@4`（schema）/ `vitest`（测试）/ `tsx`（开发时直接运行 TS）
