import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDirectRun } from '../isDirectRun'

/**
 * 回归测试：确保 isDirectRun 在 symlink 场景下仍然识别为"直接执行"。
 *
 * 背景：npm link 的全局 bin 会让 process.argv[1] 指向 node_modules 下的
 * symlink 路径（Windows 上是 junction）；而 ESM loader 把 import.meta.url
 * 解到真实目标。两者字符串不等。旧版 guard 用字符串相等判断，会漏判为
 * "被 import"，导致 CLI 一声不吭退出 0。
 *
 * 用 junction 链接目录（Windows 不需管理员权限；Unix 上 'junction' 类型被
 * 忽略，等价普通 symlink），跨平台都能跑。
 */
describe('isDirectRun', () => {
	let tmpRoot: string
	let realDir: string
	let linkDir: string
	let realEntry: string
	let linkEntry: string
	let realEntryUrl: string

	beforeAll(() => {
		tmpRoot = mkdtempSync(path.join(tmpdir(), 'isDirectRun-'))
		realDir = path.join(tmpRoot, 'real')
		linkDir = path.join(tmpRoot, 'link')
		mkdirSync(realDir, { recursive: true })

		realEntry = path.join(realDir, 'entry.mjs')
		writeFileSync(realEntry, '// fixture entry\n')

		// junction 链接整个目录：Windows 上无需管理员；Unix 上按普通 symlink 处理
		symlinkSync(realDir, linkDir, 'junction')
		linkEntry = path.join(linkDir, 'entry.mjs')

		realEntryUrl = pathToFileURL(realEntry).href
	})

	afterAll(() => {
		rmSync(tmpRoot, { recursive: true, force: true })
	})

	it('entryArg 为 undefined 时返回 false（例如 node -e 或 REPL 情形）', () => {
		expect(isDirectRun(undefined, realEntryUrl)).toBe(false)
	})

	it('entryArg 指向不存在的路径时返回 false 且不抛异常', () => {
		const ghost = path.join(tmpRoot, 'ghost.mjs')
		expect(isDirectRun(ghost, realEntryUrl)).toBe(false)
	})

	it('entryArg 与 import.meta.url 指向同一真实文件时返回 true', () => {
		expect(isDirectRun(realEntry, realEntryUrl)).toBe(true)
	})

	it('entryArg 是 symlink 路径、与 import.meta.url 字符串不等但 realpath 相等时返回 true（npm link 回归）', () => {
		// 前置校验：两个字符串确实不等（否则测试没意义）
		expect(linkEntry).not.toBe(realEntry)
		expect(isDirectRun(linkEntry, realEntryUrl)).toBe(true)
	})

	it('entryArg 指向另一个真实文件时返回 false（模拟被其他模块 import）', () => {
		const other = path.join(realDir, 'other.mjs')
		writeFileSync(other, '// another fixture\n')
		expect(isDirectRun(other, realEntryUrl)).toBe(false)
	})
})
