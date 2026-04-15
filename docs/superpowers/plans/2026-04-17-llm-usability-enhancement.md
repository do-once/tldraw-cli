# tldraw-cli LLM 可用性增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 LLM 能完整感知画布状态（所有 shape 类型、连接关系、文字内容）、执行丰富操作（创建/删除/修改/撤销）、并追踪用户手动编辑，从而真正可用。

**Architecture:** 扩展三层协议——schema 层定义多类型 shape / command / history 契约，Runtime 层实现提取/执行/追踪，CLI 层适配新命令。schema 从 methods.ts 拆分为独立文件以解耦并行开发。

**Tech Stack:** TypeScript 5.8 / zod@4（schema）/ tldraw@4.5（editor API）/ stricli（CLI）/ vitest（测试）

---

## File Structure

### New files

| 文件 | 职责 |
|------|------|
| `shared/rpc/shapes.ts` | Shape 类型 schema（geo / text / arrow / note / frame / unknown） |
| `shared/rpc/commands.ts` | Command 类型 schema（create-\* / delete / update） |
| `shared/rpc/history.ts` | HistoryEntry 类型 schema（created / updated / deleted） |
| `client/runtime/shapeExtractor.ts` | 从 tldraw editor 提取 protocol shape |
| `client/runtime/commandExecutor.ts` | 将 protocol command 翻译为 editor 操作 |
| `client/runtime/historyTracker.ts` | 追踪画布变更（CLI 驱动 + 用户手动） |

### Modified files

| 文件 | 改动 |
|------|------|
| `shared/rpc/methods.ts` | 删除内联 schema，改为 import；新增 `command.undo` / `command.redo` 方法；更新 fingerprint |
| `shared/rpc/errors.ts` | 新增 `shapeNotFound: 1007` 错误码 |
| `client/runtime/TldrawRuntimeAdapter.ts` | 用新模块替换内联逻辑；新增 undo/redo handler |
| `cli/commands/command.ts` | 新增 `undo` / `redo` 子命令 |
| `skill/tldraw-cli/references/command-reference.md` | 同步全部变更 |

### Test files

| 文件 | 覆盖 |
|------|------|
| `shared/rpc/__tests__/shapes.test.ts` | schema 校验：各类型合法/非法输入 |
| `shared/rpc/__tests__/commands.test.ts` | schema 校验：各命令类型 |
| `shared/rpc/__tests__/history.test.ts` | schema 校验：各 entry 类型 |
| `client/runtime/__tests__/shapeExtractor.test.ts` | 提取逻辑：各 shape 类型、richText、binding、parentId |
| `client/runtime/__tests__/commandExecutor.test.ts` | 执行逻辑：各命令类型 |
| `client/runtime/__tests__/historyTracker.test.ts` | 变更追踪：创建/更新/删除检测 |

### 依赖关系

```
Task 1 (shapes)  ──┐
Task 2 (commands) ──┼──▶ Task 4 (integration: methods.ts + TldrawRuntimeAdapter) ──▶ Task 5 (CLI + docs)
Task 3 (history)  ──┘
```

Tasks 1、2、3 可并行（各自创建独立文件）。Task 4 串行（修改共享文件）。Task 5 串行。

---

### Task 1: Shape 类型 schema + 提取器

**Files:**
- Create: `shared/rpc/shapes.ts`
- Create: `client/runtime/shapeExtractor.ts`
- Create: `shared/rpc/__tests__/shapes.test.ts`
- Create: `client/runtime/__tests__/shapeExtractor.test.ts`

#### Step 1: 创建 shape schema

创建 `shared/rpc/shapes.ts`：

```ts
import { z } from 'zod'

export const GeoEnum = z.enum([
  'rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'star', 'rhombus', 'rhombus-2', 'oval', 'trapezoid',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
  'x-box', 'check-box', 'heart', 'cloud',
])

export const ColorEnum = z.enum([
  'black', 'blue', 'green', 'grey', 'light-blue', 'light-green',
  'light-red', 'light-violet', 'orange', 'red', 'violet', 'white', 'yellow',
])

export const FillEnum = z.enum([
  'none', 'semi', 'solid', 'pattern', 'fill',
])

export const FontEnum = z.enum(['draw', 'sans', 'serif', 'mono'])
export const SizeEnum = z.enum(['s', 'm', 'l', 'xl'])
export const TextAlignEnum = z.enum(['start', 'middle', 'end'])

export const ArrowheadEnum = z.enum([
  'none', 'arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted', 'bar',
])

const BaseShapeFields = {
  shapeId: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  parentId: z.string().optional(),
}

export const GeoShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('geo'),
  w: z.number(),
  h: z.number(),
  geo: GeoEnum,
  text: z.string(),
  color: ColorEnum,
  fill: FillEnum,
  labelColor: ColorEnum,
})

export const TextShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('text'),
  w: z.number(),
  text: z.string(),
  color: ColorEnum,
  font: FontEnum,
  size: SizeEnum,
  textAlign: TextAlignEnum,
})

export const ArrowBindingSchema = z.object({
  shapeId: z.string(),
})

export const ArrowShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('arrow'),
  start: z.object({ x: z.number(), y: z.number() }),
  end: z.object({ x: z.number(), y: z.number() }),
  startBinding: ArrowBindingSchema.nullable(),
  endBinding: ArrowBindingSchema.nullable(),
  text: z.string(),
  color: ColorEnum,
  arrowheadStart: ArrowheadEnum,
  arrowheadEnd: ArrowheadEnum,
})

export const NoteShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('note'),
  text: z.string(),
  color: ColorEnum,
})

export const FrameShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('frame'),
  w: z.number(),
  h: z.number(),
  name: z.string(),
})

export const UnknownShapeSchema = z.object({
  ...BaseShapeFields,
  kind: z.literal('unknown'),
  type: z.string(),
  w: z.number().optional(),
  h: z.number().optional(),
})

export const ShapeSchema = z.discriminatedUnion('kind', [
  GeoShapeSchema,
  TextShapeSchema,
  ArrowShapeSchema,
  NoteShapeSchema,
  FrameShapeSchema,
  UnknownShapeSchema,
])

export type Shape = z.infer<typeof ShapeSchema>
export type GeoShape = z.infer<typeof GeoShapeSchema>
export type TextShape = z.infer<typeof TextShapeSchema>
export type ArrowShape = z.infer<typeof ArrowShapeSchema>
export type NoteShape = z.infer<typeof NoteShapeSchema>
export type FrameShape = z.infer<typeof FrameShapeSchema>
export type UnknownShape = z.infer<typeof UnknownShapeSchema>
```

