/**
 * status 命令：查询 Host 和 Runtime 的当前运行状态。
 *
 * 检测策略（按优先级）：
 *   1. 读 session 文件 → 有文件则检查 pid 存活 + RPC 查询
 *   2. session 文件不存在 → 尝试探测默认端口（兼容手动启动 Host 的场景）
 *   3. 都不通 → 输出 not-running
 *
 * 输出的 state 字段含义：
 *   not-running  → 无 session 文件且默认端口无响应
 *   stale        → session 文件存在但对应 pid 已消失（已自动清理）
 *   running      → Host 存活，附带端口、RPC 查询结果
 */
import { buildCommand } from '@stricli/core'
import type { LocalContext } from '../context'
import { clearSessionFile, isProcessAlive, readSessionFile } from '../hostClient/sessionFile'
import { JsonRpcClient } from '../hostClient/JsonRpcClient'
import { DEFAULT_HOST, DEFAULT_HTTP_PORT } from '../../shared/defaults'

/** 尝试对指定端口发起 session.status RPC，超时 2 秒 */
async function probeHost(port: number): Promise<unknown | null> {
	try {
		const client = new JsonRpcClient(`http://${DEFAULT_HOST}:${port}/rpc`)
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 2_000)
		const result = await client.call('session.status', {})
		clearTimeout(timer)
		return result
	} catch {
		return null
	}
}

async function statusHandler(this: LocalContext): Promise<void> {
	const s = readSessionFile(this.sessionPath)

	if (s) {
		// 有 session 文件
		if (!isProcessAlive(s.hostPid)) {
			clearSessionFile(this.sessionPath)
			this.process.stdout.write(JSON.stringify({ state: 'stale', hostPid: s.hostPid }, null, 2) + '\n')
			return
		}
		let rpc: unknown = null
		try {
			const client = new JsonRpcClient(`http://${DEFAULT_HOST}:${s.httpPort}/rpc`)
			rpc = await client.call('session.status', {})
		} catch (err) {
			rpc = { error: err instanceof Error ? err.message : 'unknown' }
		}
		this.process.stdout.write(JSON.stringify({
			state: 'running',
			hostPid: s.hostPid,
			httpPort: s.httpPort,
			wsPort: s.wsPort,
			startedAt: s.startedAt,
			rpc,
		}, null, 2) + '\n')
		return
	}

	// 无 session 文件 → 探测默认端口（兼容手动启动 Host）
	// TLDRAW_HOST_URL 已设时说明调用方自己管连接，跳过端口探测
	if (this.process.env.TLDRAW_HOST_URL) {
		this.process.stdout.write(JSON.stringify({ state: 'not-running' }, null, 2) + '\n')
		return
	}
	const rpc = await probeHost(DEFAULT_HTTP_PORT)
	if (rpc) {
		this.process.stdout.write(JSON.stringify({
			state: 'running',
			httpPort: DEFAULT_HTTP_PORT,
			note: 'Host 在默认端口响应，但无 session 文件（可能是手动启动）',
			rpc,
		}, null, 2) + '\n')
		return
	}

	this.process.stdout.write(JSON.stringify({ state: 'not-running' }, null, 2) + '\n')
}

export const statusCommand = buildCommand({
	loader: async () => statusHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: {
		brief: '查看 Host 和 Runtime 运行状态',
		fullDescription: [
			'检查 Host 是否在运行，输出 JSON：',
			'  state: "not-running"  无 session 文件且默认端口无响应',
			'  state: "stale"        session 文件存在但进程已消失（已自动清理）',
			'  state: "running"      Host 存活，附带端口、RPC 查询结果',
			'',
			'无 session 文件时会自动探测默认端口（兼容手动启动 Host 的场景）。',
		].join('\n'),
	},
})
