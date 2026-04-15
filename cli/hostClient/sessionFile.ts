/**
 * session 文件读写工具，用于在 CLI 进程间共享 Host 运行状态。
 *
 * Host 启动后，start 命令将 pid、端口、启动时间写入 session 文件；
 * stop / status 命令读取该文件来定位 Host 进程和通信端口。
 * 默认路径为 ~/.tldraw-cli/session.json，可通过环境变量覆盖。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { LocalContext } from '../context'

/**
 * session 文件的结构。
 * hostPid 用于检测进程是否存活，httpPort / wsPort 用于建立 RPC/WS 连接，
 * startedAt 为 Unix 毫秒时间戳，供 status 命令展示启动时间。
 */
export interface SessionFile {
	readonly hostPid: number
	readonly httpPort: number
	readonly wsPort: number
	readonly startedAt: number
	/** Vite dev server 进程 pid（仅 --dev 模式） */
	readonly devPid?: number
	/**
	 * 当前 Runtime 的会话 ID（握手时由 Runtime 生成，经 Host 下发）。
	 * 用于 canvas.diff 等命令检测 Runtime 是否重启，老 session 文件无此字段时不校验。
	 */
	readonly runtimeSessionId?: string
}

/** session 文件的默认路径（~/.tldraw-cli/session.json） */
export const DEFAULT_SESSION_PATH = join(homedir(), '.tldraw-cli', 'session.json')

/** zod 校验 schema，读文件时用于防止格式损坏 */
const Schema = z.object({
	hostPid: z.number().int().positive(),
	httpPort: z.number().int().positive(),
	wsPort: z.number().int().positive(),
	startedAt: z.number().int().nonnegative(),
	devPid: z.number().int().positive().optional(),
	runtimeSessionId: z.string().optional(),
})

/**
 * 读取 session 文件，文件不存在或格式不合法时返回 null，
 * 不抛错——调用方统一按"未运行"处理。
 */
export function readSessionFile(path = DEFAULT_SESSION_PATH): SessionFile | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, 'utf8')
		return Schema.parse(JSON.parse(raw))
	} catch { return null }
}

/**
 * 写入 session 文件（重载 1：自定义路径 + session 对象）。
 */
export function writeSessionFile(path: string, session: SessionFile): void
/**
 * 写入 session 文件（重载 2：仅传 session 对象，使用默认路径）。
 */
export function writeSessionFile(session: SessionFile): void
export function writeSessionFile(a: string | SessionFile, b?: SessionFile): void {
	const path = typeof a === 'string' ? a : DEFAULT_SESSION_PATH
	const session = typeof a === 'string' ? (b as SessionFile) : a
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, JSON.stringify(Schema.parse(session), null, 2) + '\n', 'utf8')
}

/**
 * 删除 session 文件（Host 停止后调用）。
 * force: true 表示文件不存在时不报错。
 */
export function clearSessionFile(path = DEFAULT_SESSION_PATH): void {
	rmSync(path, { force: true })
}

/**
 * 检测指定 pid 的进程是否存活。
 * 利用 signal 0（不发送实际信号，只做权限 / 存在检测）实现。
 * 进程不存在时 process.kill 会抛出 ESRCH 错误，捕获后返回 false。
 */
export function isProcessAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * 若 RPC 响应中含 runtimeSessionId，将其写回 session 文件。
 * session 文件不存在时跳过（Host 可能通过环境变量指定）。
 */
export function persistSessionId(ctx: LocalContext, result: unknown): void {
	if (!result || typeof result !== 'object') return
	const sid = (result as Record<string, unknown>).runtimeSessionId
	if (typeof sid !== 'string') return
	const session = readSessionFile(ctx.sessionPath)
	if (!session) return
	writeSessionFile(ctx.sessionPath, { ...session, runtimeSessionId: sid })
}