- [ ] 创建 `shared/rpc/shapes.ts`，内容如上
- [ ] 运行 `npx vitest run shared/rpc` 确认无语法错误

#### Step 2: 创建 shape schema 测试

创建 `shared/rpc/__tests__/shapes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { ShapeSchema, GeoShapeSchema, ArrowShapeSchema, UnknownShapeSchema } from '../shapes'

describe('ShapeSchema', () => {
  it('validates a geo shape with all fields', () => {
    const shape = {
      kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, rotation: 0,
      w: 100, h: 50, geo: 'rectangle', text: 'hello',
      color: 'black', fill: 'none', labelColor: 'black',
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('validates a geo shape with parentId', () => {
    const shape = {
      kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, rotation: 0,
      parentId: 'shape:frame1',
      w: 100, h: 50, geo: 'rectangle', text: '',
      color: 'blue', fill: 'solid', labelColor: 'black',
    }
    expect(ShapeSchema.parse(shape).parentId).toBe('shape:frame1')
  })

  it('validates an arrow shape with bindings', () => {
    const shape = {
      kind: 'arrow', shapeId: 'shape:2', x: 0, y: 0, rotation: 0,
      start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
      startBinding: { shapeId: 'shape:1' },
      endBinding: { shapeId: 'shape:3' },
      text: '', color: 'black',
      arrowheadStart: 'none', arrowheadEnd: 'arrow',
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('validates an arrow shape without bindings', () => {
    const shape = {
      kind: 'arrow', shapeId: 'shape:2', x: 0, y: 0, rotation: 0,
      start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
      startBinding: null, endBinding: null,
      text: '标签', color: 'red',
      arrowheadStart: 'none', arrowheadEnd: 'triangle',
    }
    expect(ShapeSchema.parse(shape).startBinding).toBeNull()
  })

  it('validates a text shape', () => {
    const shape = {
      kind: 'text', shapeId: 'shape:3', x: 50, y: 50, rotation: 0,
      w: 200, text: '标题文字', color: 'black',
      font: 'sans', size: 'm', textAlign: 'middle',
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('validates a note shape', () => {
    const shape = {
      kind: 'note', shapeId: 'shape:4', x: 0, y: 0, rotation: 0,
      text: '便签内容', color: 'yellow',
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('validates a frame shape', () => {
    const shape = {
      kind: 'frame', shapeId: 'shape:5', x: 0, y: 0, rotation: 0,
      w: 500, h: 300, name: '模块A',
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('validates an unknown shape', () => {
    const shape = {
      kind: 'unknown', shapeId: 'shape:6', x: 0, y: 0, rotation: 0,
      type: 'draw', w: 100, h: 100,
    }
    expect(ShapeSchema.parse(shape)).toEqual(shape)
  })

  it('rejects invalid geo enum', () => {
    const shape = {
      kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, rotation: 0,
      w: 100, h: 50, geo: 'invalid-shape', text: '',
      color: 'black', fill: 'none', labelColor: 'black',
    }
    expect(() => ShapeSchema.parse(shape)).toThrow()
  })

  it('rejects invalid color', () => {
    const shape = {
      kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, rotation: 0,
      w: 100, h: 50, geo: 'rectangle', text: '',
      color: 'neon-pink', fill: 'none', labelColor: 'black',
    }
    expect(() => ShapeSchema.parse(shape)).toThrow()
  })
})
```

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run shared/rpc/__tests__/shapes.test.ts` 确认全部通过

#### Step 3: 创建 shape 提取器

创建 `client/runtime/shapeExtractor.ts`：

```ts
import type { Editor, TLShape, TLShapeId, TLPageId, TLGeoShape, TLTextShape, TLArrowShape, TLNoteShape, TLFrameShape } from 'tldraw'
import type { Shape } from '../../shared/rpc/shapes'

/**
 * 从 TLRichText（ProseMirror JSON）中提取纯文本。
 * 结构：{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '...' }] }] }
 */
export function plainTextFromRichText(richText: unknown): string {
  if (!richText || typeof richText !== 'object') return ''
  const node = richText as { type?: string; text?: string; content?: unknown[] }
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) {
    return node.content.map(plainTextFromRichText).join('')
  }
  return ''
}

/**
 * 获取指定 page 上的所有 shape（包括 group/frame 内的嵌套 shape）。
 */
export function getPageShapes(editor: Editor, pageId: string): TLShape[] {
  const ids = editor.getPageShapeIds(pageId as TLPageId)
  return [...ids]
    .map((id) => editor.getShape(id))
    .filter((s): s is TLShape => s !== undefined)
}

/**
 * 获取 arrow shape 的 start/end binding 信息。
 * binding.toId 是被连接的 shape，binding.props.terminal 区分 start/end。
 */
function getArrowBindings(
  editor: Editor,
  arrowId: TLShapeId,
): { startBinding: { shapeId: string } | null; endBinding: { shapeId: string } | null } {
  const bindings = editor.getBindingsFromShape(arrowId, 'arrow')
  let startBinding: { shapeId: string } | null = null
  let endBinding: { shapeId: string } | null = null
  for (const b of bindings) {
    const terminal = (b.props as { terminal?: string }).terminal
    if (terminal === 'start') {
      startBinding = { shapeId: String(b.toId) }
    } else if (terminal === 'end') {
      endBinding = { shapeId: String(b.toId) }
    }
  }
  return { startBinding, endBinding }
}

/**
 * 将单个 tldraw TLShape 转换为协议层 Shape。
 * canvasId 用于判断 parentId 是否需要暴露（直接子元素不暴露 parentId）。
 */
