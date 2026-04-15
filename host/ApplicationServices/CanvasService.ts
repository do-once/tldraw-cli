/**
 * Canvas 操作用例
 *
 * 实现所有 canvas.* RPC 方法的业务逻辑。
 * 每个公开方法负责：
 * 1. 用 Zod schema 校验入参（parse 会在校验失败时抛 ZodError）
 * 2. 经 RuntimeRouter 选出 Gateway 并转发请求
 * 3. 用对应的结果 schema 校验 Runtime 返回值
 *    — 若 Runtime 返回值不符合预期，抛 InvalidParamsError（保护上层不受脏数据污染）
 * 4. 将 runtimeSessionId（来自 RuntimeRouter）注入到结果中后返回
 *
 * canvas.diff 额外做会话校验：若调用方传入 runtimeSessionId 且与当前 Runtime 不一致，
 * 立即抛 RuntimeRestartedError（1008），提示 LLM 重建基线。
 *
 * 注意：Runtime 侧不包含 runtimeSessionId，Host 侧在校验 Runtime 原始响应时
 * 使用 .omit({ runtimeSessionId: true }) 剥离该字段，避免校验失败。
 */
// host/ApplicationServices/CanvasService.ts
import {
	CanvasCreateParamsSchema,
	CanvasCreateResultSchema,
	CanvasDiffParamsSchema,
	CanvasDiffResultSchema,
	CanvasListResultSchema,
	CanvasSelectParamsSchema,
	CanvasSelectResultSchema,
	CanvasSnapshotParamsSchema,
	CanvasSnapshotResultSchema,
	CanvasGetSelectionParamsSchema,
	CanvasGetSelectionResultSchema,
	CanvasScreenshotParamsSchema,
	CanvasScreenshotResultSchema,
	type CanvasCreateParams,
	type CanvasCreateResult,
	type CanvasDiffParams,
	type CanvasDiffResult,
	type CanvasListResult,
	type CanvasSelectParams,
	type CanvasSelectResult,
	type CanvasSnapshotParams,
	type CanvasSnapshotResult,
	type CanvasGetSelectionParams,
	type CanvasGetSelectionResult,
	type CanvasScreenshotParams,
	type CanvasScreenshotResult,
} from '../../shared/rpc'
import { InvalidParamsError, RuntimeRestartedError } from '../infra/errors'
import type { RuntimeRouter } from '../infra/RuntimeRouter'
import type { MethodName } from '../../shared/rpc'
import type { ZodTypeAny } from 'zod'
import { z } from 'zod'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Runtime 侧不产生 runtimeSessionId；用 omit 后的 schema 校验 Runtime 原始响应
const SnapshotRuntimeSchema = CanvasSnapshotResultSchema.omit({ runtimeSessionId: true })
const DiffRuntimeSchema = CanvasDiffResultSchema.omit({ runtimeSessionId: true })
const GetSelectionRuntimeSchema = CanvasGetSelectionResultSchema.omit({ runtimeSessionId: true })

/** 提供 canvas.list / snapshot / diff / create / select / getSelection / screenshot 7 个 RPC 方法的实现 */
export class CanvasService {
	constructor(private readonly router: RuntimeRouter) {}

	/** 列出所有画布 */
	list(): Promise<CanvasListResult> {
		return this.forward('canvas.list', {}, CanvasListResultSchema)
	}

	/** 获取画布全量快照（LLM 建立状态基线时使用）；结果注入当前 runtimeSessionId */
	async snapshot(params: CanvasSnapshotParams): Promise<CanvasSnapshotResult> {
		const { gateway, runtimeSessionId } = this.router.pick()
		const raw = await gateway.request('canvas.snapshot', CanvasSnapshotParamsSchema.parse(params))
		const parsed = SnapshotRuntimeSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid canvas.snapshot result', parsed.error.issues)
		}
		return { ...parsed.data, runtimeSessionId }
	}

	/**
	 * 获取指定 revision 之后的增量变更。
	 * 若调用方传入 runtimeSessionId 且与当前 Runtime 不一致，抛 RuntimeRestartedError。
	 */
	async diff(params: CanvasDiffParams): Promise<CanvasDiffResult> {
		const { gateway, runtimeSessionId } = this.router.pick()
		const validated = CanvasDiffParamsSchema.parse(params)
		if (validated.runtimeSessionId !== undefined && validated.runtimeSessionId !== runtimeSessionId) {
			throw new RuntimeRestartedError()
		}
		const raw = await gateway.request('canvas.diff', validated)
		const parsed = DiffRuntimeSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid canvas.diff result', parsed.error.issues)
		}
		return { ...parsed.data, runtimeSessionId }
	}

	/** 创建新画布 */
	create(params: CanvasCreateParams): Promise<CanvasCreateResult> {
		return this.forward('canvas.create', CanvasCreateParamsSchema.parse(params), CanvasCreateResultSchema)
	}

	/** 切换当前活动画布 */
	select(params: CanvasSelectParams): Promise<CanvasSelectResult> {
		return this.forward('canvas.select', CanvasSelectParamsSchema.parse(params), CanvasSelectResultSchema)
	}

	/** 读取用户当前框选的 shapeId 列表（只读，不修改画布）；结果注入当前 runtimeSessionId */
	async getSelection(params: CanvasGetSelectionParams): Promise<CanvasGetSelectionResult> {
		const { gateway, runtimeSessionId } = this.router.pick()
		const raw = await gateway.request('canvas.getSelection', CanvasGetSelectionParamsSchema.parse(params))
		const parsed = GetSelectionRuntimeSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid canvas.getSelection result', parsed.error.issues)
		}
		return { ...parsed.data, runtimeSessionId }
	}

	/** 截取画布为图片，写入临时文件，返回文件路径供 LLM 用 Read 工具读取 */
	async screenshot(params: CanvasScreenshotParams): Promise<CanvasScreenshotResult> {
		const { gateway } = this.router.pick()
		const validated = CanvasScreenshotParamsSchema.parse(params)
		const raw = await gateway.request('canvas.screenshot', validated)
		const runtimeSchema = z.object({
			base64: z.string().min(1),
			format: z.enum(['png', 'svg']).default('png'),
		})
		const parsed = runtimeSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid canvas.screenshot result', parsed.error.issues)
		}
		const { base64, format } = parsed.data
		const buf = Buffer.from(base64, 'base64')
		const imagePath = path.join(os.tmpdir(), `tldraw-screenshot-${Date.now()}.${format}`)
		fs.writeFileSync(imagePath, buf)
		return CanvasScreenshotResultSchema.parse({ imagePath })
	}

	/**
	 * 通用转发模板：选 Gateway → 发请求 → 校验结果 schema。
	 * 用于不需要会话校验或 sessionId 注入的方法（list / create / select）。
	 */
	private async forward<T>(method: MethodName, params: unknown, schema: ZodTypeAny): Promise<T> {
		const { gateway } = this.router.pick()
		const raw = await gateway.request(method, params)
		const parsed = schema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError(`Runtime returned invalid ${method} result`, parsed.error.issues)
		}
		return parsed.data as T
	}
}
