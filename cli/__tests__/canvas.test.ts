// cli/__tests__/canvas.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { canvasRoutes } from '../commands/canvas'
import { buildLocalContext } from '../context'

const testApp = buildApplication(
	buildRouteMap({ routes: { canvas: canvasRoutes }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

function mkProc(args: string[], url: string): { proc: NodeJS.Process; out: string[] } {
	const out: string[] = []
	const proc = {
		argv: ['node', 'cli', ...args],
		env: { TLDRAW_HOST_URL: url },
		stdin: Object.assign(Readable.from([]), { isTTY: true }),
		stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
		stderr: new Writable({ write(_c, _e, cb) { cb() } }),
		exit(_c?: number) {},
	} as unknown as NodeJS.Process
	return { proc, out }
}

describe('canvas commands', () => {
	let server: Server
	let url: string
	let calls: Array<{ method: string; params: unknown }>
	let response: unknown

	beforeEach(async () => {
		calls = []
		response = {}
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				calls.push({ method: body.method, params: body.params })
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: response }))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	async function runWith(args: string[]): Promise<string> {
		const { proc, out } = mkProc(args, url)
		await run(testApp, proc.argv.slice(2), buildLocalContext(proc))
		return out.join('')
	}

	it('canvas list hits canvas.list', async () => {
		response = { items: [{ id: 'page:1', title: 'P1', revision: 0 }] }
		const text = await runWith(['canvas', 'list'])
		expect(calls[0].method).toBe('canvas.list')
		expect(text).toContain('page:1')
	})

	it('canvas snapshot passes canvasId', async () => {
		response = { canvasId: 'page:7', revision: 0, shapes: [] }
		await runWith(['canvas', 'snapshot', '--canvas', 'page:7'])
		expect(calls[0].method).toBe('canvas.snapshot')
		expect((calls[0].params as { canvasId: string }).canvasId).toBe('page:7')
	})

	it('canvas diff passes since', async () => {
		response = { canvasId: 'page:1', fromRevision: 3, toRevision: 3, entries: [] }
		await runWith(['canvas', 'diff', '--since', '3'])
		expect(calls[0].method).toBe('canvas.diff')
		expect((calls[0].params as { since: number }).since).toBe(3)
	})

	it('canvas create passes title', async () => {
		response = { canvasId: 'page:2', title: 'New', revision: 0 }
		await runWith(['canvas', 'create', '--title', 'New'])
		expect(calls[0].method).toBe('canvas.create')
		expect((calls[0].params as { title: string }).title).toBe('New')
	})

	it('canvas select requires canvasId', async () => {
		response = { activeCanvasId: 'page:2' }
		await runWith(['canvas', 'select', '--canvas', 'page:2'])
		expect(calls[0].method).toBe('canvas.select')
		expect((calls[0].params as { canvasId: string }).canvasId).toBe('page:2')
	})

	it('canvas get-selection hits canvas.getSelection without --canvas', async () => {
		response = { canvasId: 'page:1', revision: 0, shapeIds: [] }
		const text = await runWith(['canvas', 'get-selection'])
		expect(calls[0].method).toBe('canvas.getSelection')
		expect((calls[0].params as Record<string, unknown>).canvasId).toBeUndefined()
		expect(text).toContain('shapeIds')
	})

	it('canvas get-selection passes --canvas', async () => {
		response = { canvasId: 'page:5', revision: 2, shapeIds: ['shape:a'] }
		await runWith(['canvas', 'get-selection', '--canvas', 'page:5'])
		expect(calls[0].method).toBe('canvas.getSelection')
		expect((calls[0].params as { canvasId: string }).canvasId).toBe('page:5')
	})
})