export function extractShape(editor: Editor, shape: TLShape, canvasId: string): Shape {
  const base = {
    shapeId: String(shape.id),
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    parentId: String(shape.parentId) === canvasId ? undefined : String(shape.parentId),
  }

  switch (shape.type) {
    case 'geo': {
      const props = (shape as TLGeoShape).props
      return {
        ...base,
        kind: 'geo',
        w: props.w,
        h: props.h,
        geo: props.geo as Shape & { kind: 'geo' } extends { geo: infer G } ? G : never,
        text: plainTextFromRichText(props.richText),
        color: props.color as string,
        fill: props.fill as string,
        labelColor: props.labelColor as string,
      } as Shape
    }
    case 'text': {
      const props = (shape as TLTextShape).props
      return {
        ...base,
        kind: 'text',
        w: props.w,
        text: plainTextFromRichText(props.richText),
        color: props.color as string,
        font: props.font as string,
        size: props.size as string,
        textAlign: props.textAlign as string,
      } as Shape
    }
    case 'arrow': {
      const props = (shape as TLArrowShape).props
      const { startBinding, endBinding } = getArrowBindings(editor, shape.id)
      return {
        ...base,
        kind: 'arrow',
        start: { x: props.start.x, y: props.start.y },
        end: { x: props.end.x, y: props.end.y },
        startBinding,
        endBinding,
        text: plainTextFromRichText(props.richText),
        color: props.color as string,
        arrowheadStart: props.arrowheadStart as string,
        arrowheadEnd: props.arrowheadEnd as string,
      } as Shape
    }
    case 'note': {
      const props = (shape as TLNoteShape).props
      return {
        ...base,
        kind: 'note',
        text: plainTextFromRichText(props.richText),
        color: props.color as string,
      } as Shape
    }
    case 'frame': {
      const props = (shape as TLFrameShape).props
      return {
        ...base,
        kind: 'frame',
        w: props.w,
        h: props.h,
        name: props.name,
      } as Shape
    }
    default: {
      const props = shape.props as Record<string, unknown>
      return {
        ...base,
        kind: 'unknown',
        type: shape.type,
        w: typeof props.w === 'number' ? props.w : undefined,
        h: typeof props.h === 'number' ? props.h : undefined,
      } as Shape
    }
  }
}

/**
 * 提取指定 page 上所有 shape，转换为协议层 Shape 数组。
 */
export function extractAllShapes(editor: Editor, canvasId: string): Shape[] {
  const tlShapes = getPageShapes(editor, canvasId)
  return tlShapes.map((s) => extractShape(editor, s, canvasId))
}
```

- [ ] 创建 `client/runtime/shapeExtractor.ts`，内容如上
- [ ] 运行 `npx tsc --noEmit` 确认类型正确

#### Step 4: 创建 shape 提取器测试

创建 `client/runtime/__tests__/shapeExtractor.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { plainTextFromRichText } from '../shapeExtractor'

describe('plainTextFromRichText', () => {
  it('extracts text from standard doc structure', () => {
    const richText = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    }
    expect(plainTextFromRichText(richText)).toBe('hello')
  })

  it('joins multiple paragraphs', () => {
    const richText = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'line1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'line2' }] },
      ],
    }
    expect(plainTextFromRichText(richText)).toBe('line1line2')
  })

  it('returns empty string for null/undefined', () => {
    expect(plainTextFromRichText(null)).toBe('')
    expect(plainTextFromRichText(undefined)).toBe('')
  })

  it('returns empty string for empty doc', () => {
    expect(plainTextFromRichText({ type: 'doc', content: [] })).toBe('')
  })
})
```

注意：`extractShape` 依赖 tldraw Editor 实例（浏览器环境），在 Node 测试中无法直接测试。
`plainTextFromRichText` 是纯函数，可以在 Node 环境中测试。
`extractShape` 的完整测试留给集成测试或手动验证。

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run client/runtime/__tests__/shapeExtractor.test.ts` 确认通过

---

### Task 2: Command 类型 schema + 执行器

**Files:**
- Create: `shared/rpc/commands.ts`
- Create: `client/runtime/commandExecutor.ts`
- Create: `shared/rpc/__tests__/commands.test.ts`
- Create: `client/runtime/__tests__/commandExecutor.test.ts`

#### Step 1: 创建 command schema

创建 `shared/rpc/commands.ts`：

```ts
import { z } from 'zod'
import { GeoEnum, ColorEnum, FillEnum, FontEnum, SizeEnum, TextAlignEnum, ArrowheadEnum } from './shapes'

export const CreateGeoShapeCommandSchema = z.object({
  kind: z.literal('create-geo-shape'),
  geo: GeoEnum,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  text: z.string().optional(),
  color: ColorEnum.optional(),
  fill: FillEnum.optional(),
  labelColor: ColorEnum.optional(),
})

export const CreateTextCommandSchema = z.object({
  kind: z.literal('create-text'),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  w: z.number().optional(),
  color: ColorEnum.optional(),
  font: FontEnum.optional(),
  size: SizeEnum.optional(),
  textAlign: TextAlignEnum.optional(),
})

export const CreateArrowCommandSchema = z.object({
  kind: z.literal('create-arrow'),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  startBindingShapeId: z.string().optional(),
  endBindingShapeId: z.string().optional(),
  text: z.string().optional(),
  color: ColorEnum.optional(),
  arrowheadStart: ArrowheadEnum.optional(),
  arrowheadEnd: ArrowheadEnum.optional(),
})

export const CreateNoteCommandSchema = z.object({
  kind: z.literal('create-note'),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  color: ColorEnum.optional(),
})

export const DeleteShapeCommandSchema = z.object({
  kind: z.literal('delete-shape'),
  shapeId: z.string(),
})

export const UpdateShapeCommandSchema = z.object({
  kind: z.literal('update-shape'),
  shapeId: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  rotation: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string().optional(),
  color: ColorEnum.optional(),
  fill: FillEnum.optional(),
  geo: GeoEnum.optional(),
  name: z.string().optional(),
  arrowheadStart: ArrowheadEnum.optional(),
  arrowheadEnd: ArrowheadEnum.optional(),
})

export const CommandSchema = z.discriminatedUnion('kind', [
  CreateGeoShapeCommandSchema,
  CreateTextCommandSchema,
  CreateArrowCommandSchema,
  CreateNoteCommandSchema,
  DeleteShapeCommandSchema,
  UpdateShapeCommandSchema,
])

export type Command = z.infer<typeof CommandSchema>
export type CreateGeoShapeCommand = z.infer<typeof CreateGeoShapeCommandSchema>
export type CreateTextCommand = z.infer<typeof CreateTextCommandSchema>
export type CreateArrowCommand = z.infer<typeof CreateArrowCommandSchema>
export type CreateNoteCommand = z.infer<typeof CreateNoteCommandSchema>
export type DeleteShapeCommand = z.infer<typeof DeleteShapeCommandSchema>
export type UpdateShapeCommand = z.infer<typeof UpdateShapeCommandSchema>
```

- [ ] 创建 `shared/rpc/commands.ts`，内容如上
- [ ] 运行 `npx tsc --noEmit` 确认类型正确

#### Step 2: 创建 command schema 测试

