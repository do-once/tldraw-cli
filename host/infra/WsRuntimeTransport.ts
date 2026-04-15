/**
 * WebSocket 传输实现
 *
 * WsRuntimeTransport 是 RuntimeGateway 抽象的 WebSocket 传输层。
 * 职责：
 * 1. 监听 WebSocket 连接请求
 * 2. 执行握手协议（handshake → handshake-ack），超时则强制断开
 * 3. 握手成功后为每个连接创建 WsRuntimeGateway 并注册到 RuntimeRegistry
 * 4. 连接断开时从 Registry 注销并拒绝所有待处理请求
 *
 * WsRuntimeGateway（内部类）负责单条连接的 RPC 请求/响应匹配。
 */
// host/infra/WsRuntimeTransport.ts
import { WebSocket, WebSocketServer } from 'ws'
import {
	HandshakeRequestSchema,
	SystemPongSchema,
	type RuntimeCapability,
} from '../../shared/rpc'
import { DomainError, RuntimeDisconnectedError, TimeoutError } from './errors'
import type {
	GatewayState,
	RequestOptions,
	RuntimeGateway,
	RuntimeId,
} from './RuntimeGateway'
import { RuntimeRegistry } from './RuntimeRegistry'

/** WsRuntimeTransport 构造参数 */
export interface WsRuntimeTransportOptions {
	port: number
	registry: RuntimeRegistry
	/** 握手超时毫秒数，超时后强制断开连接，默认 5000 */
	handshakeTimeoutMs?: number
	/** 心跳间隔毫秒数，握手成功后每隔此时间发一次 system.ping，默认 15000 */
	heartbeatIntervalMs?: number
	/** 单次 pong 等待超时毫秒数，超时视为本次失败，默认 10000 */
	heartbeatPongTimeoutMs?: number
	/** 连续失败次数达到此阈值后判定断线，默认 2 */
	heartbeatMaxFailures?: number
}

/** WebSocket 服务端：管理 Runtime 的接入、握手和注册 */
export class WsRuntimeTransport {
	private readonly server: WebSocketServer
	private readonly registry: RuntimeRegistry
	private readonly handshakeTimeoutMs: number
	private readonly heartbeatIntervalMs: number
	private readonly heartbeatPongTimeoutMs: number
	private readonly heartbeatMaxFailures: number
	/** 递增序号，用于生成唯一的 RuntimeId（rt-1, rt-2, ...） */
	private nextRuntimeSeq = 0

	constructor(options: WsRuntimeTransportOptions) {
		this.registry = options.registry
		this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000
		this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000
		this.heartbeatPongTimeoutMs = options.heartbeatPongTimeoutMs ?? 10_000
		this.heartbeatMaxFailures = options.heartbeatMaxFailures ?? 2
		this.server = new WebSocketServer({ host: '127.0.0.1', port: options.port })
		this.server.on('connection', (ws) => this.acceptConnection(ws))
	}

	/** 获取实际监听端口 */
	get port(): number {
		const addr = this.server.address()
		if (typeof addr === 'object' && addr !== null) return addr.port
		throw new Error('WsRuntimeTransport has no bound address')
	}

	/** 向所有已连接 Runtime 广播 session.shutdown 通知 */
	broadcastShutdown(reason = 'requested'): void {
		const msg = JSON.stringify({ type: 'session.shutdown', reason })
		for (const client of this.server.clients) {
			if (client.readyState === WebSocket.OPEN) {
				try { client.send(msg) } catch { /* ignore per-client send errors */ }
			}
		}
	}

