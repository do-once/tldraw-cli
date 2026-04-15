// shared/rpc/__tests__/commands.test.ts
import { describe, expect, it } from 'vitest'
import {
	CommandSchema,
	CreateGeoShapeCommandSchema,
	CreateTextCommandSchema,
	CreateArrowCommandSchema,
	CreateNoteCommandSchema,
	DeleteShapeCommandSchema,
	UpdateShapeCommandSchema,
} from '../commands'

describe('create-geo-shape', () => {
	it('accepts minimal input', () => {
		const result = CreateGeoShapeCommandSchema.parse({
			kind: 'create-geo-shape',
			geo: 'rectangle',
			x: 0,
			y: 0,
			w: 100,
			h: 50,
		})
		expect(result.kind).toBe('create-geo-shape')
		expect(result.geo).toBe('rectangle')
	})

	it('accepts optional style fields', () => {
		const result = CreateGeoShapeCommandSchema.parse({
			kind: 'create-geo-shape',
			geo: 'ellipse',
			x: 10,
			y: 20,
			w: 200,
			h: 100,
			text: 'Hello',
			color: 'blue',
			fill: 'solid',
			labelColor: 'white',
		})
		expect(result.text).toBe('Hello')
		expect(result.color).toBe('blue')
		expect(result.fill).toBe('solid')
		expect(result.labelColor).toBe('white')
	})

	it('rejects negative w', () => {
		expect(() =>
			CreateGeoShapeCommandSchema.parse({
				kind: 'create-geo-shape',
				geo: 'rectangle',
				x: 0,
				y: 0,
				w: -1,
				h: 50,
			}),
		).toThrow()
	})

	it('rejects invalid geo value', () => {
		expect(() =>
			CreateGeoShapeCommandSchema.parse({
				kind: 'create-geo-shape',
				geo: 'invalid-shape',
				x: 0,
				y: 0,
				w: 100,
				h: 50,
			}),
		).toThrow()
	})
})

describe('create-text', () => {
	it('accepts minimal input', () => {
		const result = CreateTextCommandSchema.parse({
			kind: 'create-text',
			x: 0,
			y: 0,
			text: 'Hello world',
		})
		expect(result.kind).toBe('create-text')
		expect(result.text).toBe('Hello world')
	})

	it('accepts optional fields', () => {
		const result = CreateTextCommandSchema.parse({
			kind: 'create-text',
			x: 10,
			y: 20,
			text: 'Test',
			w: 300,
			color: 'red',
			font: 'mono',
			size: 'xl',
			textAlign: 'middle',
		})
		expect(result.w).toBe(300)
		expect(result.font).toBe('mono')
		expect(result.textAlign).toBe('middle')
	})

	it('requires text field', () => {
		expect(() =>
			CreateTextCommandSchema.parse({ kind: 'create-text', x: 0, y: 0 }),
		).toThrow()
	})
})

describe('create-arrow', () => {
	it('accepts minimal input', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 100,
		})
		expect(result.kind).toBe('create-arrow')
	})

	it('accepts binding shape ids and style options', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 100,
			startBindingShapeId: 'shape:abc',
			endBindingShapeId: 'shape:def',
			text: 'connects',
			color: 'green',
			arrowheadStart: 'arrow',
			arrowheadEnd: 'triangle',
		})
		expect(result.startBindingShapeId).toBe('shape:abc')
		expect(result.arrowheadStart).toBe('arrow')
	})

	it('rejects empty string startBindingShapeId', () => {
		expect(() =>
			CreateArrowCommandSchema.parse({
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 100,
				startBindingShapeId: '',
			}),
		).toThrow()
	})

	it('rejects empty string endBindingShapeId', () => {
		expect(() =>
			CreateArrowCommandSchema.parse({
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 100,
				endBindingShapeId: '',
			}),
		).toThrow()
	})

	it('accepts valid dash enum values', () => {
		for (const dash of ['solid', 'dashed', 'dotted', 'draw'] as const) {
			const result = CreateArrowCommandSchema.parse({
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 100,
				dash,
			})
			expect(result.dash).toBe(dash)
		}
	})

	it('rejects invalid dash enum value', () => {
		expect(() =>
			CreateArrowCommandSchema.parse({
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 100,
				dash: 'wavy',
			}),
		).toThrow()
	})

	it('accepts numeric bend value including negative', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 100,
			bend: -0.5,
		})
		expect(result.bend).toBe(-0.5)
	})
})

