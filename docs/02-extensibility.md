# 扩展能力

## 版本协商与 capability

Runtime 连接 Host 时进行 handshake 握手，上报 `protocolVersion`、支持的 `methods[]`、`flags[]`、`schemaFingerprint`。Host 据此决定可用能力集。

## 方法扩展规则

- 两个 resource（`session` / `canvas`）+ `command` 为**闭集**。新增 resource 视为架构级变更。
- 同一 resource 下新增 verb（如 `canvas.export`）视为小改，通过 capability 握手协商暴露。
- 参数级不兼容用 capability flag 表达（如 `canvas.snapshot.viewport`），**禁止方法名内嵌版本号**（不做 `canvas.snapshotV2`）。

## 实验性方法

实验阶段的方法使用 `experimental.*` 前缀，稳定后改为规范名，过渡期双挂。废弃方法通过响应 `meta.deprecation` 字段提醒调用方，不报错不阻塞。

## 适配器扩展

CLI 只是 Host 的适配器之一。核心是 9 个 RPC 方法，新的接入方式（REST API、TypeScript SDK、MCP server）只需对接 Host 的 HTTP JSON-RPC 接口。

### 通过 HTTP JSON-RPC 直接调用

Host 启动后在 `http://localhost:8787/rpc` 暴露标准 JSON-RPC 2.0 端点，任何能发 HTTP POST 的工具都可以直接调用：

```bash
# 读取画布快照
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"canvas.snapshot","params":{}}'

# 创建一个矩形
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"command.apply","params":{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":100,"y":100,"w":200,"h":120,"text":"Hello"}]}}'

# 撤销
curl -s -X POST http://localhost:8787/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"command.undo","params":{}}'
```

在代码中调用（Node.js / Python / 任何语言）：

```ts
const res = await fetch('http://localhost:8787/rpc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'canvas.snapshot',
    params: {},
  }),
})
const { result } = await res.json()
```

完整的 RPC 方法列表和参数格式见[命令速查表](../skill/tldraw-cli/references/command-reference.md#rpc-方法)。

## 命令类型扩展

`command.apply` 的 `commands[]` 数组支持扩展命令类型。第一版仅支持 `create-geo-shape`，后续可参照 `shared/schema/` 中 starter 的 action 定义新增更多命令。
