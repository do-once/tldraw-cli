// shared/rpc/__tests__/history.test.ts
import { describe, expect, it } from 'vitest'
import {
	HistoryEntrySchema,
	ShapeCreatedEntrySchema,
	ShapeUpdatedEntrySchema,
	ShapeDeletedEntrySchema,
} from '../history'

describe('ShapeCreatedEntrySchema', () => {
	it('接受合法的 geo shape-created entry', () => {
		const entry = {
			kind: 'shape-created',
			revision: 1,
			shape: {
				kind: 'geo',
				shapeId: 'shape-1',
				x: 0,
				y: 0,
				rotation: 0,
				w: 100,
				h: 50,
				geo: 'rectangle',
				text: '',
				color: 'black',
				fill: 'none',
				labelColor: 'black',
			},
		}
		expect(() => ShapeCreatedEntrySchema.parse(entry)).not.toThrow()
	})

	it('接受带 arrow shape 的 created entry', () => {
		const entry = {
			kind: 'shape-created',
			revision: 2,
			shape: {
				kind: 'arrow',
				shapeId: 'shape-arrow-1',
				x: 10,
				y: 20,
				rotation: 0,
				start: { x: 0, y: 0 },
				end: { x: 100, y: 100 },
				startBinding: null,
				endBinding: null,
				text: '',
				color: 'black',
				arrowheadStart: 'none',
				arrowheadEnd: 'arrow',
				dash: 'draw',
				bend: 0,
			},
		}
		expect(() => ShapeCreatedEntrySchema.parse(entry)).not.toThrow()
	})

	it('拒绝 revision 为 0', () => {
		const entry = {
			kind: 'shape-created',
			revision: 0,
			shape: {
				kind: 'geo',
				shapeId: 'shape-1',
				x: 0,
				y: 0,
				rotation: 0,
				w: 100,
				h: 50,
				geo: 'rectangle',
				text: '',
				color: 'black',
				fill: 'none',
				labelColor: 'black',
			},
		}
		expect(() => ShapeCreatedEntrySchema.parse(entry)).toThrow()
	})
})

describe('ShapeUpdatedEntrySchema', () => {
	it('接受合法的 shape-updated entry', () => {
		const entry = {
			kind: 'shape-updated',
			revision: 1,
			shapeId: 'shape-1',
			changes: { x: 200, y: 300 },
		}
		expect(() => ShapeUpdatedEntrySchema.parse(entry)).not.toThrow()
	})

	it('接受 changes 为空对象', () => {
		const entry = {
			kind: 'shape-updated',
			revision: 1,
			shapeId: 'shape-1',
			changes: {},
		}
		expect(() => ShapeUpdatedEntrySchema.parse(entry)).not.toThrow()
	})
})

describe('ShapeDeletedEntrySchema', () => {
	it('接受合法的 shape-deleted entry', () => {
		const entry = {
			kind: 'shape-deleted',
			revision: 3,
			shapeId: 'shape-2',
		}
		expect(() => ShapeDeletedEntrySchema.parse(entry)).not.toThrow()
	})
})

describe('HistoryEntrySchema', () => {
	it('按 kind 分发到对应 schema', () => {
		const created = {
			kind: 'shape-created',
			revision: 1,
			shape: {
				kind: 'geo',
				shapeId: 'shape-1',
				x: 0,
				y: 0,
				rotation: 0,
				w: 100,
				h: 50,
				geo: 'rectangle',
				text: '',
				color: 'black',
				fill: 'none',
				labelColor: 'black',
			},
		}
		const updated = {
			kind: 'shape-updated',
			revision: 2,
			shapeId: 'shape-1',
			changes: { x: 50 },
		}
		const deleted = {
			kind: 'shape-deleted',
			revision: 3,
			shapeId: 'shape-1',
		}

		expect(HistoryEntrySchema.parse(created).kind).toBe('shape-created')
		expect(HistoryEntrySchema.parse(updated).kind).toBe('shape-updated')
		expect(HistoryEntrySchema.parse(deleted).kind).toBe('shape-deleted')
	})

	it('拒绝非法 kind', () => {
		const entry = {
			kind: 'shape-moved',
			revision: 1,
			shapeId: 'shape-1',
		}
		expect(() => HistoryEntrySchema.parse(entry)).toThrow()
	})
})
