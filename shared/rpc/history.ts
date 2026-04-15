/**
 * History entry 的 zod schema
 *
 * 三种变更类型：shape-created / shape-updated / shape-deleted。
 * 供 canvas.diff 返回增量变更记录使用。
 */
import { z } from 'zod'
import { ShapeSchema } from './shapes'

// ---------- shape-created ----------

export const ShapeCreatedEntrySchema = z.object({
	kind: z.literal('shape-created'),
	revision: z.number().int().positive(),
	shape: ShapeSchema,
})
export type ShapeCreatedEntry = z.infer<typeof ShapeCreatedEntrySchema>

// ---------- shape-updated ----------

export const ShapeUpdatedEntrySchema = z.object({
	kind: z.literal('shape-updated'),
	revision: z.number().int().positive(),
	shapeId: z.string(),
	changes: z.record(z.string(), z.unknown()),
})
export type ShapeUpdatedEntry = z.infer<typeof ShapeUpdatedEntrySchema>

// ---------- shape-deleted ----------

export const ShapeDeletedEntrySchema = z.object({
	kind: z.literal('shape-deleted'),
	revision: z.number().int().positive(),
	shapeId: z.string(),
})
export type ShapeDeletedEntry = z.infer<typeof ShapeDeletedEntrySchema>

// ---------- 联合类型 ----------

export const HistoryEntrySchema = z.discriminatedUnion('kind', [
	ShapeCreatedEntrySchema,
	ShapeUpdatedEntrySchema,
	ShapeDeletedEntrySchema,
])
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>
