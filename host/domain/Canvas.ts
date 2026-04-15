/**
 * Canvas 领域对象
 *
 * tldraw 画布在 Host 侧的领域模型。
 * Host 不持有画布内容（shape 数据），只维护 id / title / revision 等元信息。
 * 真正的画布状态存在 tldraw editor store（Runtime 侧），通过 RPC 查询获取。
 */
// host/domain/Canvas.ts
import type { Revision } from './Revision'

/**
 * 画布摘要：列表视图和路由时使用的轻量表示。
 * 不包含 shape 数据，需要完整内容时调用 canvas.snapshot。
 */
export interface CanvasSummary {
	readonly id: string
	readonly title: string
	readonly revision: Revision
}
