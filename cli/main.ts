/**
 * CLI 入口模块，负责用 stricli 注册所有命令路由并启动 CLI。
 *
 * 路由结构：
 *   tldraw-cli
 *     start          → 启动 Host 进程
 *     stop           → 停止 Host 进程
 *     status         → 查询运行状态
 *     canvas         → 画布子命令组（list / snapshot / diff / create / select / get-selection）
 *     command        → 命令子命令组（apply / undo / redo）
 *
 * application 也单独导出，方便集成测试直接调用而不通过 process.argv。
 */
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { buildLocalContext } from './context'
import { canvasRoutes } from './commands/canvas'
import { commandRoutes } from './commands/command'
import { startCommand } from './commands/start'
import { stopCommand } from './commands/stop'
import { statusCommand } from './commands/status'
import { installCommand } from './commands/install'

const rootRoutes = buildRouteMap({
	routes: {
		start: startCommand,
		stop: stopCommand,
		status: statusCommand,
		canvas: canvasRoutes,
		command: commandRoutes,
		install: installCommand,
	},
	docs: { brief: '将 tldraw 画布包装为本地 CLI 工具，让 LLM、脚本、SDK 都能驱动画布' },
})

/** stricli Application 实例，包含完整路由树和元数据 */
export const application = buildApplication(rootRoutes, {
	name: 'tldraw-cli',
	versionInfo: { currentVersion: '0.0.1' },
})

/**
 * CLI 主入口函数。
 * 将 process.argv 的前两项（node 可执行文件路径和脚本路径）去掉，
 * 把剩余参数交给 stricli 解析并执行对应命令。
 */
export async function runCli(proc: NodeJS.Process): Promise<void> {
	await run(application, proc.argv.slice(2), buildLocalContext(proc))
}

// 显式 process.exit 以确保 handler 里设置的 process.exitCode 生效——
// stricli 不会主动调 exit，detached child 虽然 unref 但事件循环有时不自然收尾。
// isDirectRun 内部对 argv[1] realpath 规范化，兼容 npm link / pnpm 硬链 / Windows junction 场景。
import { isDirectRun } from './isDirectRun'

if (isDirectRun(process.argv[1], import.meta.url)) {
	runCli(process).then(
		() => process.exit(process.exitCode ?? 0),
		(err) => {
			console.error(err)
			process.exit(1)
		},
	)
}
