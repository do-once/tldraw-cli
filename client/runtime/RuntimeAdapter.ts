/**
 * Runtime 适配器抽象接口模块。
 *
 * 定义 Host 调用 Runtime 时的上下文和适配器契约。
 * Host 通过 WebSocket 将 JSON-RPC 请求下发给 Runtime，
 * RuntimeAdapter 是 Runtime 侧的统一入口抽象——任何具体实现
 * （如 TldrawRuntimeAdapter）都实现此接口，与传输层解耦。
 */

/**
 * Host 调用 Runtime 时携带的调用上下文。
 * requestId 用于 RPC 响应回传，traceparent 保留用于分布式追踪。
 */
export interface RuntimeInvokeContext {
	readonly requestId: number
	readonly traceparent?: string
}

/**
 * Runtime 适配器接口。
 * 所有 Runtime 实现必须满足此契约，由 RuntimeWsClient 在收到
 * JSON-RPC 请求时调用。method 对应 RPC 方法名（如 "canvas.list"），
 * params 为反序列化后的请求参数，ctx 为本次调用的上下文信息。
 */
export interface RuntimeAdapter {
	invoke(method: string, params: unknown, ctx: RuntimeInvokeContext): Promise<unknown>
}
