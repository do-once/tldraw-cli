/**
 * Runtime 侧 WebSocket 客户端（纯传输层）。
 *
 * 负责与 Host 建立 WebSocket 连接、执行协议握手，并将
 * Host 下发的 JSON-RPC 请求转发给 RuntimeAdapter 处理，
 * 再把结果回写给 Host。此层不包含任何业务逻辑——只做消息
 * 的收发、连接重试和生命周期管理。
 *
 * 连接生命周期：
 *   connect → sendHandshake → 收到 handshake-ack → onReady
 *   断开后自动 1 秒重试（除非已主动关闭或收到 session.shutdown）
 */
import {
	CURRENT_PROTOCOL_VERSION,
	JsonRpcRequestSchema,
	SessionShutdownNoticeSchema,
	SystemPingSchema,
	type RuntimeCapability,
} from '../../shared/rpc'
import type { RuntimeAdapter } from './RuntimeAdapter'

/**
 * RuntimeWsClient 的构造选项。
 * - url：Host WebSocket 地址
 * - adapter：处理具体 RPC 方法的适配器
 * - methods：本 Runtime 支持的 RPC 方法列表，握手时告知 Host
 * - onReady：握手成功后触发，参数为 runtimeId
 * - onError：连接失败（首次未连上）时触发
 * - onDisconnected：已连接后断开时触发
 * - onShutdown：收到 session.shutdown 通知时触发
 */
export interface RuntimeWsClientOptions {
	url: string
	adapter: RuntimeAdapter
	methods: string[]
	/** 本 Runtime 会话的唯一标识，握手时告知 Host（UUID） */
	sessionId: string
	onError?: (err: Error) => void
	onReady?: (runtimeId: string) => void
	onDisconnected?: () => void
	onShutdown?: (reason: string) => void
}

/**
 * Runtime 侧 WebSocket 客户端。
 * 构造时立即发起连接，断开后自动重试。
 */
export class RuntimeWsClient {
	private ws: WebSocket | null = null
	/** 已主动关闭，不再重连 */
	private closed = false
	/** 已收到服务端关机通知，不再重连 */
	private shutdownReceived = false
	/** 是否曾成功完成握手（用于区分"首次失败"和"断线"） */
	private wasConnected = false

	constructor(private readonly opts: RuntimeWsClientOptions) {
		this.connect()
	}

	/** 主动关闭连接，不再重连 */
	close(): void {
		this.closed = true
		this.ws?.close()
	}

	/** 手动触发重连（先断开现有连接） */
	reconnect(): void {
		if (this.closed) {
			this.closed = false
			this.shutdownReceived = false
		}
		this.ws?.close()
		this.connect()
	}

	private connect(): void {
		if (this.closed) return
		const ws = new WebSocket(this.opts.url)
		this.ws = ws
		ws.addEventListener('open', () => this.sendHandshake())
		ws.addEventListener('message', (ev) => { void this.onMessage(String(ev.data)) })
		ws.addEventListener('close', () => {
			if (this.closed || this.shutdownReceived) {
				if (this.wasConnected) this.opts.onDisconnected?.()
				return
			}
			if (this.wasConnected) this.opts.onDisconnected?.()
			else this.opts.onError?.(new Error('Host 未运行，无法连接'))
			setTimeout(() => this.connect(), 1_000)
		})
		ws.addEventListener('error', () => {
			// error 后一定会触发 close，状态通知在 close 中处理
		})
	}

	/**
	 * 连接建立后发送握手消息，告知 Host 本 Runtime 的协议版本
	 * 和支持的 RPC 方法列表，等待 Host 回复 handshake-ack。
	 */
	private sendHandshake(): void {
		const capability: RuntimeCapability = {
			protocolVersion: CURRENT_PROTOCOL_VERSION,
			methods: this.opts.methods,
			flags: [],
			sessionId: this.opts.sessionId,
		}
		this.ws?.send(JSON.stringify({ type: 'handshake', capability }))
	}

	/**
	 * 处理来自 Host 的 WebSocket 消息。
	 * 消息类型：
	 *   - handshake-ack：握手完成，触发 onReady
	 *   - session.shutdown：Host 即将关机，触发 onShutdown 并关闭连接
	 *   - JSON-RPC 请求：转发给 adapter.invoke，结果/错误回写给 Host
	 */
	private async onMessage(raw: string): Promise<void> {
		let msg: unknown
		try { msg = JSON.parse(raw) } catch { return }
		if (msg && typeof msg === 'object') {
			const t = (msg as { type?: string }).type
			if (t === 'handshake-ack') {
				this.wasConnected = true
				this.opts.onReady?.((msg as { runtimeId: string }).runtimeId)
				return
			}
			if (t === 'session.shutdown') {
				const parsed = SessionShutdownNoticeSchema.safeParse(msg)
				if (parsed.success) {
					this.shutdownReceived = true
					this.closed = true
					this.opts.onShutdown?.(parsed.data.reason)
					this.ws?.close()
				}
				return
			}
			if (t === 'system.ping') {
				const parsed = SystemPingSchema.safeParse(msg)
				if (parsed.success) {
					this.ws?.send(JSON.stringify({ type: 'system.pong', seq: parsed.data.seq }))
				}
				return
			}
		}
		const parsed = JsonRpcRequestSchema.safeParse(msg)
		if (!parsed.success) return
		const req = parsed.data
		const id = req.id
		try {
			const result = await this.opts.adapter.invoke(req.method, req.params, {
				requestId: typeof id === 'number' ? id : 0,
			})
			this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id, result }))
		} catch (err) {
			// 保留 adapter 抛出的 { code, message } 对象中的 code，
			// 否则领域错误（如 shapeNotFound=1007）会被压平成 -32603
			let code = -32603
			let message = 'Adapter error'
			if (err instanceof Error) {
				message = err.message
			} else if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
				code = (err as { code: number; message: string }).code
				message = (err as { code: number; message: string }).message
			}
			this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }))
		}
	}
}
