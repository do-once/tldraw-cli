// __tests__/e2e/host-cli-runtime.e2e.test.ts
import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HostProcess } from '../../host/HostProcess'
import { JsonRpcClient } from '../../cli/hostClient/JsonRpcClient'
import {
	CURRENT_PROTOCOL_VERSION,
	JsonRpcRequestSchema,
} from '../../shared/rpc'

let host: HostProcess
let runtimeWs: WebSocket
const state = new Map<string, { revision: number; history: Array<Record<string, unknown>> }>()

function stateFor(id: string) {
	let s = state.get(id)
	if (!s) { s = { revision: 0, history: [] }; state.set(id, s) }
	return s
}

async function connectFakeRuntime(wsPort: number): Promise<WebSocket> {
	const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`)
	await new Promise<void>((r, j) => { ws.once('open', () => r()); ws.once('error', j) })
	ws.send(JSON.stringify({
		type: 'handshake',
		capability: {
			protocolVersion: CURRENT_PROTOCOL_VERSION,
			methods: ['canvas.list','canvas.snapshot','canvas.diff','canvas.create','canvas.select','command.apply'],
			flags: [],
			sessionId: '00000000-0000-4000-8000-000000000001',
		},
	}))
	await new Promise<void>((r) => { ws.once('message', () => r()) })

	const pages: Array<{ id: string; title: string }> = [{ id: 'page:1', title: 'P1' }]
	let activeId = 'page:1'
	let nextShape = 1
	let nextPage = 2

	ws.on('message', (raw) => {
		const parsed = JsonRpcRequestSchema.safeParse(JSON.parse(String(raw)))
		if (!parsed.success) return
		const req = parsed.data
		const send = (result: unknown) =>
			ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }))
		switch (req.method) {
			case 'canvas.list':
				send({ items: pages.map((p) => ({ id: p.id, title: p.title, revision: stateFor(p.id).revision })) })
				return
			case 'canvas.snapshot': {
				const p = req.params as { canvasId?: string }
				const id = p.canvasId ?? activeId
				send({ canvasId: id, revision: stateFor(id).revision, shapes: [] })
				return
			}
			case 'canvas.diff': {
				const p = req.params as { canvasId?: string; since: number }
				const id = p.canvasId ?? activeId
				const s = stateFor(id)
				send({
					canvasId: id,
					fromRevision: p.since,
					toRevision: s.revision,
					entries: s.history.filter((e) => (e.revision as number) > p.since),
				})
				return
			}
			case 'canvas.create': {
				const p = req.params as { title?: string }
				const id = `page:${nextPage++}`
				pages.push({ id, title: p.title ?? 'Untitled' })
				send({ canvasId: id, title: p.title ?? 'Untitled', revision: 0 })
				return
			}
			case 'canvas.select': {
				const p = req.params as { canvasId: string }
				activeId = p.canvasId
				send({ activeCanvasId: activeId })
				return
			}
			case 'command.apply': {
				const p = req.params as { commands: Array<Record<string, unknown>>; canvasId?: string }
				const id = p.canvasId ?? activeId
				const s = stateFor(id)
				s.revision += 1
				const results = p.commands.map(() => ({ shapeId: `shape:${nextShape++}` }))
				for (const r of results) {
					s.history.push({
						kind: 'shape-created',
						revision: s.revision,
						shape: {
							kind: 'geo',
							shapeId: r.shapeId,
							x: 0, y: 0, rotation: 0,
							w: 10, h: 10,
							geo: 'rectangle',
							text: '',
							color: 'black',
							fill: 'none',
							labelColor: 'black',
						},
					})
				}
				send({ canvasId: id, revision: s.revision, results })
				return
			}
		}
	})
	await new Promise((r) => setTimeout(r, 50))
	return ws
}

beforeAll(async () => {
	host = new HostProcess({ httpPort: 0, wsPort: 0 })
	await host.start()
	runtimeWs = await connectFakeRuntime(host.wsTransport.port)
})

afterAll(async () => {
	runtimeWs.close()
	await host.stop()
})

function client(): JsonRpcClient {
	return new JsonRpcClient(`http://127.0.0.1:${host.apiGateway.port}/rpc`)
}

describe('Host + fake runtime e2e', () => {
	it('session.status', async () => {
		const r = (await client().call('session.status', {})) as { runtimes: unknown[]; canvasCount: number }
		expect(r.runtimes).toHaveLength(1)
		expect(r.canvasCount).toBe(1)
	})
	it('canvas.create + list', async () => {
		await client().call('canvas.create', { title: 'Two' })
		const r = (await client().call('canvas.list', {})) as { items: Array<{ id: string }> }
		expect(r.items).toHaveLength(2)
	})
	it('canvas.select', async () => {
		const r = (await client().call('canvas.select', { canvasId: 'page:2' })) as { activeCanvasId: string }
		expect(r.activeCanvasId).toBe('page:2')
	})
	it('command.apply + canvas.snapshot + canvas.diff', async () => {
		const apply = (await client().call('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})) as { revision: number; results: Array<{ shapeId: string }> }
		expect(apply.revision).toBeGreaterThanOrEqual(1)
		const snap = (await client().call('canvas.snapshot', {})) as { canvasId: string; revision: number }
		expect(snap.canvasId).toBe('page:2')
		const diff = (await client().call('canvas.diff', { since: 0 })) as { entries: unknown[] }
		expect(diff.entries.length).toBeGreaterThan(0)
	})
})