	/** 强制断开所有连接并关闭 WebSocket 服务器 */
	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			for (const client of this.server.clients) client.terminate()
			this.server.close((err) => (err ? reject(err) : resolve()))
		})
	}

	/**
	 * 接受新 WebSocket 连接。
	 * 要求对方在 handshakeTimeoutMs 内发送第一条握手消息；
	 * 否则强制 terminate 连接（不走正常关闭流程，避免对方挂起）。
	 */
	private acceptConnection(ws: WebSocket): void {
		let settled = false
		const timer = setTimeout(() => {
			if (!settled) { settled = true; ws.terminate() }
		}, this.handshakeTimeoutMs)
		ws.once('message', (raw) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			try {
				const parsed = HandshakeRequestSchema.parse(JSON.parse(String(raw)))
				this.onHandshake(ws, parsed.capability)
			} catch {
				ws.close(1008, 'invalid handshake')
			}
		})
	}

	/**
	 * 握手成功后：
	 * 1. 分配 RuntimeId
	 * 2. 创建 WsRuntimeGateway 并注册到 RuntimeRegistry
	 * 3. 回复 handshake-ack
	 * 4. 启动应用层心跳
	 * 5. 监听 close 事件，断开时清理注册表并拒绝所有待处理请求
	 */
	private onHandshake(ws: WebSocket, capability: RuntimeCapability): void {
		const id = `rt-${++this.nextRuntimeSeq}` as RuntimeId
		const gateway = new WsRuntimeGateway(ws, id, capability, {
			intervalMs: this.heartbeatIntervalMs,
			pongTimeoutMs: this.heartbeatPongTimeoutMs,
			maxFailures: this.heartbeatMaxFailures,
		})
		this.registry.register(gateway, capability.sessionId)
		ws.send(JSON.stringify({ type: 'handshake-ack', runtimeId: id, accepted: true }))
		gateway.startHeartbeat()
		ws.on('close', () => {
			gateway.markClosed()
			this.registry.unregister(id)
		})
	}
}

/** 一条 in-flight RPC 请求的 Promise 控制器 + 超时句柄 */
interface PendingRequest {
	resolve: (value: unknown) => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout
}

/** WsRuntimeGateway 心跳参数 */
interface HeartbeatOptions {
	intervalMs: number
	pongTimeoutMs: number
	maxFailures: number
}

/**
 * 单条 WebSocket 连接的 RPC 客户端（Host 侧）。
 * 内部维护一个 pending Map，以递增 id 匹配请求与响应。
 * 此类为 WsRuntimeTransport 的私有实现细节，不对外暴露。
 */
class WsRuntimeGateway implements RuntimeGateway {
	public readonly id: RuntimeId
	public readonly capability: RuntimeCapability
	private currentState: GatewayState = 'ready'
	/** 等待 Runtime 响应的请求集合，key 为 RPC 请求 id */
	private readonly pending = new Map<number, PendingRequest>()
	private nextReqId = 0

	/** 心跳相关状态 */
	private readonly heartbeatOpts: HeartbeatOptions
	/** 心跳间隔定时器句柄 */
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null
	/** 当前 pong 等待超时句柄；null 表示没有 pending ping */
	private pongTimer: ReturnType<typeof setTimeout> | null = null
	/** 下一次 ping 使用的序号 */
	private nextPingSeq = 0
	/** 当前等待 pong 的 seq；null 表示没有 pending ping */
	private expectedSeq: number | null = null
	/** 连续未收到 pong 的次数 */
	private failureCount = 0

	constructor(
		private readonly ws: WebSocket,
		id: RuntimeId,
		capability: RuntimeCapability,
		heartbeatOpts: HeartbeatOptions,
	) {
		this.id = id
		this.capability = capability
		this.heartbeatOpts = heartbeatOpts
		this.ws.on('message', (raw) => this.onMessage(String(raw)))
	}

	get state(): GatewayState { return this.currentState }

