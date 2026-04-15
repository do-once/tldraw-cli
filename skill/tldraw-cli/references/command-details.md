# tldraw-cli 命令详解

每个命令的完整参数、输出格式和边界情况。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [Shape 字段](shape-reference.md) · [RPC 方法](rpc-methods.md) · [错误码](error-codes.md) · [会话与环境](session-management.md)

## 目录

- [命令总览](#命令总览)
- [tldraw-cli start](#tldraw-cli-start)
- [tldraw-cli stop](#tldraw-cli-stop)
- [tldraw-cli status](#tldraw-cli-status)
- [tldraw-cli canvas list](#tldraw-cli-canvas-list)
- [tldraw-cli canvas snapshot](#tldraw-cli-canvas-snapshot)
- [tldraw-cli canvas diff](#tldraw-cli-canvas-diff)
- [tldraw-cli canvas create](#tldraw-cli-canvas-create)
- [tldraw-cli canvas select](#tldraw-cli-canvas-select)
- [tldraw-cli canvas get-selection](#tldraw-cli-canvas-get-selection)
- [tldraw-cli canvas screenshot](#tldraw-cli-canvas-screenshot)
- [tldraw-cli command apply](#tldraw-cli-command-apply)
- [tldraw-cli command undo](#tldraw-cli-command-undo)
- [tldraw-cli command redo](#tldraw-cli-command-redo)

---

## 命令总览

```
tldraw-cli start [--port <n>] [--ws-port <n>] [--dev]
tldraw-cli stop
tldraw-cli status
tldraw-cli canvas list
tldraw-cli canvas snapshot [--canvas <id>]
tldraw-cli canvas diff --since <n> [--canvas <id>]
tldraw-cli canvas create [--title <string>]
tldraw-cli canvas select --canvas <id>
tldraw-cli canvas get-selection [--canvas <id>]
tldraw-cli canvas screenshot [--canvas <id>]
tldraw-cli command apply [--canvas <id>]   # 从 stdin 读取 JSON
tldraw-cli command undo
tldraw-cli command redo
tldraw-cli install --skills <claude|agents> [--global]
```

除 `install` 外，所有命令的输出均为 **JSON**（stdout）。用 `node -p`（取单个值）或 `node -e`（多行 / 需要 `console.log` 显式输出）解析。错误信息输出到 stderr。

---

## 命令详解

### tldraw-cli start

启动 Host 进程和浏览器 Runtime 画布。**幂等**——重复调用不会报错也不会起第二个 Host。

```bash
tldraw-cli start                             # 默认端口
tldraw-cli start --port 9000 --ws-port 9001  # 自定义端口
tldraw-cli start --dev                       # 开发模式
```

| 参数 | 短写 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--port` | `-p` | number | 8787 | Host HTTP API 端口 |
| `--ws-port` | | number | 8788 | Host WebSocket 端口 |
| `--dev` | `-d` | boolean | false | 开发模式，启动 Vite dev server (8789)。仅开发 tldraw-cli 本身时用，常规使用画布不需要 |

**幂等三态：**

| state | 含义 | exit code |
|---|---|---|
| `running` | 本次调用真的 spawn 了新 Host | 0 |
| `already-running` | Host 已在跑，直接返回既有连接信息 | 0 |
| `error` | 冲突（如 `--port` 与现有 Host 不一致）| 1 |

**新启动（`state: "running"`）：**

```json
{
  "state": "running",
  "hostPid": 12345,
  "httpPort": 8787,
  "wsPort": 8788,
  "frontendUrl": "http://localhost:8787/",
  "dev": false
}
```

开发模式时 `frontendUrl` 为 `http://localhost:8789/`，`dev` 为 `true`。

**已在运行（`state: "already-running"`）：**

```json
{
  "state": "already-running",
  "hostPid": 12345,
  "httpPort": 8787,
  "wsPort": 8788,
  "frontendUrl": "http://localhost:8787/",
  "dev": false
}
```

**无 session 但默认端口被外部 Host 占用时**（手动启动的 Host），没有 `hostPid` / `wsPort`，多一个 `note` 字段：

```json
{
  "state": "already-running",
  "httpPort": 8787,
  "frontendUrl": "http://localhost:8787/",
  "note": "端口已有 Host 响应但无 session 文件（可能是手动启动）。若需替换请先 tldraw-cli stop"
}
```

**冲突（`state: "error"`）：**

```json
{
  "state": "error",
  "message": "Host already running on port 8787, but --port 9000 was requested. Run `tldraw-cli stop` first if you want to change port.",
  "hostPid": 12345,
  "httpPort": 8787
}
```

**启动后：**
- Host 在 `~/.tldraw-cli/session.json` 写入会话信息
- 浏览器打开 `frontendUrl` 后，Runtime 自动通过 WebSocket 连接 Host
- Host 关闭时自动清理 session 文件

---

### tldraw-cli stop

停止当前运行的 Host 进程。

```bash
tldraw-cli stop
```

无参数。停止策略：
1. 发送 `POST /admin/shutdown` 请求优雅关闭
2. 等待最多 5 秒
3. 超时则 SIGTERM / taskkill 强制终止
4. 如有 Vite dev server，同时终止

**输出示例：**

```json
{
  "state": "stopped",
  "graceful": true,
  "hostPid": 12345,
  "devPid": 67890
}
```

`devPid` 仅在 `--dev` 模式启动时出现。

| state 值 | 含义 |
|-----------|------|
| `stopped` | 成功停止（有 session 文件，或无 session 但默认端口有响应） |
| `not-running` | Host 未运行，无需操作 |
| `stale-cleared` | session 文件指向的进程已不存在，已清理 |

无 session 文件但默认端口有响应时，输出含 `note` 字段：
```json
{
  "state": "stopped",
  "graceful": true,
  "note": "无 session 文件，已向默认端口发送 shutdown"
}
```

---

### tldraw-cli status

查询 Host 运行状态。

```bash
tldraw-cli status
```

无参数。先读 session 文件，若不存在则探测默认端口。

**运行中：**

```json
{
  "state": "running",
  "hostPid": 12345,
  "httpPort": 8787,
  "wsPort": 8788,
  "startedAt": 1713347400000,
  "rpc": {
    "host": {
      "version": "0.0.0",
      "uptimeMs": 60000
    },
    "runtimes": [
      {
        "id": "rt-abc123",
        "state": "ready",
        "methods": ["canvas.list", "canvas.snapshot", "canvas.diff", "canvas.create", "canvas.select", "command.apply", "command.undo", "command.redo"],
        "protocolVersion": "1"
      }
    ],
    "activeCanvasId": null,
    "canvasCount": 1
  }
}
```

**未运行：**

```json
{
  "state": "not-running"
}
```

| state 值 | 含义 |
|-----------|------|
| `running` | Host 正在运行，`rpc` 字段包含详细信息 |
| `not-running` | Host 未运行 |
| `stale` | session 文件存在但进程已死（附带 `hostPid`，已自动清理 session 文件） |

**无 session 但默认端口有响应时**，也输出 `running`，但没有 `hostPid` / `wsPort` / `startedAt`，多一个 `note` 字段：
```json
{
  "state": "running",
  "httpPort": 8787,
  "note": "Host 在默认端口响应，但无 session 文件（可能是手动启动）",
  "rpc": { "..." : "..." }
}
```

**RPC 查询失败时**，`rpc` 字段为错误对象：
```json
{
  "rpc": { "error": "connect ECONNREFUSED ..." }
}
```

**判断 Runtime 是否就绪：** 检查 `rpc.runtimes` 数组中是否有 `state === "ready"` 的条目。

---

### tldraw-cli canvas list

列出所有画布。

```bash
tldraw-cli canvas list
```

**输出示例：**

```json
{
  "items": [
    {
      "id": "page:abc123",
      "title": "Page 1",
      "revision": 5
    }
  ]
}
```

每个画布有唯一 `id`（格式 `page:<随机>`）、`title`、当前 `revision`。

---

### tldraw-cli canvas snapshot

获取画布当前状态快照。

```bash
tldraw-cli canvas snapshot                     # 活跃画布
tldraw-cli canvas snapshot --canvas page:abc   # 指定画布
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--canvas` | string | 活跃画布 | 目标画布 ID |

**输出示例：**

```json
{
  "canvasId": "page:abc123",
  "revision": 5,
  "runtimeSessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "shapes": [
    {
      "kind": "geo",
      "shapeId": "shape:def456",
      "x": 100,
      "y": 200,
      "rotation": 0,
      "w": 300,
      "h": 150,
      "geo": "rectangle",
      "text": "",
      "color": "black",
      "fill": "none",
      "labelColor": "black"
    },
    {
      "kind": "text",
      "shapeId": "shape:ghi789",
      "x": 500,
      "y": 100,
      "rotation": 0,
      "w": 200,
      "text": "标题",
      "color": "black",
      "font": "draw",
      "size": "m",
      "textAlign": "start"
    },
    {
      "kind": "arrow",
      "shapeId": "shape:jkl012",
      "x": 0,
      "y": 0,
      "rotation": 0,
      "start": { "x": 100, "y": 100 },
      "end": { "x": 300, "y": 300 },
      "startBinding": { "shapeId": "shape:def456" },
      "endBinding": null,
      "text": "",
      "color": "black",
      "arrowheadStart": "none",
      "arrowheadEnd": "arrow",
      "dash": "draw",
      "bend": 0
    }
  ]
}
```

坐标 `(x, y)` 是左上角，`(w, h)` 是宽高，`rotation` 为弧度。shape 字段**全部在顶层**，没有 `props` 嵌套层。

**支持的 shape kind 及其字段：**

| kind | 专有字段 | 说明 |
|------|----------|------|
| `geo` | `w`, `h`, `geo`, `text`, `color`, `fill`, `labelColor` | 几何图形 |
| `text` | `w`, `text`, `color`, `font`, `size`, `textAlign` | 文字 |
| `arrow` | `start{x,y}`, `end{x,y}`, `startBinding{shapeId}`, `endBinding{shapeId}`, `text`, `color`, `arrowheadStart`, `arrowheadEnd`, `dash`, `bend` | 箭头（`startBinding`/`endBinding` 仅在绑定图形时存在）|
| `note` | `text`, `color` | 便签 |
| `frame` | `w`, `h`, `name` | 框架 |
| `unknown` | `type`, `w?`, `h?` | 其他暂未映射的类型 |

所有 kind 都有公共字段：`shapeId`（**不是 `id`**）, `x`, `y`, `rotation`, `parentId?`（嵌套在 frame 内时存在）。

---

### tldraw-cli canvas diff

获取画布自某个 revision 以来的变更历史。

```bash
tldraw-cli canvas diff --since 3                     # 活跃画布，revision 3 之后的变更
tldraw-cli canvas diff --since 0 --canvas page:abc   # 指定画布，全部历史
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--since` | number | 是 | | 基准 revision（>= 0 的整数） |
| `--canvas` | string | 否 | 活跃画布 | 目标画布 ID |

CLI 会自动从 session 文件读取 `runtimeSessionId` 并随请求发送，Host 据此检测 Runtime 是否重启。如果 Runtime 已重启，CLI 输出错误并退出码非零，提示先运行 `canvas snapshot` 重建基线。

**输出示例：**

```json
{
  "canvasId": "page:abc123",
  "fromRevision": 3,
  "toRevision": 5,
  "runtimeSessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entries": [
    {
      "kind": "shape-created",
      "revision": 4,
      "shape": {
        "kind": "geo",
        "shapeId": "shape:new1",
        "x": 100,
        "y": 200,
        "rotation": 0,
        "w": 300,
        "h": 150,
        "geo": "rectangle",
        "text": "",
        "color": "black",
        "fill": "none",
        "labelColor": "black"
      }
    },
    {
      "kind": "shape-updated",
      "revision": 5,
      "shapeId": "shape:def456",
      "changes": { "x": 150, "color": "blue" }
    },
    {
      "kind": "shape-deleted",
      "revision": 5,
      "shapeId": "shape:old1"
    }
  ]
}
```

**entry kind 说明：**

| kind | 字段 | 说明 |
|------|------|------|
| `shape-created` | `revision`, `shape`（完整 shape 对象） | 新图形被添加 |
| `shape-updated` | `revision`, `shapeId`, `changes`（变更字段 map） | 已有图形属性改变 |
| `shape-deleted` | `revision`, `shapeId` | 图形被删除 |

---

### tldraw-cli canvas create

创建新画布。

```bash
tldraw-cli canvas create                    # 使用默认标题
tldraw-cli canvas create --title "设计稿"   # 指定标题
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--title` | string | 自动生成 | 画布标题 |

**输出示例：**

```json
{
  "canvasId": "page:xyz789",
  "title": "设计稿",
  "revision": 0
}
```

新画布的 `revision` 从 0 开始。

> **注意**：新画布**不会自动变为 activeCanvasId**，后续 `command apply` 仍打到原画布——用 `--canvas <id>` 或先 `canvas select` 切换。

---

### tldraw-cli canvas select

切换活跃画布。

```bash
tldraw-cli canvas select --canvas page:abc123
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--canvas` | string | 是 | 目标画布 ID |

**输出示例：**

```json
{
  "activeCanvasId": "page:abc123"
}
```

---

### tldraw-cli canvas get-selection

读取用户在浏览器中当前框选的 shapeId 列表。只读，不修改画布。

```bash
tldraw-cli canvas get-selection                       # 活跃画布
tldraw-cli canvas get-selection --canvas page:abc     # 指定画布
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--canvas` | string | 活跃画布 | 目标画布 ID |

**输出示例：**

```json
{
  "canvasId": "page:abc123",
  "revision": 5,
  "shapeIds": ["shape:def456", "shape:ghi789"],
  "runtimeSessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

`shapeIds` 为空数组表示用户未选中任何图形。`revision` 是此刻画布版本，可作为后续 `command apply expectedRevision` 的参考基线。

**边界情况**：用户未选中任何图形时 `shapeIds` 为 `[]`，不报错。收到空数组后建议提示用户先在浏览器框选目标图形，再重试。

---

### tldraw-cli canvas screenshot

截取当前画布为 PNG，写入临时文件，返回文件路径。

```bash
tldraw-cli canvas screenshot                       # 当前活跃画布
tldraw-cli canvas screenshot --canvas page:abc     # 指定画布
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--canvas` | string | 活跃画布 | 目标画布 ID |

**输出示例：**

```json
{
  "imagePath": "/tmp/tldraw-screenshot-1745400000000.png"
}
```

`imagePath` 是操作系统临时目录下的 PNG 文件绝对路径。用 Read 工具读取该路径即可直接看到画布渲染结果。

**使用方式：**

```bash
# 截图并用 Read 工具查看
IMG=$(tldraw-cli canvas screenshot | node -p "JSON.parse(require('fs').readFileSync(0)).imagePath")
# 然后用 Read 工具读取 $IMG
```

**注意**：`imagePath` 指向操作系统临时目录，重启后可能被清理。如需持久化，自行复制到目标目录。

---

### tldraw-cli command apply

向画布发送绘图命令。从 **stdin** 读取 JSON。

```bash
echo '{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":100,"y":100,"w":200,"h":150}]}' | tldraw-cli command apply

# 指定画布
echo '{"commands":[...]}' | tldraw-cli command apply --canvas page:abc
```

| CLI 参数 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `--canvas` | string | stdin 中的 canvasId 或活跃画布 | 目标画布 ID（覆盖 stdin 中的 canvasId） |

**stdin JSON 格式：**

```json
{
  "commands": [...],
  "canvasId": "page:abc123",
  "expectedRevision": 5,
  "idempotencyKey": "unique-key-123"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `commands` | array | 是 | 至少 1 个命令，按序执行 |
| `canvasId` | string | 否 | 目标画布，可被 CLI `--canvas` 覆盖 |
| `expectedRevision` | number | 否 | 预留给未来 CAS 乐观并发控制，当前实现忽略（last-write-wins） |
| `idempotencyKey` | string | 否 | 预留给未来去重，当前实现忽略 |

**支持的命令类型：**

| kind | 必填字段 | 可选字段 |
|------|----------|----------|
| `create-geo-shape` | `geo`, `x`, `y`, `w`, `h` | `text`, `color`, `fill`(`none`/`semi`/`solid`/`fill`/`pattern`，默认 `none`), `labelColor` |
| `create-text` | `x`, `y`, `text` | `w`, `color`, `font`, `size`, `textAlign` |
| `create-arrow` | `startX`, `startY`, `endX`, `endY` | `startBindingShapeId`, `endBindingShapeId`（若提供必须为非空串，空串会被 schema 拒绝；绑定后坐标仅作初始提示，端点由 tldraw 自动贴边），`text`, `color`(默认 `black`), `fill`(`none`/`semi`/`solid`/`fill`/`pattern`，默认 `none`), `arrowheadStart`(默认 `none`), `arrowheadEnd`(默认 `arrow`), `dash`(`solid`/`dashed`/`dotted`/`draw`，默认 `draw`), `bend`(数值，约 -1..1) |
| `create-note` | `x`, `y`, `text` | `color` |
| `delete-shape` | `shapeId` | |
| `update-shape` | `shapeId` | 通用：`x`, `y`, `rotation`, `w`, `h`, `text`, `color`；geo：`fill`, `labelColor`, `geo`；text：`font`, `size`, `textAlign`；arrow：`arrowheadStart`, `arrowheadEnd`, `dash`, `bend`；frame：`name` |

**geo 枚举**：完整 20 种见 [shape-reference.md](shape-reference.md)。

**输出示例：**

```json
{
  "canvasId": "page:abc123",
  "revision": 6,
  "results": [
    { "shapeId": "shape:new123" }
  ],
  "runtimeSessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

`results` 数组与 `commands` 数组一一对应，每项包含目标 `shapeId`（create 命令为新分配的 id，delete/update 命令为传入的 shapeId）。

---

### tldraw-cli command undo

撤销当前活跃画布的上一次操作（等价于 Ctrl+Z）。

```bash
tldraw-cli command undo
```

无参数。作用于当前活跃画布。

**输出示例：**

```json
{
  "revision": 4
}
```

---

### tldraw-cli command redo

重做当前活跃画布上一次被撤销的操作（等价于 Ctrl+Y）。

```bash
tldraw-cli command redo
```

无参数。作用于当前活跃画布。

**输出示例：**

```json
{
  "revision": 5
}
```
