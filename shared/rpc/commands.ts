/**
 * command.apply 支持的 6 种命令 schema
 *
 * 扩展了 methods.ts 中原有的 CreateGeoShapeCommandSchema，
 * 并新增 create-text、create-arrow、create-note、delete-shape、update-shape。
 * 各字段含义对齐 tldraw editor 的 shape props。
 */
import { z } from 'zod'
import {
	GeoEnum,
	ColorEnum,
	FillEnum,
	FontEnum,
	SizeEnum,
	TextAlignEnum,
	ArrowheadEnum,
	DashEnum,
} from './shapes'

// ---------- create-geo-shape（扩展版，新增可选样式字段） ----------

export const CreateGeoShapeCommandSchema = z.object({
	kind: z.literal('create-geo-shape'),
	geo: GeoEnum,
	x: z.number(),
	y: z.number(),
	w: z.number().positive(),
	h: z.number().positive(),
	text: z.string().optional(),
	color: ColorEnum.optional(),
	fill: FillEnum.optional(),
	labelColor: ColorEnum.optional(),
})
export type CreateGeoShapeCommand = z.infer<typeof CreateGeoShapeCommandSchema>

// ---------- create-text ----------

export const CreateTextCommandSchema = z.object({
	kind: z.literal('create-text'),
	x: z.number(),
	y: z.number(),
	text: z.string(),
	w: z.number().positive().optional(),
	color: ColorEnum.optional(),
	font: FontEnum.optional(),
	size: SizeEnum.optional(),
	textAlign: TextAlignEnum.optional(),
})
export type CreateTextCommand = z.infer<typeof CreateTextCommandSchema>

// ---------- create-arrow ----------

export const CreateArrowCommandSchema = z.object({
	kind: z.literal('create-arrow'),
	startX: z.number(),
	startY: z.number(),
	endX: z.number(),
	endY: z.number(),
	startBindingShapeId: z.string().min(1).optional(),
	endBindingShapeId: z.string().min(1).optional(),
	text: z.string().optional(),
	color: ColorEnum.optional(),
	arrowheadStart: ArrowheadEnum.optional(),
	arrowheadEnd: ArrowheadEnum.optional(),
	dash: DashEnum.optional(),
	bend: z.number().optional(),
	fill: FillEnum.optional(),
})
export type CreateArrowCommand = z.infer<typeof CreateArrowCommandSchema>

// ---------- create-note ----------

export const CreateNoteCommandSchema = z.object({
	kind: z.literal('create-note'),
	x: z.number(),
	y: z.number(),
	text: z.string(),
	color: ColorEnum.optional(),
})
export type CreateNoteCommand = z.infer<typeof CreateNoteCommandSchema>

// ---------- delete-shape ----------

export const DeleteShapeCommandSchema = z.object({
	kind: z.literal('delete-shape'),
	shapeId: z.string(),
})
export type DeleteShapeCommand = z.infer<typeof DeleteShapeCommandSchema>

// ---------- update-shape ----------

export const UpdateShapeCommandSchema = z.object({
	kind: z.literal('update-shape'),
	shapeId: z.string(),
	x: z.number().optional(),
	y: z.number().optional(),
	rotation: z.number().optional(),
	w: z.number().positive().optional(),
	h: z.number().positive().optional(),
	text: z.string().optional(),
	color: ColorEnum.optional(),
	fill: FillEnum.optional(),
	labelColor: ColorEnum.optional(),
	geo: GeoEnum.optional(),
	font: FontEnum.optional(),
	size: SizeEnum.optional(),
	textAlign: TextAlignEnum.optional(),
	name: z.string().optional(),
	arrowheadStart: ArrowheadEnum.optional(),
	arrowheadEnd: ArrowheadEnum.optional(),
	dash: DashEnum.optional(),
	bend: z.number().optional(),
})
export type UpdateShapeCommand = z.infer<typeof UpdateShapeCommandSchema>

// ---------- 联合类型 ----------

export const CommandSchema = z.discriminatedUnion('kind', [
	CreateGeoShapeCommandSchema,
	CreateTextCommandSchema,
	CreateArrowCommandSchema,
	CreateNoteCommandSchema,
	DeleteShapeCommandSchema,
	UpdateShapeCommandSchema,
])
export type Command = z.infer<typeof CommandSchema>
