// cli/__tests__/command.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { commandRoutes } from '../commands/command'
import { buildLocalContext } from '../context'

const app = buildApplication(
	buildRouteMap({ routes: { command: commandRoutes }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

describe('command apply', () => {
	let server: Server
	let url: string
	let lastBody: { method: string; params: unknown } | null = null

	beforeEach(async () => {
		lastBody = null
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				lastBody = { method: body.method, params: body.params }
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({
					jsonrpc: '2.0', id: body.id,
					result: { canvasId: 'page:1', revision: 1, results: [{ shapeId: 'shape:1' }] },
				}))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	it('reads stdin JSON and sends command.apply', async () => {
		const stdinBody = JSON.stringify({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'command', 'apply'],
			env: { TLDRAW_HOST_URL: url },
			stdin: Object.assign(Readable.from([stdinBody]), { isTTY: false }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		expect(lastBody?.method).toBe('command.apply')
		expect((lastBody?.params as { commands: unknown[] }).commands).toHaveLength(1)
		expect(out.join('')).toContain('shape:1')
	})
})

describe('command undo', () => {
	let server: Server
	let url: string
	let lastBody: { method: string; params: unknown } | null = null

	beforeEach(async () => {
		lastBody = null
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				lastBody = { method: body.method, params: body.params }
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { revision: 2 } }))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	it('sends command.undo and outputs revision', async () => {
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'command', 'undo'],
			env: { TLDRAW_HOST_URL: url },
			stdin: Object.assign(Readable.from(['']), { isTTY: true }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		expect(lastBody?.method).toBe('command.undo')
		expect(out.join('')).toContain('revision')
	})
})

describe('command redo', () => {
	let server: Server
	let url: string
	let lastBody: { method: string; params: unknown } | null = null

	beforeEach(async () => {
		lastBody = null
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				lastBody = { method: body.method, params: body.params }
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { revision: 3 } }))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	it('sends command.redo and outputs revision', async () => {
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'command', 'redo'],
			env: { TLDRAW_HOST_URL: url },
			stdin: Object.assign(Readable.from(['']), { isTTY: true }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		expect(lastBody?.method).toBe('command.redo')
		expect(out.join('')).toContain('revision')
	})
})
