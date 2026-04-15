/**
 * canvas 子命令组，提供画布管理的全部 CLI 子命令：
 *   list          列出所有画布
 *   snapshot      获取指定画布的全量快照
 *   diff          获取 revision 之后的增量变更
 *   create        新建画布
 *   select        切换活跃画布
 *   get-selection 读取用户当前框选的 shapeId 列表
 *   screenshot    截取画布为 PNG 并返回临时文件路径
 *
 * 每个子命令都通过 buildClient().call() 转发到 Host 的 JSON-RPC 端点，
 * 结果以格式化 JSON 输出到 stdout，供 LLM 或脚本解析。
 *
 * snapshot / diff / getSelection / command.apply 的响应携带 runtimeSessionId，
 * CLI 会将其写回 session 文件；diff 命令会带上已有 sessionId 以便 Host 检测 Runtime 重启。
 */
import { buildCommand, buildRouteMap } from '@stricli/core'
import type { LocalContext } from '../context'
import { persistSessionId, readSessionFile, writeSessionFile } from '../hostClient/sessionFile'
import { JsonRpcError } from '../hostClient/JsonRpcClient'
import { ErrorCodes } from '../../shared/rpc'

/** 将任意对象格式化为 JSON 并写入 stdout（统一输出格式） */
function print(this: LocalContext, obj: unknown): void {
	this.process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}

// canvas list
async function listHandler(this: LocalContext): Promise<void> {
	const r = await this.buildClient().call('canvas.list', {})
	print.call(this, r)
}
const listCmd = buildCommand({
	loader: async () => listHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: {
		brief: '列出所有画布',
		fullDescription: '返回 JSON 数组，每项包含 id、title、revision。一个画布对应一个 tldraw page。',
	},
})

// canvas snapshot [--canvas <id>]
async function snapshotHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const params = flags.canvas ? { canvasId: flags.canvas } : {}
	const r = await this.buildClient().call('canvas.snapshot', params)
	persistSessionId(this, r)
	print.call(this, r)
}
const snapshotCmd = buildCommand({
	loader: async () => snapshotHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: '画布 id（即 tldraw page id），省略则使用当前活跃画布', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '获取画布当前全量快照',
		fullDescription: '返回指定画布的所有 shapes 和当前 revision。\n省略 --canvas 时使用当前活跃画布。LLM 用此方法建立画布基线。',
	},
})

// canvas diff --since N [--canvas <id>]
async function diffHandler(this: LocalContext, flags: { canvas?: string; since: number }): Promise<void> {
	const params: { canvasId?: string; since: number; runtimeSessionId?: string } = { since: flags.since }
	if (flags.canvas) params.canvasId = flags.canvas
	// 读取已持久化的 runtimeSessionId，传给 Host 做会话校验
	const session = readSessionFile(this.sessionPath)
	if (session?.runtimeSessionId) params.runtimeSessionId = session.runtimeSessionId
	try {
		const r = await this.buildClient().call('canvas.diff', params)
		persistSessionId(this, r)
		print.call(this, r)
	} catch (err) {
		if (err instanceof JsonRpcError && err.code === ErrorCodes.runtimeRestarted) {
			this.process.stderr.write(
				'Runtime 已重启 (session 失效)，请先运行 `canvas snapshot` 重建基线\n',
			)
			this.process.exit?.(1)
			return
		}
		throw err
	}
}
const diffCmd = buildCommand({
	loader: async () => diffHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: '画布 id，省略则使用当前活跃画布', optional: true },
			since: { kind: 'parsed', parse: (s: string) => {
				const n = Number.parseInt(s, 10)
				if (!Number.isFinite(n) || n < 0) throw new Error('--since must be >= 0')
				return n
			}, brief: '基准 revision（返回此值之后的变更）' },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '获取 revision 之后的增量变更',
		fullDescription: '返回 since 之后的 HistoryEntry 列表（如 shape-created）。\n--since 为上次快照的 revision 值。LLM 用此方法增量感知画布变化。',
	},
})

// canvas create [--title <name>]
async function createHandler(this: LocalContext, flags: { title?: string }): Promise<void> {
	const params = flags.title ? { title: flags.title } : {}
	const r = await this.buildClient().call('canvas.create', params)
	print.call(this, r)
}
const createCmd = buildCommand({
	loader: async () => createHandler,
	parameters: {
		flags: {
			title: { kind: 'parsed', parse: String, brief: '画布标题（省略则使用默认名称）', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '新建画布',
		fullDescription: '创建一个新的 tldraw page 作为画布。返回新画布 id 和 revision。',
	},
})

// canvas select --canvas <id>
async function selectHandler(this: LocalContext, flags: { canvas: string }): Promise<void> {
	const r = await this.buildClient().call('canvas.select', { canvasId: flags.canvas })
	print.call(this, r)
}
const selectCmd = buildCommand({
	loader: async () => selectHandler,
	parameters: {
		flags: { canvas: { kind: 'parsed', parse: String, brief: '要激活的画布 id' } },
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '切换活跃画布',
		fullDescription: '将指定画布设为当前活跃画布。后续省略 --canvas 的命令都作用于此画布。',
	},
})

// canvas get-selection [--canvas <id>]
async function getSelectionHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const params = flags.canvas ? { canvasId: flags.canvas } : {}
	const r = await this.buildClient().call('canvas.getSelection', params)
	persistSessionId(this, r)
	print.call(this, r)
}
const getSelectionCmd = buildCommand({
	loader: async () => getSelectionHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: '画布 id，省略则使用当前活跃画布', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '读取用户当前框选的 shapeId 列表',
		fullDescription: '返回用户在浏览器中当前选中的 shape id 数组及此时 revision。\n用于"LLM 画粗版 → 用户框选局部 → LLM 只改选中"迭代工作流。',
	},
})

// canvas screenshot [--canvas <id>]
async function screenshotHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const params = flags.canvas ? { canvasId: flags.canvas } : {}
	const r = await this.buildClient().call('canvas.screenshot', params)
	print.call(this, r)
}
const screenshotCmd = buildCommand({
	loader: async () => screenshotHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: '画布 id，省略则使用当前活跃画布', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: {
		brief: '截取画布为 PNG 并返回文件路径',
		fullDescription: '将当前画布导出为 PNG，写入临时文件，返回 {imagePath}。\nLLM 用 Read 工具读取 imagePath 即可直接看到渲染结果。',
	},
})

export const canvasRoutes = buildRouteMap({
	routes: {
		list: listCmd,
		snapshot: snapshotCmd,
		diff: diffCmd,
		create: createCmd,
		select: selectCmd,
		'get-selection': getSelectionCmd,
		screenshot: screenshotCmd,
	},
	docs: { brief: '画布管理（列表 / 快照 / 增量 / 创建 / 切换 / 选区 / 截图）' },
})
