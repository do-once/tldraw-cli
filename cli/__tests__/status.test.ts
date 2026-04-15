// cli/__tests__/status.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { statusCommand } from '../commands/status'
import { writeSessionFile } from '../hostClient/sessionFile'
import { buildLocalContext } from '../context'

const app = buildApplication(
	buildRouteMap({ routes: { status: statusCommand }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

describe('status command', () => {
	let dir: string
	let sessionPath: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tldraw-cli-status-'))
		sessionPath = join(dir, 'session.json')
	})
	afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

	function mkProc(env: Record<string, string>): { proc: NodeJS.Process; out: string[] } {
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'status'],
			// TLDRAW_HOST_URL 指向不存在的端口，避免探测到外部真实 Host
			env: { TLDRAW_SESSION_FILE: sessionPath, TLDRAW_HOST_URL: 'http://localhost:1/rpc', ...env },
			stdin: Object.assign(Readable.from([]), { isTTY: true }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		return { proc, out }
	}

	it('reports not-running when no session file', async () => {
		const { proc, out } = mkProc({})
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		const parsed = JSON.parse(out.join(''))
		expect(parsed.state).toBe('not-running')
	})

	it('merges RPC session.status when running', async () => {
		const server: Server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({
					jsonrpc: '2.0', id: body.id,
					result: {
						host: { version: '0.0.1', uptimeMs: 42 },
						runtimes: [],
						activeCanvasId: null,
						canvasCount: 0,
					},
				}))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		const port = (server.address() as AddressInfo).port

		writeSessionFile(sessionPath, {
			hostPid: process.pid, httpPort: port, wsPort: port + 1, startedAt: Date.now(),
		})

		const { proc, out } = mkProc({})
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		const parsed = JSON.parse(out.join(''))
		expect(parsed.state).toBe('running')
		expect(parsed.hostPid).toBe(process.pid)
		expect(parsed.rpc.host.version).toBe('0.0.1')

		await new Promise<void>((r) => server.close(() => r()))
	})
})
