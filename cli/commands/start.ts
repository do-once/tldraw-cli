/**
 * start 命令：启动 Host 进程并打开浏览器 Runtime。幂等语义——重复调用不报错。
 *
 * 执行流程：
 *   1. 检查 session 文件
 *      - pid 活着 → 输出 `state: already-running` + 既有 Host 连接信息（exit 0）
 *      - `--port` 与既有不一致 → 输出 `state: error` 提示先 stop（exit 1）
 *   2. 无 session 但默认端口已被 Host 占用（手动启动场景） → 同 already-running，带 note
 *   3. 否则：spawn Host 进程（生产环境用打包后的 host.mjs，开发环境用 tsx）
 *   4. 等待 Host HTTP 端口就绪（最长 10 秒）
 *   5. 将 pid / 端口 / 启动时间写入 session 文件
 *   6. 打开浏览器（生产用本地 index.html，开发用 Vite dev server）
 *   7. 输出 JSON 状态到 stdout
 */
import { buildCommand } from '@stricli/core'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { LocalContext } from '../context'
import { isProcessAlive, readSessionFile, writeSessionFile } from '../hostClient/sessionFile'
import { openBrowser } from '../hostClient/openBrowser'
import { DEFAULT_HOST, DEFAULT_HTTP_PORT, DEFAULT_WS_PORT, DEFAULT_DEV_PORT, DEFAULT_DEV_FRONTEND_URL } from '../../shared/defaults'

/**
 * 轮询等待指定 TCP 端口可连接。
 * 每 100ms 尝试一次，超过 timeoutMs 后抛出超时错误。
 * 用于判断 Host 进程是否已完成初始化并开始监听。
 */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const ok = await new Promise<boolean>((resolveP) => {
			const socket = createConnection({ port, host: DEFAULT_HOST })
			socket.once('connect', () => { socket.end(); resolveP(true) })
			socket.once('error', () => { resolveP(false) })
		})
		if (ok) return
		if (Date.now() > deadline) throw new Error(`Host HTTP port ${port} not ready within ${timeoutMs}ms`)
		await new Promise((r) => setTimeout(r, 100))
	}
}

/**
 * 单次 TCP 探测指定端口是否被占用（500ms 超时）。
 * 用于"无 session 但默认端口已有 Host 响应"的幂等判断——能连通就认为是外部 Host。
 */
async function probePort(port: number): Promise<boolean> {
	return new Promise<boolean>((resolveP) => {
		const socket = createConnection({ port, host: DEFAULT_HOST })
		const done = (ok: boolean) => {
			socket.destroy()
			resolveP(ok)
		}
		socket.once('connect', () => done(true))
		socket.once('error', () => done(false))
		setTimeout(() => done(false), 500)
	})
}

/** cli.mjs 所在目录 */
function cliDir(): string {
	return dirname(fileURLToPath(import.meta.url))
}

/**
 * 启动 Host 进程。
 * 生产模式：cli 目录下存在 host.mjs，直接用 node 运行
 * 开发模式：用 npx tsx 运行 host/HostProcess.ts 源文件
 * 两种模式都以 detached + stdio ignore 方式运行，子进程独立于 CLI 进程。
 */
function spawnHost(env: NodeJS.ProcessEnv): ReturnType<typeof spawn> {
	const dir = cliDir()
	const distHost = resolve(dir, 'host.mjs')

	if (existsSync(distHost)) {
		return spawn(process.execPath, [distHost], {
			cwd: resolve(dir, '..'),
			detached: true,
			stdio: 'ignore',
			env,
		})
	}

	// 开发模式：用 node --import tsx 直接运行 TS 源文件，避免 npx 在 Windows 上的 ENOENT 问题
	const root = resolve(dir, '..', '..')
	const hostScript = resolve(root, 'host', 'HostProcess.ts')
	return spawn(process.execPath, ['--import', 'tsx', hostScript], {
		cwd: root,
		detached: true,
		stdio: 'ignore',
		env,
	})
}

/** start 命令的 CLI flags */
interface StartFlags {
	readonly port?: number
	readonly 'ws-port'?: number
	readonly dev?: true
}