describe('create-note', () => {
	it('accepts minimal input', () => {
		const result = CreateNoteCommandSchema.parse({
			kind: 'create-note',
			x: 0,
			y: 0,
			text: 'A sticky note',
		})
		expect(result.kind).toBe('create-note')
		expect(result.text).toBe('A sticky note')
	})

	it('accepts optional color', () => {
		const result = CreateNoteCommandSchema.parse({
			kind: 'create-note',
			x: 0,
			y: 0,
			text: 'Note',
			color: 'yellow',
		})
		expect(result.color).toBe('yellow')
	})
})

describe('delete-shape', () => {
	it('accepts shapeId', () => {
		const result = DeleteShapeCommandSchema.parse({
			kind: 'delete-shape',
			shapeId: 'shape:123',
		})
		expect(result.shapeId).toBe('shape:123')
	})

	it('requires shapeId', () => {
		expect(() =>
			DeleteShapeCommandSchema.parse({ kind: 'delete-shape' }),
		).toThrow()
	})
})

describe('update-shape', () => {
	it('accepts shapeId only (all fields optional)', () => {
		const result = UpdateShapeCommandSchema.parse({
			kind: 'update-shape',
			shapeId: 'shape:abc',
		})
		expect(result.shapeId).toBe('shape:abc')
		expect(result.x).toBeUndefined()
	})

	it('accepts full optional fields', () => {
		const result = UpdateShapeCommandSchema.parse({
			kind: 'update-shape',
			shapeId: 'shape:abc',
			x: 10,
			y: 20,
			rotation: 1.57,
			w: 200,
			h: 100,
			text: 'Updated',
			color: 'violet',
			fill: 'semi',
			labelColor: 'white',
			geo: 'diamond',
			font: 'mono',
			size: 'l',
			textAlign: 'middle',
			name: 'MyShape',
			arrowheadStart: 'dot',
			arrowheadEnd: 'bar',
		})
		expect(result.geo).toBe('diamond')
		expect(result.arrowheadEnd).toBe('bar')
		expect(result.labelColor).toBe('white')
		expect(result.font).toBe('mono')
		expect(result.size).toBe('l')
		expect(result.textAlign).toBe('middle')
	})

	it('rejects unknown font value', () => {
		expect(() =>
			UpdateShapeCommandSchema.parse({
				kind: 'update-shape',
				shapeId: 'shape:abc',
				font: 'comic-sans',
			}),
		).toThrow()
	})

	it('accepts dash enum values for arrow update', () => {
		for (const dash of ['solid', 'dashed', 'dotted', 'draw'] as const) {
			const result = UpdateShapeCommandSchema.parse({
				kind: 'update-shape',
				shapeId: 'shape:abc',
				dash,
			})
			expect(result.dash).toBe(dash)
		}
	})

	it('rejects invalid dash value for update-shape', () => {
		expect(() =>
			UpdateShapeCommandSchema.parse({
				kind: 'update-shape',
				shapeId: 'shape:abc',
				dash: 'zigzag',
			}),
		).toThrow()
	})

	it('accepts numeric bend value for update-shape', () => {
		const result = UpdateShapeCommandSchema.parse({
			kind: 'update-shape',
			shapeId: 'shape:abc',
			bend: 0.8,
		})
		expect(result.bend).toBe(0.8)
	})
})

describe('CommandSchema (discriminatedUnion)', () => {
	it('dispatches create-geo-shape', () => {
		const result = CommandSchema.parse({
			kind: 'create-geo-shape',
			geo: 'rectangle',
			x: 0,
			y: 0,
			w: 10,
			h: 10,
		})
		expect(result.kind).toBe('create-geo-shape')
	})

	it('dispatches delete-shape', () => {
		const result = CommandSchema.parse({
			kind: 'delete-shape',
			shapeId: 'shape:xyz',
		})
		expect(result.kind).toBe('delete-shape')
	})

	it('rejects unknown kind', () => {
		expect(() =>
			CommandSchema.parse({ kind: 'unknown-command', shapeId: 'shape:1' }),
		).toThrow()
	})
})

// ——— create-arrow fill 字段 ———

describe('create-arrow fill 字段', () => {
	it('accepts fill=solid for UML composition', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 0,
			arrowheadEnd: 'diamond',
			fill: 'solid',
		})
		expect(result.fill).toBe('solid')
	})

	it('accepts fill=none for UML aggregation', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 0,
			arrowheadEnd: 'diamond',
			fill: 'none',
		})
		expect(result.fill).toBe('none')
	})

	it('fill is optional (defaults to undefined)', () => {
		const result = CreateArrowCommandSchema.parse({
			kind: 'create-arrow',
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 0,
		})
		expect(result.fill).toBeUndefined()
	})
})
