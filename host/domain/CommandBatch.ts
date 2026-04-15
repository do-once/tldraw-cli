/**
 * CommandBatch 领域对象
 *
 * 一次 command.apply 请求的领域表示。
 * commands 列表中的命令由 Runtime 按顺序原子执行，结果按序返回。
 *
 * expectedRevision 和 idempotencyKey 为预留字段：
 * - expectedRevision：当前版本不做 CAS 检查（last-write-wins）
 * - idempotencyKey：当前版本不做去重，重复提交会被执行多次
 * 两个字段均已在协议中预留，启用时不需要改 schema。
 */
// host/domain/CommandBatch.ts
import type { Command } from '../../shared/rpc'

/** command.apply 请求的领域模型，对应 CommandApplyParams 的结构化表示 */
export interface CommandBatch {
	/** 目标画布 id，undefined 时 Runtime 使用当前活动画布 */
	readonly canvasId: string | undefined
	/** 预期 revision，用于乐观并发控制（当前版本不检查） */
	readonly expectedRevision: number | undefined
	/** 幂等键，用于防止命令重放（当前版本不去重） */
	readonly idempotencyKey: string | undefined
	/** 要执行的命令列表，至少一条 */
	readonly commands: readonly Command[]
}
