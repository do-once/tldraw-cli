/**
 * canvas screenshot e2e 测试
 * 验证 CLI → Host → Runtime → 文件写入的完整链路。
 * 使用 fakeRuntime 模拟 Runtime 侧行为。
 */
// __tests__/e2e/screenshot.e2e.test.ts
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
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

// ── canvas screenshot e2e ────────────────────────────────────────────────────

describe('canvas screenshot e2e', () => {
	let runtime: FakeRuntime
	let sessionPath: string

	beforeAll(async () => {
		sessionPath = makeSessionPath()
		writeSessionFile(sessionPath, {
			hostPid: process.pid,
			httpPort: host.apiGateway.port,
			wsPort: host.wsTransport.port,
			startedAt: Date.now(),
		})
		runtime = await connectFakeRuntime(host.wsTransport.port)
	})

	afterAll(() => {
		runtime.ws.close()
	})

	it('命令正常退出（exitCode 0）', async () => {
		const r = await runCliWith(['canvas', 'screenshot'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
	})

	it('stdout 包含 imagePath 字段', async () => {
		const r = await runCliWith(['canvas', 'screenshot'], sessionPath, hostUrl)
		const result = JSON.parse(r.stdout) as { imagePath?: string }
		expect(typeof result.imagePath).toBe('string')
		expect(result.imagePath).toMatch(/tldraw-screenshot-\d+\.png$/)
	})

	it('imagePath 指向真实存在的 PNG 文件', async () => {
		const r = await runCliWith(['canvas', 'screenshot'], sessionPath, hostUrl)
		const result = JSON.parse(r.stdout) as { imagePath: string }
		expect(existsSync(result.imagePath)).toBe(true)
		const buf = readFileSync(result.imagePath)
		// PNG magic bytes: 89 50 4E 47
		expect(buf[0]).toBe(0x89)
		expect(buf[1]).toBe(0x50)
		// 清理临时文件
		unlinkSync(result.imagePath)
	})

	it('--canvas 参数正常工作（exitCode 0）', async () => {
		const r = await runCliWith(['canvas', 'screenshot', '--canvas', 'page:1'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
		const result = JSON.parse(r.stdout) as { imagePath: string }
		if (existsSync(result.imagePath)) unlinkSync(result.imagePath)
	})
})