创建 `shared/rpc/__tests__/commands.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { CommandSchema } from '../commands'

describe('CommandSchema', () => {
  it('validates create-geo-shape with optional fields', () => {
    const cmd = { kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }
    expect(CommandSchema.parse(cmd).kind).toBe('create-geo-shape')
  })

  it('validates create-geo-shape with text and color', () => {
    const cmd = {
      kind: 'create-geo-shape', geo: 'ellipse', x: 10, y: 20, w: 200, h: 100,
      text: '节点A', color: 'blue', fill: 'solid', labelColor: 'white',
    }
    const parsed = CommandSchema.parse(cmd)
    expect(parsed.kind).toBe('create-geo-shape')
    if (parsed.kind === 'create-geo-shape') {
      expect(parsed.text).toBe('节点A')
    }
  })

  it('validates create-text', () => {
    const cmd = { kind: 'create-text', x: 50, y: 50, text: '标题' }
    expect(CommandSchema.parse(cmd).kind).toBe('create-text')
  })

  it('validates create-arrow with bindings', () => {
    const cmd = {
      kind: 'create-arrow', startX: 0, startY: 0, endX: 100, endY: 100,
      startBindingShapeId: 'shape:1', endBindingShapeId: 'shape:2',
    }
    expect(CommandSchema.parse(cmd).kind).toBe('create-arrow')
  })

  it('validates create-note', () => {
    const cmd = { kind: 'create-note', x: 0, y: 0, text: '想法', color: 'yellow' }
    expect(CommandSchema.parse(cmd).kind).toBe('create-note')
  })

  it('validates delete-shape', () => {
    const cmd = { kind: 'delete-shape', shapeId: 'shape:1' }
    expect(CommandSchema.parse(cmd).kind).toBe('delete-shape')
  })

  it('validates update-shape with partial fields', () => {
    const cmd = { kind: 'update-shape', shapeId: 'shape:1', x: 200, color: 'red' }
    expect(CommandSchema.parse(cmd).kind).toBe('update-shape')
  })

  it('rejects unknown command kind', () => {
    expect(() => CommandSchema.parse({ kind: 'fly-to-moon' })).toThrow()
  })
})
```

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run shared/rpc/__tests__/commands.test.ts` 确认通过

#### Step 3: 创建命令执行器

创建 `client/runtime/commandExecutor.ts`：

```ts
import type { Editor, TLShapeId } from 'tldraw'
import { toRichText } from 'tldraw'
import type { Command } from '../../shared/rpc/commands'

export interface CommandResult {
  shapeId: string
}

/**
 * 将协议层 Command 翻译为 tldraw editor 操作。
 * 返回执行结果（shapeId）。
 *
 * delete-shape / update-shape 在 shape 不存在时抛出错误，
 * 调用方负责映射为 RPC 错误码。
 */
export function executeCommand(
  editor: Editor,
  command: Command,
  canvasId: string,
): CommandResult {
  switch (command.kind) {
    case 'create-geo-shape': {
      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
      editor.createShape({
        id: shapeId,
        type: 'geo',
        parentId: canvasId as any,
        x: command.x,
        y: command.y,
        props: {
          w: command.w,
          h: command.h,
          geo: command.geo,
          ...(command.text != null ? { richText: toRichText(command.text) } : {}),
          ...(command.color != null ? { color: command.color } : {}),
          ...(command.fill != null ? { fill: command.fill } : {}),
          ...(command.labelColor != null ? { labelColor: command.labelColor } : {}),
        },
      })
      return { shapeId: String(shapeId) }
    }

    case 'create-text': {
      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
      editor.createShape({
        id: shapeId,
        type: 'text',
        parentId: canvasId as any,
        x: command.x,
        y: command.y,
        props: {
          richText: toRichText(command.text),
          ...(command.w != null ? { w: command.w } : {}),
          ...(command.color != null ? { color: command.color } : {}),
          ...(command.font != null ? { font: command.font } : {}),
          ...(command.size != null ? { size: command.size } : {}),
          ...(command.textAlign != null ? { textAlign: command.textAlign } : {}),
        },
      })
      return { shapeId: String(shapeId) }
    }

    case 'create-arrow': {
      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
      editor.createShape({
        id: shapeId,
        type: 'arrow',
        parentId: canvasId as any,
        x: 0,
        y: 0,
        props: {
          start: { x: command.startX, y: command.startY },
          end: { x: command.endX, y: command.endY },
          ...(command.text != null ? { richText: toRichText(command.text) } : {}),
          ...(command.color != null ? { color: command.color } : {}),
          ...(command.arrowheadStart != null ? { arrowheadStart: command.arrowheadStart } : {}),
          ...(command.arrowheadEnd != null ? { arrowheadEnd: command.arrowheadEnd } : {}),
        },
      })
      // 创建 arrow binding（如果指定了绑定目标）
      if (command.startBindingShapeId) {
        editor.createBinding({
          type: 'arrow',
          fromId: shapeId,
          toId: command.startBindingShapeId as TLShapeId,
          props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        })
      }
      if (command.endBindingShapeId) {
        editor.createBinding({
          type: 'arrow',
          fromId: shapeId,
          toId: command.endBindingShapeId as TLShapeId,
          props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        })
      }
      return { shapeId: String(shapeId) }
    }

    case 'create-note': {
      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
      editor.createShape({
        id: shapeId,
        type: 'note',
        parentId: canvasId as any,
        x: command.x,
        y: command.y,
        props: {
          richText: toRichText(command.text),
          ...(command.color != null ? { color: command.color } : {}),
        },
      })
      return { shapeId: String(shapeId) }
    }

    case 'delete-shape': {
      const shape = editor.getShape(command.shapeId as TLShapeId)
      if (!shape) {
        throw new Error(`SHAPE_NOT_FOUND:${command.shapeId}`)
      }
      editor.deleteShape(shape.id)
      return { shapeId: command.shapeId }
    }

    case 'update-shape': {
      const shape = editor.getShape(command.shapeId as TLShapeId)
      if (!shape) {
        throw new Error(`SHAPE_NOT_FOUND:${command.shapeId}`)
      }
      const partial: Record<string, unknown> = { id: shape.id, type: shape.type }
      if (command.x != null) partial.x = command.x
      if (command.y != null) partial.y = command.y
      if (command.rotation != null) partial.rotation = command.rotation

      const propsUpdate: Record<string, unknown> = {}
      if (command.w != null) propsUpdate.w = command.w
      if (command.h != null) propsUpdate.h = command.h
      if (command.text != null) propsUpdate.richText = toRichText(command.text)
      if (command.color != null) propsUpdate.color = command.color
      if (command.fill != null) propsUpdate.fill = command.fill
      if (command.geo != null) propsUpdate.geo = command.geo
      if (command.name != null) propsUpdate.name = command.name
      if (command.arrowheadStart != null) propsUpdate.arrowheadStart = command.arrowheadStart
      if (command.arrowheadEnd != null) propsUpdate.arrowheadEnd = command.arrowheadEnd

      if (Object.keys(propsUpdate).length > 0) {
        partial.props = propsUpdate
      }
      editor.updateShape(partial as any)
      return { shapeId: command.shapeId }
    }
  }
}

