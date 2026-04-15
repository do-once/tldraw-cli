// host/__tests__/CanvasService.test.ts
import { describe, expect, it } from 'vitest'
import { CanvasService } from '../ApplicationServices/CanvasService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'
import { RuntimeUnavailableError, RuntimeRestartedError } from '../infra/errors'

const FAKE_SESSION_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_SESSION_ID = '00000000-0000-4000-8000-000000000002'

function gw(handler: (method: string, params: unknown) => unknown): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], sessionId: FAKE_SESSION_ID },
		state: 'ready',
		async request(method, params) { return handler(method, params) },
		async close() {},
	}
}

function svcWith(g: RuntimeGateway, sessionId = FAKE_SESSION_ID): CanvasService {
	const r = new RuntimeRegistry(); r.register(g, sessionId)
	return new CanvasService(new RuntimeRouter(r))
}

describe('CanvasService', () => {
	it('list forwards', async () => {
		const s = svcWith(gw(() => ({ items: [{ id: 'page:1', title: 'P1', revision: 3 }] })))
		const r = await s.list()
		expect(r.items[0].id).toBe('page:1')
	})

	it('snapshot forwards params and injects runtimeSessionId', async () => {
		const s = svcWith(gw((m, p) => {
			if (m !== 'canvas.snapshot') throw new Error('wrong method')
			const cid = (p as { canvasId?: string }).canvasId ?? 'page:1'
			return { canvasId: cid, revision: 0, shapes: [] }
		}))
		const r = await s.snapshot({ canvasId: 'page:7' })
		expect(r.canvasId).toBe('page:7')
		expect(r.runtimeSessionId).toBe(FAKE_SESSION_ID)
	})

	it('diff forwards since and injects runtimeSessionId (no sessionId in params → no check)', async () => {
		const s = svcWith(gw((m, p) => {
			if (m !== 'canvas.diff') throw new Error('wrong method')
			const pp = p as { since: number }
			return { canvasId: 'page:1', fromRevision: pp.since, toRevision: pp.since, entries: [] }
		}))
		const r = await s.diff({ since: 5 })
		expect(r.fromRevision).toBe(5)
		expect(r.runtimeSessionId).toBe(FAKE_SESSION_ID)
	})

	it('diff with matching runtimeSessionId passes through', async () => {
		const s = svcWith(gw(() => ({ canvasId: 'page:1', fromRevision: 0, toRevision: 0, entries: [] })))
		const r = await s.diff({ since: 0, runtimeSessionId: FAKE_SESSION_ID })
		expect(r.runtimeSessionId).toBe(FAKE_SESSION_ID)
	})

	it('diff with mismatched runtimeSessionId throws RuntimeRestartedError', async () => {
		const s = svcWith(gw(() => ({ canvasId: 'page:1', fromRevision: 0, toRevision: 0, entries: [] })))
		await expect(s.diff({ since: 0, runtimeSessionId: OTHER_SESSION_ID })).rejects.toBeInstanceOf(RuntimeRestartedError)
	})

	it('create returns new canvas id', async () => {
		const s = svcWith(gw(() => ({ canvasId: 'page:new', title: 'Untitled', revision: 0 })))
		const r = await s.create({})
		expect(r.canvasId).toBe('page:new')
	})

	it('select returns active id', async () => {
		const s = svcWith(gw((_m, p) => ({ activeCanvasId: (p as { canvasId: string }).canvasId })))
		const r = await s.select({ canvasId: 'page:2' })
		expect(r.activeCanvasId).toBe('page:2')
	})

	it('getSelection forwards and returns shapeIds with runtimeSessionId', async () => {
		const s = svcWith(gw((_m, p) => {
			const cid = (p as { canvasId?: string }).canvasId ?? 'page:1'
			return { canvasId: cid, revision: 0, shapeIds: ['shape:a', 'shape:b'] }
		}))
		const r = await s.getSelection({})
		expect(r.shapeIds).toEqual(['shape:a', 'shape:b'])
		expect(r.runtimeSessionId).toBe(FAKE_SESSION_ID)
	})

	it('throws RuntimeUnavailableError when no runtime', async () => {
		const s = new CanvasService(new RuntimeRouter(new RuntimeRegistry()))
		await expect(s.list()).rejects.toBeInstanceOf(RuntimeUnavailableError)
	})

	describe('screenshot', () => {
		const BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

		it('writes base64 to tmp file and returns imagePath', async () => {
			const s = svcWith(gw(() => ({ base64: BASE64 })))
			const result = await s.screenshot({})
			expect(result.imagePath).toMatch(/tldraw-screenshot-\d+\.png$/)
			const { readFileSync, existsSync } = await import('node:fs')
			expect(existsSync(result.imagePath)).toBe(true)
			const written = readFileSync(result.imagePath)
			expect(written).toBeInstanceOf(Buffer)
			expect(written.length).toBeGreaterThan(0)
		})

		it('accepts optional canvasId', async () => {
			const s = svcWith(gw(() => ({ base64: BASE64 })))
			const result = await s.screenshot({ canvasId: 'page:1' })
			expect(result.imagePath).toMatch(/\.png$/)
		})

		it('throws when Runtime returns invalid shape (missing base64)', async () => {
			const s = svcWith(gw(() => ({ notBase64: true })))
			await expect(s.screenshot({})).rejects.toThrow()
		})
	})
})
