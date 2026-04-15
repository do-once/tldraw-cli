/**
 * Playwright 全局 teardown：关闭 global-setup 启动的 Host 子进程。
 *
 * Windows 上 ChildProcess.kill() 内部调用 TerminateProcess（强制终止），
 * 不支持 POSIX 信号语义，所以统一用不带参数的 kill() 即可。
 */
import { execSync } from 'node:child_process'

export default async function globalTeardown() {
  const hostProc = (globalThis as any).__e2e_host_proc
  if (hostProc && !hostProc.killed) {
    // 先尝试常规 kill（Unix: SIGTERM，Windows: TerminateProcess）
    hostProc.kill()
    // 等待进程退出，超时后按平台强制杀
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /PID ${hostProc.pid} /T /F`, { stdio: 'ignore' })
          } else {
            hostProc.kill('SIGKILL')
          }
        } catch { /* ignore */ }
        resolve()
      }, 3000)
      hostProc.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    console.log('[global-teardown] Host 已停止')
  }
}
