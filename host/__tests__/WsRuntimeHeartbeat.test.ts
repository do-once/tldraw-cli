/**
 * WsRuntimeGateway 应用层心跳测试
 *
 * 使用 vitest fake timers 控制时间推进，验证心跳发出、pong 响应清零、
 * 连续超时断线等关键场景。
 *
 * 因 WsRuntimeGateway 是 WsRuntimeTransport 的内部类，通过
 * WsRuntimeTransport 集成测试驱动，用 mock 替换 ws 模块。
 */
// host/__tests__/WsRuntimeHeartbeat.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'

// ─── 用 vi.hoisted 把 mock class 提前初始化，让 vi.mock factory 可以引用 ──────

const { MockWs, MockWss } = vi.hoisted(() => {
	const { EventEmitter } = require('events') as typeof import('events')

	class MockWs extends EventEmitter {
		readyState = 1 // OPEN
		sent: string[] = []
		closeCode: number | undefined
		closeReason: string | undefined

		send(data: string) { this.sent.push(data) }
		close(code?: number, reason?: string | Buffer) {
			this.readyState = 3 // CLOSED
			this.closeCode = code
			this.closeReason = typeof reason === 'string' ? reason : reason?.toString()
			this.emit('close', code, reason)
		}
		terminate() { this.close(1006) }
		static OPEN = 1
	}

	class MockWss extends EventEmitter {
		clients = new Set<InstanceType<typeof MockWs>>()
		boundPort: number
		constructor(opts: { host: string; port: number }) {
			super()
			this.boundPort = opts.port
		}
		address() { return { port: this.boundPort } }
		close(cb?: (err?: Error) => void) { cb?.() }
		acceptClient(ws: InstanceType<typeof MockWs>) {
			this.clients.add(ws)
			ws.on('close', () => this.clients.delete(ws))
			this.emit('connection', ws)
		}
	}

	return { MockWs, MockWss }
})

vi.mock('ws', () => ({ WebSocket: MockWs, WebSocketServer: MockWss }))

// ─── 在 mock 就绪后才 import 依赖 ws 的模块 ──────────────────────────────────

import { WsRuntimeTransport } from '../infra/WsRuntimeTransport'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { ErrorCodes } from '../../shared/rpc'

// ─── helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = '00000000-0000-4000-8000-000000000001'

function doHandshake(wss: InstanceType<typeof MockWss>): InstanceType<typeof MockWs> {
	const ws = new MockWs()
	wss.acceptClient(ws)
	ws.emit('message', JSON.stringify({
		type: 'handshake',
		capability: {
			protocolVersion: '1',
			methods: [],
			flags: [],
			sessionId: SESSION_ID,
		},
	}))
	return ws
}

function lastPingSeq(ws: InstanceType<typeof MockWs>): number | null {
	for (let i = ws.sent.length - 1; i >= 0; i--) {
		const m = JSON.parse(ws.sent[i]) as { type?: string; seq?: number }
		if (m.type === 'system.ping') return m.seq ?? null
	}
	return null
}

function sendPong(ws: InstanceType<typeof MockWs>, seq: number) {
	ws.emit('message', JSON.stringify({ type: 'system.pong', seq }))
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('WsRuntimeGateway 心跳', () => {
	let registry: RuntimeRegistry
	let transport: WsRuntimeTransport
	let wss: InstanceType<typeof MockWss>

	beforeEach(() => {
		vi.useFakeTimers()
		registry = new RuntimeRegistry()
		transport = new WsRuntimeTransport({
			port: 0,
			registry,
			heartbeatIntervalMs: 15_000,
			heartbeatPongTimeoutMs: 10_000,
			heartbeatMaxFailures: 2,
		})
		wss = (transport as unknown as { server: InstanceType<typeof MockWss> }).server
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('握手后 15 秒发出第一次 system.ping', () => {
		const ws = doHandshake(wss)
		expect(lastPingSeq(ws)).toBeNull()
		vi.advanceTimersByTime(15_000)
		const seq = lastPingSeq(ws)
		expect(seq).not.toBeNull()
		expect(typeof seq).toBe('number')
	})

	it('收到 pong 后失败计数清零，不断线', () => {
		const ws = doHandshake(wss)
		vi.advanceTimersByTime(15_000)
		const seq = lastPingSeq(ws)!
		vi.advanceTimersByTime(5_000)
		sendPong(ws, seq)
		vi.advanceTimersByTime(10_000 + 15_000)
		expect(ws.closeCode).toBeUndefined()
		expect(registry.size()).toBe(1)
	})

	it('连续 2 次 ping 未收到 pong → 关闭连接（code 1001）', () => {
		const ws = doHandshake(wss)
		// 第 1 次 ping，不回 pong，等 pong 超时
		vi.advanceTimersByTime(15_000 + 10_000)
		expect(ws.closeCode).toBeUndefined()
		// 第 2 次 ping（interval 剩余 5s），不回 pong，等 pong 超时
		vi.advanceTimersByTime(5_000 + 10_000)
		expect(ws.closeCode).toBe(1001)
		expect(ws.closeReason).toBe('heartbeat-timeout')
	})

	it('连续 2 次断线后 pending 请求以 1009 拒绝', async () => {
		const ws = doHandshake(wss)
		const gw = registry.list()[0]
		const reqPromise = gw.request('canvas.snapshot', {}, { timeoutMs: 60_000 })
		// 推时间触发心跳断线
		vi.advanceTimersByTime(15_000 + 10_000 + 5_000 + 10_000)
		await expect(reqPromise).rejects.toMatchObject({ code: ErrorCodes.runtimeDisconnected })
	})

	it('第 1 次 ping 未回但第 2 次回了 pong → 失败计数清零，不断线', () => {
		const ws = doHandshake(wss)
		// t=15s：第 1 次 ping（seq=0）发出，pong 等待 10s
		// t=25s：pong 超时，failure=1，未达阈值
		// t=30s：第 2 次 ping（seq=1）发出（interval 触发）
		vi.advanceTimersByTime(30_000)
		const seq = lastPingSeq(ws)! // 此时 lastPingSeq 找到 seq=1
		expect(seq).toBe(1)
		// 在 pong 超时窗口内回 pong（10s 内）
		sendPong(ws, seq)
		// 继续推时间，确认没断
		vi.advanceTimersByTime(30_000)
		expect(ws.closeCode).toBeUndefined()
		expect(registry.size()).toBe(1)
	})

	it('连接关闭时心跳 timer 停止，不再发 ping', () => {
		const ws = doHandshake(wss)
		ws.close(1000)
		const sentBefore = ws.sent.length
		vi.advanceTimersByTime(60_000)
		const extraPings = ws.sent.slice(sentBefore).filter(s => {
			const m = JSON.parse(s) as { type?: string }
			return m.type === 'system.ping'
		})
		expect(extraPings).toHaveLength(0)
	})
})
