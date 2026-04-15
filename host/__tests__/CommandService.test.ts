// host/__tests__/CommandService.test.ts
import { describe, expect, it } from 'vitest'
import { CommandService } from '../ApplicationServices/CommandService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

const FAKE_SESSION_ID = '00000000-0000-4000-8000-000000000001'

function gw(): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], sessionId: FAKE_SESSION_ID },
		state: 'ready',
		async request(_m, params) {
			const p = params as { commands: unknown[]; canvasId?: string }
			return {
				canvasId: p.canvasId ?? 'page:1',
				revision: 1,
				results: p.commands.map(() => ({ shapeId: 'shape:1' })),
			}
		},
		async close() {},
	}
}

describe('CommandService', () => {
	it('applies commands and injects runtimeSessionId', async () => {
		const r = new RuntimeRegistry(); r.register(gw(), FAKE_SESSION_ID)
		const s = new CommandService(new RuntimeRouter(r))
		const out = await s.apply({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})
		expect(out.revision).toBe(1)
		expect(out.results).toHaveLength(1)
		expect(out.runtimeSessionId).toBe(FAKE_SESSION_ID)
	})
	it('rejects empty commands', async () => {
		const r = new RuntimeRegistry(); r.register(gw(), FAKE_SESSION_ID)
		const s = new CommandService(new RuntimeRouter(r))
		await expect(s.apply({ commands: [] } as unknown as Parameters<typeof s.apply>[0])).rejects.toThrow()
	})
})
