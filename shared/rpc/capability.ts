/**
 * 协议握手与 capability 协商
 *
 * Runtime 在 WebSocket 连上 Host 后，必须立即发送一条 HandshakeRequest 消息。
 * Host 校验通过后回复 HandshakeAck，之后才能收发 JSON-RPC 请求。
 * Host 关闭前会广播 SessionShutdownNotice，Runtime 应在收到后主动断开。
 *
 * capability 机制让不同版本的 Runtime 声明自己支持的方法集，
 * Host 据此决定能向该 Runtime 路由哪些 RPC 方法。
 */
// shared/rpc/capability.ts
import { z } from 'zod'

/**
 * Runtime 在握手时声明的能力信息。
 * - protocolVersion：协议大版本，用于基本兼容性检查
 * - methods：Runtime 实际支持的 RPC 方法名列表
 * - flags：细粒度特性标志（如 "cas"、"idempotency" 等），用于可选能力协商
 */
export const RuntimeCapabilitySchema = z.object({
	protocolVersion: z.string(),
	methods: z.array(z.string()),
	flags: z.array(z.string()).default([]),
	sessionId: z.string().uuid(),
})
export type RuntimeCapability = z.infer<typeof RuntimeCapabilitySchema>

/**
 * Runtime → Host 握手请求消息（WebSocket 连接建立后的第一条消息）
 */
export const HandshakeRequestSchema = z.object({
	type: z.literal('handshake'),
	capability: RuntimeCapabilitySchema,
})
export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>

/**
 * Host → Runtime 握手确认消息。
 * runtimeId 是 Host 分配的实例唯一 ID，Runtime 可用于日志标识。
 * accepted 为 false 时 Host 随即关闭连接。
 */
export const HandshakeAckSchema = z.object({
	type: z.literal('handshake-ack'),
	runtimeId: z.string(),
	accepted: z.boolean(),
})
export type HandshakeAck = z.infer<typeof HandshakeAckSchema>

/**
 * Host → Runtime 关闭通知（广播）。
 * Runtime 收到后应做清理并主动关闭 WebSocket。
 */
export const SessionShutdownNoticeSchema = z.object({
	type: z.literal('session.shutdown'),
	reason: z.string(),
})
export type SessionShutdownNotice = z.infer<typeof SessionShutdownNoticeSchema>

/** 当前协议版本号，Runtime 和 Host 必须使用相同的值才能通信 */
export const CURRENT_PROTOCOL_VERSION = '1'
