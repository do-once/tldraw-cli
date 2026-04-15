// client/runtime/__tests__/historyTracker.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { HistoryTracker } from '../historyTracker'
import type { Shape } from '../../../shared/rpc/shapes'

function geoShape(id: string, x: number, y: number, text = ''): Shape {
	return {
		kind: 'geo',
		shapeId: id,
		x,
		y,
		rotation: 0,
		w: 100,
		h: 50,
		geo: 'rectangle',
		text,
		color: 'black',
		fill: 'none',
		labelColor: 'black',
	}
}

describe('HistoryTracker', () => {
	let tracker: HistoryTracker

	beforeEach(() => {
		tracker = new HistoryTracker()
	})

	it('初始 revision 为 0', () => {
		expect(tracker.getRevision('canvas-1')).toBe(0)
	})

	it('recordChanges 检测新增 → shape-created entry', () => {
		const shape = geoShape('s1', 0, 0)
		tracker.recordChanges('canvas-1', [], [shape])

		expect(tracker.getRevision('canvas-1')).toBe(1)
		const history = tracker.getHistory('canvas-1')
		expect(history).toHaveLength(1)
		expect(history[0].kind).toBe('shape-created')
		expect(history[0].revision).toBe(1)
		if (history[0].kind === 'shape-created') {
			expect(history[0].shape.shapeId).toBe('s1')
		}
	})

	it('recordChanges 检测删除 → shape-deleted entry', () => {
		const shape = geoShape('s1', 0, 0)
		tracker.recordChanges('canvas-1', [shape], [])

		const history = tracker.getHistory('canvas-1')
		expect(history).toHaveLength(1)
		expect(history[0].kind).toBe('shape-deleted')
		if (history[0].kind === 'shape-deleted') {
			expect(history[0].shapeId).toBe('s1')
		}
	})

	it('recordChanges 检测修改 → shape-updated entry，changes 包含变化字段', () => {
		const before = geoShape('s1', 0, 0)
		const after = geoShape('s1', 100, 200)
		tracker.recordChanges('canvas-1', [before], [after])

		const history = tracker.getHistory('canvas-1')
		expect(history).toHaveLength(1)
		expect(history[0].kind).toBe('shape-updated')
		if (history[0].kind === 'shape-updated') {
			expect(history[0].shapeId).toBe('s1')
			expect(history[0].changes).toMatchObject({ x: 100, y: 200 })
			expect(history[0].changes).not.toHaveProperty('kind')
			expect(history[0].changes).not.toHaveProperty('shapeId')
		}
	})

	it('相同 shapes 不产生 entries，revision 不变', () => {
		const shape = geoShape('s1', 0, 0)
		tracker.recordChanges('canvas-1', [shape], [shape])

		expect(tracker.getRevision('canvas-1')).toBe(0)
		expect(tracker.getHistory('canvas-1')).toHaveLength(0)
	})

	it('getEntriesSince 按 revision 过滤', () => {
		const s1 = geoShape('s1', 0, 0)
		const s2 = geoShape('s2', 100, 0)
		const s3 = geoShape('s3', 200, 0)

		tracker.recordChanges('canvas-1', [], [s1]) // revision 1
		tracker.recordChanges('canvas-1', [s1], [s1, s2]) // revision 2
		tracker.recordChanges('canvas-1', [s1, s2], [s1, s2, s3]) // revision 3

		const since1 = tracker.getEntriesSince('canvas-1', 1)
		expect(since1.every((e) => e.revision > 1)).toBe(true)
		expect(since1).toHaveLength(2)

		const since2 = tracker.getEntriesSince('canvas-1', 2)
		expect(since2).toHaveLength(1)
		expect(since2[0].revision).toBe(3)
	})

	it('detectExternalChanges 第一次调用只初始化基线，不生成 history', () => {
		const shapes = [geoShape('s1', 0, 0), geoShape('s2', 100, 0)]
		tracker.detectExternalChanges('canvas-1', shapes)

		expect(tracker.getRevision('canvas-1')).toBe(0)
		expect(tracker.getHistory('canvas-1')).toHaveLength(0)
	})

	it('detectExternalChanges 后续调用检测变更', () => {
		const initial = [geoShape('s1', 0, 0)]
		tracker.detectExternalChanges('canvas-1', initial)

		// 用户新增了 s2，删除了 s1
		tracker.detectExternalChanges('canvas-1', [geoShape('s2', 50, 50)])

		expect(tracker.getRevision('canvas-1')).toBe(1)
		const history = tracker.getHistory('canvas-1')
		expect(history).toHaveLength(2)
		const kinds = history.map((e) => e.kind).sort()
		expect(kinds).toEqual(['shape-created', 'shape-deleted'])
	})

	it('多 canvas 独立追踪', () => {
		tracker.recordChanges('canvas-1', [], [geoShape('s1', 0, 0)])
		tracker.recordChanges('canvas-2', [], [geoShape('s2', 0, 0), geoShape('s3', 100, 0)])

		expect(tracker.getRevision('canvas-1')).toBe(1)
		expect(tracker.getRevision('canvas-2')).toBe(1)
		expect(tracker.getHistory('canvas-1')).toHaveLength(1)
		expect(tracker.getHistory('canvas-2')).toHaveLength(2)
	})

	it('removeCanvas 删除追踪状态', () => {
		tracker.recordChanges('canvas-1', [], [geoShape('s1', 0, 0)])
		tracker.removeCanvas('canvas-1')

		expect(tracker.getRevision('canvas-1')).toBe(0)
		expect(tracker.getHistory('canvas-1')).toHaveLength(0)
	})
})
