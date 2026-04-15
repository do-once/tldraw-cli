/**
 * Host 进程主入口
 *
 * 负责组装所有组件（Registry、Router、Transport、ApplicationServices、ApiGateway），
 * 并对外暴露 start / stop 生命周期。HostProcess 是依赖注入的根节点：
 * 所有组件在构造函数里按依赖顺序实例化，无运行时动态注册。
 *
 * 启动流程：new HostProcess(config) → start()
 * 关闭流程：stop(reason) → 广播 shutdown → 等待 Runtime 收到通知 → 关闭 WS/HTTP
 */
// host/HostProcess.ts
import { ApiGateway } from './ApiGateway'
import { CanvasService } from './ApplicationServices/CanvasService'
import { CommandService } from './ApplicationServices/CommandService'
import { SessionService } from './ApplicationServices/SessionService'
import { RuntimeRegistry } from './infra/RuntimeRegistry'
import { RuntimeRouter } from './infra/RuntimeRouter'
import { WsRuntimeTransport } from './infra/WsRuntimeTransport'

const HOST_VERSION = '0.0.1'

/** Host 启动配置 */
export interface HostConfig {
	readonly httpPort: number
	readonly wsPort: number
	/** 前端静态文件目录，设置后 Host 同时 serve 前端页面 */
	readonly staticDir?: string
}

/** Host 进程：生命周期管理 + 组件装配 */
export class HostProcess {
	readonly registry: RuntimeRegistry
	readonly router: RuntimeRouter
	readonly apiGateway: ApiGateway
	readonly wsTransport: WsRuntimeTransport
	/** 防止 stop() 被并发调用多次 */
	private stopping = false

	constructor(config: HostConfig) {
		const startedAt = Date.now()
		this.registry = new RuntimeRegistry()
		this.router = new RuntimeRouter(this.registry)
		const session = new SessionService(this.registry, { hostVersion: HOST_VERSION, startedAt })
		const canvas = new CanvasService(this.router)
		const command = new CommandService(this.router)
		this.wsTransport = new WsRuntimeTransport({ port: config.wsPort, registry: this.registry })
		this.apiGateway = new ApiGateway({
			port: config.httpPort,
			session, canvas, command,
			onShutdown: () => this.stop('requested'),
			staticDir: config.staticDir,
		})
	}

	/** 启动 HTTP 服务器（WS 服务器在构造时已启动） */
	async start(): Promise<void> {
		await this.apiGateway.listen()
	}

	/**
	 * 优雅关闭：先通知所有已连接的 Runtime，再依次关闭 WS 和 HTTP 服务器。
	 * 100ms 的等待是为了让 Runtime 有机会收到 shutdown 通知后主动断开。
	 */
	async stop(reason = 'signal'): Promise<void> {
		if (this.stopping) return
		this.stopping = true
		try { this.wsTransport.broadcastShutdown(reason) } catch { /* best effort */ }
		// 给 runtime 一小段时间收到通知
		await new Promise((r) => setTimeout(r, 100))
		await this.wsTransport.close()
		await this.apiGateway.close()
	}
}

async function main(): Promise<void> {
	const { existsSync } = await import('node:fs')
	const { dirname, join } = await import('node:path')
	const { fileURLToPath } = await import('node:url')
	const hostDir = dirname(fileURLToPath(import.meta.url))
	// 优先使用环境变量指定的静态目录（E2E 测试场景），其次按约定位置推导
	const envStaticDir = process.env.TLDRAW_STATIC_DIR
	const clientDir = envStaticDir ?? join(hostDir, 'client')
	const staticDir = existsSync(join(clientDir, 'index.html')) ? clientDir : undefined
	const { DEFAULT_HTTP_PORT, DEFAULT_WS_PORT, DEFAULT_HOST } = await import('../shared/defaults')
	const httpPort = Number(process.env.TLDRAW_HTTP_PORT) || DEFAULT_HTTP_PORT
	const wsPort = Number(process.env.TLDRAW_WS_PORT) || DEFAULT_WS_PORT
	const host = new HostProcess({ httpPort, wsPort, staticDir })
	await host.start()

	// Host 自己写 session 文件，不管是 CLI start 还是手动启动都会有
	const { writeSessionFile, clearSessionFile } = await import('../cli/hostClient/sessionFile')
	const sessionPath = process.env.TLDRAW_SESSION_FILE ?? undefined
	const sessionData = {
		hostPid: process.pid,
		httpPort: host.apiGateway.port,
		wsPort: host.wsTransport.port,
		startedAt: Date.now(),
	}
	if (sessionPath) writeSessionFile(sessionPath, sessionData)
	else writeSessionFile(sessionData)

	const parts = [`http=${DEFAULT_HOST}:${host.apiGateway.port}`, `ws=${DEFAULT_HOST}:${host.wsTransport.port}`]
	if (staticDir) parts.push(`ui=http://${DEFAULT_HOST}:${host.apiGateway.port}/`)
	// eslint-disable-next-line no-console
	console.log(`[tldraw-host] ready: ${parts.join(' ')}`)
	const shutdown = async (reason: string) => {
		await host.stop(reason)
		clearSessionFile(sessionPath)
		process.exit(0)
	}
	process.on('SIGINT', () => { void shutdown('SIGINT') })
	process.on('SIGTERM', () => { void shutdown('SIGTERM') })
}

import { pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const invokedDirectly =
	typeof import.meta.url === 'string' &&
	typeof process.argv[1] === 'string' &&
	import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href

if (invokedDirectly) void main()