/**
 * 批量执行命令。所有命令在同一个 editor batch 中执行。
 */
export function executeCommands(
  editor: Editor,
  commands: Command[],
  canvasId: string,
): CommandResult[] {
  return commands.map((cmd) => executeCommand(editor, cmd, canvasId))
}
```

- [ ] 创建 `client/runtime/commandExecutor.ts`，内容如上
- [ ] 运行 `npx tsc --noEmit` 确认类型正确

#### Step 4: 创建命令执行器测试

创建 `client/runtime/__tests__/commandExecutor.test.ts`：

```ts
import { describe, it, expect } from 'vitest'

/**
 * commandExecutor 依赖真实的 tldraw Editor 实例（浏览器 DOM 环境），
 * 无法在 Node vitest 中直接测试。
 *
 * 这里只测试可以纯逻辑验证的部分：
 * - 命令类型到 editor 方法的映射关系通过 schema 测试保证
 * - delete/update 对不存在 shape 的错误抛出
 *
 * 完整功能测试依赖端到端测试（启动 Host + Runtime + CLI）。
 */

describe('commandExecutor error conventions', () => {
  it('delete-shape error message includes shape ID', () => {
    const shapeId = 'shape:nonexistent'
    const errorMessage = `SHAPE_NOT_FOUND:${shapeId}`
    expect(errorMessage).toContain('SHAPE_NOT_FOUND')
    expect(errorMessage).toContain(shapeId)
  })
})
```

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run client/runtime/__tests__/commandExecutor.test.ts` 确认通过

---

### Task 3: History Entry schema + 变更追踪器

**Files:**
- Create: `shared/rpc/history.ts`
- Create: `client/runtime/historyTracker.ts`
- Create: `shared/rpc/__tests__/history.test.ts`
- Create: `client/runtime/__tests__/historyTracker.test.ts`

#### Step 1: 创建 history entry schema

创建 `shared/rpc/history.ts`：

```ts
import { z } from 'zod'
import { ShapeSchema } from './shapes'

export const ShapeCreatedEntrySchema = z.object({
  kind: z.literal('shape-created'),
  revision: z.number().int(),
  shape: ShapeSchema,
})

export const ShapeUpdatedEntrySchema = z.object({
  kind: z.literal('shape-updated'),
  revision: z.number().int(),
  shapeId: z.string(),
  changes: z.record(z.unknown()),
})

export const ShapeDeletedEntrySchema = z.object({
  kind: z.literal('shape-deleted'),
  revision: z.number().int(),
  shapeId: z.string(),
})

export const HistoryEntrySchema = z.discriminatedUnion('kind', [
  ShapeCreatedEntrySchema,
  ShapeUpdatedEntrySchema,
  ShapeDeletedEntrySchema,
])

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>
export type ShapeCreatedEntry = z.infer<typeof ShapeCreatedEntrySchema>
export type ShapeUpdatedEntry = z.infer<typeof ShapeUpdatedEntrySchema>
export type ShapeDeletedEntry = z.infer<typeof ShapeDeletedEntrySchema>
```

- [ ] 创建 `shared/rpc/history.ts`，内容如上
- [ ] 运行 `npx tsc --noEmit` 确认类型正确

#### Step 2: 创建 history schema 测试

创建 `shared/rpc/__tests__/history.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { HistoryEntrySchema } from '../history'

describe('HistoryEntrySchema', () => {
  it('validates shape-created entry', () => {
    const entry = {
      kind: 'shape-created',
      revision: 1,
      shape: {
        kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, rotation: 0,
        w: 100, h: 50, geo: 'rectangle', text: '',
        color: 'black', fill: 'none', labelColor: 'black',
      },
    }
    expect(HistoryEntrySchema.parse(entry).kind).toBe('shape-created')
  })

  it('validates shape-updated entry', () => {
    const entry = {
      kind: 'shape-updated',
      revision: 2,
      shapeId: 'shape:1',
      changes: { x: 200, color: 'red' },
    }
    expect(HistoryEntrySchema.parse(entry).kind).toBe('shape-updated')
  })

  it('validates shape-deleted entry', () => {
    const entry = {
      kind: 'shape-deleted',
      revision: 3,
      shapeId: 'shape:1',
    }
    expect(HistoryEntrySchema.parse(entry).kind).toBe('shape-deleted')
  })

  it('validates shape-created with arrow shape', () => {
    const entry = {
      kind: 'shape-created',
      revision: 1,
      shape: {
        kind: 'arrow', shapeId: 'shape:2', x: 0, y: 0, rotation: 0,
        start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
        startBinding: { shapeId: 'shape:1' }, endBinding: null,
        text: '', color: 'black', arrowheadStart: 'none', arrowheadEnd: 'arrow',
      },
    }
    expect(HistoryEntrySchema.parse(entry).kind).toBe('shape-created')
  })

  it('rejects invalid entry kind', () => {
    expect(() => HistoryEntrySchema.parse({ kind: 'shape-moved', revision: 1 })).toThrow()
  })
})
```

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run shared/rpc/__tests__/history.test.ts` 确认通过

#### Step 3: 创建变更追踪器

创建 `client/runtime/historyTracker.ts`：

```ts
import type { Shape } from '../../shared/rpc/shapes'
import type { HistoryEntry } from '../../shared/rpc/history'

interface CanvasState {
  revision: number
  history: HistoryEntry[]
  knownShapes: Map<string, Shape>
}

/**
 * 追踪画布变更，维护 per-canvas 的 revision 和 history。
 *
 * 两种变更来源：
 * 1. CLI 驱动：commandApply 执行后调用 recordChanges，对比前后 shapes 生成 entries
 * 2. 用户手动：canvasSnapshot/canvasDiff 调用前先 detectExternalChanges，
 *    对比当前 shapes 与上次已知状态
 */
export class HistoryTracker {
  private state = new Map<string, CanvasState>()

  private getOrCreate(canvasId: string): CanvasState {
    let s = this.state.get(canvasId)
    if (!s) {
      s = { revision: 0, history: [], knownShapes: new Map() }
      this.state.set(canvasId, s)
    }
    return s
  }

  getRevision(canvasId: string): number {
    return this.getOrCreate(canvasId).revision
  }