	/**
	 * 握手完成后调用，启动心跳定时器。
	 * 每隔 intervalMs 发一次 system.ping，等待 pong 超时或达到失败阈值则断线。
	 */
	startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.sendPing()
		}, this.heartbeatOpts.intervalMs)
	}

	/** 停止心跳定时器，清理所有 timer（由 markClosed 调用） */
	private stopHeartbeat(): void {
		if (this.heartbeatTimer !== null) {
			clearInterval(this.heartbeatTimer)
			this.heartbeatTimer = null
		}
		if (this.pongTimer !== null) {
			clearTimeout(this.pongTimer)
			this.pongTimer = null
		}
		this.expectedSeq = null
	}

	/** 发送一次 system.ping，并启动 pong 等待超时 */
	private sendPing(): void {
		if (this.currentState !== 'ready') return
		// 上一次 ping 仍未收到 pong——本次超时算一次失败
		if (this.expectedSeq !== null) {
			this.failureCount++
			if (this.pongTimer !== null) { clearTimeout(this.pongTimer); this.pongTimer = null }
			if (this.failureCount >= this.heartbeatOpts.maxFailures) {
				this.triggerHeartbeatFailure()
				return
			}
		}
		const seq = this.nextPingSeq++
		this.expectedSeq = seq
		try {
			this.ws.send(JSON.stringify({ type: 'system.ping', seq }))
		} catch {
			// send 失败说明底层已断，等 ws close 事件处理
			return
		}
		this.pongTimer = setTimeout(() => {
			this.pongTimer = null
			if (this.expectedSeq !== seq) return // 已被 pong 清零
			this.failureCount++
			this.expectedSeq = null
			if (this.failureCount >= this.heartbeatOpts.maxFailures) {
				this.triggerHeartbeatFailure()
			}
		}, this.heartbeatOpts.pongTimeoutMs)
	}

	/**
	 * 连续失败达到阈值：关闭 WS（触发 close 事件 → markClosed → registry.unregister），
	 * 所有 pending 请求将在 markClosed 里被 RuntimeDisconnectedError 拒绝。
	 */
	private triggerHeartbeatFailure(): void {
		this.stopHeartbeat()
		this.ws.close(1001, 'heartbeat-timeout')
	}

	/**
	 * WebSocket 断开时调用：将状态置为 closed，停止心跳，并拒绝所有 in-flight 请求。
	 * 由 WsRuntimeTransport 在 close 事件里调用。
	 * 心跳触发的断线走同一路径，pending 统一用 RuntimeDisconnectedError。
	 */
	markClosed(): void {
		this.currentState = 'closed'
		this.stopHeartbeat()
		const err = this.failureCount >= this.heartbeatOpts.maxFailures
			? new RuntimeDisconnectedError()
			: new Error('Runtime connection closed')
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer)
			entry.reject(err)
		}
		this.pending.clear()
	}

	/**
	 * 发送 JSON-RPC 请求并等待响应。
	 * - 超时时从 pending 移除并 reject TimeoutError
	 * - signal abort 时从 pending 移除并 reject Cancelled
	 * - send 失败时立即 reject（例如连接已关闭）
	 */
	request(method: string, params: unknown, options?: RequestOptions): Promise<unknown> {
		const id = ++this.nextReqId
		const timeoutMs = options?.timeoutMs ?? 30_000
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pending.delete(id)) reject(new TimeoutError(timeoutMs))
			}, timeoutMs)
			this.pending.set(id, { resolve, reject, timer })
			try {
				this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
			} catch (err) {
				clearTimeout(timer)
				this.pending.delete(id)
				reject(err as Error)
				return
			}
			options?.signal?.addEventListener('abort', () => {
				const entry = this.pending.get(id)
				if (!entry) return
				this.pending.delete(id)
				clearTimeout(entry.timer)
				entry.reject(new Error('Cancelled'))
			})
		})
	}

	/** 发起优雅关闭：将状态置为 closing 并发送 WebSocket close 帧 */
	async close(): Promise<void> {
		this.currentState = 'closing'
		this.ws.close()
	}

	/**
	 * 处理来自 Runtime 的消息。
	 * - system.pong：匹配 seq，清零失败计数
	 * - JSON-RPC 响应：匹配 pending 中对应 id 的请求
	 * 无法解析或找不到对应请求的消息直接丢弃。
	 */
	private onMessage(raw: string): void {
		let msg: unknown
		try { msg = JSON.parse(raw) } catch { return }
		if (!msg || typeof msg !== 'object') return

		// 处理 system.pong
		const pong = SystemPongSchema.safeParse(msg)
		if (pong.success) {
			if (pong.data.seq === this.expectedSeq) {
				// 清除 pong 等待超时
				if (this.pongTimer !== null) { clearTimeout(this.pongTimer); this.pongTimer = null }
				this.expectedSeq = null
				this.failureCount = 0
			}
			return
		}

		// 处理 JSON-RPC 响应
		const m = msg as { id?: number; result?: unknown; error?: { message?: string; code?: number } }
		if (typeof m.id !== 'number') return
		const entry = this.pending.get(m.id)
		if (!entry) return
		this.pending.delete(m.id)
		clearTimeout(entry.timer)
		if ('result' in m) entry.resolve(m.result)
		else if (m.error) {
			// 保留 Runtime 侧的错误 code（如 1007 shapeNotFound），让 ApiGateway 能正确分类
			const code = m.error.code ?? -32603
			const msg = m.error.message ?? 'Runtime error'
			entry.reject(new DomainError(code, msg))
		}
		else entry.reject(new Error('Malformed runtime response'))
	}
}
