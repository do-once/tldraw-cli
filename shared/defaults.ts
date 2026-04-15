// shared/defaults.ts
// 三端共享的默认配置，所有端口/URL 常量从此处引用

/** 默认 loopback 主机名（用 localhost 而非 127.0.0.1，tldraw 依赖此判定开发环境） */
export const DEFAULT_HOST = 'localhost'

/** Host HTTP API 默认端口 */
export const DEFAULT_HTTP_PORT = 8787

/** Host WebSocket 默认端口 */
export const DEFAULT_WS_PORT = 8788

/** Vite dev server 默认端口（仅开发模式，与 8787/8788 成组） */
export const DEFAULT_DEV_PORT = 8789

/** 默认 Host RPC 地址 */
export const DEFAULT_RPC_URL = `http://${DEFAULT_HOST}:${DEFAULT_HTTP_PORT}/rpc`

/** 默认 WebSocket 地址（浏览器 Runtime 连接 Host） */
export const DEFAULT_WS_URL = `ws://${DEFAULT_HOST}:${DEFAULT_WS_PORT}`

/** 开发模式前端地址 */
export const DEFAULT_DEV_FRONTEND_URL = `http://${DEFAULT_HOST}:${DEFAULT_DEV_PORT}/`
