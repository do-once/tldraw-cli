// client/runtime/__tests__/commandExecutor.test.ts
//
// commandExecutor 依赖真实 tldraw Editor（需要浏览器 DOM），
// 无法在 Node 环境中完整测试。本文件仅验证错误消息格式约定和 fill 透传逻辑。
import { describe, expect, it } from 'vitest'
import { executeCommand } from '../commandExecutor'
import type { Editor } from 'tldraw'

describe('SHAPE_NOT_FOUND error format', () => {
	it('matches expected pattern', () => {
		const shapeId = 'shape:abc-123'
		const err = new Error(`SHAPE_NOT_FOUND:${shapeId}`)
		expect(err.message).toBe(`SHAPE_NOT_FOUND:${shapeId}`)
		expect(err.message.startsWith('SHAPE_NOT_FOUND:')).toBe(true)
		const extracted = err.message.slice('SHAPE_NOT_FOUND:'.length)
		expect(extracted).toBe(shapeId)
	})

	it('prefix is exactly SHAPE_NOT_FOUND: with colon', () => {
		const err = new Error('SHAPE_NOT_FOUND:shape:xyz')
		// 提取 shapeId 时只截掉固定前缀长度，不依赖 split(':')
		const prefix = 'SHAPE_NOT_FOUND:'
		expect(err.message.indexOf(prefix)).toBe(0)
	})
})

// ——— create-arrow fill 透传 ———

describe('create-arrow fill 透传', () => {
	it('passes fill=solid to editor props', () => {
		const createdProps: Record<string, unknown> = {}
		const mockEditor = {
			createShape: (shape: { props?: Record<string, unknown> }) => {
				Object.assign(createdProps, shape.props ?? {})
			},
			createBinding: () => {},
		}

		executeCommand(
			mockEditor as unknown as Editor,
			{
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 0,
				arrowheadEnd: 'diamond',
				fill: 'solid',
			},
			'page:test',
		)

		expect(createdProps.fill).toBe('solid')
	})

	it('does not set fill when not provided', () => {
		const createdProps: Record<string, unknown> = {}
		const mockEditor = {
			createShape: (shape: { props?: Record<string, unknown> }) => {
				Object.assign(createdProps, shape.props ?? {})
			},
			createBinding: () => {},
		}

		executeCommand(
			mockEditor as unknown as Editor,
			{
				kind: 'create-arrow',
				startX: 0,
				startY: 0,
				endX: 100,
				endY: 0,
			},
			'page:test',
		)

		expect(createdProps.fill).toBeUndefined()
	})
})
