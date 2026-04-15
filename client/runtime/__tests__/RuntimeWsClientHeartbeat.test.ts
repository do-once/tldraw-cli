/**
 * RuntimeWsClient 心跳响应测试
 *
 * 验证 Runtime 侧收到 system.ping 后立即回 system.pong（seq 回声），
 * 且收到非法 ping 消息时不崩溃。
 */
// client/runtime/__tests__/RuntimeWsClientHeartbeat.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'

// ─── Mock browser WebSocket via vi.hoisted + vi.stubGlobal ───────────────────

class MockWs extends EventEmitter {
	readyState = 0 // CONNECTING
	sent: string[] = []

	send(data: string) { this.sent.push(data) }
	close() { this.emit('close') }
	addEventListener(event: string, handler: (...args: unknown[]) => void) { this.on(event, handler) }
	removeEventListener(event: string, handler: (...args: unknown[]) => void) { this.off(event, handler) }
}

let mockWsInstance: MockWs

// ─── import 放在全局注入之后 ──────────────────────────────────────────────────

// vitest 在 Node 环境运行，需要在模块 import 前把 WebSocket 注入全局。
// 这里先在顶层 stub，每个 test 通过 beforeEach 重置实例。
// (vi.stubGlobal 比手动 global.X 更安全，afterEach 时 vi.unstubAllGlobals 清理)

beforeEach(() => {
	mockWsInstance = new MockWs()
	vi.stubGlobal('WebSocket', vi.fn(() => mockWsInstance))
})

afterEach(() => {
	vi.unstubAllGlobals()
})

// eslint-disable-next-line import/first
import { RuntimeWsClient } from '../RuntimeWsClient'
import type { RuntimeAdapter } from '../RuntimeAdapter'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(): RuntimeAdapter {
	return { async invoke() { return null } }
}

/** 触发 open → handshake-ack，让 client 进入 ready 状态 */
function completeHandshake(ws: MockWs, runtimeId = 'rt-1') {
	ws.emit('open')
	ws.emit('message', { data: JSON.stringify({ type: 'handshake-ack', runtimeId, accepted: true }) })
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RuntimeWsClient 心跳响应', () => {
	it('收到 system.ping 立即回 system.pong（seq 回声）', () => {
		const client = new RuntimeWsClient({
			url: 'ws://localhost:9000',
			adapter: makeAdapter(),
			methods: [],
			sessionId: 'test-session-id',
		})
		completeHandshake(mockWsInstance)

		mockWsInstance.emit('message', { data: JSON.stringify({ type: 'system.ping', seq: 42 }) })

		const pong = mockWsInstance.sent.find(s => {
			const m = JSON.parse(s) as { type?: string }
			return m.type === 'system.pong'
		})
		expect(pong).toBeDefined()
		expect((JSON.parse(pong!) as { seq: number }).seq).toBe(42)

		client.close()
	})

	it('ping seq=0 也能正确回 pong', () => {
		const client = new RuntimeWsClient({
			url: 'ws://localhost:9000',
			adapter: makeAdapter(),
			methods: [],
			sessionId: 'test-session-id',
		})
		completeHandshake(mockWsInstance)

		mockWsInstance.emit('message', { data: JSON.stringify({ type: 'system.ping', seq: 0 }) })

		const pong = mockWsInstance.sent.find(s => {
			const m = JSON.parse(s) as { type?: string }
			return m.type === 'system.pong'
		})
		expect(pong).toBeDefined()
		expect((JSON.parse(pong!) as { seq: number }).seq).toBe(0)

		client.close()
	})

	it('seq 字段缺失的 ping 不崩溃、不回 pong', () => {
		const client = new RuntimeWsClient({
			url: 'ws://localhost:9000',
			adapter: makeAdapter(),
			methods: [],
			sessionId: 'test-session-id',
		})
		completeHandshake(mockWsInstance)

		expect(() => {
			mockWsInstance.emit('message', { data: JSON.stringify({ type: 'system.ping' }) })
		}).not.toThrow()

		const pong = mockWsInstance.sent.find(s => {
			const m = JSON.parse(s) as { type?: string }
			return m.type === 'system.pong'
		})
		expect(pong).toBeUndefined()

		client.close()
	})
})