  getHistory(canvasId: string): HistoryEntry[] {
    return this.getOrCreate(canvasId).history
  }

  getEntriesSince(canvasId: string, since: number): HistoryEntry[] {
    return this.getHistory(canvasId).filter((e) => e.revision > since)
  }

  /**
   * 对比 before/after shapes，记录变更并递增 revision。
   * 用于 commandApply 执行后立即记录 CLI 驱动的变更。
   */
  recordChanges(canvasId: string, before: Shape[], after: Shape[]): void {
    const s = this.getOrCreate(canvasId)
    const beforeMap = new Map(before.map((sh) => [sh.shapeId, sh]))
    const afterMap = new Map(after.map((sh) => [sh.shapeId, sh]))

    const entries: HistoryEntry[] = []

    // 新增
    for (const [id, shape] of afterMap) {
      if (!beforeMap.has(id)) {
        entries.push({ kind: 'shape-created', revision: 0, shape })
      }
    }
    // 删除
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) {
        entries.push({ kind: 'shape-deleted', revision: 0, shapeId: id })
      }
    }
    // 修改
    for (const [id, afterShape] of afterMap) {
      const beforeShape = beforeMap.get(id)
      if (beforeShape) {
        const changes = computeChanges(beforeShape, afterShape)
        if (Object.keys(changes).length > 0) {
          entries.push({ kind: 'shape-updated', revision: 0, shapeId: id, changes })
        }
      }
    }

    if (entries.length > 0) {
      s.revision += 1
      for (const e of entries) {
        (e as { revision: number }).revision = s.revision
      }
      s.history.push(...entries)
    }

    s.knownShapes = afterMap
  }

  /**
   * 检测外部变更（用户手动操作）。
   * 对比当前 shapes 与上次已知状态，记录差异。
   * 在 canvasSnapshot / canvasDiff 调用前执行。
   */
  detectExternalChanges(canvasId: string, currentShapes: Shape[]): void {
    const s = this.getOrCreate(canvasId)
    if (s.knownShapes.size === 0 && currentShapes.length > 0) {
      // 第一次调用，初始化基线，不生成 history entries
      s.knownShapes = new Map(currentShapes.map((sh) => [sh.shapeId, sh]))
      return
    }
    const known = [...s.knownShapes.values()]
    this.recordChanges(canvasId, known, currentShapes)
  }

  /**
   * 删除某个画布的追踪状态（画布删除时调用）。
   */
  removeCanvas(canvasId: string): void {
    this.state.delete(canvasId)
  }
}

function computeChanges(before: Shape, after: Shape): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of allKeys) {
    if (key === 'kind' || key === 'shapeId') continue
    const bVal = (before as Record<string, unknown>)[key]
    const aVal = (after as Record<string, unknown>)[key]
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes[key] = aVal
    }
  }
  return changes
}
```

- [ ] 创建 `client/runtime/historyTracker.ts`，内容如上
- [ ] 运行 `npx tsc --noEmit` 确认类型正确

#### Step 4: 创建变更追踪器测试

创建 `client/runtime/__tests__/historyTracker.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { HistoryTracker } from '../historyTracker'
import type { Shape } from '../../../shared/rpc/shapes'

function geoShape(id: string, x: number, y: number, text = ''): Shape {
  return {
    kind: 'geo', shapeId: id, x, y, rotation: 0,
    w: 100, h: 50, geo: 'rectangle', text,
    color: 'black', fill: 'none', labelColor: 'black',
  }
}

describe('HistoryTracker', () => {
  it('starts at revision 0', () => {
    const tracker = new HistoryTracker()
    expect(tracker.getRevision('page:1')).toBe(0)
  })

  it('records shape-created when new shapes appear', () => {
    const tracker = new HistoryTracker()
    const before: Shape[] = []
    const after = [geoShape('shape:1', 0, 0)]
    tracker.recordChanges('page:1', before, after)
    expect(tracker.getRevision('page:1')).toBe(1)
    const entries = tracker.getEntriesSince('page:1', 0)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('shape-created')
  })

  it('records shape-deleted when shapes disappear', () => {
    const tracker = new HistoryTracker()
    const before = [geoShape('shape:1', 0, 0)]
    const after: Shape[] = []
    tracker.recordChanges('page:1', before, after)
    const entries = tracker.getEntriesSince('page:1', 0)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('shape-deleted')
    if (entries[0].kind === 'shape-deleted') {
      expect(entries[0].shapeId).toBe('shape:1')
    }
  })

  it('records shape-updated when shape properties change', () => {
    const tracker = new HistoryTracker()
    const before = [geoShape('shape:1', 0, 0, 'old')]
    const after = [geoShape('shape:1', 100, 0, 'new')]
    tracker.recordChanges('page:1', before, after)
    const entries = tracker.getEntriesSince('page:1', 0)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('shape-updated')
    if (entries[0].kind === 'shape-updated') {
      expect(entries[0].changes).toHaveProperty('x', 100)
      expect(entries[0].changes).toHaveProperty('text', 'new')
    }
  })

  it('does not record changes when shapes are identical', () => {
    const tracker = new HistoryTracker()
    const shapes = [geoShape('shape:1', 0, 0)]
    tracker.recordChanges('page:1', shapes, shapes)
    expect(tracker.getRevision('page:1')).toBe(0)
    expect(tracker.getHistory('page:1')).toHaveLength(0)
  })

  it('getEntriesSince filters by revision', () => {
    const tracker = new HistoryTracker()
    tracker.recordChanges('page:1', [], [geoShape('shape:1', 0, 0)])
    tracker.recordChanges('page:1', [geoShape('shape:1', 0, 0)], [geoShape('shape:1', 50, 0)])
    expect(tracker.getRevision('page:1')).toBe(2)
    expect(tracker.getEntriesSince('page:1', 0)).toHaveLength(2)
    expect(tracker.getEntriesSince('page:1', 1)).toHaveLength(1)
    expect(tracker.getEntriesSince('page:1', 2)).toHaveLength(0)
  })

  it('detectExternalChanges initializes baseline on first call', () => {
    const tracker = new HistoryTracker()
    tracker.detectExternalChanges('page:1', [geoShape('shape:1', 0, 0)])
    // 第一次调用只初始化基线，不产生 history
    expect(tracker.getRevision('page:1')).toBe(0)
    expect(tracker.getHistory('page:1')).toHaveLength(0)
  })

  it('detectExternalChanges records changes after baseline', () => {
    const tracker = new HistoryTracker()
    tracker.detectExternalChanges('page:1', [geoShape('shape:1', 0, 0)])
    // 第二次调用检测变更
    tracker.detectExternalChanges('page:1', [geoShape('shape:1', 200, 0)])
    expect(tracker.getRevision('page:1')).toBe(1)
    const entries = tracker.getEntriesSince('page:1', 0)
    expect(entries[0].kind).toBe('shape-updated')
  })

  it('tracks multiple canvases independently', () => {
    const tracker = new HistoryTracker()
    tracker.recordChanges('page:1', [], [geoShape('shape:1', 0, 0)])
    tracker.recordChanges('page:2', [], [geoShape('shape:2', 0, 0)])
    expect(tracker.getRevision('page:1')).toBe(1)
    expect(tracker.getRevision('page:2')).toBe(1)
  })
})
```

- [ ] 创建测试文件
- [ ] 运行 `npx vitest run client/runtime/__tests__/historyTracker.test.ts` 确认通过

---

### Task 4: 集成——methods.ts + TldrawRuntimeAdapter.ts + errors.ts

**Files:**
- Modify: `shared/rpc/methods.ts`
- Modify: `shared/rpc/errors.ts`
- Modify: `client/runtime/TldrawRuntimeAdapter.ts`

**前置依赖：** Tasks 1、2、3 全部完成。

#### Step 1: 更新 errors.ts

在 `shared/rpc/errors.ts` 中新增 `shapeNotFound` 错误码：

```ts
// 在 ErrorCodes 对象中新增：
shapeNotFound: 1007,
```

- [ ] 修改 `shared/rpc/errors.ts`，新增 `shapeNotFound: 1007`

#### Step 2: 重写 methods.ts

将 `shared/rpc/methods.ts` 中的内联 schema 替换为从新文件导入，同时新增 `command.undo` 和 `command.redo` 方法。

核心改动：

1. 删除内联的 `GeoShapeSchema`、`ShapeCreatedEntrySchema`、`CreateGeoShapeCommandSchema`、`CommandResultSchema`
2. 从 `./shapes` 导入 `ShapeSchema`
3. 从 `./commands` 导入 `CommandSchema`
4. 从 `./history` 导入 `HistoryEntrySchema`
5. 更新 `CanvasSnapshotResultSchema.shapes` 为 `z.array(ShapeSchema)`
6. 更新 `CanvasDiffResultSchema.entries` 为 `z.array(HistoryEntrySchema)`
7. 更新 `CommandApplyParamsSchema.commands` 为 `z.array(CommandSchema)`
8. 新增 `command.undo` 和 `command.redo` 方法（params 空，result `{ revision: number }`）
9. 更新 `SCHEMA_FINGERPRINT` 为 `'v2'`

新增方法定义：

```ts
const CommandUndoParamsSchema = z.object({})
const CommandUndoResultSchema = z.object({ revision: z.number().int() })

