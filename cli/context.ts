/**
 * CLI 命令的公共执行上下文。
 *
 * stricli 框架要求每个命令处理函数的 this 绑定一个 CommandContext。
 * LocalContext 在此基础上扩展了 CLI 专用的字段：
 *   - process：Node.js Process 对象（stdout/stderr/env/exitCode）
 *   - sessionPath：session 文件路径（可通过环境变量覆盖）
 *   - buildClient：按需构建 JsonRpcClient（读 session 文件或读环境变量）
 *
 * buildClient 设计为工厂函数而非直接实例，目的是让命令在真正需要
 * 与 Host 通信时才建立连接，start/stop/status 可按需决定是否调用。
 */
import type { CommandContext } from '@stricli/core'
import { JsonRpcClient } from './hostClient/JsonRpcClient'
import { DEFAULT_SESSION_PATH, readSessionFile } from './hostClient/sessionFile'
import { DEFAULT_HOST, DEFAULT_HTTP_PORT } from '../shared/defaults'

/**
 * CLI 本地执行上下文接口。
 * 每个命令处理函数通过 this 访问这些字段。
 */
export interface LocalContext extends CommandContext {
	readonly process: NodeJS.Process
	readonly sessionPath: string
	/** 构造一个指向当前 Host 的 JSON-RPC 客户端 */
	readonly buildClient: () => JsonRpcClient
}

/**
 * 构建 LocalContext 实例，供 stricli run() 调用时传入。
 * sessionPath 优先读取 TLDRAW_SESSION_FILE 环境变量，
 * buildClient 优先读取 TLDRAW_HOST_URL 环境变量（方便测试和远程调试）。
 */
export function buildLocalContext(proc: NodeJS.Process): LocalContext {
	const sessionPath = proc.env.TLDRAW_SESSION_FILE ?? DEFAULT_SESSION_PATH
	return {
		process: proc,
		sessionPath,
		buildClient: () => {
			const override = proc.env.TLDRAW_HOST_URL
			if (override) return new JsonRpcClient(override)
			const s = readSessionFile(sessionPath)
			const port = s?.httpPort ?? DEFAULT_HTTP_PORT
			return new JsonRpcClient(`http://${DEFAULT_HOST}:${port}/rpc`)
		},
	}
}
