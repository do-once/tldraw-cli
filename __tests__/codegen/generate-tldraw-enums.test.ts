// __tests__/codegen/generate-tldraw-enums.test.ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '../..')

describe('generate-tldraw-enums', () => {
	it('generates tldraw-enums.ts with expected enum names', () => {
		execSync('npx tsx scripts/codegen/generate-tldraw-enums.ts', { cwd: ROOT, stdio: 'pipe' })
		const outPath = resolve(ROOT, 'shared/rpc/generated/tldraw-enums.ts')
		expect(existsSync(outPath)).toBe(true)
		const content = readFileSync(outPath, 'utf-8')
		// 必须包含 banner
		expect(content).toContain('Do not edit manually')
		// 必须导出核心枚举
		expect(content).toContain('export const ArrowheadEnum')
		expect(content).toContain('export const FillEnum')
		expect(content).toContain('export const DashEnum')
		expect(content).toContain('export const ColorEnum')
		expect(content).toContain('export const GeoEnum')
	})

	it('generates enum-tables.md with expected sections', () => {
		const mdPath = resolve(ROOT, 'skill/tldraw-cli/references/generated/enum-tables.md')
		expect(existsSync(mdPath)).toBe(true)
		const content = readFileSync(mdPath, 'utf-8')
		// 必须包含 banner 注释
		expect(content).toContain('Do not edit manually')
		// 必须有各枚举节
		expect(content).toContain('## arrowhead')
		expect(content).toContain('## fill')
		expect(content).toContain('## dash')
		expect(content).toContain('## color')
		expect(content).toContain('## geo')
	})

	it('generated ArrowheadEnum contains diamond and pipe', () => {
		const outPath = resolve(ROOT, 'shared/rpc/generated/tldraw-enums.ts')
		const content = readFileSync(outPath, 'utf-8')
		// diamond 和 pipe 是 tlschema 实际有但 shapes.ts 手写时漏掉的值
		expect(content).toContain('"diamond"')
		expect(content).toContain('"pipe"')
	})

	it('codegen output is deterministic (running twice yields same result)', () => {
		execSync('npx tsx scripts/codegen/generate-tldraw-enums.ts', { cwd: ROOT, stdio: 'pipe' })
		const outPath = resolve(ROOT, 'shared/rpc/generated/tldraw-enums.ts')
		const first = readFileSync(outPath, 'utf-8')
		execSync('npx tsx scripts/codegen/generate-tldraw-enums.ts', { cwd: ROOT, stdio: 'pipe' })
		const second = readFileSync(outPath, 'utf-8')
		expect(first).toBe(second)
	})
})
