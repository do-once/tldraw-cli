/**
 * revision / session 跨层契约 e2e 测试
 *
 * 场景 1: F5 重连 → RUNTIME_RESTARTED (1008)
 *   Runtime A 断开后 Runtime B 以新 sessionId 接入，CLI 持有旧 sessionId 发 diff 时
 *   应收到 1008 错误，CLI 退出码 != 0，stderr 含引导文案。
 *
 * 场景 2: 首次无 sessionId → 正常响应 + sessionFile 写入
 *   sessionFile 中不含 runtimeSessionId 时，snapshot 正常返回并将 sessionId 写入文件；
 *   后续 diff 自动携带该 sessionId 并正常返回。
 *
 * 场景 3: sessionId 匹配时的正常增量
 *   同一 Runtime 内 command.apply 后，diff 返回至少一个 entry，
 *   响应中的 runtimeSessionId 与 sessionFile 记录的一致。
 */
// __tests__/e2e/revision-session.e2e.test.ts
import { readFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { canvasRoutes } from '../../cli/commands/canvas'
import { buildLocalContext } from '../../cli/context'
import { JsonRpcClient } from '../../cli/hostClient/JsonRpcClient'
import { writeSessionFile } from '../../cli/hostClient/sessionFile'
import { HostProcess } from '../../host/HostProcess'
import { ErrorCodes } from '../../shared/rpc'
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
		// stricli 在 run() 完成后可能会把 exitCode 重置为 0，
		// 所以记录所有非 0 的赋值，只要曾经被设置为非 0 则结果非 0
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
let rpcClient: JsonRpcClient

beforeAll(async () => {
	host = new HostProcess({ httpPort: 0, wsPort: 0 })
	await host.start()
	hostUrl = `http://127.0.0.1:${host.apiGateway.port}/rpc`
	rpcClient = new JsonRpcClient(hostUrl)
})

afterAll(async () => {
	await host.stop()
})

// 每个测试后清理 registry（通过关闭 WS 连接触发 unregister）
// 由各测试自己管理 runtime 的生命周期

// ── 场景 1: F5 重连 → 1008 ─────────────────────────────────────────────────

describe('场景 1: F5 重连 → RUNTIME_RESTARTED (1008)', () => {
	let runtimeA: FakeRuntime
	let sessionPath: string

	beforeAll(async () => {
		sessionPath = makeSessionPath()
		// 写入基础 sessionFile（无 runtimeSessionId）
		writeSessionFile(sessionPath, {
			hostPid: process.pid,
			httpPort: host.apiGateway.port,
			wsPort: host.wsTransport.port,
			startedAt: Date.now(),
		})
		// 接入 Runtime A
		runtimeA = await connectFakeRuntime(host.wsTransport.port)
	})

	afterAll(async () => {
		// 确保 Runtime A/B 都关闭
		try { runtimeA.ws.close() } catch { /* already closed */ }
	})

	it('snapshot 拿到 sessionId X 并写入 sessionFile', async () => {
		const r = await runCliWith(['canvas', 'snapshot'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
		const file = JSON.parse(readFileSync(sessionPath, 'utf8')) as { runtimeSessionId?: string }
		expect(file.runtimeSessionId).toBe(runtimeA.sessionId)
	})

	it('断开 Runtime A、接入 Runtime B 后 diff 返回 1008，CLI 退出码 != 0，stderr 含引导文案', async () => {
		// 断开 Runtime A
		runtimeA.ws.close()
		// 等待 Host 侧 unregister
		await new Promise((r) => setTimeout(r, 100))

		// 接入 Runtime B（新 sessionId）
		const runtimeB = await connectFakeRuntime(host.wsTransport.port)

		try {
			// sessionFile 已有 runtimeSessionId === runtimeA.sessionId
			// CLI diff 会自动携带旧 sessionId → Host 应返回 1008
			const r = await runCliWith(['canvas', 'diff', '--since', '5'], sessionPath, hostUrl)

			expect(r.exitCode).not.toBe(0)
			// 引导文案来自 cli/commands/canvas.ts diffHandler 中的 stderr.write
			const combined = r.stdout + r.stderr
			expect(combined).toContain('Runtime 已重启')
		} finally {
			runtimeB.ws.close()
		}
	})
})

// ── 场景 2: 首次无 sessionId → 写入 sessionFile ────────────────────────────

describe('场景 2: 首次无 sessionId → 正常响应 + sessionFile 写入', () => {
	let runtime: FakeRuntime
	let sessionPath: string

	beforeAll(async () => {
		sessionPath = makeSessionPath()
		writeSessionFile(sessionPath, {
			hostPid: process.pid,
			httpPort: host.apiGateway.port,
			wsPort: host.wsTransport.port,
			startedAt: Date.now(),
			// 不写 runtimeSessionId
		})
		runtime = await connectFakeRuntime(host.wsTransport.port)
	})

	afterAll(() => {
		runtime.ws.close()
	})

	it('snapshot 成功返回，sessionFile 被写入 runtimeSessionId', async () => {
		const r = await runCliWith(['canvas', 'snapshot'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
		expect(r.stdout).toContain('canvasId')

		const file = JSON.parse(readFileSync(sessionPath, 'utf8')) as { runtimeSessionId?: string }
		expect(file.runtimeSessionId).toBe(runtime.sessionId)
	})

	it('后续 diff 自动携带 sessionId，正常返回（无 1008）', async () => {
		const r = await runCliWith(['canvas', 'diff', '--since', '0'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)
		expect(r.stdout).toContain('entries')
		expect(r.stderr).not.toContain('Runtime 已重启')
	})
})

// ── 场景 3: sessionId 匹配时的正常增量 ────────────────────────────────────

describe('场景 3: sessionId 匹配时的正常增量', () => {
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

		// 先 snapshot 写入 sessionId
		await runCliWith(['canvas', 'snapshot'], sessionPath, hostUrl)
	})

	afterAll(() => {
		runtime.ws.close()
	})

	it('command.apply 后 diff 返回至少一条 entry，runtimeSessionId 与 sessionFile 一致', async () => {
		// 通过 RPC 直接 apply 一条 command
		await rpcClient.call('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})

		const r = await runCliWith(['canvas', 'diff', '--since', '0'], sessionPath, hostUrl)
		expect(r.exitCode).toBe(0)

		const result = JSON.parse(r.stdout) as { entries: unknown[]; runtimeSessionId: string }
		expect(result.entries.length).toBeGreaterThan(0)

		// runtimeSessionId 与 sessionFile 里记录的一致
		const file = JSON.parse(readFileSync(sessionPath, 'utf8')) as { runtimeSessionId?: string }
		expect(result.runtimeSessionId).toBe(file.runtimeSessionId)
		expect(result.runtimeSessionId).toBe(runtime.sessionId)
	})
})