async function startHandler(this: LocalContext, flags: StartFlags): Promise<void> {
	const httpPort = flags.port ?? DEFAULT_HTTP_PORT
	const wsPort = flags['ws-port'] ?? DEFAULT_WS_PORT
	const isDev = flags.dev === true

	const existing = readSessionFile(this.sessionPath)

	// 情况 A：session 存在且 pid 活着 → 幂等复用
	if (existing && isProcessAlive(existing.hostPid)) {
		// 边界：用户显式 --port 且与既有 Host 不一致 → 冲突错误
		if (flags.port !== undefined && flags.port !== existing.httpPort) {
			this.process.stdout.write(JSON.stringify({
				state: 'error',
				message: `Host already running on port ${existing.httpPort}, but --port ${flags.port} was requested. Run \`tldraw-cli stop\` first if you want to change port.`,
				hostPid: existing.hostPid,
				httpPort: existing.httpPort,
			}, null, 2) + '\n')
			this.process.exitCode = 1
			// 直接调 exit 确保退出码生效（stricli 的 run() 有时不会让事件循环自然收尾）
			this.process.exit?.(1)
			return
		}
		const frontendUrl = isDev
			? DEFAULT_DEV_FRONTEND_URL
			: `http://${DEFAULT_HOST}:${existing.httpPort}/`
		this.process.stdout.write(JSON.stringify({
			state: 'already-running',
			hostPid: existing.hostPid,
			httpPort: existing.httpPort,
			wsPort: existing.wsPort,
			frontendUrl,
			dev: isDev,
		}, null, 2) + '\n')
		return
	}

	// 情况 B：无 session 但默认端口已被 Host 占用（可能是手动启动）→ 也算 already-running
	// 只在用户未显式指定 --port 时才检查默认端口
	if (!existing && flags.port === undefined) {
		const portInUse = await probePort(DEFAULT_HTTP_PORT)
		if (portInUse) {
			const frontendUrl = isDev
				? DEFAULT_DEV_FRONTEND_URL
				: `http://${DEFAULT_HOST}:${DEFAULT_HTTP_PORT}/`
			this.process.stdout.write(JSON.stringify({
				state: 'already-running',
				httpPort: DEFAULT_HTTP_PORT,
				frontendUrl,
				note: '端口已有 Host 响应但无 session 文件（可能是手动启动）。若需替换请先 tldraw-cli stop',
			}, null, 2) + '\n')
			return
		}
	}

	const child = spawnHost({
		...this.process.env,
		TLDRAW_HTTP_PORT: String(httpPort),
		TLDRAW_WS_PORT: String(wsPort),
		TLDRAW_SESSION_FILE: this.sessionPath,
	})
	child.unref()
	if (typeof child.pid !== 'number') throw new Error('Failed to spawn host')

	await waitForPort(httpPort, 10_000)

	let devPid: number | undefined
	if (isDev) {
		// --dev 模式：同时启动 Vite dev server（HMR 热更新）
		const root = resolve(cliDir(), '..', '..')
		const viteBin = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
		const viteChild = spawn(process.execPath, [viteBin, '--port', String(DEFAULT_DEV_PORT)], {
			cwd: root,
			detached: true,
			stdio: 'ignore',
			env: { ...this.process.env },
		})
		viteChild.unref()
		devPid = viteChild.pid
		await waitForPort(DEFAULT_DEV_PORT, 10_000)

		// 把 devPid 追加到 Host 已写的 session 文件中
		const session = readSessionFile(this.sessionPath)
		if (session && devPid) {
			writeSessionFile(this.sessionPath, { ...session, devPid })
		}
	}

	const frontendUrl = isDev
		? DEFAULT_DEV_FRONTEND_URL
		: `http://${DEFAULT_HOST}:${httpPort}/`

	openBrowser(frontendUrl)

	this.process.stdout.write(JSON.stringify({
		state: 'running', hostPid: child.pid, httpPort, wsPort, frontendUrl, dev: isDev,
	}, null, 2) + '\n')
}

export const startCommand = buildCommand({
	loader: async () => startHandler,
	parameters: {
		positional: { kind: 'tuple', parameters: [] },
		flags: {
			port: {
				kind: 'parsed',
				parse: Number,
				brief: `Host HTTP 端口 (默认: ${DEFAULT_HTTP_PORT})`,
				optional: true,
			},
			'ws-port': {
				kind: 'parsed',
				parse: Number,
				brief: `Host WebSocket 端口 (默认: ${DEFAULT_WS_PORT})`,
				optional: true,
			},
			dev: {
				kind: 'boolean',
				brief: `开发模式：同时启动 Vite dev server (${DEFAULT_DEV_PORT})，提供 HMR 热更新`,
				optional: true,
			},
		},
		aliases: { p: 'port', d: 'dev' },
	},
	docs: {
		brief: '启动 Host 进程并打开浏览器 Runtime',
		fullDescription: [
			'启动 Host（HTTP + WebSocket）、打开浏览器画布、Runtime 自动握手。',
			'生产模式下 Host 同时 serve 前端页面（localhost:8787）。',
			'session 信息写入 ~/.tldraw-cli/session.json，供 stop/status 使用。',
			'',
			'示例:',
			'  tldraw-cli start                         使用默认端口',
			'  tldraw-cli start --port 9000              自定义 HTTP 端口',
			'  tldraw-cli start -p 9000 --ws-port 9001   自定义双端口',
		].join('\n'),
	},
})
