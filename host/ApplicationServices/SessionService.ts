/**
 * Session 查询用例
 *
 * 只读用例：聚合 Host 本身的运行状态和所有已连接 Runtime 的摘要，
 * 供 CLI 的 session status 命令和监控展示使用。
 * 不持有任何状态副本，每次调用都实时从 Registry 和 Runtime 查询。
 */
// host/ApplicationServices/SessionService.ts
import type { SessionStatusResult } from '../../shared/rpc'
import type { RuntimeRegistry } from '../infra/RuntimeRegistry'

/** Session 服务所需的 Host 元信息（构造时注入，运行期不变） */
export interface SessionContext {
	readonly hostVersion: string
	readonly startedAt: number
}

/** 提供 session.status RPC 方法的实现 */
export class SessionService {
	constructor(
		private readonly registry: RuntimeRegistry,
		private readonly ctx: SessionContext,
	) {}

	/**
	 * 查询当前 Host 状态。
	 * 会并发向每个 Runtime 查询 canvas.list 来累加 canvasCount；
	 * 单个 Runtime 查询失败不影响整体响应（吞掉异常，canvasCount 可能偏低）。
	 * activeCanvasId 由 Runtime 侧维护，当前版本 Host 不跟踪，始终返回 null。
	 */
	async status(): Promise<SessionStatusResult> {
		const gateways = this.registry.list()
		let canvasCount = 0
		for (const gw of gateways) {
			try {
				const res = (await gw.request('canvas.list', {})) as { items?: unknown[] }
				if (Array.isArray(res.items)) canvasCount += res.items.length
			} catch { /* runtime 可能正在关闭；对 status 不致命 */ }
		}
		return {
			host: { version: this.ctx.hostVersion, uptimeMs: Math.max(0, Date.now() - this.ctx.startedAt) },
			runtimes: gateways.map((gw) => ({
				id: gw.id,
				state: gw.state,
				methods: gw.capability.methods,
				protocolVersion: gw.capability.protocolVersion,
			})),
			activeCanvasId: null,
			canvasCount,
		}
	}
}
