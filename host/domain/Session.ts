/**
 * Session 领域对象
 *
 * 描述一次 Host 运行会话的静态信息。
 * "Session" 的生命周期等同于 Host 进程的生命周期：进程启动时创建，进程结束时销毁。
 * 当前版本 Host 不持久化 Session 状态，重启后 revision 和 activeCanvasId 均归零。
 */
// host/domain/Session.ts

/**
 * Session 的只读快照，用于 session.status 响应。
 * activeCanvasId 由 Runtime 侧维护，Host 无法直接读取，查询时需向 Runtime 请求。
 */
export interface SessionSnapshot {
	readonly hostVersion: string
	readonly startedAt: number
	readonly activeCanvasId: string | null
}
