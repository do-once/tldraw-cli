/**
 * install 命令：安装 tldraw-cli 的 skill 文件到项目或用户目录。
 *
 * `tldraw-cli install --skills` 将 skill 文件复制到对应 agent 的 skills 目录：
 *   - --skills claude（默认）→ .claude/skills/tldraw-cli/
 *   - --skills agents → .agents/skills/tldraw-cli/
 *   - --global 追加时安装到用户级 ~/.<target>/skills/tldraw-cli/
 *
 * 跟 playwright-cli install --skills 的约定一致：
 * 目标目录模式为 `.<target>/skills/<tool-name>/`，
 * skill 文件内容不区分 agent 类型（同一份 SKILL.md）。
 */
import { buildCommand } from '@stricli/core'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import type { LocalContext } from '../context'

const SKILL_NAME = 'tldraw-cli'

/** 从 CLI 入口文件位置反推包根目录下的 skill 源目录 */
function findSkillSource(): string {
	const thisFile = fileURLToPath(import.meta.url)
	const candidates = [
		resolve(dirname(thisFile), '..', '..', 'skill', SKILL_NAME),  // cli/commands/ → root
		resolve(dirname(thisFile), '..', 'skill', SKILL_NAME),        // dist/ → root
	]
	for (const c of candidates) {
		if (existsSync(c)) return c
	}
	throw new Error(`找不到 skill 源文件，已检查：\n${candidates.join('\n')}`)
}

/** 根据 target 确定安装目录名（claude → .claude, agents → .agents） */
function targetDir(target: string): string {
	return target === 'agents' ? '.agents' : `.${target}`
}

async function installHandler(
	this: LocalContext,
	flags: { skills: 'claude' | 'agents' | undefined; global: boolean },
): Promise<void> {
	if (!flags.skills) {
		this.process.stdout.write('用法：tldraw-cli install --skills <claude|agents>\n')
		this.process.exit?.(1)
		return
	}

	const target = flags.skills
	const source = findSkillSource()
	const dir = targetDir(target)
	const targetBase = flags.global
		? join(homedir(), dir, 'skills', SKILL_NAME)
		: join(process.cwd(), dir, 'skills', SKILL_NAME)

	mkdirSync(targetBase, { recursive: true })
	cpSync(source, targetBase, { recursive: true, force: true })

	const scope = flags.global
		? `~/${dir}/skills/${SKILL_NAME}`
		: `${dir}/skills/${SKILL_NAME}`
	this.process.stdout.write(`✅ Skills installed to \`${scope}\`.\n`)
}

export const installCommand = buildCommand({
	loader: async () => installHandler,
	parameters: {
		positional: { kind: 'tuple', parameters: [] },
		flags: {
			skills: {
				kind: 'enum',
				values: ['claude', 'agents'] as const,
				brief: '选择 agent 类型：claude → .claude/skills/，agents → .agents/skills/',
				optional: true,
				default: undefined,
			},
			global: {
				kind: 'boolean',
				brief: '装到用户目录 ~/.<target>/skills/tldraw-cli/（默认装到当前项目 ./.{target}/skills/tldraw-cli/）',
				default: false,
			},
		},
	},
	docs: {
		brief: '安装 skill 文件到项目或用户目录',
		fullDescription: [
			'把本包内置的 tldraw-cli skill 复制到 agent 的 skills 目录，',
			'供 LLM（Claude Code / agents）读取后驱动画布。',
			'',
			'目标路径：',
			'  默认       ./.<target>/skills/tldraw-cli/',
			'  --global   ~/.<target>/skills/tldraw-cli/',
			'',
			'其中 <target> 由 --skills 决定（claude → .claude，agents → .agents）。',
			'',
			'示例：',
			'  tldraw-cli install --skills=claude            # 装到当前项目 .claude/skills/',
			'  tldraw-cli install --skills=claude --global   # 装到 ~/.claude/skills/ 全局可用',
			'  tldraw-cli install --skills=agents --global   # 装到 ~/.agents/skills/',
			'',
			'说明：',
			'  - 已存在同名文件会被覆盖，但不会清理源里已删除的旧文件',
			'  - 省略 --skills 会提示用法并以 exitCode=1 退出',
		].join('\n'),
	},
})
