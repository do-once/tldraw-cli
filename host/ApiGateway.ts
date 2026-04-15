/**
 * HTTP 接口层：JSON-RPC 请求分发 + 静态文件服务
 *
 * 对外暴露两个端点：
 * - POST /rpc         接收 JSON-RPC 2.0 请求，分发到对应 ApplicationService
 * - POST /admin/shutdown  触发 Host 优雅关闭（由 CLI stop 命令调用）
 * - GET  /*           静态文件服务（前端 SPA，启用时），未找到文件则 fallback 到 index.html
 *
 * ApiGateway 只负责 HTTP 协议层，不包含任何业务逻辑——业务均在 ApplicationService 里。
 */
// host/ApiGateway.ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import {
	ErrorCodes,
	JsonRpcRequestSchema,
	type JsonRpcErrorResponse,
	type JsonRpcSuccess,
	type MethodName,
} from '../shared/rpc'
import { DEFAULT_HOST } from '../shared/defaults'
import type { CanvasService } from './ApplicationServices/CanvasService'
import type { CommandService } from './ApplicationServices/CommandService'
import type { SessionService } from './ApplicationServices/SessionService'
import { DomainError, MethodNotFoundError } from './infra/errors'

/** 文件扩展名 → MIME 类型映射，用于静态文件服务 */
const MIME: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
}

/** ApiGateway 构造参数 */
export interface ApiGatewayOptions {
	port: number
	session: SessionService
	canvas: CanvasService
	command: CommandService
	onShutdown?: () => Promise<void>
	/** 静态文件目录（dist/client），设置后 GET 请求会 serve 前端 */
	staticDir?: string
}

/** HTTP 接口网关：接收 CLI 的 JSON-RPC 请求并分发到 ApplicationService */
export class ApiGateway {
	private readonly server: Server
	private readonly opts: ApiGatewayOptions
	/** 实际绑定的端口（listen 前为 0） */
	private boundPort = 0

	constructor(options: ApiGatewayOptions) {
		this.opts = options
		this.server = createServer((req, res) => { void this.handle(req, res) })
	}

	/** 获取实际监听端口，listen() 完成前返回 0 */
	get port(): number { return this.boundPort }

	/** 启动 HTTP 服务器，绑定到 localhost:port */
	listen(): Promise<void> {
		return new Promise((resolve) => {
			this.server.listen(this.opts.port, DEFAULT_HOST, () => {
				const addr = this.server.address()
				if (typeof addr === 'object' && addr !== null) this.boundPort = addr.port
				resolve()
			})
		})
	}

	/** 关闭 HTTP 服务器，拒绝新连接并等待现有连接结束 */
	close(): Promise<void> {
		return new Promise((resolve, reject) =>
			this.server.close((err) => (err ? reject(err) : resolve())))
	}

