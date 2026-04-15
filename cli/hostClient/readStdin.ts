/**
 * 从 stdin 读取 JSON 数据的工具函数。
 *
 * CLI 的 command apply 命令要求调用方通过 stdin 传入命令体，
 * 此函数负责收集所有 chunk、拼接为字符串、解析 JSON 并返回。
 *
 * 当 stdin 是 TTY（交互式终端）时直接报错，引导用户用管道传入数据。
 */
import type { Readable } from 'node:stream'

/**
 * 从 stdin 流读取全部数据并解析为 JSON。
 * isTTY 为 true 表示在交互式终端直接运行（没有管道数据），此时报错提示用法。
 * Buffer chunk 统一转为 UTF-8 字符串后再拼接，支持大输入分块传输。
 */
export async function readStdinJson(stdin: Readable & { isTTY?: boolean }): Promise<unknown> {
	if (stdin.isTTY) {
		throw new Error('command apply requires JSON on stdin; pipe a body or redirect a file')
	}
	const chunks: string[] = []
	for await (const chunk of stdin) {
		chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8'))
	}
	const raw = chunks.join('').trim()
	if (!raw) throw new Error('Missing JSON body on stdin')
	try { return JSON.parse(raw) } catch { throw new Error('Invalid JSON body on stdin') }
}
