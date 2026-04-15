/**
 * Runtime 路由器
 *
 * 从 RuntimeRegistry 中选出一个可用的 RuntimeGateway 供 ApplicationService 使用。
 * 当前策略：取列表第一个（单 Runtime 场景），无可用 Runtime 时抛 RuntimeUnavailableError。
 * 未来多 Runtime 场景可扩展为负载均衡或按 canvasId 路由，不影响调用方接口。
 */
// host/infra/RuntimeRouter.ts
import { RuntimeUnavailableError } from './errors'
import type { RuntimeGateway } from './RuntimeGateway'
import type { RuntimeRegistry } from './RuntimeRegistry'

/** pick() 的返回值：gateway 实例 + 本次会话 ID */
export interface PickedRuntime {
	gateway: RuntimeGateway
	runtimeSessionId: string
}

/** 从已连接的 Runtime 中选出一个用于处理当前请求 */
export class RuntimeRouter {
	constructor(private readonly registry: RuntimeRegistry) {}

	/**
	 * 选取一个可用的 RuntimeGateway。
	 * 当前实现：取注册表中的第一个（MVP 单 Runtime 假设）。
	 * 若注册表为空，抛 RuntimeUnavailableError（对应 HTTP 响应中的 1001 错误码）。
	 */
	pick(): PickedRuntime {
		const [first] = this.registry.listEntries()
		if (!first) throw new RuntimeUnavailableError()
		return { gateway: first.gateway, runtimeSessionId: first.runtimeSessionId }
	}
}
