/**
 * tldraw editor 适配器（业务翻译层）。
 *
 * 实现 RuntimeAdapter 接口，把 Host 下发的 RPC 方法名
 * 映射为对 tldraw Editor 的实际操作：
 *   canvas.list         → getPages()
 *   canvas.snapshot     → extractAllShapes()
 *   canvas.diff         → historyTracker.getEntriesSince()
 *   canvas.create       → createPage()
 *   canvas.select       → setCurrentPage()
 *   canvas.getSelection → getSelectedShapeIds()
 *   canvas.screenshot   → getSvgElement() → toDataURL()
 *   command.apply       → executeCommands()，并推进 revision
 *   command.undo        → editor.undo()，并推进 revision
 *   command.redo        → editor.redo()，并推进 revision
 *
 * revision 和 history 仅在 Runtime 生命周期内有效，重启归零。
 * tldraw editor/store 是唯一数据源，本类不持有画布状态副本。
 */
import type { Editor } from 'tldraw'
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
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	CommandUndoResultSchema,
	CommandRedoResultSchema,
	type CanvasCreateResult,
	type CanvasListResult,
	type CanvasSelectResult,
	type CommandUndoResult,
	type CommandRedoResult,
} from '../../shared/rpc'

// Runtime 不产生 runtimeSessionId（由 Host 注入），用 omit schema 构造 Runtime 侧结果
const RuntimeSnapshotSchema = CanvasSnapshotResultSchema.omit({ runtimeSessionId: true })
const RuntimeDiffSchema = CanvasDiffResultSchema.omit({ runtimeSessionId: true })
const RuntimeGetSelectionSchema = CanvasGetSelectionResultSchema.omit({ runtimeSessionId: true })
const RuntimeApplySchema = CommandApplyResultSchema.omit({ runtimeSessionId: true })

type RuntimeSnapshotResult = ReturnType<typeof RuntimeSnapshotSchema.parse>
type RuntimeDiffResult = ReturnType<typeof RuntimeDiffSchema.parse>
type RuntimeGetSelectionResult = ReturnType<typeof RuntimeGetSelectionSchema.parse>
type RuntimeApplyResult = ReturnType<typeof RuntimeApplySchema.parse>
import { ErrorCodes } from '../../shared/rpc/errors'
import { extractAllShapes } from './shapeExtractor'
import { executeCommands } from './commandExecutor'
import { HistoryTracker } from './historyTracker'
import type { RuntimeAdapter, RuntimeInvokeContext } from './RuntimeAdapter'

/**
 * tldraw Editor 的 RuntimeAdapter 实现。
 * 直接持有 Editor 引用，所有画布读写都通过 Editor API 完成。
 */
export class TldrawRuntimeAdapter implements RuntimeAdapter {
	private readonly historyTracker = new HistoryTracker()

	constructor(private readonly editor: Editor) {}

	/**
	 * 统一 RPC 方法分发入口。
	 * 未知 method 直接抛出 "Method not found" 错误，
	 * Host 会将其包装为 JSON-RPC error 返回给调用方。
	 */
	async invoke(method: string, params: unknown, _ctx: RuntimeInvokeContext): Promise<unknown> {
		switch (method) {
			case 'canvas.list': return this.canvasList()
			case 'canvas.snapshot': return this.canvasSnapshot(params)
			case 'canvas.diff': return this.canvasDiff(params)
			case 'canvas.create': return this.canvasCreate(params)
			case 'canvas.select': return this.canvasSelect(params)
			case 'canvas.getSelection': return this.canvasGetSelection(params)
			case 'canvas.screenshot': return this.canvasScreenshot(params)
			case 'command.apply': return this.commandApply(params)
			case 'command.undo': return this.commandUndo()
			case 'command.redo': return this.commandRedo()
			default: throw new Error(`Method not found: ${method}`)
		}
	}

	/**
	 * 解析目标画布 id：调用方可以省略 canvasId，
	 * 省略时使用 editor 当前活跃 page。
	 */
	private resolveCanvasId(requested: string | undefined): string {
		if (requested) return requested
		return String(this.editor.getCurrentPageId())
	}

	private canvasList(): CanvasListResult {
		const items = this.editor.getPages().map((p) => ({
			id: String(p.id),
			title: p.name,
			revision: this.historyTracker.getRevision(String(p.id)),
		}))
		return CanvasListResultSchema.parse({ items })
	}

	/**
	 * 返回指定画布的全量快照。
	 * 同时调用 detectExternalChanges 将画布外部变更纳入 history。
	 */
	private canvasSnapshot(params: unknown): RuntimeSnapshotResult {
		const parsed = CanvasSnapshotParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const shapes = extractAllShapes(this.editor, canvasId)
		this.historyTracker.detectExternalChanges(canvasId, shapes)
		return RuntimeSnapshotSchema.parse({
			canvasId,
			revision: this.historyTracker.getRevision(canvasId),
			shapes,
		})
	}

	/**
	 * 返回 since revision 之后的增量历史记录。
	 */
	private canvasDiff(params: unknown): RuntimeDiffResult {
		const parsed = CanvasDiffParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const shapes = extractAllShapes(this.editor, canvasId)
		this.historyTracker.detectExternalChanges(canvasId, shapes)
		const entries = this.historyTracker.getEntriesSince(canvasId, parsed.since)
		return RuntimeDiffSchema.parse({
			canvasId,
			fromRevision: parsed.since,
			toRevision: this.historyTracker.getRevision(canvasId),
			entries,
		})
	}

