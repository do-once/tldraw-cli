/**
 * 将 protocol Command 翻译为 tldraw editor 操作。
 *
 * 每种命令对应一套 editor API 调用：
 *   create-geo-shape → editor.createShape({ type: 'geo', ... })
 *   create-text      → editor.createShape({ type: 'text', ... })
 *   create-arrow     → editor.createShape({ type: 'arrow', ... }) + 可选 createBinding
 *   create-note      → editor.createShape({ type: 'note', ... })
 *   delete-shape     → editor.deleteShape(id)
 *   update-shape     → editor.updateShape({ id, ... })
 *
 * delete-shape / update-shape 找不到目标 shape 时抛出
 * `SHAPE_NOT_FOUND:<shapeId>` 格式的 Error，供调用方映射为 RPC 错误。
 */
import { type Editor, type TLShapeId } from 'tldraw'
import type { Command } from '../../shared/rpc/commands'

export interface CommandResult {
	shapeId: string
}

/**
 * 把字符串按 `\n` 拆分成 ProseMirror 的多 paragraph richText 结构。
 * tldraw 自带的 toRichText 不拆 `\n`——会把整段当成单 paragraph 内容，
 * 导致换行被静默丢失。这里手工拆，保留空行（变成空 paragraph）。
 */
// tldraw TLRichText 的最小结构，与 ProseMirror doc 兼容
interface PmDoc {
	type: string
	content: Array<{ type: string; content?: Array<{ type: string; text: string }> }>
}

function toMultilineRichText(text: string): PmDoc {
	return {
		type: 'doc',
		content: text.split('\n').map((line) =>
			line.length > 0
				? { type: 'paragraph', content: [{ type: 'text', text: line }] }
				: { type: 'paragraph' },
		),
	}
}

/**
 * 执行单条命令并返回结果。
 * @param editor    tldraw Editor 实例
 * @param command   已验证的 Command 对象
 * @param canvasId  目标 canvas（page）id，用于设置 parentId
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
				parentId: canvasId as never,
				x: command.x,
				y: command.y,
				props: {
					geo: command.geo,
					w: command.w,
					h: command.h,
					...(command.text !== undefined && { richText: toMultilineRichText(command.text) }),
					...(command.color !== undefined && { color: command.color }),
					...(command.fill !== undefined && { fill: command.fill }),
					...(command.labelColor !== undefined && { labelColor: command.labelColor }),
				},
			})
			return { shapeId: String(shapeId) }
		}

		case 'create-text': {
			const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
			editor.createShape({
				id: shapeId,
				type: 'text',
				parentId: canvasId as never,
				x: command.x,
				y: command.y,
				props: {
					richText: toMultilineRichText(command.text),
					...(command.w !== undefined && { w: command.w }),
					...(command.color !== undefined && { color: command.color }),
					...(command.font !== undefined && { font: command.font }),
					...(command.size !== undefined && { size: command.size }),
					...(command.textAlign !== undefined && { textAlign: command.textAlign }),
				},
			})
			return { shapeId: String(shapeId) }
		}

		case 'create-arrow': {
			const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
			editor.createShape({
				id: shapeId,
				type: 'arrow',
				parentId: canvasId as never,
				x: 0,
				y: 0,
				props: {
					start: { x: command.startX, y: command.startY },
					end: { x: command.endX, y: command.endY },
					...(command.text !== undefined && { richText: toMultilineRichText(command.text) }),
					...(command.color !== undefined && { color: command.color }),
					...(command.arrowheadStart !== undefined && { arrowheadStart: command.arrowheadStart }),
					...(command.arrowheadEnd !== undefined && { arrowheadEnd: command.arrowheadEnd }),
					...(command.dash !== undefined && { dash: command.dash }),
					...(command.bend !== undefined && { bend: command.bend }),
					...(command.fill !== undefined && { fill: command.fill }),
				},
			})
			if (command.startBindingShapeId) {
				editor.createBinding({
					type: 'arrow',
					fromId: shapeId,
					toId: command.startBindingShapeId as TLShapeId,
					props: {
						terminal: 'start',
						normalizedAnchor: { x: 0.5, y: 0.5 },
						isExact: false,
						isPrecise: false,
					},
				})
			}
			if (command.endBindingShapeId) {
				editor.createBinding({
					type: 'arrow',
					fromId: shapeId,
					toId: command.endBindingShapeId as TLShapeId,
					props: {
						terminal: 'end',
						normalizedAnchor: { x: 0.5, y: 0.5 },
						isExact: false,
						isPrecise: false,
					},
				})
			}
			return { shapeId: String(shapeId) }
		}

		case 'create-note': {
			const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId
			editor.createShape({
				id: shapeId,
				type: 'note',
				parentId: canvasId as never,
				x: command.x,
				y: command.y,
				props: {
					richText: toMultilineRichText(command.text),
					...(command.color !== undefined && { color: command.color }),
				},
			})
			return { shapeId: String(shapeId) }
		}

		case 'delete-shape': {
			const existing = editor.getShape(command.shapeId as TLShapeId)
			if (!existing) {
				throw new Error(`SHAPE_NOT_FOUND:${command.shapeId}`)
			}
			editor.deleteShape(command.shapeId as TLShapeId)
			return { shapeId: command.shapeId }
		}

		case 'update-shape': {
			const existing = editor.getShape(command.shapeId as TLShapeId)
			if (!existing) {
				throw new Error(`SHAPE_NOT_FOUND:${command.shapeId}`)
			}
			const props: Record<string, unknown> = {}
			if (command.text !== undefined) props.richText = toMultilineRichText(command.text)
			if (command.color !== undefined) props.color = command.color
			if (command.fill !== undefined) props.fill = command.fill
			if (command.labelColor !== undefined) props.labelColor = command.labelColor
			if (command.geo !== undefined) props.geo = command.geo
			if (command.font !== undefined) props.font = command.font
			if (command.size !== undefined) props.size = command.size
			if (command.textAlign !== undefined) props.textAlign = command.textAlign
			if (command.name !== undefined) props.name = command.name
			if (command.arrowheadStart !== undefined) props.arrowheadStart = command.arrowheadStart
			if (command.arrowheadEnd !== undefined) props.arrowheadEnd = command.arrowheadEnd
			if (command.dash !== undefined) props.dash = command.dash
			if (command.bend !== undefined) props.bend = command.bend
			if (command.w !== undefined) props.w = command.w
			if (command.h !== undefined) props.h = command.h
			editor.updateShape({
				id: command.shapeId as TLShapeId,
				type: existing.type,
				...(command.x !== undefined && { x: command.x }),
				...(command.y !== undefined && { y: command.y }),
				...(command.rotation !== undefined && { rotation: command.rotation }),
				...(Object.keys(props).length > 0 && { props }),
			})
			return { shapeId: command.shapeId }
		}
	}
}

/**
 * 批量执行命令，返回与输入 commands 一一对应的结果数组。
 * 任一命令抛出错误时向上传播，调用方负责包装为 RPC 错误响应。
 */
export function executeCommands(
	editor: Editor,
	commands: Command[],
	canvasId: string,
): CommandResult[] {
	return commands.map((cmd) => executeCommand(editor, cmd, canvasId))
}
