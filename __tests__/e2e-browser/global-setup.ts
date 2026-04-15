/**
 * Playwright 全局 setup：用子进程启动 HostProcess，等待就绪后写入环境变量供测试使用。
 * 使用子进程方式（spawn tsx）而非直接 import，避免 ESM 加载问题。
 */
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const HTTP_PORT = 19787
const WS_PORT = 19788

let hostProc: ChildProcess | null = null

export default async function globalSetup() {
  const staticDir = path.resolve(PROJECT_ROOT, 'dist')

  // 用 tsx 启动 HostProcess（ESM 友好）
  hostProc = spawn(
    process.execPath,
    ['--import', 'tsx', path.join(PROJECT_ROOT, 'host/HostProcess.ts')],
    {
      env: {
        ...process.env,
        TLDRAW_HTTP_PORT: String(HTTP_PORT),
        TLDRAW_WS_PORT: String(WS_PORT),
        // 让 HostProcess 知道静态文件在哪（通过 main() 内部逻辑）
        // 但 main() 用 __dirname 推导，这里改用直接传 HostProcess
        TLDRAW_STATIC_DIR: staticDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Windows 需要 shell: false（默认）
    }
  )

  hostProc.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) console.log(`[host-stdout] ${line}`)
  })
  hostProc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) console.error(`[host-stderr] ${line}`)
  })
  hostProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[host] 进程异常退出，exit code=${code}`)
    }
  })

  // 等待 Host HTTP 就绪
  await waitForHost(`http://localhost:${HTTP_PORT}/rpc`)

  // 写入全局变量供 global-teardown 使用
  ;(globalThis as any).__e2e_host_proc = hostProc

  // 写入环境变量供测试 helpers 使用
  process.env.E2E_HTTP_PORT = String(HTTP_PORT)
  process.env.E2E_WS_PORT = String(WS_PORT)
  process.env.E2E_BASE_URL = `http://localhost:${HTTP_PORT}`
  process.env.E2E_RPC_URL = `http://localhost:${HTTP_PORT}/rpc`
  process.env.E2E_WS_URL = `ws://localhost:${WS_PORT}`

  console.log(`[global-setup] Host 已就绪 http=${HTTP_PORT} ws=${WS_PORT}`)
}

async function waitForHost(rpcUrl: string, maxMs = 15000): Promise<void> {
  const start = Date.now()
  let lastErr = ''
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.status', params: {} }),
      })
      if (res.ok) return
      lastErr = `HTTP ${res.status}`
    } catch (e) {
      lastErr = String(e)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  // 超时，杀掉进程并抛错
  hostProc?.kill()
  throw new Error(`Host 未在 ${maxMs}ms 内就绪。最后错误：${lastErr}`)
}
