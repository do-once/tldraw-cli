/**
 * RPC 错误码枚举
 *
 * -32700 ~ -32603 为 JSON-RPC 2.0 标准保留错误码。
 * 1001 起为本项目自定义的业务错误码，对应 Host 或 Runtime 侧的领域错误。
 */
// shared/rpc/errors.ts
export const ErrorCodes = {
	/** JSON 解析失败（请求体不是合法 JSON） */
	parseError: -32700,
	/** 请求格式不符合 JSON-RPC 2.0 规范 */
	invalidRequest: -32600,
	/** 请求的方法名不存在 */
	methodNotFound: -32601,
	/** 方法参数校验失败 */
	invalidParams: -32602,
	/** 服务内部未预期的错误 */
	internal: -32603,
	/** 当前没有已连接的 Runtime，无法处理请求 */
	runtimeUnavailable: 1001,
	/** canvas.diff/command.apply 时 expectedRevision 与实际 revision 不一致 */
	revisionConflict: 1002,
	/** 等待 Runtime 响应超时 */
	timeout: 1003,
	/** 鉴权失败（预留，当前版本不启用） */
	unauthorized: 1004,
	/** Runtime 过载，拒绝新请求（预留） */
	tooBusy: 1005,
	/** 指定的 canvasId 不存在 */
	canvasNotFound: 1006,
	/** 指定的 shapeId 不存在（delete-shape / update-shape 时目标找不到） */
	shapeNotFound: 1007,
	/** Runtime 已重启，CLI 持有的 runtimeSessionId 与当前 Runtime 不匹配 */
	runtimeRestarted: 1008,
	/** 心跳超时：连续多次未收到 pong，判定 Runtime 假活断线 */
	runtimeDisconnected: 1009,
} as const
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
