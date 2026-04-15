// host/__tests__/SessionService.test.ts
import { describe, expect, it } from 'vitest'
import { SessionService } from '../ApplicationServices/SessionService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

function gw(id: string, canvasCount: number): RuntimeGateway {
	return {
		id: id as RuntimeId,
		capability: { protocolVersion: '1', methods: ['canvas.list'], flags: [], sessionId: '00000000-0000-4000-8000-000000000001' },
		state: 'ready',
		async request(method) {
			if (method === 'canvas.list') {
				return { items: Array.from({ length: canvasCount }, (_, i) => ({
					id: `page:${i + 1}`, title: `Page ${i + 1}`, revision: 0,
				})) }
			}
			throw new Error(`unexpected ${method}`)
		},
		async close() {},
	}
}

describe('SessionService', () => {
	it('reports zero runtimes', async () => {
		const svc = new SessionService(new RuntimeRegistry(), { hostVersion: '0.0.1', startedAt: 0 })
		const r = await svc.status()
		expect(r.runtimes).toEqual([])
		expect(r.canvasCount).toBe(0)
		expect(r.activeCanvasId).toBeNull()
	})
	it('aggregates canvasCount from runtimes', async () => {
		const reg = new RuntimeRegistry()
		reg.register(gw('rt-1', 2), '00000000-0000-4000-8000-000000000001')
		const svc = new SessionService(reg, { hostVersion: '0.0.1', startedAt: Date.now() - 20 })
		const r = await svc.status()
		expect(r.runtimes).toHaveLength(1)
		expect(r.canvasCount).toBe(2)
		expect(r.host.uptimeMs).toBeGreaterThanOrEqual(0)
	})
})
