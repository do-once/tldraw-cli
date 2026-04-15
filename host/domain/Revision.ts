/**
 * Revision 领域类型
 *
 * 画布变更的单调递增版本号，由 TldrawRuntimeAdapter 在 Runtime 侧维护。
 * Host 侧只传递和比较，不生成 revision。
 *
 * 约束：
 * - revision 仅在 Runtime 生命周期内有效，Runtime 重启后从 INITIAL_REVISION 归零
 * - LLM 重启后应通过 canvas.snapshot 重新获取基线 revision，不能沿用旧值
 * - canvas.diff 的 since 参数和 command.apply 的 expectedRevision 使用此类型
 */
// host/domain/Revision.ts

/** 非负整数，表示画布的变更版本 */
export type Revision = number
/** 新建画布或 Runtime 重启后的初始 revision 值 */
export const INITIAL_REVISION: Revision = 0
