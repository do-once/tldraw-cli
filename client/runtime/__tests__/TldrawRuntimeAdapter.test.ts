// client/runtime/__tests__/TldrawRuntimeAdapter.test.ts
import { describe, expect, it } from 'vitest'
import { TldrawRuntimeAdapter } from '../TldrawRuntimeAdapter'

interface FakePage { id: string; name: string }
interface FakeShape {
	id: string; type: string; x: number; y: number; rotation: number; parentId: string
	props: { geo: 'rectangle' | 'ellipse'; w: number; h: number; color: string; fill: string; labelColor: string; text: string }
}

class FakeEditor {
	pages: FakePage[] = [{ id: 'page:1', name: 'Page 1' }]
	currentPageId = 'page:1'
	shapes: FakeShape[] = []
	nextShape = 1
	nextPage = 2
	getPages() { return this.pages }
	getCurrentPageId() { return this.currentPageId }
	setCurrentPage(id: string) { this.currentPageId = id }
	batch(fn: () => void) { fn() }
	createShape(partial: { id?: string; type: string; parentId?: string; x: number; y: number; props: Record<string, unknown> }) {
		const id = (partial.id as string | undefined) ?? `shape:${this.nextShape++}`
		this.shapes.push({
			id,
			type: partial.type,
			x: partial.x,
			y: partial.y,
			rotation: 0,
			parentId: (partial.parentId as string | undefined) ?? this.currentPageId,
			props: {
				geo: (partial.props.geo as 'rectangle' | 'ellipse') ?? 'rectangle',
				w: (partial.props.w as number) ?? 100,
				h: (partial.props.h as number) ?? 100,
				color: 'black',
				fill: 'none',
				labelColor: 'black',
				text: '',
			},
		})
	}
	getCurrentPageShapes() { return this.shapes.filter((s) => s.parentId === this.currentPageId) }
	getPageShapeIds(pageId: string): Set<string> {
		return new Set(this.shapes.filter((s) => s.parentId === pageId).map((s) => s.id))
	}
	getShape(id: string): FakeShape | undefined {
		return this.shapes.find((s) => s.id === id)
	}
	deleteShape(id: string) {
		this.shapes = this.shapes.filter((s) => s.id !== id)
	}
	updateShape(partial: { id: string; type: string; x?: number; y?: number }) {
		const s = this.shapes.find((sh) => sh.id === partial.id)
		if (s) {
			if (partial.x !== undefined) s.x = partial.x
			if (partial.y !== undefined) s.y = partial.y
		}
	}
	getBindingsFromShape(): unknown[] { return [] }
	undo() { /* no-op in tests */ }
	redo() { /* no-op in tests */ }
	createPage(opts: { name?: string }) {
		const id = `page:${this.nextPage++}`
		this.pages.push({ id, name: opts.name ?? 'Untitled' })
		return { id }
	}
	selectedShapeIds: string[] = []
	getSelectedShapeIds(): Set<string> {
		return new Set(this.selectedShapeIds)
	}
}

function mk(): { a: TldrawRuntimeAdapter; e: FakeEditor } {
	const e = new FakeEditor()
	const a = new TldrawRuntimeAdapter(e as unknown as import('tldraw').Editor)
	return { a, e }
}

describe('TldrawRuntimeAdapter', () => {
	it('canvas.list returns pages', async () => {
		const { a } = mk()
		const r = (await a.invoke('canvas.list', {}, { requestId: 1 })) as {
			items: Array<{ id: string; title: string; revision: number }>
		}
		expect(r.items).toEqual([{ id: 'page:1', title: 'Page 1', revision: 0 }])
	})

	it('canvas.snapshot returns shapes', async () => {
		const { a } = mk()
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		}, { requestId: 2 })
		const r = (await a.invoke('canvas.snapshot', {}, { requestId: 3 })) as {
			canvasId: string; revision: number; shapes: unknown[]
		}
		expect(r.canvasId).toBe('page:1')
		expect(r.revision).toBe(1)
		expect(r.shapes).toHaveLength(1)
	})

	it('canvas.diff returns shape-created entries since revision', async () => {
		const { a } = mk()
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 1, y: 1, w: 5, h: 5 }],
		}, { requestId: 4 })
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 2, y: 2, w: 5, h: 5 }],
		}, { requestId: 5 })
		const r = (await a.invoke('canvas.diff', { since: 1 }, { requestId: 6 })) as {
			fromRevision: number; toRevision: number; entries: Array<{ revision: number; kind: string }>
		}
		expect(r.fromRevision).toBe(1)
		expect(r.toRevision).toBe(2)
		expect(r.entries).toHaveLength(1)
		expect(r.entries[0].kind).toBe('shape-created')
		expect(r.entries[0].revision).toBe(2)
	})

	it('canvas.create adds a page', async () => {
		const { a, e } = mk()
		const r = (await a.invoke('canvas.create', { title: 'New' }, { requestId: 7 })) as { canvasId: string }
		expect(e.pages).toHaveLength(2)
		expect(r.canvasId).toBe('page:2')
	})

	it('canvas.select switches active page', async () => {
		const { a, e } = mk()
		await a.invoke('canvas.create', {}, { requestId: 8 })
		await a.invoke('canvas.select', { canvasId: 'page:2' }, { requestId: 9 })
		expect(e.currentPageId).toBe('page:2')
	})

	it('command.apply falls back to active canvas when canvasId omitted', async () => {
		const { a, e } = mk()
		await a.invoke('canvas.create', {}, { requestId: 10 })
		await a.invoke('canvas.select', { canvasId: 'page:2' }, { requestId: 11 })
		const r = (await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		}, { requestId: 12 })) as { canvasId: string }
		expect(r.canvasId).toBe('page:2')
		expect(e.shapes[0].parentId).toBe('page:2')
	})

	it('unknown method throws', async () => {
		const { a } = mk()
		await expect(a.invoke('mystery', {}, { requestId: 99 })).rejects.toThrow()
	})

	it('canvas.getSelection returns empty shapeIds when nothing selected', async () => {
		const { a } = mk()
		const r = (await a.invoke('canvas.getSelection', {}, { requestId: 100 })) as {
			canvasId: string; revision: number; shapeIds: string[]
		}
		expect(r.canvasId).toBe('page:1')
		expect(r.shapeIds).toEqual([])
	})

	it('canvas.getSelection returns selected shapeIds', async () => {
		const { a, e } = mk()
		e.selectedShapeIds = ['shape:x', 'shape:y']
		const r = (await a.invoke('canvas.getSelection', {}, { requestId: 101 })) as {
			canvasId: string; revision: number; shapeIds: string[]
		}
		expect(r.shapeIds).toEqual(['shape:x', 'shape:y'])
	})
})
