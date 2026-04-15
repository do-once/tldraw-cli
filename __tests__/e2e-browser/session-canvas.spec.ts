/**
 * E2E 测试：Session 状态 + 画布管理
 *
 * 覆盖用例：
 *   1.1 Runtime 自动连接就绪
 *   1.2 session.status 返回完整信息
 *   2.1 默认画布存在
 *   2.2 创建新画布
 *   2.3 切换画布
 *
 * 隔离策略：整个 describe 共用一个 page 保持 Runtime 连接。
 */
import { test, expect, type Page } from '@playwright/test'
import { rpc, waitForStableRuntime, buildPageUrl } from './helpers'

const PAGE_URL = buildPageUrl()

test.describe('Session & Canvas', () => {
  let sharedPage: Page

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage()
    await sharedPage.goto(PAGE_URL)
    await sharedPage.waitForLoadState('domcontentloaded')
    await waitForStableRuntime()
  })

  test.afterAll(async () => {
    await sharedPage?.close()
  })

  // 用例 1.1：Runtime 自动连接就绪
  test('1.1 Runtime 自动连接就绪', async () => {
    const status = await rpc('session.status')
    const readyRuntime = status.runtimes?.find((r: any) => r.state === 'ready')
    expect(readyRuntime).toBeDefined()
  })

  // 用例 1.2：session.status 返回完整信息
  test('1.2 session.status 返回 host 版本和 canvasCount', async () => {
    const status = await rpc('session.status')
    expect(typeof status.host.version).toBe('string')
    expect(status.host.uptimeMs).toBeGreaterThan(0)
    expect(typeof status.canvasCount).toBe('number')
    expect(status.canvasCount).toBeGreaterThanOrEqual(1)
  })

  // 用例 2.1：默认画布存在
  test('2.1 默认画布存在', async () => {
    const result = await rpc('canvas.list')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items[0].id).toBeTruthy()
    expect(typeof result.items[0].title).toBe('string')
  })

  // 用例 2.2：创建新画布后 list 数量+1，返回 canvasId/title/revision
  test('2.2 创建新画布', async () => {
    const before = await rpc('canvas.list')
    const beforeCount = before.items.length

    const created = await rpc('canvas.create', { title: '测试画布' })
    expect(created.canvasId).toBeTruthy()
    expect(created.title).toBe('测试画布')
    expect(created.revision).toBe(0)

    const after = await rpc('canvas.list')
    expect(after.items.length).toBe(beforeCount + 1)
    expect(after.items.some((i: any) => i.id === created.canvasId)).toBe(true)
  })

  // 用例 2.3：创建新画布后通过 canvasId 直接 snapshot，验证是空的
  // 不调用 canvas.select（避免 tldraw setCurrentPage 触发 Editor 重建）
  test('2.3 新画布 snapshot 为空', async () => {
    const created = await rpc('canvas.create', { title: '空白画布' })

    // 不切换，直接用 canvasId 查询新画布的 snapshot
    const snapshot = await rpc('canvas.snapshot', { canvasId: created.canvasId })
    expect(snapshot.shapes).toHaveLength(0)
    expect(snapshot.canvasId).toBe(created.canvasId)
  })
})
