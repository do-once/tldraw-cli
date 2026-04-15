/**
 * canvas.getSelection 端到端测试
 *
 * 场景 4: canvas.getSelection 端到端
 *   Runtime 侧预设已选中的 shape 集合，CLI 调 `canvas get-selection`，
 *   断言：退出码 0、stdout 含 shapeId/kind、响应含 runtimeSessionId、sessionFile 被更新。
 */
// __tests__/e2e/get-selection.e2e.test.ts
import { readFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { canvasRoutes } from '../../cli/commands/canvas'
import { buildLocalContext } from '../../cli/context'
import { writeSessionFile } from '../../cli/hostClient/sessionFile'
import { HostProcess } from '../../host/HostProcess'
import { connectFakeRuntime, makeSessionPath } from './_helpers/fakeRuntime'
import type { FakeRuntime } from './_helpers/fakeRuntime'

// ── stricli app ──────────────────────────────────────────────────────────────

const testApp = buildApplication(
	buildRouteMap({ routes: { canvas: canvasRoutes }, docs: { brief: 'test' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

// ── helpers ──────────────────────────────────────────────────────────────────

interface RunResult {
	stdout: string
	stderr: string
	exitCode: number
}

function runCliWith(args: string[], sessionPath: string, hostUrl: string): Promise<RunResult> {
	return new Promise((resolve) => {
		const outChunks: string[] = []
		const errChunks: string[] = []
		// stricli 在 run() 完成后可能重置 exitCode，用 maxExitCode 记录曾设置的最大值
		let maxExitCode = 0
		const proc = {
			argv: ['node', 'cli', ...args],
			env: { TLDRAW_HOST_URL: hostUrl, TLDRAW_SESSION_FILE: sessionPath },
			stdin: Object.assign(Readable.from([]), { isTTY: true }),
			stdout: new Writable({ write(c, _e, cb) { outChunks.push(String(c)); cb() } }),
			stderr: new Writable({ write(c, _e, cb) { errChunks.push(String(c)); cb() } }),
			get exitCode() { return maxExitCode },
			set exitCode(v: number | undefined) { if (v !== undefined && v > maxExitCode) maxExitCode = v },
			exit(c?: number) { if (c !== undefined && c > maxExitCode) maxExitCode = c },
		} as unknown as NodeJS.Process

		run(testApp, proc.argv.slice(2), buildLocalContext(proc)).then(() => {
			resolve({ stdout: outChunks.join(''), stderr: errChunks.join(''), exitCode: maxExitCode })
		}).catch((err: unknown) => {
			errChunks.push(String(err))
			resolve({ stdout: outChunks.join(''), stderr: errChunks.join(''), exitCode: Math.max(maxExitCode, 1) })
		})
	})
}

// ── suite setup ──────────────────────────────────────────────────────────────

let host: HostProcess
let hostUrl: string

beforeAll(async () => {
	host = new HostProcess({ httpPort: 0, wsPort: 0 })
	await host.start()
	hostUrl = `http://127.0.0.1:${host.apiGateway.port}/rpc`
})

afterAll(async () => {
	await host.stop()
})

// ── 场景 4: canvas.getSelection 端到端 ────────────────────────────────────

describe('场景 4: canvas.getSelection 端到端', () => {
	/** 预设选中的 shape id，fake Runtime 握手后返回这个列表 */
	const SELECTED_SHAPE_IDS = ['shape:abc-001', 'shape:abc-002']

	let runtime: FakeRuntime
	let sessionPath: string

	beforeAll(async () => {
		sessionPath = makeSessionPath()
		writeSessionFile(sessionPath, {
			hostPid: process.pid,
			httpPort: host.apiGateway.port,
			wsPort: host.wsTransport.port,
			startedAt: Date.now(),
			// 不预置 runtimeSessionId，让 getSelection 去写入
		})
		// 接入 Runtime，预设选中的 shape 列表
		runtime = await connectFakeRuntime(host.wsTransport.port, {
			selectedShapeIds: SELECTED_SHAPE_IDS,
		})
	})

	afterAll(() => {
		runtime.ws.close()
	})

	it('命令正常退出（exitCode 0）', async () => {
		const r = await runCliWith(['canvas', 'get-selection'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
	})

	it('stdout 包含预期 shapeId', async () => {
		const r = await runCliWith(['canvas', 'get-selection'], sessionPath, hostUrl)
		for (const id of SELECTED_SHAPE_IDS) {
			expect(r.stdout).toContain(id)
		}
	})

	it('响应结构含 runtimeSessionId（P0 新字段）', async () => {
		const r = await runCliWith(['canvas', 'get-selection'], sessionPath, hostUrl)
		const result = JSON.parse(r.stdout) as { runtimeSessionId?: string; shapeIds?: string[] }
		expect(typeof result.runtimeSessionId).toBe('string')
		expect(result.runtimeSessionId).toBe(runtime.sessionId)
	})

	it('sessionFile 被更新（runtimeSessionId 写入）', async () => {
		// 用新的 sessionFile（确保从无到有写入）
		const freshPath = makeSessionPath()
		writeSessionFile(freshPath, {
			hostPid: process.pid,
			httpPort: host.apiGateway.port,
			wsPort: host.wsTransport.port,
			startedAt: Date.now(),
		})

		const r = await runCliWith(['canvas', 'get-selection'], freshPath, hostUrl)
		expect(r.exitCode).toBe(0)

		const file = JSON.parse(readFileSync(freshPath, 'utf8')) as { runtimeSessionId?: string }
		expect(file.runtimeSessionId).toBe(runtime.sessionId)
	})
})
