/**
 * fake Runtime 辅助工具，供 e2e 测试复用。
 *
 * connectFakeRuntime：用给定 sessionId 接入 Host 的 WS 端口，完成握手后
 * 在后台响应 canvas.snapshot/diff/getSelection/command.apply 等 RPC 请求。
 * 返回 WebSocket 实例，调用方在不需要时 close() 即可触发 Host 侧注销。
 *
 * makeSessionPath：在 os.tmpdir() 下生成唯一 session 文件路径，供测试隔离使用。
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { CURRENT_PROTOCOL_VERSION, JsonRpcRequestSchema } from '../../../shared/rpc'

export interface FakeRuntimeOptions {
	/** 要在握手中声明的 sessionId（UUID），默认随机生成 */
	sessionId?: string
	/**
	 * 握手完成后挂载到 WebSocket 的消息处理器（覆盖默认的 canvas.* 响应逻辑）。
	 * 不传则使用内置的通用处理器。
	 */
	messageHandler?: (req: { id: number; method: string; params: unknown }, ws: WebSocket) => boolean
	/** 预设 getSelection 要返回的 shapeId 列表（仅内置处理器有效），默认 [] */
	selectedShapeIds?: string[]
}

export interface FakeRuntime {
	ws: WebSocket
	sessionId: string
}

/**
 * 以指定 sessionId 接入 Host wsPort，完成握手，返回 WS 实例和使用的 sessionId。
 * 内置处理器支持 canvas.snapshot / canvas.diff / canvas.getSelection / canvas.list /
 * canvas.create / canvas.select / command.apply。
 */
export async function connectFakeRuntime(
	wsPort: number,
	options: FakeRuntimeOptions = {},
): Promise<FakeRuntime> {
	const sessionId = options.sessionId ?? randomUUID()
	const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`)
	await new Promise<void>((resolve, reject) => {
		ws.once('open', resolve)
		ws.once('error', reject)
	})

	ws.send(
		JSON.stringify({
			type: 'handshake',
			capability: {
				protocolVersion: CURRENT_PROTOCOL_VERSION,
				methods: [
					'canvas.list',
					'canvas.snapshot',
					'canvas.diff',
					'canvas.create',
					'canvas.select',
					'canvas.getSelection',
					'canvas.screenshot',
					'command.apply',
				],
				flags: [],
				sessionId,
			},
		}),
	)

	// 等握手 ack
	await new Promise<void>((resolve) => ws.once('message', () => resolve()))

	// 内置状态（每个 Runtime 实例独立）
	const pages: Array<{ id: string; title: string }> = [{ id: 'page:1', title: 'P1' }]
	let activeId = 'page:1'
	let nextShape = 1
	let nextPage = 2
	const state = new Map<string, { revision: number; history: Array<Record<string, unknown>> }>()
	const selectedShapeIds: string[] = options.selectedShapeIds ?? []

	function stateFor(id: string) {
		let s = state.get(id)
		if (!s) {
			s = { revision: 0, history: [] }
			state.set(id, s)
		}
		return s
	}

	ws.on('message', (raw) => {
		const parsed = JsonRpcRequestSchema.safeParse(JSON.parse(String(raw)))
		if (!parsed.success) return
		const req = parsed.data

		// 先给调用方覆盖处理器的机会
		if (options.messageHandler) {
			const handled = options.messageHandler(
				{ id: req.id as number, method: req.method, params: req.params },
				ws,
			)
			if (handled) return
		}

		const send = (result: unknown) =>
			ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }))

		switch (req.method) {
			case 'canvas.list':
				send({
					items: pages.map((p) => ({
						id: p.id,
						title: p.title,
						revision: stateFor(p.id).revision,
					})),
				})
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
			case 'canvas.getSelection': {
				const p = req.params as { canvasId?: string }
				const id = p.canvasId ?? activeId
				send({ canvasId: id, revision: stateFor(id).revision, shapeIds: selectedShapeIds })
				return
			}
			case 'canvas.screenshot': {
				// 返回 1x1 透明 PNG 的 base64
				send({ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
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

	// 短暂等待确保消息处理器挂载完毕
	await new Promise((r) => setTimeout(r, 30))
	return { ws, sessionId }
}

/** 在 os.tmpdir() 下生成隔离的 session 文件路径 */
export function makeSessionPath(): string {
	return join(tmpdir(), `tldraw-e2e-${randomUUID()}.json`)
}
