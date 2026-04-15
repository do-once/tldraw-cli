// client/runtime/__tests__/shapeExtractor.test.ts
import { describe, expect, it } from 'vitest'
import type { Editor, TLShape } from 'tldraw'
import { plainTextFromRichText, extractShape } from '../shapeExtractor'

describe('plainTextFromRichText', () => {
	it('extracts text from standard doc structure', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'hello world' }],
				},
			],
		}
		expect(plainTextFromRichText(doc)).toBe('hello world')
	})

	it('concatenates multiple paragraphs', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'line one' }],
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'line two' }],
				},
			],
		}
		expect(plainTextFromRichText(doc)).toBe('line one\nline two')
	})

	it('returns empty string for null', () => {
		expect(plainTextFromRichText(null)).toBe('')
	})

	it('returns empty string for undefined', () => {
		expect(plainTextFromRichText(undefined)).toBe('')
	})

	it('returns empty string for empty doc', () => {
		const doc = { type: 'doc', content: [] }
		expect(plainTextFromRichText(doc)).toBe('')
	})

	it('returns empty string for non-object', () => {
		expect(plainTextFromRichText(42)).toBe('')
		expect(plainTextFromRichText('raw string')).toBe('')
	})

	it('handles deeply nested content', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'marks',
							content: [{ type: 'text', text: 'bold' }],
						},
					],
				},
			],
		}
		expect(plainTextFromRichText(doc)).toBe('bold')
	})

	it('returns empty string when no text nodes', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [],
				},
			],
		}
		expect(plainTextFromRichText(doc)).toBe('')
	})
})

describe('extractShape arrow fill', () => {
	it('extracts fill from arrow shape props', () => {
		const canvasId = 'page:canvas1'
		const mockArrow: TLShape = {
			id: 'shape:arrow1' as TLShape['id'],
			type: 'arrow',
			parentId: canvasId as TLShape['parentId'],
			index: 'a1' as TLShape['index'],
			x: 0,
			y: 0,
			rotation: 0,
			isLocked: false,
			opacity: 1,
			meta: {},
			props: {
				text: '',
				richText: null,
				color: 'black',
				fill: 'solid',
				dash: 'draw',
				arrowheadStart: 'none',
				arrowheadEnd: 'arrow',
				bend: 0,
				start: { x: 0, y: 0 },
				end: { x: 100, y: 0 },
			},
		} as unknown as TLShape

		const mockEditor = {
			getBindingsFromShape: () => [],
		} as unknown as Editor

		const result = extractShape(mockEditor, mockArrow, canvasId)

		expect(result.kind).toBe('arrow')
		if (result.kind === 'arrow') {
			expect(result.fill).toBe('solid')
		}
	})
})
