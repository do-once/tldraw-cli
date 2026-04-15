/**
 * stop 命令：停止正在运行的 Host 进程。
 *
 * 停止策略（按顺序）：
 *   1. 读 session 文件，文件不存在则尝试向默认端口发 shutdown（兼容手动启动）
 *   2. 进程已消失（stale pid）则清理 session 文件，输出 stale-cleared 退出
 *   3. 向 Host POST /admin/shutdown 触发优雅关闭（超时 3 秒）
 *   4. 等待进程退出（最长 5 秒），超时则发送 SIGTERM 强制终止
 *   5. 清理 session 文件，输出 stopped 状态
 */
import { buildCommand } from '@stricli/core'
import { execSync } from 'node:child_process'
import type { LocalContext } from '../context'
import { clearSessionFile, isProcessAlive, readSessionFile } from '../hostClient/sessionFile'
import { DEFAULT_HOST, DEFAULT_HTTP_PORT, DEFAULT_DEV_PORT } from '../../shared/defaults'

/**
 * 向 Host 发送关机请求。
 * Host 收到后会广播 session.shutdown WebSocket 通知，再关闭所有连接。
 * 返回 false 仅表示请求超时或失败，不代表进程没有退出。
 */
async function postShutdown(port: number, timeoutMs: number): Promise<boolean> {
	try {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeoutMs)
		const res = await fetch(`http://${DEFAULT_HOST}:${port}/admin/shutdown`, {
			method: 'POST', signal: controller.signal,
		})
		clearTimeout(timer)
		return res.ok
	} catch { return false }
}

/**
 * 轮询等待进程退出，每 100ms 检查一次。
 * 超过 timeoutMs 后返回 false（此时进程可能仍在运行）。
 */
async function waitProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return true
		await new Promise((r) => setTimeout(r, 100))
	}
	return !isProcessAlive(pid)
}

/** 跨平台强制杀进程（Windows 用 taskkill /T 杀进程树，其他平台用 SIGKILL） */
function killProcess(pid: number): void {
	try {
		if (process.platform === 'win32') {
			execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
		} else {
			process.kill(pid, 'SIGKILL')
		}
	} catch { /* ignore */ }
}

/** 按端口号查找并杀掉监听进程（兼容 Vite fork 子进程的场景） */
function killByPort(port: number): void {
	try {
		if (process.platform === 'win32') {
			const out = execSync(
				`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
			)
			for (const line of out.trim().split(/\r?\n/)) {
				const pid = Number(line.trim())
				if (pid > 0) killProcess(pid)
			}
		} else {
			execSync(`lsof -ti :${port} | xargs -r kill -9`, { stdio: 'ignore' })
		}
	} catch { /* ignore */ }
}

async function stopHandler(this: LocalContext): Promise<void> {
	const s = readSessionFile(this.sessionPath)
	if (!s) {
		// 无 session 文件 → 尝试向默认端口发 shutdown（兼容手动启动）
		const ok = await postShutdown(DEFAULT_HTTP_PORT, 3_000)
		this.process.stdout.write(JSON.stringify(
			ok
				? { state: 'stopped', graceful: true, note: '无 session 文件，已向默认端口发送 shutdown' }
				: { state: 'not-running' },
			null, 2) + '\n')
		return
	}
	if (!isProcessAlive(s.hostPid)) {
		clearSessionFile(this.sessionPath)
		this.process.stdout.write(JSON.stringify({ state: 'stale-cleared' }, null, 2) + '\n')
		return
	}
	const gracefulOk = await postShutdown(s.httpPort, 3_000)
	const exited = await waitProcessExit(s.hostPid, 5_000)
	if (!exited) {
		killProcess(s.hostPid)
		await waitProcessExit(s.hostPid, 2_000)
	}
	// 关闭 Vite dev server（如果 --dev 模式启动的话）
	if (s.devPid) {
		killProcess(s.devPid)
		// Vite 可能 fork 了子进程（监听同一端口），按端口兜底清理
		killByPort(DEFAULT_DEV_PORT)
	}
	clearSessionFile(this.sessionPath)
	this.process.stdout.write(JSON.stringify({
		state: 'stopped', graceful: gracefulOk, hostPid: s.hostPid,
		...(s.devPid ? { devPid: s.devPid } : {}),
	}, null, 2) + '\n')
}

export const stopCommand = buildCommand({
	loader: async () => stopHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: {
		brief: '停止 Host 进程',
		fullDescription: [
			'向 Host 发送 POST /admin/shutdown 触发优雅关闭。',
			'Host 会通过 WebSocket 广播 session.shutdown 通知 Runtime，',
			'浏览器弹出 toast 提示用户手动关闭标签。',
			'如果优雅关闭超时（5 秒），会发送 SIGTERM 强制终止。',
			'关闭后自动清理 ~/.tldraw-cli/session.json。',
		].join('\n'),
	},
})
