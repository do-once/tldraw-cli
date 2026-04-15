// host/__tests__/RuntimeRegistry.test.ts
import { describe, expect, it } from 'vitest'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

const TEST_SESSION_ID = '00000000-0000-4000-8000-000000000001'

function gw(id: string): RuntimeGateway {
	return {
		id: id as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], sessionId: TEST_SESSION_ID },
		state: 'ready',
		async request() { return null },
		async close() {},
	}
}

describe('RuntimeRegistry', () => {
	it('register + list', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'), 'sid-a')
		r.register(gw('b'), 'sid-b')
		expect(r.size()).toBe(2)
		expect(r.list().map((g) => g.id)).toEqual(['a', 'b'])
	})

	it('unregister', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'), 'sid-a')
		r.unregister('a' as RuntimeId)
		expect(r.size()).toBe(0)
	})

	it('get unknown returns undefined', () => {
		expect(new RuntimeRegistry().get('x' as RuntimeId)).toBeUndefined()
	})

	it('getSessionId returns registered sessionId', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'), 'my-session-id')
		expect(r.getSessionId('a' as RuntimeId)).toBe('my-session-id')
	})

	it('getSessionId returns undefined for unknown id', () => {
		expect(new RuntimeRegistry().getSessionId('x' as RuntimeId)).toBeUndefined()
	})

	it('getSessionId returns undefined after unregister', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'), 'my-session-id')
		r.unregister('a' as RuntimeId)
		expect(r.getSessionId('a' as RuntimeId)).toBeUndefined()
	})
})
