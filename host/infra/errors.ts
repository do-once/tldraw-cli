/**
 * Host 领域错误类体系
 *
 * DomainError 是所有业务错误的基类，携带 JSON-RPC 错误码，
 * ApiGateway 的 toErrorResponse() 会统一捕获并转为标准错误响应。
 * 每种错误对应 shared/rpc/errors.ts 中的一个 ErrorCode。
 */
// host/infra/errors.ts
import { ErrorCodes } from '../../shared/rpc'

/**
 * 所有领域错误的基类。
 * code 字段对应 JSON-RPC 错误码，data 字段携带上下文信息（如 canvasId）。
 */
export class DomainError extends Error {
	constructor(
		public readonly code: number,
		message: string,
		public readonly data?: unknown,
	) {
		super(message)
		this.name = 'DomainError'
	}
}

/** 注册表里没有可用 Runtime（错误码 1001） */
export class RuntimeUnavailableError extends DomainError {
	constructor() { super(ErrorCodes.runtimeUnavailable, 'No runtime available') }
}

/** RPC 请求等待 Runtime 响应超时（错误码 1003） */
export class TimeoutError extends DomainError {
	constructor(ms: number) { super(ErrorCodes.timeout, `Timed out after ${ms}ms`) }
}

/** 指定的 canvasId 不存在（错误码 1006） */
export class CanvasNotFoundError extends DomainError {
	constructor(id: string) { super(ErrorCodes.canvasNotFound, `Canvas not found: ${id}`, { id }) }
}

/** 参数校验失败（错误码 -32602），data 字段包含 Zod issues */
export class InvalidParamsError extends DomainError {
	constructor(message: string, data?: unknown) { super(ErrorCodes.invalidParams, message, data) }
}

/** 调用了不存在的 RPC 方法（错误码 -32601） */
export class MethodNotFoundError extends DomainError {
	constructor(method: string) {
		super(ErrorCodes.methodNotFound, `Method not found: ${method}`, { method })
	}
}

/** CLI 传入的 runtimeSessionId 与当前 Runtime 不匹配，说明 Runtime 已重启（错误码 1008） */
export class RuntimeRestartedError extends DomainError {
	constructor() { super(ErrorCodes.runtimeRestarted, 'Runtime has restarted; session is stale. Run `canvas snapshot` to rebuild baseline.') }
}

/** 心跳超时：连续多次未收到 pong，判定 Runtime 假活断线（错误码 1009） */
export class RuntimeDisconnectedError extends DomainError {
	constructor() { super(ErrorCodes.runtimeDisconnected, 'Runtime heartbeat timed out; connection dropped') }
}
