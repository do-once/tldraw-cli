/**
 * JSON-RPC 2.0 信封 schema
 *
 * 定义 CLI ↔ Host ↔ Runtime 三端通信所使用的 JSON-RPC 2.0 请求/响应结构。
 * 所有 schema 均用 Zod 定义，运行时可直接 parse 做结构校验。
 */
// shared/rpc/envelope.ts
import { z } from 'zod'

/** 请求/响应 id 字段：可以是数字、字符串，或 null（通知消息） */
const idSchema = z.union([z.number(), z.string(), z.null()])

/** JSON-RPC 2.0 请求体 schema */
export const JsonRpcRequestSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	method: z.string(),
	params: z.unknown().optional(),
})
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>

/** JSON-RPC 2.0 错误对象（嵌套在错误响应的 error 字段里） */
export const JsonRpcErrorBodySchema = z.object({
	code: z.number(),
	message: z.string(),
	data: z.unknown().optional(),
})
export type JsonRpcErrorBody = z.infer<typeof JsonRpcErrorBodySchema>

/** JSON-RPC 2.0 成功响应体 schema */
export const JsonRpcSuccessSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	result: z.unknown(),
})
export type JsonRpcSuccess = z.infer<typeof JsonRpcSuccessSchema>

/** JSON-RPC 2.0 错误响应体 schema */
export const JsonRpcErrorResponseSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	error: JsonRpcErrorBodySchema,
})
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>

/** 成功响应与错误响应的联合类型 */
export const JsonRpcResponseSchema = z.union([JsonRpcSuccessSchema, JsonRpcErrorResponseSchema])
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>

/**
 * 类型守卫：判断响应是否为成功响应。
 * 有 result 字段视为成功，否则视为错误响应。
 */
export function isSuccess(r: JsonRpcResponse): r is JsonRpcSuccess {
	return 'result' in r
}

/**
 * 应用层心跳消息（Host → Runtime）。
 * 使用独立 type 字段，不走 JSON-RPC envelope，不占用 pending 请求表。
 */
export const SystemPingSchema = z.object({
	type: z.literal('system.ping'),
	seq: z.number().int().nonnegative(),
})
export type SystemPingMessage = z.infer<typeof SystemPingSchema>

/**
 * 应用层心跳回声（Runtime → Host）。
 * Runtime 收到 system.ping 后立即回复，seq 与 ping 相同。
 */
export const SystemPongSchema = z.object({
	type: z.literal('system.pong'),
	seq: z.number().int().nonnegative(),
})
export type SystemPongMessage = z.infer<typeof SystemPongSchema>
