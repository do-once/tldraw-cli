/**
 * JSON-RPC 2.0 HTTP 客户端（CLI 侧，用于向 Host 发送 RPC 请求）。
 *
 * 每次调用通过 HTTP POST 发送一个 JSON-RPC 请求到 Host 的 /rpc 端点。
 * 出于安全考虑，第一版只允许 loopback 地址（127.0.0.1 / localhost / ::1），
 * 远程部署需要独立设计认证机制后再放开。
 */
/**
 * JSON-RPC 协议层错误，封装服务端返回的 error 对象。
 * code 遵循 JSON-RPC 2.0 规范（-32600 ~ -32603 为协议级错误，其余为应用级）。
 */
export class JsonRpcError extends Error {
	constructor(public readonly code: number, message: string, public readonly data?: unknown) {
		super(message); this.name = 'JsonRpcError'
	}
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * 向 Host /rpc 端点发送 JSON-RPC 请求的客户端。
 * nextId 作为请求序列号自增，确保同一实例内每次请求 id 唯一。
 */
export class JsonRpcClient {
	private nextId = 0
	constructor(private readonly url: string) {
		const host = new URL(url).hostname
		if (!LOOPBACK_HOSTS.has(host)) {
			// 第一版仅允许本机；远程部署需经 AuthN，独立迭代
			throw new Error(`JsonRpcClient only accepts loopback hosts, got: ${host}`)
		}
	}

	/**
	 * 发起一次 JSON-RPC 调用，返回 result 字段的值。
	 * HTTP 非 2xx 或服务端返回 error 对象时抛出 JsonRpcError。
	 */
	async call(method: string, params: unknown): Promise<unknown> {
		const id = ++this.nextId
		const response = await fetch(this.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
		})
		if (!response.ok) throw new JsonRpcError(-32603, `HTTP ${response.status}`)
		const body = (await response.json()) as
			| { result: unknown }
			| { error: { code: number; message: string; data?: unknown } }
		if ('error' in body) throw new JsonRpcError(body.error.code, body.error.message, body.error.data)
		return body.result
	}
}
