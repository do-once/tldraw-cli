import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TldrawRuntimeAdapter } from '../TldrawRuntimeAdapter'
import type { Editor } from 'tldraw'

// getSvgElement 返回 { svg, width, height } 或 undefined
function makeSvgResult() {
	return {
		svg: {} as SVGSVGElement,
		width: 100,
		height: 100,
	}
}

function makeEditorMock(svgReturn: { svg: SVGSVGElement; width: number; height: number } | undefined = makeSvgResult()) {
	return {
		getCurrentPageId: vi.fn().mockReturnValue('page:test'),
		getPages: vi.fn().mockReturnValue([{ id: 'page:test', name: 'Test' }]),
		getSvgElement: vi.fn().mockResolvedValue(svgReturn),
		getPageShapeIds: vi.fn().mockReturnValue(new Set([])),
		getSelectedShapeIds: vi.fn().mockReturnValue(new Set([])),
	} as unknown as Editor
}

const CTX = { requestId: 1 }

describe('TldrawRuntimeAdapter.canvasScreenshot', () => {
	let adapter: TldrawRuntimeAdapter
	let editorMock: Editor

	beforeEach(() => {
		editorMock = makeEditorMock()
		adapter = new TldrawRuntimeAdapter(editorMock)
	})

	it('routes canvas.screenshot to canvasScreenshot', async () => {
		const result = await adapter.invoke('canvas.screenshot', {}, CTX)
		expect(result).toHaveProperty('base64')
		expect(typeof (result as { base64: string }).base64).toBe('string')
	})

	it('returns non-empty base64 string', async () => {
		const result = await adapter.invoke('canvas.screenshot', {}, CTX) as { base64: string }
		expect(result.base64.length).toBeGreaterThan(0)
	})

	it('accepts optional canvasId param', async () => {
		const result = await adapter.invoke('canvas.screenshot', { canvasId: 'page:test' }, CTX)
		expect(result).toHaveProperty('base64')
	})

	it('returns fallback base64 when getSvgElement returns undefined (empty canvas)', async () => {
		editorMock = makeEditorMock(undefined)
		adapter = new TldrawRuntimeAdapter(editorMock)
		const result = await adapter.invoke('canvas.screenshot', {}, CTX) as { base64: string }
		expect(result.base64.length).toBeGreaterThan(0)
	})
})
