/**
 * 从 tldraw editor 提取 protocol shape 的纯函数模块。
 *
 * 职责：把 tldraw 内部 TLShape 结构翻译为 RPC 协议层的 Shape 类型，
 * 不持有任何状态，所有函数均为纯函数（editor 参数是只读来源）。
 */
import type { Editor, TLBinding, TLPageId, TLShape, TLShapeId } from 'tldraw'
import type { Shape } from '../../shared/rpc/shapes'
import { ColorEnum, FillEnum, FontEnum, SizeEnum, TextAlignEnum, ArrowheadEnum, DashEnum, GeoEnum } from '../../shared/rpc/shapes'

// ---------- ProseMirror 富文本提取 ----------

interface PmNode {
	type: string
	text?: string
	content?: PmNode[]
}

/**
 * 递归从 ProseMirror JSON 中提取纯文本。
 * tldraw shape 的文字存储为 richText: TLRichText，结构为：
 *   { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '...' }] }] }
 *
 * 多 paragraph 用 `\n` join——与 commandExecutor 写入侧的 toMultilineRichText 对称，
 * 让 `text: "第一行\n第二行"` 写入后再读出能还原。
 */
export function plainTextFromRichText(richText: unknown): string {
	if (!richText || typeof richText !== 'object') return ''
	const node = richText as PmNode
	if (node.type === 'text' && typeof node.text === 'string') return node.text
	if (!Array.isArray(node.content)) return node.type === 'paragraph' ? '' : ''
	const sep = node.type === 'doc' ? '\n' : ''
	return node.content.map((child) => plainTextFromRichText(child)).join(sep)
}

// ---------- 枚举安全转换工具 ----------

function safeGeo(v: unknown): string {
	const r = GeoEnum.safeParse(v)
	return r.success ? r.data : 'rectangle'
}

function safeColor(v: unknown): string {
	const r = ColorEnum.safeParse(v)
	return r.success ? r.data : 'black'
}

function safeFill(v: unknown): string {
	const r = FillEnum.safeParse(v)
	return r.success ? r.data : 'none'
}

function safeFont(v: unknown): string {
	const r = FontEnum.safeParse(v)
	return r.success ? r.data : 'draw'
}

function safeSize(v: unknown): string {
	const r = SizeEnum.safeParse(v)
	return r.success ? r.data : 'm'
}

function safeTextAlign(v: unknown): string {
	const r = TextAlignEnum.safeParse(v)
	return r.success ? r.data : 'middle'
}

function safeDash(v: unknown): string {
	const r = DashEnum.safeParse(v)
	return r.success ? r.data : 'draw'
}

function safeArrowhead(v: unknown): string {
	const r = ArrowheadEnum.safeParse(v)
	return r.success ? r.data : 'none'
}

// ---------- 单个 shape 转换 ----------

/**
 * 把 tldraw TLShape 转换为协议层 Shape。
 * canvasId 用于判断顶层 shape（parentId === canvasId 时省略 parentId）。
 */
