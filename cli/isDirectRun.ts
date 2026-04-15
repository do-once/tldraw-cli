import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

/**
 * 判断当前模块是否作为入口被直接执行（区别于被测试或其他模块 import）。
 *
 * 对 entryArg 做 realpath 规范化：ESM loader 会把 import.meta.url 解到
 * symlink 的真实目标（npm link / pnpm 硬链 / Windows junction 场景），
 * 而 process.argv[1] 保留调用方传入的原始路径，两者字符串可能不等。
 */
export function isDirectRun(
	entryArg: string | undefined,
	importMetaUrl: string,
): boolean {
	if (!entryArg) return false
	try {
		return realpathSync(entryArg) === fileURLToPath(importMetaUrl)
	} catch {
		return false
	}
}
