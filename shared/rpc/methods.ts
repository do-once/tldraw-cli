/**
 * 10 个 RPC 方法的参数与结果 schema
 *
 * 本文件是 Host ↔ Runtime 协议的核心约定，所有方法签名均用 Zod 定义，
 * 可在运行时双向校验。方法按 resource（session / canvas / command）分组。
 * 文件末尾的 MethodMap 汇总全部方法，供泛型分发和类型推断使用。
 */
// shared/rpc/methods.ts
import { z } from 'zod'
import { ShapeSchema } from './shapes'
import { CommandSchema } from './commands'
import { HistoryEntrySchema } from './history'

// ---------- session.status ----------

/** session.status 无需任何参数 */
export const SessionStatusParamsSchema = z.object({}).strict()
export type SessionStatusParams = z.infer<typeof SessionStatusParamsSchema>

/** 单个 Runtime 实例的摘要信息（嵌套在 SessionStatusResult 里） */
const RuntimeSummarySchema = z.object({
	id: z.string(),
	state: z.enum(['connecting', 'ready', 'closing', 'closed']),
	methods: z.array(z.string()),
	protocolVersion: z.string(),
})

/**
 * session.status 结果：Host 整体状态，包含版本、运行时间、已连 Runtime 列表、画布数量。
 * activeCanvasId 由 Runtime 侧维护，当前版本 Host 始终返回 null。
 */
export const SessionStatusResultSchema = z.object({
	host: z.object({ version: z.string(), uptimeMs: z.number() }),
	runtimes: z.array(RuntimeSummarySchema),
	activeCanvasId: z.string().nullable(),
	canvasCount: z.number(),
})
export type SessionStatusResult = z.infer<typeof SessionStatusResultSchema>

// ---------- canvas.list ----------

/** canvas.list 无需任何参数 */
export const CanvasListParamsSchema = z.object({}).strict()
export type CanvasListParams = z.infer<typeof CanvasListParamsSchema>

/** 画布列表项摘要（id、标题、当前 revision） */
const CanvasSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	revision: z.number().int().nonnegative(),
})

/** canvas.list 结果：当前所有画布的摘要列表 */
export const CanvasListResultSchema = z.object({
	items: z.array(CanvasSummarySchema),
})
export type CanvasListResult = z.infer<typeof CanvasListResultSchema>

// ---------- canvas.snapshot ----------

/**
 * canvas.snapshot 参数：可选 canvasId，省略时使用当前活动画布。
 * 快照是 LLM 建立画布状态基线的主要手段，返回全量 shape 列表。
 */
export const CanvasSnapshotParamsSchema = z.object({
	canvasId: z.string().optional(),
})
export type CanvasSnapshotParams = z.infer<typeof CanvasSnapshotParamsSchema>

/** canvas.snapshot 结果：当前 revision 及全量 shape 列表 */
export const CanvasSnapshotResultSchema = z.object({
	canvasId: z.string(),
	revision: z.number().int().nonnegative(),
	shapes: z.array(ShapeSchema),
	runtimeSessionId: z.string().uuid(),
})
export type CanvasSnapshotResult = z.infer<typeof CanvasSnapshotResultSchema>

// ---------- canvas.diff ----------

/**
 * canvas.diff 参数：since 指定起始 revision（不含），返回之后的增量变更。
 * 配合 canvas.snapshot 使用：先 snapshot 获取基线 revision，后续轮询 diff 取增量。
 */
export const CanvasDiffParamsSchema = z.object({
	canvasId: z.string().optional(),
	since: z.number().int().nonnegative(),
	runtimeSessionId: z.string().uuid().optional(),
})
export type CanvasDiffParams = z.infer<typeof CanvasDiffParamsSchema>

/** canvas.diff 结果：[fromRevision, toRevision] 区间内的有序变更列表 */
export const CanvasDiffResultSchema = z.object({
	canvasId: z.string(),
	fromRevision: z.number().int().nonnegative(),
	toRevision: z.number().int().nonnegative(),
	entries: z.array(HistoryEntrySchema),
	runtimeSessionId: z.string().uuid(),
})
export type CanvasDiffResult = z.infer<typeof CanvasDiffResultSchema>

// ---------- canvas.create ----------

/** canvas.create 参数：可选标题，省略时 Runtime 自动生成 */
export const CanvasCreateParamsSchema = z.object({
	title: z.string().optional(),
})
export type CanvasCreateParams = z.infer<typeof CanvasCreateParamsSchema>

/** canvas.create 结果：新建画布的 id、标题和初始 revision（始终为 0） */
export const CanvasCreateResultSchema = z.object({
	canvasId: z.string(),
	title: z.string(),
	revision: z.number().int().nonnegative(),
})
export type CanvasCreateResult = z.infer<typeof CanvasCreateResultSchema>

// ---------- canvas.select ----------

/** canvas.select 参数：必须指定要切换到的 canvasId */
export const CanvasSelectParamsSchema = z.object({
	canvasId: z.string(),
})
export type CanvasSelectParams = z.infer<typeof CanvasSelectParamsSchema>

/** canvas.select 结果：切换后的活动 canvasId */
export const CanvasSelectResultSchema = z.object({
	activeCanvasId: z.string(),
})
export type CanvasSelectResult = z.infer<typeof CanvasSelectResultSchema>