export function extractShape(editor: Editor, shape: TLShape, canvasId: string): Shape {
	const parentId =
		String(shape.parentId) === canvasId ? undefined : String(shape.parentId)

	const base = {
		shapeId: String(shape.id),
		x: shape.x,
		y: shape.y,
		rotation: shape.rotation,
		...(parentId !== undefined ? { parentId } : {}),
	}

	switch (shape.type) {
		case 'geo': {
			const p = shape.props as unknown as Record<string, unknown>
			const text = p.richText != null
				? plainTextFromRichText(p.richText)
				: typeof p.text === 'string' ? p.text : ''
			return {
				kind: 'geo',
				...base,
				w: typeof p.w === 'number' ? p.w : 0,
				h: typeof p.h === 'number' ? p.h : 0,
				geo: safeGeo(p.geo) as Shape extends { kind: 'geo' } ? never : never,
				text,
				color: safeColor(p.color) as never,
				fill: safeFill(p.fill) as never,
				labelColor: safeColor(p.labelColor) as never,
			} as Shape
		}

		case 'text': {
			const p = shape.props as unknown as Record<string, unknown>
			const text = p.richText != null
				? plainTextFromRichText(p.richText)
				: typeof p.text === 'string' ? p.text : ''
			return {
				kind: 'text',
				...base,
				w: typeof p.w === 'number' ? p.w : 0,
				text,
				color: safeColor(p.color) as never,
				font: safeFont(p.font) as never,
				size: safeSize(p.size) as never,
				textAlign: safeTextAlign(p.textAlign) as never,
			} as Shape
		}

		case 'arrow': {
			const p = shape.props as unknown as Record<string, unknown>
			const text = p.richText != null
				? plainTextFromRichText(p.richText)
				: typeof p.text === 'string' ? p.text : ''

			// 通过 editor.getBindingsFromShape 获取箭头两端绑定
			const bindings: TLBinding[] = editor.getBindingsFromShape(shape as TLShape, 'arrow')
			let startBinding: { shapeId: string } | null = null
			let endBinding: { shapeId: string } | null = null
			for (const b of bindings) {
				const terminal = (b.props as unknown as Record<string, unknown>)?.terminal
				if (terminal === 'start') startBinding = { shapeId: String(b.toId) }
				else if (terminal === 'end') endBinding = { shapeId: String(b.toId) }
			}

			const startPoint = p.start as Record<string, unknown> | undefined
			const endPoint = p.end as Record<string, unknown> | undefined

			const fillResult = FillEnum.safeParse(p.fill)
			return {
				kind: 'arrow',
				...base,
				start: { x: Number(startPoint?.x ?? 0), y: Number(startPoint?.y ?? 0) },
				end: { x: Number(endPoint?.x ?? 0), y: Number(endPoint?.y ?? 0) },
				startBinding,
				endBinding,
				text,
				color: safeColor(p.color) as never,
				...(fillResult.success ? { fill: fillResult.data } : {}),
				arrowheadStart: safeArrowhead(p.arrowheadStart) as never,
				arrowheadEnd: safeArrowhead(p.arrowheadEnd) as never,
				dash: safeDash(p.dash) as never,
				bend: typeof p.bend === 'number' ? p.bend : 0,
			} as Shape
		}

		case 'note': {
			const p = shape.props as unknown as Record<string, unknown>
			const text = p.richText != null
				? plainTextFromRichText(p.richText)
				: typeof p.text === 'string' ? p.text : ''
			return {
				kind: 'note',
				...base,
				text,
				color: safeColor(p.color) as never,
			} as Shape
		}

		case 'frame': {
			const p = shape.props as unknown as Record<string, unknown>
			return {
				kind: 'frame',
				...base,
				w: typeof p.w === 'number' ? p.w : 0,
				h: typeof p.h === 'number' ? p.h : 0,
				name: typeof p.name === 'string' ? p.name : '',
			} as Shape
		}

		default: {
			const p = shape.props as Record<string, unknown>
			return {
				kind: 'unknown',
				...base,
				type: shape.type,
				...(typeof p.w === 'number' ? { w: p.w } : {}),
				...(typeof p.h === 'number' ? { h: p.h } : {}),
			} as Shape
		}
	}
}

// ---------- 页面级批量提取 ----------

/**
 * 获取指定 page 的所有 shape（含嵌套在 frame 内的）。
 * 使用 editor.getPageShapeIds 获取完整集合，不用 parentId 过滤。
 */
export function getPageShapes(editor: Editor, pageId: string): TLShape[] {
	const ids = editor.getPageShapeIds(pageId as TLPageId)
	const shapes: TLShape[] = []
	for (const id of ids) {
		const s = editor.getShape(id as TLShapeId)
		if (s) shapes.push(s)
	}
	return shapes
}

/**
 * 提取指定画布中所有 shape 并转为协议层 Shape 数组。
 */
export function extractAllShapes(editor: Editor, canvasId: string): Shape[] {
	const shapes = getPageShapes(editor, canvasId)
	return shapes.map((s) => extractShape(editor, s, canvasId))
}
