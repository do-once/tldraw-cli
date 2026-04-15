/**
 * 变更追踪器
 *
 * 维护 per-canvas 的 revision 和 history，对比 before/after shape 列表生成
 * shape-created / shape-updated / shape-deleted 三种 history entry。
 */
import type { Shape } from '../../shared/rpc/shapes'
import type { HistoryEntry } from '../../shared/rpc/history'

interface CanvasState {
	revision: number
	history: HistoryEntry[]
	knownShapes: Map<string, Shape>
}

/**
 * 对比两个 shape，返回变化的字段（跳过 kind 和 shapeId）。
 * 用 JSON.stringify 比较值。
 */
function computeChanges(before: Shape, after: Shape): Record<string, unknown> {
	const changes: Record<string, unknown> = {}
	const afterObj = after as Record<string, unknown>
	const beforeObj = before as Record<string, unknown>

	for (const key of Object.keys(afterObj)) {
		if (key === 'kind' || key === 'shapeId') continue
		if (JSON.stringify(afterObj[key]) !== JSON.stringify(beforeObj[key])) {
			changes[key] = afterObj[key]
		}
	}

	// 检查 before 有但 after 没有的字段（理论上 shape 类型不变，但防御性处理）
	for (const key of Object.keys(beforeObj)) {
		if (key === 'kind' || key === 'shapeId') continue
		if (!(key in afterObj)) {
			changes[key] = undefined
		}
	}

	return changes
}

export class HistoryTracker {
	private canvases = new Map<string, CanvasState>()

	private getOrCreate(canvasId: string): CanvasState {
		if (!this.canvases.has(canvasId)) {
			this.canvases.set(canvasId, {
				revision: 0,
				history: [],
				knownShapes: new Map(),
			})
		}
		return this.canvases.get(canvasId)!
	}

	getRevision(canvasId: string): number {
		return this.canvases.get(canvasId)?.revision ?? 0
	}

	getHistory(canvasId: string): HistoryEntry[] {
		return this.canvases.get(canvasId)?.history ?? []
	}

	getEntriesSince(canvasId: string, since: number): HistoryEntry[] {
		const state = this.canvases.get(canvasId)
		if (!state) return []
		return state.history.filter((e) => e.revision > since)
	}

	recordChanges(canvasId: string, before: Shape[], after: Shape[]): void {
		const state = this.getOrCreate(canvasId)

		const beforeMap = new Map(before.map((s) => [s.shapeId, s]))
		const afterMap = new Map(after.map((s) => [s.shapeId, s]))

		const newEntries: HistoryEntry[] = []

		// 新增
		for (const [id, shape] of afterMap) {
			if (!beforeMap.has(id)) {
				newEntries.push({ kind: 'shape-created', revision: 0, shape })
			}
		}

		// 删除
		for (const id of beforeMap.keys()) {
			if (!afterMap.has(id)) {
				newEntries.push({ kind: 'shape-deleted', revision: 0, shapeId: id })
			}
		}

		// 修改
		for (const [id, afterShape] of afterMap) {
			const beforeShape = beforeMap.get(id)
			if (!beforeShape) continue
			const changes = computeChanges(beforeShape, afterShape)
			if (Object.keys(changes).length > 0) {
				newEntries.push({ kind: 'shape-updated', revision: 0, shapeId: id, changes })
			}
		}

		if (newEntries.length > 0) {
			state.revision += 1
			const rev = state.revision
			for (const entry of newEntries) {
				entry.revision = rev
			}
			state.history.push(...newEntries)
		}

		// 更新 knownShapes
		state.knownShapes = afterMap
	}

	detectExternalChanges(canvasId: string, currentShapes: Shape[]): void {
		const state = this.canvases.get(canvasId)

		if (!state) {
			// 第一次调用：只初始化基线，不生成 history
			const newState: CanvasState = {
				revision: 0,
				history: [],
				knownShapes: new Map(currentShapes.map((s) => [s.shapeId, s])),
			}
			this.canvases.set(canvasId, newState)
			return
		}

		const before = Array.from(state.knownShapes.values())
		this.recordChanges(canvasId, before, currentShapes)
	}

	removeCanvas(canvasId: string): void {
		this.canvases.delete(canvasId)
	}
}