	/**
	 * 在 tldraw editor 中新建一个 page 作为画布。
	 */
	private canvasCreate(params: unknown): CanvasCreateResult {
		const parsed = CanvasCreateParamsSchema.parse(params)
		const title = parsed.title ?? 'Untitled'
		const pagesBefore = this.editor.getPages().map((p) => p.id)
		this.editor.createPage({ name: title })
		const newPage = this.editor.getPages().find((p) => !pagesBefore.includes(p.id))
		const canvasId = newPage ? String(newPage.id) : String(this.editor.getPages().at(-1)!.id)
		return CanvasCreateResultSchema.parse({ canvasId, title, revision: 0 })
	}

	/**
	 * 将指定 page 设为当前活跃 page。
	 */
	private canvasSelect(params: unknown): CanvasSelectResult {
		const parsed = CanvasSelectParamsSchema.parse(params)
		this.editor.setCurrentPage(parsed.canvasId as never)
		return CanvasSelectResultSchema.parse({ activeCanvasId: parsed.canvasId })
	}

	/**
	 * 读取用户在浏览器中当前框选的 shapeId 集合。
	 * 只读操作，不修改画布状态。
	 */
	private canvasGetSelection(params: unknown): RuntimeGetSelectionResult {
		const parsed = CanvasGetSelectionParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const shapeIds = Array.from(this.editor.getSelectedShapeIds()).map(String)
		return RuntimeGetSelectionSchema.parse({
			canvasId,
			revision: this.historyTracker.getRevision(canvasId),
			shapeIds,
		})
	}

	/**
	 * 批量执行画布命令。
	 * expectedRevision 字段已预留但本版本不做 CAS 检查（last-write-wins）。
	 */
	private commandApply(params: unknown): CommandApplyResult {
		const parsed = CommandApplyParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const before = extractAllShapes(this.editor, canvasId)

		let results: Array<{ shapeId: string }>
		try {
			results = executeCommands(this.editor, parsed.commands, canvasId)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			if (message.startsWith('SHAPE_NOT_FOUND:')) {
				const shapeId = message.slice('SHAPE_NOT_FOUND:'.length)
				throw { code: ErrorCodes.shapeNotFound, message: `Shape not found: ${shapeId}` }
			}
			throw err
		}

		const after = extractAllShapes(this.editor, canvasId)
		this.historyTracker.recordChanges(canvasId, before, after)
		return RuntimeApplySchema.parse({
			canvasId,
			revision: this.historyTracker.getRevision(canvasId),
			results,
		})
	}

	private commandUndo(): CommandUndoResult {
		const canvasId = this.resolveCanvasId(undefined)
		const before = extractAllShapes(this.editor, canvasId)
		this.editor.undo()
		const after = extractAllShapes(this.editor, canvasId)
		this.historyTracker.recordChanges(canvasId, before, after)
		return CommandUndoResultSchema.parse({ revision: this.historyTracker.getRevision(canvasId) })
	}

	private commandRedo(): CommandRedoResult {
		const canvasId = this.resolveCanvasId(undefined)
		const before = extractAllShapes(this.editor, canvasId)
		this.editor.redo()
		const after = extractAllShapes(this.editor, canvasId)
		this.historyTracker.recordChanges(canvasId, before, after)
		return CommandRedoResultSchema.parse({ revision: this.historyTracker.getRevision(canvasId) })
	}

	/**
	 * 将当前画布导出为图片 base64 字符串。
	 * 主路径：editor.toImage() → Blob → base64，format='png'
	 * Fallback（toImage 不可用或失败）：getSvgString → base64，format='svg'
	 * 返回 { base64, format } 供 Host 侧按格式写文件。
	 */
	private async canvasScreenshot(params: unknown): Promise<{ base64: string; format: 'png' | 'svg' }> {
		const EMPTY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
		const parsed = CanvasScreenshotParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const shapeIds = Array.from(this.editor.getPageShapeIds(canvasId as never))

		if (shapeIds.length === 0) {
			return { base64: EMPTY_PNG, format: 'png' }
		}

		// 主路径：editor.toImage() 在 tldraw 内部渲染，不经过外部 <canvas>，规避 tainted canvas 问题
		if (typeof this.editor.toImage === 'function' && typeof FileReader !== 'undefined') {
			try {
				const result = await Promise.race([
					this.editor.toImage(shapeIds, { format: 'png', background: true }),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('toImage timeout')), 10000)),
				])
				const base64 = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader()
					reader.onload = () => {
						const dataUrl = reader.result as string
						resolve(dataUrl.split(',')[1])
					}
					reader.onerror = reject
					reader.readAsDataURL(result.blob)
				})
				return { base64, format: 'png' }
			} catch {
				// 继续 fallback
			}
		}

		// Fallback：SVG 字符串 base64（Node 环境 / toImage 不可用时）
		const svgResult = await this.editor.getSvgString(shapeIds, { background: true })
		if (!svgResult) {
			return { base64: EMPTY_PNG, format: 'png' }
		}
		return {
			base64: btoa(unescape(encodeURIComponent(svgResult.svg))),
			format: 'svg',
		}
	}
}
