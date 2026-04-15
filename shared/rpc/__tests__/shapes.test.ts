// shared/rpc/__tests__/shapes.test.ts
import { describe, expect, it } from 'vitest'
import {
	ShapeSchema,
	GeoShapeSchema,
	TextShapeSchema,
	ArrowShapeSchema,
	NoteShapeSchema,
	FrameShapeSchema,
	UnknownShapeSchema,
	ArrowheadEnum,
	FillEnum,
} from '../shapes'

const baseGeo = {
	kind: 'geo' as const,
	shapeId: 'shape:1',
	x: 0,
	y: 0,
	rotation: 0,
	w: 100,
	h: 80,
	geo: 'rectangle' as const,
	text: 'hello',
	color: 'black' as const,
	fill: 'none' as const,
	labelColor: 'black' as const,
}

describe('GeoShapeSchema', () => {
	it('accepts valid geo shape', () => {
		expect(() => GeoShapeSchema.parse(baseGeo)).not.toThrow()
	})

	it('accepts geo shape with parentId', () => {
		expect(() =>
			GeoShapeSchema.parse({ ...baseGeo, parentId: 'frame:1' }),
		).not.toThrow()
	})

	it('rejects invalid geo type', () => {
		expect(() =>
			GeoShapeSchema.parse({ ...baseGeo, geo: 'invalid-shape' }),
		).toThrow()
	})

	it('rejects invalid color', () => {
		expect(() =>
			GeoShapeSchema.parse({ ...baseGeo, color: 'pink' }),
		).toThrow()
	})

	it('accepts all 20 geo subtypes', () => {
		const geoTypes = [
			'rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon',
			'hexagon', 'octagon', 'star', 'rhombus', 'rhombus-2',
			'oval', 'trapezoid', 'arrow-right', 'arrow-left', 'arrow-up',
			'arrow-down', 'x-box', 'check-box', 'heart', 'cloud',
		]
		for (const geo of geoTypes) {
			expect(() => GeoShapeSchema.parse({ ...baseGeo, geo })).not.toThrow()
		}
	})
})

describe('TextShapeSchema', () => {
	const baseText = {
		kind: 'text' as const,
		shapeId: 'shape:2',
		x: 10,
		y: 20,
		rotation: 0,
		w: 200,
		text: 'sample text',
		color: 'blue' as const,
		font: 'sans' as const,
		size: 'm' as const,
		textAlign: 'middle' as const,
	}

	it('accepts valid text shape', () => {
		expect(() => TextShapeSchema.parse(baseText)).not.toThrow()
	})

	it('accepts text shape with parentId', () => {
		expect(() =>
			TextShapeSchema.parse({ ...baseText, parentId: 'frame:1' }),
		).not.toThrow()
	})
})

describe('ArrowShapeSchema', () => {
	const baseArrow = {
		kind: 'arrow' as const,
		shapeId: 'shape:3',
		x: 0,
		y: 0,
		rotation: 0,
		start: { x: 0, y: 0 },
		end: { x: 100, y: 100 },
		startBinding: null,
		endBinding: null,
		text: '',
		color: 'black' as const,
		arrowheadStart: 'none' as const,
		arrowheadEnd: 'arrow' as const,
		dash: 'draw' as const,
		bend: 0,
	}

	it('accepts arrow without binding', () => {
		expect(() => ArrowShapeSchema.parse(baseArrow)).not.toThrow()
	})

	it('accepts arrow with start binding', () => {
		expect(() =>
			ArrowShapeSchema.parse({
				...baseArrow,
				startBinding: { shapeId: 'shape:10' },
			}),
		).not.toThrow()
	})

	it('accepts arrow with both bindings', () => {
		expect(() =>
			ArrowShapeSchema.parse({
				...baseArrow,
				startBinding: { shapeId: 'shape:10' },
				endBinding: { shapeId: 'shape:20' },
			}),
		).not.toThrow()
	})
})

describe('NoteShapeSchema', () => {
	it('accepts valid note shape', () => {
		expect(() =>
			NoteShapeSchema.parse({
				kind: 'note',
				shapeId: 'shape:4',
				x: 0,
				y: 0,
				rotation: 0,
				text: 'sticky note',
				color: 'yellow',
			}),
		).not.toThrow()
	})
})

describe('FrameShapeSchema', () => {
	it('accepts valid frame shape', () => {
		expect(() =>
			FrameShapeSchema.parse({
				kind: 'frame',
				shapeId: 'shape:5',
				x: 0,
				y: 0,
				rotation: 0,
				w: 400,
				h: 300,
				name: 'My Frame',
			}),
		).not.toThrow()
	})
})

describe('UnknownShapeSchema', () => {
	it('accepts unknown shape without w/h', () => {
		expect(() =>
			UnknownShapeSchema.parse({
				kind: 'unknown',
				shapeId: 'shape:6',
				x: 0,
				y: 0,
				rotation: 0,
				type: 'custom-shape',
			}),
		).not.toThrow()
	})

	it('accepts unknown shape with w and h', () => {
		expect(() =>
			UnknownShapeSchema.parse({
				kind: 'unknown',
				shapeId: 'shape:6',
				x: 0,
				y: 0,
				rotation: 0,
				type: 'custom-shape',
				w: 100,
				h: 50,
			}),
		).not.toThrow()
	})
})

describe('ShapeSchema (discriminatedUnion)', () => {
	it('routes geo by kind', () => {
		const r = ShapeSchema.parse(baseGeo)
		expect(r.kind).toBe('geo')
	})

	it('routes unknown by kind', () => {
		const r = ShapeSchema.parse({
			kind: 'unknown',
			shapeId: 'shape:99',
			x: 0,
			y: 0,
			rotation: 0,
			type: 'exotic',
		})
		expect(r.kind).toBe('unknown')
	})

	it('rejects unknown kind value', () => {
		expect(() =>
			ShapeSchema.parse({ kind: 'line', shapeId: 'x', x: 0, y: 0, rotation: 0 }),
		).toThrow()
	})
})

// ——— enum re-export 等价性（来自 generated） ———

describe('enum re-export 等价性（来自 generated）', () => {
	it('ArrowheadEnum 包含 diamond 和 pipe', () => {
		expect(ArrowheadEnum.options).toContain('diamond')
		expect(ArrowheadEnum.options).toContain('pipe')
	})

	it('FillEnum 包含 none / semi / solid / fill / pattern', () => {
		const opts = FillEnum.options
		expect(opts).toContain('none')
		expect(opts).toContain('semi')
		expect(opts).toContain('solid')
		expect(opts).toContain('fill')
		expect(opts).toContain('pattern')
	})

	it('ArrowheadEnum 可解析 arrow shape 中的 diamond', () => {
		const shape = {
			kind: 'arrow' as const,
			shapeId: 'shape:1',
			x: 0,
			y: 0,
			rotation: 0,
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			startBinding: null,
			endBinding: null,
			text: '',
			color: 'black' as const,
			arrowheadStart: 'none' as const,
			arrowheadEnd: 'diamond' as const,
			dash: 'solid' as const,
			bend: 0,
		}
		expect(ArrowShapeSchema.parse(shape).arrowheadEnd).toBe('diamond')
	})
})
