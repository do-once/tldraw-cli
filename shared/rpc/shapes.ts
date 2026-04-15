/**
 * 多类型 shape 的 zod schema
 *
 * 覆盖 tldraw 中的主要 shape 类型：geo、text、arrow、note、frame 及未知类型。
 * 供 canvas.snapshot 使用，替换原有只支持 geo 的 SnapshotShapeSchema。
 *
 * 枚举定义已迁移到 generated/tldraw-enums.ts（由 codegen 自动派生），
 * 此处 re-export 保持对外接口不变。
 */
import { z } from 'zod'
import {
	ArrowheadEnum,
	FillEnum,
	DashEnum,
	ColorEnum,
	GeoEnum,
	FontEnum,
	SizeEnum,
	TextAlignEnum,
} from './generated/tldraw-enums'

// ---------- 枚举（从 codegen 产物 re-export） ----------

export {
	ArrowheadEnum,
	FillEnum,
	DashEnum,
	ColorEnum,
	GeoEnum,
	FontEnum,
	SizeEnum,
	TextAlignEnum,
	VerticalAlignEnum,
} from './generated/tldraw-enums'

export type {
	Arrowhead,
	Fill,
	Dash,
	Color,
	Geo,
	Font,
	Size,
	TextAlign,
	VerticalAlign,
} from './generated/tldraw-enums'

// ---------- shape 基础字段（每种 shape 都有） ----------

const BaseShapeFields = {
	shapeId: z.string(),
	x: z.number(),
	y: z.number(),
	rotation: z.number(),
	parentId: z.string().optional(),
}

// ---------- 各类型 shape schema ----------

export const GeoShapeSchema = z.object({
	kind: z.literal('geo'),
	...BaseShapeFields,
	w: z.number().positive(),
	h: z.number().positive(),
	geo: GeoEnum,
	text: z.string(),
	color: ColorEnum,
	fill: FillEnum,
	labelColor: ColorEnum,
})
export type GeoShape = z.infer<typeof GeoShapeSchema>

export const TextShapeSchema = z.object({
	kind: z.literal('text'),
	...BaseShapeFields,
	w: z.number().positive(),
	text: z.string(),
	color: ColorEnum,
	font: FontEnum,
	size: SizeEnum,
	textAlign: TextAlignEnum,
})
export type TextShape = z.infer<typeof TextShapeSchema>

const ArrowBindingSchema = z.object({
	shapeId: z.string(),
})

export const ArrowShapeSchema = z.object({
	kind: z.literal('arrow'),
	...BaseShapeFields,
	start: z.object({ x: z.number(), y: z.number() }),
	end: z.object({ x: z.number(), y: z.number() }),
	startBinding: ArrowBindingSchema.nullable(),
	endBinding: ArrowBindingSchema.nullable(),
	text: z.string(),
	color: ColorEnum,
	fill: FillEnum.optional(),
	arrowheadStart: ArrowheadEnum,
	arrowheadEnd: ArrowheadEnum,
	dash: DashEnum,
	bend: z.number(),
})
export type ArrowShape = z.infer<typeof ArrowShapeSchema>

export const NoteShapeSchema = z.object({
	kind: z.literal('note'),
	...BaseShapeFields,
	text: z.string(),
	color: ColorEnum,
})
export type NoteShape = z.infer<typeof NoteShapeSchema>

export const FrameShapeSchema = z.object({
	kind: z.literal('frame'),
	...BaseShapeFields,
	w: z.number().positive(),
	h: z.number().positive(),
	name: z.string(),
})
export type FrameShape = z.infer<typeof FrameShapeSchema>

export const UnknownShapeSchema = z.object({
	kind: z.literal('unknown'),
	...BaseShapeFields,
	type: z.string(),
	w: z.number().positive().optional(),
	h: z.number().positive().optional(),
})
export type UnknownShape = z.infer<typeof UnknownShapeSchema>

// ---------- 联合类型 ----------

export const ShapeSchema = z.discriminatedUnion('kind', [
	GeoShapeSchema,
	TextShapeSchema,
	ArrowShapeSchema,
	NoteShapeSchema,
	FrameShapeSchema,
	UnknownShapeSchema,
])
export type Shape = z.infer<typeof ShapeSchema>
