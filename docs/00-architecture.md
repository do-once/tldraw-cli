# 架构

## 三端分离

三个进程独立运行，无共享内存，通信全部显式：

```
外部调用方（LLM / 脚本 / SDK）
    │
    │  HTTP JSON-RPC 2.0（POST /rpc，无状态）
    ▼
Host 进程（Node，长 lived）
    │
    │  WebSocket JSON-RPC 2.0（长连接，双向）
    ▼
浏览器 Runtime（React + tldraw editor）
    │
    ▼
tldraw editor/store（唯一数据源）
```

- **CLI**（`cli/`）：短 lived Node 进程，每条命令执行完即退。`start/stop/status` 是本地命令（管理 Host 进程生命周期，不走 RPC），`canvas/command` 是 Host RPC 的薄适配。CLI 只是 Host 的众多适配器之一——REST API、SDK、MCP 将来也是适配器。
- **Host**（`host/`）：公共 RPC 边界，核心是 7 个 RPC 方法。不持有画布状态副本，所有读写最终转发到 Runtime 执行。
- **Runtime**（`client/runtime/`）：浏览器端，承载 tldraw editor。通过 `RuntimeMount` 组件挂载到 `<Tldraw>` 内部，不干扰用户手动操作画布。

## Host 内部分层

Host 按依赖倒置原则（DIP）组织为六个角色，应用层只依赖抽象接口，不感知传输细节：

```
┌─────────────────────────────────────────────┐
│  ApiGateway（接口层）                         │
│  HTTP 入口 · envelope 解码 · schema 校验      │
│  错误码映射 · 静态文件服务                     │
├─────────────────────────────────────────────┤
│  ApplicationServices（应用层）                │
│  SessionService · CanvasService              │
│  CommandService                              │
│  ↓ 仅依赖 RuntimeGateway 抽象接口            │
├─────────────────────────────────────────────┤
│  Domain（领域层）                             │
│  Session · Canvas · Revision                 │
│  CommandBatch · HistoryEntry                 │
├─────────────────────────────────────────────┤
│  Infrastructure（基础设施层）                  │
│  RuntimeRegistry · RuntimeRouter             │
│  WsRuntimeTransport（实现 RuntimeGateway）    │
└─────────────────────────────────────────────┘
```

换传输方式（如进程内测试、IPC）时，只需实现 `RuntimeGateway` 接口，应用层零修改。

## 浏览器 Runtime 分离

Runtime 端做了传输与业务的严格分离：

- **RuntimeWsClient**（纯传输）：WebSocket 建连/重连、JSON-RPC envelope 编解码、handshake 握手、`session.shutdown` 接收。不知道 tldraw 的存在。
- **TldrawRuntimeAdapter**（业务翻译）：接收 `(method, params)` 调用，翻译为 tldraw editor API 操作，维护 per-canvas 的 revision 和 history entries。不知道 WebSocket 的存在。

两者通过 `RuntimeAdapter` 接口组合，职责清晰。

## RPC 方法

7 个方法分为三组，覆盖查询、画布管理、写入操作：

| 方法              | 参数                      | 返回值                                     | 用途                             |
| ----------------- | ------------------------- | ------------------------------------------ | -------------------------------- |
| `session.status`  | 无                        | host 版本/运行时长、runtime 列表、活跃画布 | 查询整体运行状态                 |
| `canvas.list`     | 无                        | `[{ id, title, revision }]`                | 枚举所有画布（对应 tldraw page） |
| `canvas.snapshot` | `canvasId?`               | 当前画布全量 shapes + revision             | LLM 读取画布基线                 |
| `canvas.diff`     | `canvasId?`, `since`      | `since` 之后的 HistoryEntry 列表           | LLM 增量感知画布变化             |
| `canvas.create`   | `title?`                  | 新 canvasId + revision                     | 新建画布                         |
| `canvas.select`   | `canvasId`                | 当前 activeCanvasId                        | 切换活跃画布                     |
| `command.apply`   | `canvasId?`, `commands[]` | canvasId + revision + results              | 批量写入命令（原子执行）         |

`canvasId` 省略时使用当前活跃画布。`command.apply` 整个 `commands[]` 数组原子执行，全部成功或全部回滚。

## 并发与一致性

- **revision**：per-canvas 单调递增整数，由 Runtime 端维护。每次 `command.apply` 成功后 revision +1。跨 canvas 不可比较，runtime 重启后归零，LLM 用 `canvas.snapshot` 重建基线。
- **history entries**：`command.apply` 成功后记录变更条目（如 `shape-created`），`canvas.diff` 通过 `since` 参数过滤返回。
- **单写者假设**：第一版假定单 Host + 单 Runtime + 单 Writer。`expectedRevision` 和 `idempotencyKey` 字段已预留但不检查（last-write-wins）。
- **人机共画**：浏览器画布既能被 CLI 驱动，也能被用户手动操作。两端共用同一份 `editor.store`，tldraw 自身的操作序列化保证一致性。

## 目录结构

| 目录                | 用途                                                       |
| ------------------- | ---------------------------------------------------------- |
| `cli/`              | CLI 适配层（stricli 入口 + hostClient + commands）         |
| `host/`             | Host Node 进程（ApiGateway + ApplicationServices + infra） |
| `client/runtime/`   | 浏览器端 runtime 新增代码                                  |
| `shared/rpc/`       | RPC 协议契约（envelope / errors / capability / methods）   |
| `client/`（其余）   | starter 原生 React app，作为实现参考                       |
| `shared/`（其余）   | starter 原生 schema / format                               |
| `docs/`             | 架构、开发、扩展文档                                       |
| `skill/`            | LLM skill 定义                                             |
| `public/`           | 静态资产                                                   |
