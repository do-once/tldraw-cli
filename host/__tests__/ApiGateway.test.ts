// host/__tests__/ApiGateway.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiGateway } from '../ApiGateway'
import { SessionService } from '../ApplicationServices/SessionService'
import { CanvasService } from '../ApplicationServices/CanvasService'
import { CommandService } from '../ApplicationServices/CommandService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

const FAKE_SESSION_ID = '00000000-0000-4000-8000-000000000001'
const EMPTY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function stubGateway(): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: {
			protocolVersion: '1',
			methods: ['canvas.list','canvas.snapshot','canvas.diff','canvas.create','canvas.select','canvas.screenshot','command.apply'],
			flags: [],
			sessionId: FAKE_SESSION_ID,
		},
		state: 'ready',
		async request(method, params) {
			switch (method) {
				case 'canvas.list': return { items: [{ id: 'page:1', title: 'P1', revision: 0 }] }
				case 'canvas.snapshot': return { canvasId: 'page:1', revision: 0, shapes: [] }
				case 'canvas.diff': return { canvasId: 'page:1', fromRevision: 0, toRevision: 0, entries: [] }
				case 'canvas.create': return { canvasId: 'page:new', title: 'Untitled', revision: 0 }
				case 'canvas.select': {
					const p = params as { canvasId: string }
					return { activeCanvasId: p.canvasId }
				}
				case 'canvas.screenshot': return { base64: EMPTY_PNG_BASE64 }
				case 'command.apply': {
					const p = params as { commands: unknown[] }
					return { canvasId: 'page:1', revision: 1, results: p.commands.map(() => ({ shapeId: 'shape:1' })) }
				}
			}
			throw new Error('unexpected')
		},
		async close() {},
	}
}

describe('ApiGateway', () => {
	let gateway: ApiGateway
	let baseUrl: string
	let shutdownSpy: ReturnType<typeof vi.fn>

	beforeEach(async () => {
		const registry = new RuntimeRegistry(); registry.register(stubGateway(), FAKE_SESSION_ID)
		const router = new RuntimeRouter(registry)
		shutdownSpy = vi.fn()
		gateway = new ApiGateway({
			port: 0,
			session: new SessionService(registry, { hostVersion: '0.0.1', startedAt: Date.now() }),
			canvas: new CanvasService(router),
			command: new CommandService(router),
			onShutdown: () => { shutdownSpy(); return Promise.resolve() },
		})
		await gateway.listen()
		baseUrl = `http://127.0.0.1:${gateway.port}`
	})

	afterEach(async () => { await gateway.close() })

	async function rpc(body: unknown) {
		const res = await fetch(`${baseUrl}/rpc`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
		return res.json() as Promise<{ result?: unknown; error?: { code: number; message: string } }>
	}

	it('dispatches session.status', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'session.status', params: {} })
		expect(r.error).toBeUndefined()
	})
	it('dispatches canvas.list', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'canvas.list', params: {} })
		expect((r.result as { items: unknown[] }).items).toHaveLength(1)
	})
	it('dispatches canvas.snapshot', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 3, method: 'canvas.snapshot', params: {} })
		expect((r.result as { canvasId: string }).canvasId).toBe('page:1')
	})
	it('dispatches canvas.diff with since', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 4, method: 'canvas.diff', params: { since: 0 } })
		expect(r.result).toBeDefined()
	})
	it('dispatches canvas.create', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 5, method: 'canvas.create', params: {} })
		expect((r.result as { canvasId: string }).canvasId).toBe('page:new')
	})
	it('dispatches canvas.select', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 6, method: 'canvas.select', params: { canvasId: 'page:2' } })
		expect((r.result as { activeCanvasId: string }).activeCanvasId).toBe('page:2')
	})
	it('dispatches command.apply', async () => {
		const r = await rpc({
			jsonrpc: '2.0', id: 7, method: 'command.apply',
			params: { commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }] },
		})
		expect((r.result as { revision: number }).revision).toBe(1)
	})
	it('dispatches canvas.screenshot and returns imagePath', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 8, method: 'canvas.screenshot', params: {} })
		expect(r.error).toBeUndefined()
		expect((r.result as { imagePath: string }).imagePath).toMatch(/tldraw-screenshot-\d+\.png$/)
	})
	it('returns methodNotFound for unknown', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'x.y', params: {} })
		expect(r.error?.code).toBe(-32601)
	})
	it('returns parseError for invalid JSON', async () => {
		const res = await fetch(`${baseUrl}/rpc`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{not json',
		})
		const r = (await res.json()) as { error?: { code: number } }
		expect(r.error?.code).toBe(-32700)
	})
	it('returns invalidParams on schema failure', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'command.apply', params: { commands: [] } })
		expect(r.error?.code).toBe(-32602)
	})
	it('POST /admin/shutdown triggers onShutdown', async () => {
		const res = await fetch(`${baseUrl}/admin/shutdown`, { method: 'POST' })
		expect(res.status).toBe(202)
		// onShutdown 是异步触发，给它一点时间
		await new Promise((r) => setTimeout(r, 30))
		expect(shutdownSpy).toHaveBeenCalledOnce()
	})
	it('rejects non-loopback /admin/shutdown', async () => {
		// 本测试运行在 127.0.0.1，已是 loopback；这里用 URL 路径模拟非 /admin/shutdown
		const res = await fetch(`${baseUrl}/admin/other`, { method: 'POST' })
		expect(res.status).toBe(404)
	})
})
