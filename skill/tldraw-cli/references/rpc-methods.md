# RPC 方法参考

想绕开 CLI 直接 curl HTTP JSON-RPC 时读这里。CLI 底层通过 `POST http://localhost:8787/rpc` 发送 JSON-RPC 2.0 请求。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [Shape 字段](shape-reference.md) · [错误码](error-codes.md) · [会话与环境](session-management.md)

## 方法表

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `session.status` | `{}` | `{host{version, uptimeMs}, runtimes[], activeCanvasId, canvasCount}` | Host 本地聚合，不转发 Runtime |
| `canvas.list` | `{}` | `{items[{id, title, revision}]}` | 转发至 Runtime |
| `canvas.snapshot` | `{canvasId?}` | `{canvasId, revision, shapes[], runtimeSessionId}` | 转发至 Runtime |
| `canvas.diff` | `{canvasId?, since, runtimeSessionId?}` | `{canvasId, fromRevision, toRevision, entries[], runtimeSessionId}` | 转发至 Runtime；传入 runtimeSessionId 时 Host 做会话校验 |
| `canvas.create` | `{title?}` | `{canvasId, title, revision}` | 转发至 Runtime |
| `canvas.select` | `{canvasId}` | `{activeCanvasId}` | 转发至 Runtime |
| `canvas.getSelection` | `{canvasId?}` | `{canvasId, revision, shapeIds[], runtimeSessionId}` | 读取浏览器当前选区，转发至 Runtime |
| `canvas.screenshot` | `{canvasId?}` | `{imagePath}` | 截取画布为 PNG，写入临时文件，返回路径；转发至 Runtime |
| `command.apply` | `{commands[], canvasId?, expectedRevision?, idempotencyKey?}` | `{canvasId, revision, results[], runtimeSessionId}` | 转发至 Runtime |
| `command.undo` | `{}` | `{revision}` | 转发至 Runtime |
| `command.redo` | `{}` | `{revision}` | 转发至 Runtime |

## curl 示例

```bash
# canvas.list —— 列出所有画布
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"canvas.list","params":{}}'

# canvas.snapshot —— 获取当前画布全量 shape
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"canvas.snapshot","params":{}}'

# canvas.diff —— 取 revision 5 之后的增量变更
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"canvas.diff","params":{"since":5}}'

# command.apply —— 创建矩形
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"command.apply","params":{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":100,"h":100}]}}'

# command.undo
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"command.undo","params":{}}'

# canvas.getSelection —— 读取浏览器当前选区
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":6,"method":"canvas.getSelection","params":{}}'

# canvas.screenshot —— 截取画布为 PNG，返回临时文件路径
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":7,"method":"canvas.screenshot","params":{}}'
```

## canvas.screenshot 详解

截取当前画布渲染结果为 PNG，写入临时文件，返回路径。

**请求**

```json
{"jsonrpc":"2.0","id":1,"method":"canvas.screenshot","params":{}}
```

**响应**

```json
{"jsonrpc":"2.0","id":1,"result":{"imagePath":"/tmp/tldraw-screenshot-1745400000000.png"}}
```

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `canvasId` | string | 否 | 目标画布 id，省略则使用当前活跃画布 |

**结果**

| 字段 | 类型 | 说明 |
|------|------|------|
| `imagePath` | string | 临时 PNG 文件绝对路径，LLM 用 Read 工具读取 |
