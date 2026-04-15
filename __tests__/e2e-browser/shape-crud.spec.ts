/**
 * E2E 测试：Shape 增删改查
 *
 * 覆盖用例：
 *   3.1 创建矩形（RPC + browser 双侧验证）
 *   3.2 创建椭圆
 *   3.3 创建文本
 *   3.4 创建 note
 *   3.5 用大矩形模拟容器
 *   3.6 创建箭头并绑定两个 shape
 *   3.7 批量创建多个 shape
 *   4.1 更新 shape 位置
 *   4.2 更新 shape 尺寸
 *   4.3 更新 shape 文本
 *   4.4 删除 shape
 *   4.5 删除不存在的 shape 返回 error 1007
 *   8.1 snapshot revision 在每次操作后递增
 *
 * 隔离策略：共用一个 page 和一个默认画布，每个测试用 afterEach 清理自己创建的 shapes。
 * 不创建新画布，避免 editor.createPage() 触发 tldraw 内部 remount 导致 Runtime 断连。
 */
import { test, expect, type Page } from '@playwright/test'
import { rpc, waitForStableRuntime, getEditorShapeById, buildPageUrl } from './helpers'

const PAGE_URL = buildPageUrl()

test.describe('Shape CRUD', () => {
  let sharedPage: Page
  // 测试中创建的 shapeIds，afterEach 里清理
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

  // afterEach 清理本测试创建的 shapes（最大努力，失败不报错）
  test.afterEach(async () => {
    for (const shapeId of createdShapeIds) {
      try {
        await rpc('command.apply', { commands: [{ kind: 'delete-shape', shapeId }] })
      } catch {
        // 忽略：shape 可能已被测试删除
      }
    }
  })

  // 用例 3.1：创建矩形，RPC snapshot + browser editor 双侧验证
  test('3.1 创建矩形', async () => {
    const result = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 100, y: 100, w: 200, h: 150 }],
    })
    expect(result.results).toHaveLength(1)
    const shapeId = result.results[0].shapeId
    createdShapeIds.push(shapeId)
    expect(shapeId).toBeTruthy()

    // RPC 验证
    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape).toBeDefined()
    expect(shape.kind).toBe('geo')
    expect(shape.geo).toBe('rectangle')
    expect(shape.x).toBe(100)
    expect(shape.y).toBe(100)

    // Browser 验证（通过 window.__tldraw_editor）
    const editorShape = await getEditorShapeById(sharedPage, shapeId)
    expect(editorShape).not.toBeNull()
    expect(editorShape!.type).toBe('geo')
  })

  // 用例 3.2：创建椭圆
  test('3.2 创建椭圆', async () => {
    const result = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 50, y: 50, w: 120, h: 80 }],
    })
    const shapeId = result.results[0].shapeId
    createdShapeIds.push(shapeId)

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.kind).toBe('geo')
    expect(shape?.geo).toBe('ellipse')

    const editorShape = await getEditorShapeById(sharedPage, shapeId)
    expect(editorShape?.props?.geo).toBe('ellipse')
  })

  // 用例 3.3：创建文本
  test('3.3 创建文本 shape', async () => {
    const result = await rpc('command.apply', {
      commands: [{ kind: 'create-text', x: 200, y: 300, text: '你好世界', w: 150 }],
    })
    const shapeId = result.results[0].shapeId
    createdShapeIds.push(shapeId)

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.kind).toBe('text')
    expect(shape?.text).toBe('你好世界')

    const editorShape = await getEditorShapeById(sharedPage, shapeId)
    expect(editorShape?.type).toBe('text')
  })

  // 用例 3.4：创建 note（便利贴）
  test('3.4 创建 note', async () => {
    const result = await rpc('command.apply', {
      commands: [{ kind: 'create-note', x: 400, y: 100, text: '便利贴内容' }],
    })
    const shapeId = result.results[0].shapeId
    createdShapeIds.push(shapeId)

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.kind).toBe('note')
    expect(shape?.text).toBe('便利贴内容')

    const editorShape = await getEditorShapeById(sharedPage, shapeId)
    expect(editorShape?.type).toBe('note')
  })

  // 用例 3.5：创建大矩形（模拟容器框）
  test('3.5 创建大矩形容器', async () => {
    const result = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 300, h: 200 }],
    })
    const shapeId = result.results[0].shapeId
    createdShapeIds.push(shapeId)

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.kind).toBe('geo')
    expect(shape?.w).toBe(300)
    expect(shape?.h).toBe(200)
  })

  // 用例 3.6：创建箭头并绑定两端 shape
  test('3.6 创建箭头并绑定两端 shape', async () => {
    const r1 = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100 }],
    })
    const r2 = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 300, y: 0, w: 100, h: 100 }],
    })
    const id1 = r1.results[0].shapeId
    const id2 = r2.results[0].shapeId
    createdShapeIds.push(id1, id2)

    const arrowResult = await rpc('command.apply', {
      commands: [{
        kind: 'create-arrow',
        startX: 50, startY: 50,
        endX: 350, endY: 50,
        startBindingShapeId: id1,
        endBindingShapeId: id2,
      }],
    })
    const arrowId = arrowResult.results[0].shapeId
    createdShapeIds.push(arrowId)

    const snapshot = await rpc('canvas.snapshot')
    const arrow = snapshot.shapes.find((s: any) => s.shapeId === arrowId)
    expect(arrow?.kind).toBe('arrow')
    expect(arrow?.startBinding).not.toBeNull()
    expect(arrow?.endBinding).not.toBeNull()
    expect(arrow?.startBinding?.shapeId).toBe(id1)
    expect(arrow?.endBinding?.shapeId).toBe(id2)
  })

  // 用例 3.7：批量创建多个 shape
  test('3.7 批量创建多个 shape', async () => {
    const before = await rpc('canvas.snapshot')
    const beforeCount = before.shapes.length

    const result = await rpc('command.apply', {
      commands: [
        { kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 50, h: 50 },
        { kind: 'create-geo-shape', geo: 'ellipse', x: 100, y: 0, w: 50, h: 50 },
        { kind: 'create-text', x: 200, y: 0, text: 'batch', w: 80 },
      ],
    })
    expect(result.results).toHaveLength(3)
    result.results.forEach((r: any) => createdShapeIds.push(r.shapeId))

    const after = await rpc('canvas.snapshot')
    expect(after.shapes.length).toBe(beforeCount + 3)
  })

  // 用例 4.1：更新 shape 位置
  test('4.1 更新 shape 位置', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100 }],
    })
    const shapeId = r.results[0].shapeId
    createdShapeIds.push(shapeId)

    await rpc('command.apply', {
      commands: [{ kind: 'update-shape', shapeId, x: 500, y: 300 }],
    })

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.x).toBe(500)
    expect(shape?.y).toBe(300)
  })

  // 用例 4.2：更新 shape 尺寸
  test('4.2 更新 shape 尺寸', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100 }],
    })
    const shapeId = r.results[0].shapeId
    createdShapeIds.push(shapeId)

    await rpc('command.apply', {
      commands: [{ kind: 'update-shape', shapeId, w: 250, h: 180 }],
    })

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.w).toBe(250)
    expect(shape?.h).toBe(180)
  })

  // 用例 4.3：更新 geo shape 文本
  test('4.3 更新 geo shape 文本', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100, text: '原文' }],
    })
    const shapeId = r.results[0].shapeId
    createdShapeIds.push(shapeId)

    await rpc('command.apply', {
      commands: [{ kind: 'update-shape', shapeId, text: '新文本' }],
    })

    const snapshot = await rpc('canvas.snapshot')
    const shape = snapshot.shapes.find((s: any) => s.shapeId === shapeId)
    expect(shape?.text).toBe('新文本')
  })

  // 用例 4.4：删除 shape 后 snapshot 中消失，browser editor 也消失
  test('4.4 删除 shape', async () => {
    const r = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
    })
    const shapeId = r.results[0].shapeId
    // 不加入 createdShapeIds，这个测试自己删

    await rpc('command.apply', {
      commands: [{ kind: 'delete-shape', shapeId }],
    })

    const snapshot = await rpc('canvas.snapshot')
    expect(snapshot.shapes.find((s: any) => s.shapeId === shapeId)).toBeUndefined()

    const editorShape = await getEditorShapeById(sharedPage, shapeId)
    expect(editorShape).toBeNull()
  })

  // 用例 4.5：删除不存在的 shape 返回 error code 1007
  test('4.5 删除不存在的 shape 返回 error 1007', async () => {
    let thrown = false
    try {
      await rpc('command.apply', {
        commands: [{ kind: 'delete-shape', shapeId: 'shape:nonexistent_test_id_xyz' }],
      })
    } catch (e: any) {
      thrown = true
      expect(e.message).toContain('1007')
    }
    expect(thrown).toBe(true)
  })

  // 用例 8.1：每次 command.apply 后 snapshot revision 递增
  test('8.1 revision 在每次操作后递增', async () => {
    const s1 = await rpc('canvas.snapshot')
    const rev1 = s1.revision

    const r1 = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 50, h: 50 }],
    })
    createdShapeIds.push(r1.results[0].shapeId)
    const s2 = await rpc('canvas.snapshot')
    expect(s2.revision).toBeGreaterThan(rev1)

    const r2 = await rpc('command.apply', {
      commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 100, y: 0, w: 50, h: 50 }],
    })
    createdShapeIds.push(r2.results[0].shapeId)
    const s3 = await rpc('canvas.snapshot')
    expect(s3.revision).toBeGreaterThan(s2.revision)
  })
})
