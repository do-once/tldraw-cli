// shared/rpc/__tests__/methods.test.ts
import { describe, expect, it } from 'vitest'
import {
	SessionStatusResultSchema,
	CanvasListResultSchema,
	CanvasSnapshotParamsSchema,
	CanvasSnapshotResultSchema,
	CanvasDiffParamsSchema,
	CanvasDiffResultSchema,
	CanvasCreateParamsSchema,
	CanvasSelectParamsSchema,
	CanvasGetSelectionParamsSchema,
	CanvasGetSelectionResultSchema,
	CanvasScreenshotParamsSchema,
	CanvasScreenshotResultSchema,
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	MethodMap,
} from '../methods'

describe('MethodMap', () => {
	it('contains 11 methods', () => {
		expect(Object.keys(MethodMap).sort()).toEqual([
			'canvas.create',
			'canvas.diff',
			'canvas.getSelection',
			'canvas.list',
			'canvas.screenshot',
			'canvas.select',
			'canvas.snapshot',
			'command.apply',
			'command.redo',
			'command.undo',
			'session.status',
		])
	})
})

describe('SessionStatusResultSchema', () => {
	it('accepts zero runtimes', () => {
		expect(() =>
			SessionStatusResultSchema.parse({
				host: { version: '0.0.1', uptimeMs: 0 },
				runtimes: [],
				activeCanvasId: null,
				canvasCount: 0,
			}),
		).not.toThrow()
	})
})

describe('CanvasListResultSchema', () => {
	it('accepts items', () => {
		const r = CanvasListResultSchema.parse({
			items: [{ id: 'page:1', title: 'Page 1', revision: 0 }],
		})
		expect(r.items).toHaveLength(1)
	})
})

describe('CanvasSnapshot', () => {
	it('params optional canvasId', () => {
		expect(() => CanvasSnapshotParamsSchema.parse({})).not.toThrow()
	})
	it('result has shapes array', () => {
		expect(() =>
			CanvasSnapshotResultSchema.parse({
				canvasId: 'page:1',
				revision: 0,
				shapes: [
					{
						kind: 'geo',
						shapeId: 'shape:1',
						x: 0, y: 0, rotation: 0,
						w: 10, h: 10,
						geo: 'rectangle',
						text: '',
						color: 'black',
						fill: 'none',
						labelColor: 'black',
					},
				],
				runtimeSessionId: '00000000-0000-4000-8000-000000000001',
			}),
		).not.toThrow()
	})
})

describe('CanvasDiff', () => {
	it('requires since >= 0', () => {
		expect(() => CanvasDiffParamsSchema.parse({ since: -1 })).toThrow()
	})
	it('result entries can be empty', () => {
		expect(() =>
			CanvasDiffResultSchema.parse({
				canvasId: 'page:1',
				fromRevision: 0,
				toRevision: 0,
				entries: [],
				runtimeSessionId: '00000000-0000-4000-8000-000000000001',
			}),
		).not.toThrow()
	})
	it('result accepts shape-created entry', () => {
		expect(() =>
			CanvasDiffResultSchema.parse({
				canvasId: 'page:1',
				fromRevision: 0,
				toRevision: 1,
				entries: [
					{
						kind: 'shape-created',
						revision: 1,
						shape: {
							kind: 'geo',
							shapeId: 'shape:1',
							x: 0, y: 0, rotation: 0,
							w: 10, h: 10,
							geo: 'rectangle',
							text: '',
							color: 'black',
							fill: 'none',
							labelColor: 'black',
						},
					},
				],
				runtimeSessionId: '00000000-0000-4000-8000-000000000001',
			}),
		).not.toThrow()
	})
})

describe('CanvasCreate / Select', () => {
	it('create allows empty params', () => {
		expect(() => CanvasCreateParamsSchema.parse({})).not.toThrow()
	})
	it('select requires canvasId', () => {
		expect(() => CanvasSelectParamsSchema.parse({} as unknown)).toThrow()
	})
})

describe('CommandApply', () => {
	it('requires at least one command', () => {
		expect(() => CommandApplyParamsSchema.parse({ commands: [] })).toThrow()
	})
	it('accepts create-geo-shape', () => {
		const p = CommandApplyParamsSchema.parse({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
		})
		expect(p.commands[0].kind).toBe('create-geo-shape')
	})
	it('result requires revision as number', () => {
		expect(() =>
			CommandApplyResultSchema.parse({ canvasId: 'page:1', revision: 'wrong', results: [], runtimeSessionId: '00000000-0000-4000-8000-000000000001' }),
		).toThrow()
	})
})

describe('CanvasGetSelection', () => {
	it('params canvasId is optional', () => {
		expect(() => CanvasGetSelectionParamsSchema.parse({})).not.toThrow()
	})
	it('params accepts canvasId', () => {
		expect(() => CanvasGetSelectionParamsSchema.parse({ canvasId: 'page:1' })).not.toThrow()
	})
	it('result has shapeIds array and revision', () => {
		expect(() =>
			CanvasGetSelectionResultSchema.parse({
				canvasId: 'page:1',
				revision: 3,
				shapeIds: ['shape:a', 'shape:b'],
				runtimeSessionId: '00000000-0000-4000-8000-000000000001',
			}),
		).not.toThrow()
	})
	it('result rejects invalid input (missing canvasId)', () => {
		expect(() =>
			CanvasGetSelectionResultSchema.parse({ revision: 0, shapeIds: [], runtimeSessionId: '00000000-0000-4000-8000-000000000001' }),
		).toThrow()
	})
})

describe('canvas.screenshot', () => {
	it('params accepts empty object', () => {
		expect(CanvasScreenshotParamsSchema.parse({})).toEqual({})
	})

	it('params accepts canvasId', () => {
		expect(CanvasScreenshotParamsSchema.parse({ canvasId: 'page:abc' })).toEqual({ canvasId: 'page:abc' })
	})

	it('result requires imagePath string', () => {
		expect(CanvasScreenshotResultSchema.parse({ imagePath: '/tmp/tldraw-screenshot-123.png' }))
			.toEqual({ imagePath: '/tmp/tldraw-screenshot-123.png' })
	})

	it('result rejects missing imagePath', () => {
		expect(() => CanvasScreenshotResultSchema.parse({})).toThrow()
	})

	it('MethodMap includes canvas.screenshot', () => {
		expect(MethodMap['canvas.screenshot']).toBeDefined()
		expect(MethodMap['canvas.screenshot'].params).toBe(CanvasScreenshotParamsSchema)
		expect(MethodMap['canvas.screenshot'].result).toBe(CanvasScreenshotResultSchema)
	})
})
