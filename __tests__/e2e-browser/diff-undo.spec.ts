/**
 * E2E 测试：canvas.diff + command.undo/redo
 *
 * 覆盖用例：
 *   5.1 创建后 diff 包含 shape-created 事件
 *   5.2 更新后 diff 包含 shape-updated 事件
 *   5.3 删除后 diff 包含 shape-deleted 事件
 *   5.4 diff since=当前 revision 返回空列表
 *   6.1 undo 撤销创建，shape 消失
 *   6.2 redo 恢复，shape 重新出现
 *
 * 隔离策略：共用一个 page 和默认画布，afterEach 清理本测试创建的 shapes。
 */
import { test, expect, type Page } from '@playwright/test'
import { rpc, waitForStableRuntime, buildPageUrl } from './helpers'

const PAGE_URL = buildPageUrl()

test.describe('Diff & Undo/Redo', () => {
  let sharedPage: Page
  let createdShapeIds: string[] = []

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage()
    await sharedPage.goto(PAGE_URL)
    await sharedPage.waitForLoadState('domcontentloaded')
    await waitForStableRuntime()
  })

  test.afterAll(async () => {
    await sharedPage?.close()
  })

  test.beforeEach(() => {
    createdShapeIds = []
  })

  test.afterEach(async () => {
    for (const shapeId of createdShapeIds) {
      try {
        await rpc('command.apply', { commands: [{ kind: 'delete-shape', shapeId }] })
      } catch { /* 忽略：shape 可能已被测试删除 */ }
    }
  })

  // 用例 5.1：创建 shape 后 diff 包含 shape-created 类型条目
  test('5.1 创建后 diff 包含 shape-created 条目', async () => {
    // 调用两次 snapshot 确保 revision 稳定
    await rpc('canvas.snapshot')
    const s1 = await rpc('canvas.snapshot')
    const rev = s1.revision

    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    createdShapeIds.push(r.results[0].shapeId)

    const diff = await rpc('canvas.diff', { since: rev })
    expect(diff.fromRevision).toBe(rev)
    expect(diff.toRevision).toBeGreaterThan(rev)
    expect(diff.entries.some((e: any) => e.kind === 'shape-created')).toBe(true)
  })

  // 用例 5.2：更新 shape 后 diff 包含 shape-updated 条目
  test('5.2 更新后 diff 包含 shape-updated 条目', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    const shapeId = r.results[0].shapeId
    createdShapeIds.push(shapeId)

    await rpc('canvas.snapshot')
    const s1 = await rpc('canvas.snapshot')
    const rev = s1.revision

    await rpc('command.apply', {
      commands: [{ kind: 'update-shape', shapeId, x: 200, y: 200 }],
    })

    const diff = await rpc('canvas.diff', { since: rev })
    expect(diff.entries.some((e: any) => e.kind === 'shape-updated')).toBe(true)
  })

  // 用例 5.3：删除 shape 后 diff 包含 shape-deleted 条目
  test('5.3 删除后 diff 包含 shape-deleted 条目', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    const shapeId = r.results[0].shapeId
    // 不加入 createdShapeIds，因为会手动删

    await rpc('canvas.snapshot')
    const s1 = await rpc('canvas.snapshot')
    const rev = s1.revision

    await rpc('command.apply', {
      commands: [{ kind: 'delete-shape', shapeId }],
    })

    const diff = await rpc('canvas.diff', { since: rev })
    expect(diff.entries.some((e: any) => e.kind === 'shape-deleted')).toBe(true)
  })

  // 用例 5.4：diff since=当前 revision 返回空 entries
  test('5.4 diff since=当前 revision 返回空 entries', async () => {
    // 调用两次 snapshot 确保 revision 稳定
    await rpc('canvas.snapshot')
    const s2 = await rpc('canvas.snapshot')
    const stableRev = s2.revision

    const diff = await rpc('canvas.diff', { since: stableRev })
    expect(diff.entries).toHaveLength(0)
    expect(diff.fromRevision).toBe(stableRev)
    expect(diff.toRevision).toBe(stableRev)
  })

  // 用例 6.1：undo 撤销创建，shape 从 snapshot 中消失
  test('6.1 undo 撤销 shape 创建', async () => {
    const before = await rpc('canvas.snapshot')
    const beforeCount = before.shapes.length

    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    const shapeId = r.results[0].shapeId

    const afterCreate = await rpc('canvas.snapshot')
    expect(afterCreate.shapes.length).toBe(beforeCount + 1)

    await rpc('command.undo')
    const afterUndo = await rpc('canvas.snapshot')
    expect(afterUndo.shapes.length).toBe(beforeCount)

    // undo 后 shape 已不存在，不需要清理
    // 但如果 undo 失败可能还在，加保险
    createdShapeIds.push(shapeId)
  })

  // 用例 6.2：redo 恢复被 undo 的创建，shape 重新出现
  test('6.2 redo 恢复 shape 创建', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    const snapshot0 = await rpc('canvas.snapshot')
    const lastShape = snapshot0.shapes[snapshot0.shapes.length - 1]
    const shapeId = lastShape.shapeId
    createdShapeIds.push(shapeId)

    await rpc('command.undo')
    const afterUndo = await rpc('canvas.snapshot')
    expect(afterUndo.shapes.find((s: any) => s.shapeId === shapeId)).toBeUndefined()

    await rpc('command.redo')
    const afterRedo = await rpc('canvas.snapshot')
    expect(afterRedo.shapes.find((s: any) => s.shapeId === shapeId)).toBeDefined()
  })
})
