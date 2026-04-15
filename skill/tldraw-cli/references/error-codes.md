# 错误码

CLI 命令退出码非零、或 RPC 返回 `error` 字段时，对照本表找原因与修法。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [Shape 字段](shape-reference.md) · [RPC 方法](rpc-methods.md) · [会话与环境](session-management.md)

## CLI 层错误

Host 未运行时，CLI 命令输出到 stderr 并以非零退出码退出：

```
Error: Host not running. Use: tldraw-cli start
```

## RPC 错误格式

RPC 错误遵循 JSON-RPC 2.0 格式：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

## 错误码表

| 错误码 | 含义 | 触发场景 / 建议处理 |
|--------|------|---------------------|
| -32700 | JSON 解析错误 | 请求体不是合法 JSON。检查 heredoc 或 `-d` 参数里的 JSON 格式，尤其是字符串字段中不能有裸换行 |
| -32600 | 无效请求 | 请求不符合 JSON-RPC 2.0 结构（缺少 `jsonrpc`/`method`/`id` 字段）。直接 curl 时容易遇到 |
| -32601 | 方法不存在 | 方法名拼错，或 Host 版本不支持该方法。用 `tldraw-cli status` 确认协议版本 |
| -32602 | 参数无效 | 命令字段类型不对或缺少必填字段，zod schema 校验失败。常见原因见"参数校验常见错误"节 |
| -32603 | 内部错误 | Host 或 Runtime 侧未预期的异常。查看 Host 进程 stderr |
| 1001 | Runtime 未连接 | 浏览器 tab 还没打开、或 tab 被关闭导致 WebSocket 断开。打开 `http://localhost:8787/` 后等几秒再重试；用 `tldraw-cli status` 确认 `runtimes` 列表不为空 |
| 1002 | revision 冲突（预留） | `expectedRevision` 与 Runtime 实际 revision 不一致。当前版本不检查此字段（last-write-wins），收到此错误属于未预期情况 |
| 1003 | 等待 Runtime 响应超时 | Host 转发给 Runtime 的请求默认 30 秒无响应即超时。可能是浏览器卡死或 WebSocket 断开。刷新页面重建 Runtime 连接后重试 |
| 1004 | 鉴权失败（预留） | 当前版本不启用 |
| 1005 | Runtime 过载（预留） | 当前版本不启用 |
| 1006 | canvasId 不存在 | 传入了不存在的 `canvasId`。先用 `canvas list` 查可用 id，或省略 `canvasId` 使用当前活动画布 |
| 1007 | shapeId 不存在 | `delete-shape` 或 `update-shape` 时目标 shape 找不到。先用 `canvas snapshot` 核对 shape id 是否仍在画布上 |
| 1008 | Runtime 已重启 | CLI 持有的 `runtimeSessionId` 与当前 Runtime 不匹配，说明 Runtime 已重启。收到此错误后必须先运行 `canvas snapshot` 重建基线，再继续 `canvas diff` |
| 1009 | Runtime 假活断线 | Host 应用层心跳连续 2 次未收到 pong，判定浏览器 tab 卡死或挂起。刷新页面重建 Runtime 连接后重试 |

## 参数校验常见错误

`command.apply` 的每条命令先经过 zod schema 校验，失败时返回 `-32602`。易踩清单：

| 命令 | 错误输入 | 原因 |
|------|---------|------|
| `create-arrow` | `"startBindingShapeId": ""` 或 `"endBindingShapeId": ""` | 若提供则必须为非空串；不绑定就**省略字段**，不要传空串 |
| `create-geo-shape` | `"w": 0` 或 `"h": -1` | 宽高必须为正数 |
| `create-text` / `create-note` | 省略 `text` | `text` 为必填 |
| `delete-shape` / `update-shape` | 省略 `shapeId` 或传不存在的 id | 必填；id 不存在时错误码为 `1007` |
