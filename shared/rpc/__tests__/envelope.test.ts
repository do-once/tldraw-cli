// shared/rpc/__tests__/envelope.test.ts
import { describe, expect, it } from 'vitest'
import {
	JsonRpcRequestSchema,
	JsonRpcSuccessSchema,
	JsonRpcErrorResponseSchema,
} from '../envelope'

describe('JsonRpcRequestSchema', () => {
	it('accepts valid request', () => {
		const p = JsonRpcRequestSchema.parse({
			jsonrpc: '2.0', id: 1, method: 'session.status', params: {},
		})
		expect(p.method).toBe('session.status')
	})
	it('rejects non-2.0 jsonrpc', () => {
		expect(() => JsonRpcRequestSchema.parse({ jsonrpc: '1.0', id: 1, method: 'x' })).toThrow()
	})
})

describe('response shapes', () => {
	it('accepts success', () => {
		expect(() => JsonRpcSuccessSchema.parse({ jsonrpc: '2.0', id: 1, result: {} })).not.toThrow()
	})
	it('accepts error', () => {
		expect(() =>
			JsonRpcErrorResponseSchema.parse({
				jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' },
			}),
		).not.toThrow()
	})
})
