/**
 * E2E 测试：用户直接操作画布（通过 editor API 模拟），验证 RPC 侧能感知变化
 *
 * 覆盖用例：
 *   7.1 用户通过 editor API 创建 shape，snapshot 能看到
 *   7.2 用户通过 editor API 删除 shape，snapshot 反映消失
 *
 * 隔离策略：共用一个 page，使用当前活跃画布（不 canvas.select 避免 Editor 重建）。
 */
import { test, expect, type Page } from '@playwright/test'
import { rpc, waitForStableRuntime, buildPageUrl } from './helpers'

const PAGE_URL = buildPageUrl()

test.describe('User Interaction', () => {
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

  // 用例 7.1：用户在 browser 里直接用 editor API 创建 shape，RPC snapshot 能看到
  test('7.1 用户创建 shape，snapshot 能感知', async () => {
    const beforeSnapshot = await rpc('canvas.snapshot')
    const beforeCount = beforeSnapshot.shapes.length

    // 通过 window.__tldraw_editor 直接调用 tldraw editor API（模拟用户操作）
    await sharedPage.evaluate(() => {
      const editor = (window as any).__tldraw_editor
      if (!editor) throw new Error('Editor not exposed on window')
      editor.createShape({
        type: 'geo',
        x: 200,
        y: 200,
        props: { w: 150, h: 100, geo: 'rectangle' },
      })
    })

    // 等待 store 变更传播
    await sharedPage.waitForTimeout(500)

    const snapshot = await rpc('canvas.snapshot')
    expect(snapshot.shapes.length).toBeGreaterThan(beforeCount)
    // 找到坐标匹配的 shape
    const userShape = snapshot.shapes.find(
      (s: any) => s.kind === 'geo' && s.x === 200 && s.y === 200
    )
    expect(userShape).toBeDefined()
  })

  // 用例 7.2：用户在 browser 里直接删除 shape，RPC snapshot 反映消失
  test('7.2 用户删除 shape，snapshot 反映消失', async () => {
    // 先通过 RPC 创建一个 shape（在当前活跃画布上）
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 300, y: 300, w: 80, h: 80 }],
    })
    const shapeId = r.results[0].shapeId

    const s1 = await rpc('canvas.snapshot')
    expect(s1.shapes.find((s: any) => s.shapeId === shapeId)).toBeDefined()

    // 用户通过 editor API 直接删除
    await sharedPage.evaluate((id) => {
      const editor = (window as any).__tldraw_editor
      if (!editor) throw new Error('Editor not exposed on window')
      editor.deleteShape(id)
    }, shapeId)

    // 等待 store 变更传播
    await sharedPage.waitForTimeout(500)

    const s2 = await rpc('canvas.snapshot')
    expect(s2.shapes.find((s: any) => s.shapeId === shapeId)).toBeUndefined()
  })
})
