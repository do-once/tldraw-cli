/**
 * command 子命令组，包含 apply / undo / redo 子命令。
 *
 * apply：从 stdin 读取 JSON 命令体，通过 RPC 批量执行画布操作。
 * undo：撤销上一次操作。
 * redo：重做上一次撤销的操作。
 *
 * apply 响应携带 runtimeSessionId，CLI 将其写回 session 文件，
 * 供后续 canvas diff 检测 Runtime 是否重启。
 */
import { buildCommand, buildRouteMap } from '@stricli/core'
import type { LocalContext } from '../context'
import { readStdinJson } from '../hostClient/readStdin'
import { persistSessionId } from '../hostClient/sessionFile'

/**
 * command apply 处理函数。
 * 从 stdin 读取命令体后，如果传了 --canvas 标志，
 * 则将其注入为 canvasId 字段（覆盖 stdin 中可能存在的 canvasId）。
 */
async function applyHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const body = (await readStdinJson(this.process.stdin)) as Record<string, unknown>
	const params = flags.canvas ? { ...body, canvasId: flags.canvas } : body
	const r = await this.buildClient().call('command.apply', params)
	persistSessionId(this, r)
	this.process.stdout.write(JSON.stringify(r, null, 2) + '\n')
}

const applyCmd = buildCommand({
	loader: async () => applyHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: '目标画布 id（覆盖 stdin 中的 canvasId）', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '批量执行画布命令',
		fullDescription: [
			'从 stdin 读取 JSON，批量执行画布操作（原子性：全部成功或全部回滚）。',
			'',
			'stdin JSON 格式:',
			'  {"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":100,"y":100,"w":200,"h":120}]}',
			'',
			'当前支持的命令类型:',
			'  create-geo-shape   创建几何图形（rectangle / ellipse / diamond 等）',
			'  create-text        创建文字',
			'  create-arrow       创建箭头',
			'  create-note        创建便签',
			'  delete-shape       删除图形',
			'  update-shape       更新图形属性',
			'',
			'示例:',
			'  echo \'{"commands":[...]}\' | tldraw-cli command apply',
			'  echo \'{"commands":[...]}\' | tldraw-cli command apply --canvas page:abc',
		].join('\n'),
	},
})

async function undoHandler(this: LocalContext): Promise<void> {
	const r = await this.buildClient().call('command.undo', {})
	this.process.stdout.write(JSON.stringify(r, null, 2) + '\n')
}

const undoCmd = buildCommand({
	loader: async () => undoHandler,
	parameters: {
		flags: {},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '撤销上一次画布操作',
		fullDescription: [
			'撤销当前活跃画布的上一次操作，等价于 Ctrl+Z。',
			'返回执行后的最新 revision。',
			'',
			'示例:',
			'  tldraw-cli command undo',
		].join('\n'),
	},
})

async function redoHandler(this: LocalContext): Promise<void> {
	const r = await this.buildClient().call('command.redo', {})
	this.process.stdout.write(JSON.stringify(r, null, 2) + '\n')
}

const redoCmd = buildCommand({
	loader: async () => redoHandler,
	parameters: {
		flags: {},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '重做上一次被撤销的画布操作',
		fullDescription: [
			'重做当前活跃画布上一次被撤销的操作，等价于 Ctrl+Y / Ctrl+Shift+Z。',
			'返回执行后的最新 revision。',
			'',
			'示例:',
			'  tldraw-cli command redo',
		].join('\n'),
	},
})

export const commandRoutes = buildRouteMap({
	routes: { apply: applyCmd, undo: undoCmd, redo: redoCmd },
	docs: { brief: '向画布发送批量操作命令（从 stdin 读取 JSON）' },
})