	/**
	 * 请求总入口：
	 * 1. POST /admin/shutdown → 先回 202 再异步触发关闭，避免响应被 TCP RST 截断
	 * 2. POST /rpc → 解析 JSON-RPC 2.0 请求，分发到 dispatch()
	 * 3. GET /* → 静态文件服务（staticDir 存在时）
	 * 4. 其他 → 404
	 */
	private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
		if (req.method === 'POST' && req.url === '/admin/shutdown') {
			res.writeHead(202).end()
			if (this.opts.onShutdown) queueMicrotask(() => { void this.opts.onShutdown!() })
			return
		}
		if (req.method !== 'POST' || req.url !== '/rpc') {
			if (req.method === 'GET' && this.opts.staticDir) {
				this.serveStatic(req, res)
				return
			}
			res.writeHead(404).end()
			return
		}
		const body = await readBody(req)
		let requestId: number | string | null = null
		try {
			const json = JSON.parse(body)
			const parsed = JsonRpcRequestSchema.parse(json)
			requestId = parsed.id
			const result = await this.dispatch(parsed.method as MethodName, parsed.params)
			const success: JsonRpcSuccess = { jsonrpc: '2.0', id: requestId, result }
			this.sendJson(res, 200, success)
		} catch (err) {
			this.sendJson(res, 200, this.toErrorResponse(requestId, err))
		}
	}

	/**
	 * 将 RPC 方法名路由到对应的 ApplicationService 方法。
	 * 未知方法抛 MethodNotFoundError，由 toErrorResponse 转为标准错误响应。
	 */
	private async dispatch(method: MethodName | string, params: unknown): Promise<unknown> {
		switch (method) {
			case 'session.status': return this.opts.session.status()
			case 'canvas.list': return this.opts.canvas.list()
			case 'canvas.snapshot': return this.opts.canvas.snapshot(params as Parameters<CanvasService['snapshot']>[0])
			case 'canvas.diff': return this.opts.canvas.diff(params as Parameters<CanvasService['diff']>[0])
			case 'canvas.create': return this.opts.canvas.create(params as Parameters<CanvasService['create']>[0])
			case 'canvas.select': return this.opts.canvas.select(params as Parameters<CanvasService['select']>[0])
			case 'canvas.getSelection': return this.opts.canvas.getSelection(params as Parameters<CanvasService['getSelection']>[0])
			case 'canvas.screenshot': return this.opts.canvas.screenshot(params as Parameters<CanvasService['screenshot']>[0])
			case 'command.apply': return this.opts.command.apply(params as Parameters<CommandService['apply']>[0])
			case 'command.undo': return this.opts.command.undo()
			case 'command.redo': return this.opts.command.redo()
			default: throw new MethodNotFoundError(method)
		}
	}

	/**
	 * 将各类异常转换为符合 JSON-RPC 2.0 规范的错误响应。
	 * 优先级：JSON 解析错误 → 领域错误 → Zod 校验错误 → 通用内部错误。
	 */
	private toErrorResponse(id: number | string | null, err: unknown): JsonRpcErrorResponse {
		if (err instanceof SyntaxError) {
			return { jsonrpc: '2.0', id, error: { code: ErrorCodes.parseError, message: 'Parse error' } }
		}
		if (err instanceof DomainError) {
			return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } }
		}
		if (err && typeof err === 'object' && 'issues' in err) {
			return {
				jsonrpc: '2.0', id,
				error: {
					code: ErrorCodes.invalidParams,
					message: 'Invalid params',
					data: (err as { issues: unknown }).issues,
				},
			}
		}
		const message = err instanceof Error ? err.message : 'Internal error'
		return { jsonrpc: '2.0', id, error: { code: ErrorCodes.internal, message } }
	}

	private sendJson(res: ServerResponse, status: number, body: unknown): void {
		res.writeHead(status, { 'content-type': 'application/json' })
		res.end(JSON.stringify(body))
	}

	/**
	 * 静态文件服务：将请求路径映射到 staticDir 目录下的文件。
	 * 含 .. 的路径直接 403（防路径穿越攻击）。
	 * 文件不存在时 fallback 到 index.html（支持 SPA 客户端路由）。
	 */
	private serveStatic(req: IncomingMessage, res: ServerResponse): void {
		const dir = this.opts.staticDir!
		const url = new URL(req.url ?? '/', 'http://localhost')
		const rel = url.pathname === '/' ? '/index.html' : url.pathname
		// 防路径穿越
		if (rel.includes('..')) { res.writeHead(403).end(); return }
		const file = join(dir, rel)
		if (!existsSync(file)) {
			// SPA fallback
			const index = join(dir, 'index.html')
			if (existsSync(index)) {
				res.writeHead(200, { 'content-type': 'text/html' })
				res.end(readFileSync(index))
				return
			}
			res.writeHead(404).end()
			return
		}
		const ext = extname(file)
		const mime = MIME[ext] ?? 'application/octet-stream'
		res.writeHead(200, { 'content-type': mime })
		res.end(readFileSync(file))
	}
}

/** 读取 HTTP 请求体，返回 UTF-8 字符串 */
function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on('data', (c) => chunks.push(c as Buffer))
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
		req.on('error', reject)
	})
}