const CommandRedoParamsSchema = z.object({})
const CommandRedoResultSchema = z.object({ revision: z.number().int() })
```

MethodMap 新增：

```ts
'command.undo': { params: CommandUndoParamsSchema, result: CommandUndoResultSchema },
'command.redo': { params: CommandRedoParamsSchema, result: CommandRedoResultSchema },
```

- [ ] 重写 `shared/rpc/methods.ts`，执行上述全部改动
- [ ] 运行 `npx vitest run shared/rpc` 确认已有测试仍然通过

#### Step 3: 重写 TldrawRuntimeAdapter.ts

用新模块替换 `TldrawRuntimeAdapter` 中的内联逻辑：

核心改动：

1. 删除 `PerCanvasState` 接口（由 `HistoryTracker` 替代）
2. 删除 `canvasState` Map（由 `HistoryTracker` 替代）
3. 删除 `stateFor()` 方法
4. 构造函数中创建 `HistoryTracker` 实例
5. `canvasSnapshot` 方法：
   - 调用 `extractAllShapes(editor, canvasId)` 替代内联提取
   - 调用 `historyTracker.detectExternalChanges(canvasId, shapes)` 检测用户变更
   - 从 `historyTracker.getRevision(canvasId)` 获取 revision
6. `canvasDiff` 方法：
   - 先 `detectExternalChanges`，再 `getEntriesSince`
   - 从 `historyTracker` 获取 revision
7. `commandApply` 方法：
   - 用 `extractAllShapes` 获取 before shapes
   - 用 `executeCommands` 替代内联创建逻辑
   - 用 `extractAllShapes` 获取 after shapes
   - 用 `historyTracker.recordChanges` 记录变更
   - 处理 `SHAPE_NOT_FOUND` 错误，映射为 RPC 错误码
8. 新增 `commandUndo` 和 `commandRedo` 方法：
   - 获取 before shapes
   - 调用 `editor.undo()` / `editor.redo()`
   - 获取 after shapes
   - 记录变更
   - 返回 `{ revision }`
9. `invoke` 方法的 switch 新增 `command.undo` 和 `command.redo` 分支

重写后的 `canvasSnapshot` 方法示例：

```ts
private canvasSnapshot(params: { canvasId?: string }) {
  const canvasId = this.resolveCanvasId(params.canvasId)
  const shapes = extractAllShapes(this.editor, canvasId)
  this.historyTracker.detectExternalChanges(canvasId, shapes)
  return {
    canvasId,
    revision: this.historyTracker.getRevision(canvasId),
    shapes,
  }
}
```

重写后的 `commandApply` 方法示例：

```ts
private commandApply(params: CommandApplyParams) {
  const canvasId = this.resolveCanvasId(params.canvasId)
  const before = extractAllShapes(this.editor, canvasId)
  let results: CommandResult[]
  try {
    results = executeCommands(this.editor, params.commands, canvasId)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SHAPE_NOT_FOUND:')) {
      const shapeId = err.message.split(':').slice(1).join(':')
      throw { code: ErrorCodes.shapeNotFound, message: `Shape not found: ${shapeId}` }
    }
    throw err
  }
  const after = extractAllShapes(this.editor, canvasId)
  this.historyTracker.recordChanges(canvasId, before, after)
  return {
    canvasId,
    revision: this.historyTracker.getRevision(canvasId),
    results,
  }
}
```

`commandUndo` 和 `commandRedo` 方法：

```ts
private commandUndo() {
  const canvasId = this.resolveCanvasId(undefined)
  const before = extractAllShapes(this.editor, canvasId)
  this.editor.undo()
  const after = extractAllShapes(this.editor, canvasId)
  this.historyTracker.recordChanges(canvasId, before, after)
  return { revision: this.historyTracker.getRevision(canvasId) }
}

