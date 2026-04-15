/**
 * RuntimeGateway 抽象接口（依赖倒置核心）
 *
 * ApplicationService 层只依赖此接口，不依赖任何具体传输实现。
 * 当前实现：WsRuntimeGateway（WebSocket）。
 * 未来可替换为 MockRuntimeGateway（测试）或其他传输而不改动 ApplicationService。
 *
 * 架构约束：host/ApplicationServices/ 目录下的代码只能 import 本文件，
 * 不能直接 import WsRuntimeTransport 或 ws 包。
 */
// host/infra/RuntimeGateway.ts
import type { MethodName, RuntimeCapability } from '../../shared/rpc'

/**
 * Runtime 实例的唯一标识符（品牌类型，防止与普通 string 混用）。
 * 由 WsRuntimeTransport 在握手时分配，格式为 "rt-{seq}"。
 */
export type RuntimeId = string & { readonly _brand: 'RuntimeId' }

/**
 * Runtime 连接的生命周期状态：
 * - connecting：握手尚未完成
 * - ready：可以正常收发 RPC 请求
 * - closing：已发送关闭信号，等待 WebSocket 断开
 * - closed：连接已断开，所有待处理请求均已拒绝
 */
export type GatewayState = 'connecting' | 'ready' | 'closing' | 'closed'

/** RPC 请求的额外选项 */
export interface RequestOptions {
	/** 可用于取消请求的 AbortSignal */
	signal?: AbortSignal
	/** 请求超时毫秒数，默认 30000 */
	timeoutMs?: number
	/** 幂等键（预留，当前版本不做去重） */
	idempotencyKey?: string
	/** 链路追踪 ID（预留） */
	traceparent?: string
}

/**
 * Host 侧 Runtime 连接抽象。
 * 每个已连接的 Runtime 实例在 Host 内对应一个 RuntimeGateway。
 * request() 将 RPC 方法调用转发给 Runtime，并在超时或断连时拒绝 Promise。
 */
export interface RuntimeGateway {
	readonly id: RuntimeId
	readonly capability: RuntimeCapability
	readonly state: GatewayState
	request<M extends MethodName>(method: M, params: unknown, options?: RequestOptions): Promise<unknown>
	close(reason?: string): Promise<void>
}
