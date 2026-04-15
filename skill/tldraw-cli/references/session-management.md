# 会话与环境

改端口、找 session 文件位置、查环境变量时读这里。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [Shape 字段](shape-reference.md) · [RPC 方法](rpc-methods.md) · [错误码](error-codes.md)

## 网络端口

| 端口 | 用途 | 何时监听 |
|------|------|----------|
| 8787 | Host HTTP API（JSON-RPC + 静态文件） | `tldraw-cli start` 后始终监听 |
| 8788 | Host WebSocket（Runtime 连接） | 同上 |
| 8789 | Vite dev server（HMR 开发用） | 仅 `tldraw-cli start --dev` |

`--port` 改的是 HTTP 端口（8787），浏览器访问前端和所有 JSON-RPC 请求都走这里。`--ws-port` 改的是 WebSocket 端口（8788），Runtime（浏览器 tab）通过这个端口与 Host 保持长连接。两个端口都要可达，Runtime 才能正常工作——改端口时确保浏览器能同时连上两者。

```bash
tldraw-cli start --port 9000 --ws-port 9001
# 前端访问：http://localhost:9000/
# RPC 地址：http://localhost:9000/rpc
# Runtime WS：ws://localhost:9001/
```

---

## 会话文件

Host 启动时在 `~/.tldraw-cli/session.json` 写入会话信息，关闭时自动清理。

```json
{
  "hostPid": 12345,
  "httpPort": 8787,
  "wsPort": 8788,
  "startedAt": 1713347400000,
  "devPid": 67890,
  "runtimeSessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

- `hostPid`：Host 进程 PID
- `startedAt`：Unix 毫秒时间戳（整数）
- `devPid`：（可选，仅 `--dev`）Vite dev server 进程 PID；普通模式启动时不存在
- `runtimeSessionId`：（可选）Runtime 握手时生成的会话 ID，首次 `canvas snapshot` / `command apply` 后自动写入；`canvas diff` 随请求发送，Host 用于检测 Runtime 是否重启；老 session 文件缺少此字段时不校验

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TLDRAW_SESSION_FILE` | 覆盖 session 文件路径 | `~/.tldraw-cli/session.json` |
| `TLDRAW_HOST_URL` | 直接指定 Host RPC URL，跳过 session 文件读取 | 无（从 session 文件获取） |

`TLDRAW_HOST_URL` 用于测试或远程调试场景——调用方自己管 Host 进程。设了之后：

- 所有命令的 RPC 都走这个 URL，不再读 session 文件
- `status` 命令在没有 session 文件时不再探测默认端口 8787（避免误命中本地无关进程），直接返回 `{"state":"not-running"}`
- 想判断 Host 是否真在跑，用 `curl <URL>/health` 自己测
