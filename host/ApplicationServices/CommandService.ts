/**
 * Command 批量执行用例
 *
 * 实现 command.apply RPC 方法：将一批 Command 转发给 Runtime 执行。
 * 入参经 Zod schema 严格校验后才发给 Runtime，返回值同样校验。
 *
 * 注意：expectedRevision 和 idempotencyKey 字段已预留在协议里，
 * 但当前版本 Host 直接透传给 Runtime，不在此层做 CAS 或去重逻辑。
 * apply 结果注入当前 runtimeSessionId，供 CLI 持久化后续 diff 校验用。
 *
 * Runtime 侧不包含 runtimeSessionId；Host 使用 .omit 后的 schema
 * 校验 Runtime 原始响应，再注入 runtimeSessionId 后返回给调用方。
 */
// host/ApplicationServices/CommandService.ts
import {
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	CommandUndoResultSchema,
	CommandRedoResultSchema,
	type CommandApplyParams,
	type CommandApplyResult,
	type CommandUndoResult,
	type CommandRedoResult,
} from '../../shared/rpc'
import { InvalidParamsError } from '../infra/errors'
import type { RuntimeRouter } from '../infra/RuntimeRouter'

// Runtime 侧不产生 runtimeSessionId；用 omit 后的 schema 校验 Runtime 原始响应
const ApplyRuntimeSchema = CommandApplyResultSchema.omit({ runtimeSessionId: true })

/** 提供 command.apply / command.undo / command.redo RPC 方法的实现 */
export class CommandService {
	constructor(private readonly router: RuntimeRouter) {}

	/**
	 * 将命令批次转发给 Runtime 执行。
	 * 1. parse() 校验入参（失败时 Zod 直接抛错，由 ApiGateway 转为 -32602）
	 * 2. 转发到 Runtime，等待结果
	 * 3. 校验结果 schema，注入 runtimeSessionId 后返回给调用方
	 */
	async apply(params: CommandApplyParams): Promise<CommandApplyResult> {
		const validated = CommandApplyParamsSchema.parse(params)
		const { gateway, runtimeSessionId } = this.router.pick()
		const raw = await gateway.request('command.apply', validated)
		const parsed = ApplyRuntimeSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid command.apply result', parsed.error.issues)
		}
		return { ...parsed.data, runtimeSessionId }
	}

	async undo(): Promise<CommandUndoResult> {
		const { gateway } = this.router.pick()
		const raw = await gateway.request('command.undo', {})
		const parsed = CommandUndoResultSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid command.undo result', parsed.error.issues)
		}
		return parsed.data
	}

	async redo(): Promise<CommandRedoResult> {
		const { gateway } = this.router.pick()
		const raw = await gateway.request('command.redo', {})
		const parsed = CommandRedoResultSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid command.redo result', parsed.error.issues)
		}
		return parsed.data
	}
}