// ---------- canvas.getSelection ----------

/**
 * canvas.getSelection 参数：可选 canvasId，省略时使用当前活动画布。
 * 读取用户在浏览器中当前框选的 shapeId 集合，供 LLM 定向修改所用。
 */
export const CanvasGetSelectionParamsSchema = z.object({
	canvasId: z.string().optional(),
})
export type CanvasGetSelectionParams = z.infer<typeof CanvasGetSelectionParamsSchema>

/** canvas.getSelection 结果：当前选中的 shapeId 列表及此刻 revision */
export const CanvasGetSelectionResultSchema = z.object({
	canvasId: z.string(),
	revision: z.number().int().nonnegative(),
	shapeIds: z.array(z.string()),
	runtimeSessionId: z.string().uuid(),
})
export type CanvasGetSelectionResult = z.infer<typeof CanvasGetSelectionResultSchema>

// ---------- canvas.screenshot ----------

/**
 * canvas.screenshot 参数：可选 canvasId，省略时使用当前活动画布。
 * 触发 Runtime 将画布导出为 PNG，写入临时文件，返回文件路径供 LLM 用 Read 工具查看。
 */
export const CanvasScreenshotParamsSchema = z.object({
	canvasId: z.string().optional(),
})
export type CanvasScreenshotParams = z.infer<typeof CanvasScreenshotParamsSchema>

/** canvas.screenshot 结果：Host 写入的临时 PNG 文件路径 */
export const CanvasScreenshotResultSchema = z.object({
	imagePath: z.string(),
})
export type CanvasScreenshotResult = z.infer<typeof CanvasScreenshotResultSchema>

// ---------- command.apply ----------

/**
 * command.apply 参数：
 * - canvasId：省略时用当前活动画布
 * - expectedRevision：预期 revision，用于 CAS 检查（当前版本预留但不检查）
 * - idempotencyKey：幂等键，用于防重放（当前版本预留但不去重）
 * - commands：至少一条命令的有序列表，Runtime 会原子地按序执行
 */
export const CommandApplyParamsSchema = z.object({
	canvasId: z.string().optional(),
	expectedRevision: z.number().int().nonnegative().optional(),
	idempotencyKey: z.string().optional(),
	commands: z.array(CommandSchema).min(1),
})
export type CommandApplyParams = z.infer<typeof CommandApplyParamsSchema>

/** 单条命令执行结果，shapeId 是 Runtime 为新图形分配的唯一 ID */
const CommandResultSchema = z.object({ shapeId: z.string() })

/**
 * command.apply 结果：执行后的最新 revision 及每条命令的结果。
 * results 顺序与 commands 一一对应。
 */
export const CommandApplyResultSchema = z.object({
	canvasId: z.string(),
	revision: z.number().int().nonnegative(),
	results: z.array(CommandResultSchema),
	runtimeSessionId: z.string().uuid(),
})
export type CommandApplyResult = z.infer<typeof CommandApplyResultSchema>

// ---------- command.undo ----------

/** command.undo 无需任何参数 */
export const CommandUndoParamsSchema = z.object({})
export type CommandUndoParams = z.infer<typeof CommandUndoParamsSchema>

/** command.undo 结果：执行后的最新 revision */
export const CommandUndoResultSchema = z.object({
	revision: z.number().int(),
})
export type CommandUndoResult = z.infer<typeof CommandUndoResultSchema>

// ---------- command.redo ----------

/** command.redo 无需任何参数 */
export const CommandRedoParamsSchema = z.object({})
export type CommandRedoParams = z.infer<typeof CommandRedoParamsSchema>

/** command.redo 结果：执行后的最新 revision */
export const CommandRedoResultSchema = z.object({
	revision: z.number().int(),
})
export type CommandRedoResult = z.infer<typeof CommandRedoResultSchema>

// ---------- 方法表 ----------

/**
 * 全部 RPC 方法的参数/结果 schema 映射表。
 * 用于泛型分发（如 ApiGateway.dispatch）和运行时校验。
 * 新增方法需同时在此注册。
 */
export const MethodMap = {
	'session.status': { params: SessionStatusParamsSchema, result: SessionStatusResultSchema },
	'canvas.list': { params: CanvasListParamsSchema, result: CanvasListResultSchema },
	'canvas.snapshot': { params: CanvasSnapshotParamsSchema, result: CanvasSnapshotResultSchema },
	'canvas.diff': { params: CanvasDiffParamsSchema, result: CanvasDiffResultSchema },
	'canvas.create': { params: CanvasCreateParamsSchema, result: CanvasCreateResultSchema },
	'canvas.select': { params: CanvasSelectParamsSchema, result: CanvasSelectResultSchema },
	'canvas.getSelection': { params: CanvasGetSelectionParamsSchema, result: CanvasGetSelectionResultSchema },
	'canvas.screenshot': { params: CanvasScreenshotParamsSchema, result: CanvasScreenshotResultSchema },
	'command.apply': { params: CommandApplyParamsSchema, result: CommandApplyResultSchema },
	'command.undo': { params: CommandUndoParamsSchema, result: CommandUndoResultSchema },
	'command.redo': { params: CommandRedoParamsSchema, result: CommandRedoResultSchema },
} as const
export type MethodName = keyof typeof MethodMap
