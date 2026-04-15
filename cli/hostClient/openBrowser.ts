/**
 * 跨平台打开浏览器工具函数。
 *
 * 根据当前 OS 选择对应的命令：
 *   macOS   → open
 *   Windows → cmd /c start
 *   Linux   → xdg-open
 *
 * 子进程以 detached + stdio ignore 方式启动，并调用 unref()，
 * 使其不阻塞 CLI 进程退出。
 */
import { spawn } from 'node:child_process'

/**
 * 在用户默认浏览器中打开指定 URL。
 * 调用后立即返回，不等待浏览器关闭。
 */
export function openBrowser(url: string): void {
	const platform = process.platform
	const opener =
		platform === 'darwin' ? { cmd: 'open', args: [url] } :
		platform === 'win32' ? { cmd: 'cmd', args: ['/c', 'start', '', url] } :
		{ cmd: 'xdg-open', args: [url] }
	const child = spawn(opener.cmd, opener.args, { detached: true, stdio: 'ignore' })
	child.unref()
}