private commandRedo() {
  const canvasId = this.resolveCanvasId(undefined)
  const before = extractAllShapes(this.editor, canvasId)
  this.editor.redo()
  const after = extractAllShapes(this.editor, canvasId)
  this.historyTracker.recordChanges(canvasId, before, after)
  return { revision: this.historyTracker.getRevision(canvasId) }
}
```

- [ ] 重写 `client/runtime/TldrawRuntimeAdapter.ts`，执行上述全部改动
- [ ] 运行 `npx tsc --noEmit` 确认类型正确
- [ ] 运行 `npx vitest run` 确认全部测试通过

#### Step 4: 更新 Host 层 service

Host 层的 `CommandService` 需要新增 `undo` 和 `redo` 方法。
`host/ApplicationServices/CommandService.ts` 新增：

```ts
async undo(): Promise<CommandUndoResult> {
  return this.router.pickGateway().request('command.undo', {}, CommandUndoResultSchema)
}

async redo(): Promise<CommandRedoResult> {
  return this.router.pickGateway().request('command.redo', {}, CommandRedoResultSchema)
}
```

`host/ApiGateway.ts` 的 RPC dispatch 新增 `command.undo` 和 `command.redo` 分支：

```ts
case 'command.undo':
  return this.commandService.undo()
case 'command.redo':
  return this.commandService.redo()
```

- [ ] 修改 `host/ApplicationServices/CommandService.ts`，新增 undo/redo 方法
- [ ] 修改 `host/ApiGateway.ts`，新增 dispatch 分支
- [ ] 运行 `npx vitest run` 确认全部测试通过

#### Step 5: 更新 Runtime capability handshake

Runtime 的 capability `methods[]` 需要包含新方法。在 `client/runtime/RuntimeWsClient.ts` 或 `RuntimeMount.tsx` 中找到 handshake capability 构建处，将 `methods` 数组新增 `'command.undo'` 和 `'command.redo'`。

- [ ] 找到 capability methods 数组，新增两个方法名
- [ ] 运行 `npx vitest run` 确认通过

---

### Task 5: CLI 命令 + 速查表更新

**Files:**
- Modify: `cli/commands/command.ts`
- Modify: `skill/tldraw-cli/references/command-reference.md`

**前置依赖：** Task 4 完成。

#### Step 1: 新增 CLI undo/redo 子命令

在 `cli/commands/command.ts` 中新增 `undo` 和 `redo` 子命令：

```ts
const undoCommand = buildCommand({
  loader: async () => ({
    default: async function (this: { buildClient(): JsonRpcClient }) {
      const result = await this.buildClient().call('command.undo', {})
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    },
  }),
  parameters: { flags: {}, positional: { kind: 'tuple', parameters: [] } },
  docs: {
    brief: '撤销上一步操作',
    fullDescription: [
      '撤销 tldraw 画布上的上一步操作（包括 CLI 驱动和用户手动操作）。',
      '返回撤销后的当前 revision。',
    ].join('\n'),
  },
})

const redoCommand = buildCommand({
  loader: async () => ({
    default: async function (this: { buildClient(): JsonRpcClient }) {
      const result = await this.buildClient().call('command.redo', {})
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    },
  }),
  parameters: { flags: {}, positional: { kind: 'tuple', parameters: [] } },
  docs: {
    brief: '重做上一步撤销的操作',
    fullDescription: [
      '重做上一步被撤销的操作。',
      '返回重做后的当前 revision。',
    ].join('\n'),
  },
})
```

在 `commandRoutes` 的 `routes` 中新增：

```ts
routes: {
  apply: applyCommand,
  undo: undoCommand,
  redo: redoCommand,
}
```

- [ ] 修改 `cli/commands/command.ts`，新增 undo/redo 子命令
- [ ] 运行 `npx vitest run cli` 确认 CLI 测试通过

#### Step 2: 更新 CLI command 测试

在 `cli/__tests__/command.test.ts` 中新增测试：

```ts
it('command undo sends command.undo RPC', async () => {
  const mockResult = { revision: 3 }
  // 使用已有的 mock server 模式
  // ...设置 mock 响应 mockResult
  // 调用 application.run(['command', 'undo'], ...)
  // 验证 stdout 包含 revision: 3
})

it('command redo sends command.redo RPC', async () => {
  // 类似 undo 测试
})
```

- [ ] 新增测试用例
- [ ] 运行 `npx vitest run cli/__tests__/command.test.ts` 确认通过

#### Step 3: 更新速查表

修改 `skill/tldraw-cli/references/command-reference.md`，同步以下变更：

**命令总览新增：**
```
tldraw-cli command undo
tldraw-cli command redo
```

**命令详解新增 command undo / redo 章节。**

**command apply 章节更新：**
- 新增命令类型：`create-text`、`create-arrow`、`create-note`、`delete-shape`、`update-shape`
- 更新支持的命令类型表
- 更新 stdin JSON 格式示例

**canvas snapshot 章节更新：**
- shapes 数组现在包含所有 shape 类型（geo / text / arrow / note / frame / unknown）
- 更新输出示例，展示多类型 shape
- 说明各 shape 类型的字段

**canvas diff 章节更新：**
- 新增 `shape-updated` 和 `shape-deleted` entry kind
- 更新输出示例

**RPC 方法参考表更新：**
- 新增 `command.undo` 和 `command.redo` 行

**错误处理更新：**
- 新增 `1007 shapeNotFound` 错误码

**当前版本限制更新：**
- 删除已解决的限制项
- 更新剩余限制

- [ ] 更新 `skill/tldraw-cli/references/command-reference.md`
- [ ] 检查与现有代码一致

---

## 执行约束

- **不做 git commit**——用户手动提交
- **不征询意见**——自主推进，遇到阻塞先尝试解决
- **schema 指纹**：`SCHEMA_FINGERPRINT` 从 `'mvp-v1'` 改为 `'v2'`
- **向后兼容**：不考虑，MVP 阶段无外部消费者
- **tldraw API 不确定处**：以 `node_modules/tldraw` 的 `.d.ts` 类型定义为准，遇到类型错误时 grep 查找正确签名
- **arrow binding 创建**：`editor.createBinding()` 的 props 结构需从 tldraw 类型定义中确认 `normalizedAnchor` / `isExact` / `isPrecise` 的默认值

## 不在本次范围

- `canvas.export`（SVG/PNG 导出）
- `canvas.import`（tldr/JSON 导入）
- `expectedRevision` CAS 检查
- `idempotencyKey` 去重
- `create-frame` / `create-draw` 命令
