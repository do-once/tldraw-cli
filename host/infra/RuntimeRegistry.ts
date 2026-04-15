/**
 * Runtime 注册表
 *
 * 维护当前所有已连接 RuntimeGateway 的内存索引。
 * WsRuntimeTransport 在握手成功时调用 register()，连接断开时调用 unregister()。
 * RuntimeRouter 通过 list() 查询可用实例，ApplicationService 不直接访问 Registry。
 */
// host/infra/RuntimeRegistry.ts
import type { RuntimeGateway, RuntimeId } from './RuntimeGateway'

/** 注册表条目：gateway + runtime 本次会话 ID */
interface RegistryEntry {
	gateway: RuntimeGateway
	runtimeSessionId: string
}

/** 已连接 Runtime 的内存注册表，以 RuntimeId 为键 */
export class RuntimeRegistry {
	private readonly entries = new Map<RuntimeId, RegistryEntry>()

	/** 注册一个新连接的 Runtime，同时记录其 sessionId */
	register(gateway: RuntimeGateway, runtimeSessionId: string): void {
		this.entries.set(gateway.id, { gateway, runtimeSessionId })
	}

	/** 注销指定 Runtime（连接断开时调用） */
	unregister(id: RuntimeId): void { this.entries.delete(id) }

	/** 按 id 查找 RuntimeGateway，不存在返回 undefined */
	get(id: RuntimeId): RuntimeGateway | undefined { return this.entries.get(id)?.gateway }

	/** 按 id 查找 runtimeSessionId，不存在返回 undefined */
	getSessionId(id: RuntimeId): string | undefined { return this.entries.get(id)?.runtimeSessionId }

	/** 返回所有已注册的条目（快照，不持有引用） */
	listEntries(): RegistryEntry[] { return Array.from(this.entries.values()) }

	/** 返回所有已注册 Runtime 的 gateway 列表（快照） */
	list(): RuntimeGateway[] { return this.listEntries().map((e) => e.gateway) }

	/** 当前已注册 Runtime 数量 */
	size(): number { return this.entries.size }
}
