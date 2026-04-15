/**
 * E2E 测试辅助函数：
 * - rpc()              发送 JSON-RPC 请求到 Host
 * - waitForRuntime()   轮询直到有 Runtime 处于 ready 状态
 * - waitForStableRuntime()  等待 Runtime ready 后再等一段时间确保 tldraw 完全初始化
 * - getEditorShapeCount()   通过 page.evaluate() 读取 editor 当前 page 的 shape 数量
 * - getEditorShapeById()    通过 page.evaluate() 根据 id 查找 shape
 */
import type { Page } from '@playwright/test'

const HTTP_PORT = process.env.E2E_HTTP_PORT || '19787'
const RPC_URL = `http://localhost:${HTTP_PORT}/rpc`

let rpcId = 0

/** 向 Host 发送一个 JSON-RPC 2.0 请求，返回 result；出错则抛出带 code 的 Error */
export async function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
  return json.result
}

/**
 * 轮询 session.status，直到有至少一个 Runtime 处于 ready 状态。
 * 超时后抛出错误。
 */
export async function waitForRuntime(maxMs = 15000): Promise<any> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const result = await rpc('session.status')
      const readyRuntime = result.runtimes?.find((r: any) => r.state === 'ready')
      if (readyRuntime) return result
    } catch {
      // Host 可能还未完全就绪，忽略临时错误
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Runtime 未在 ${maxMs}ms 内连接就绪`)
}

/**
 * 等待 Runtime ready，然后再轮询确认 Runtime 稳定（两次连续 ready 间隔 500ms）。
 * 用于防止 tldraw 在握手后立即 unmount/remount 导致 RuntimeWsClient 重建。
 */
export async function waitForStableRuntime(maxMs = 20000): Promise<void> {
  const start = Date.now()
  let consecutiveReady = 0
  while (Date.now() - start < maxMs) {
    try {
      const result = await rpc('session.status')
      const hasReady = result.runtimes?.some((r: any) => r.state === 'ready')
      if (hasReady) {
        consecutiveReady++
        if (consecutiveReady >= 2) return
      } else {
        consecutiveReady = 0
      }
    } catch {
      consecutiveReady = 0
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Runtime 未在 ${maxMs}ms 内稳定`)
}

/** 通过 window.__tldraw_editor 获取当前 page 的 shape 数量 */
export async function getEditorShapeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const editor = (window as any).__tldraw_editor
    if (!editor) throw new Error('Editor not exposed on window')
    return editor.getCurrentPageShapes().length
  })
}

/** 通过 window.__tldraw_editor 根据 shapeId 查找 shape，返回简化对象或 null */
export async function getEditorShapeById(page: Page, shapeId: string): Promise<{
  id: string
  type: string
  x: number
  y: number
  props: Record<string, unknown>
} | null> {
  return page.evaluate((id) => {
    const editor = (window as any).__tldraw_editor
    if (!editor) throw new Error('Editor not exposed on window')
    const shape = editor.getShape(id)
    if (!shape) return null
    return { id: shape.id, type: shape.type, x: shape.x, y: shape.y, props: shape.props }
  }, shapeId)
}

/** 构造用于访问前端的 URL，包含 wsUrl query param */
export function buildPageUrl(httpPort?: string, wsPort?: string): string {
  const hp = httpPort ?? process.env.E2E_HTTP_PORT ?? '19787'
  const wp = wsPort ?? process.env.E2E_WS_PORT ?? '19788'
  const wsUrl = encodeURIComponent(`ws://localhost:${wp}`)
  return `http://localhost:${hp}/?wsUrl=${wsUrl}`
}
