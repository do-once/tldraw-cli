# tldraw-cli 第一版实现计划

> **给执行 agent：** 必用 skill：`superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。逐任务落地，以 checkbox（`- [ ]`）标记进度。保留 `- [ ] **Step N.M: ...**` 结构、`运行：` / `预期：` 段落——用于 agent 解析。

**目标：** 按 `docs/superpowers/specs/2026-04-16-tldraw-cli-implementation-spec.md` 落地 tldraw-cli 第一版。CLI 一键拉起 Host + 浏览器 runtime，LLM 通过 CLI skill 完成"开画布 / 看画布 / 写画布 / 收增量 / 关画布"全闭环。

**架构：** 三端分离——CLI 通过 HTTP JSON-RPC 调 Host 进程；Host 通过 WebSocket 桥接浏览器 runtime；浏览器端 `RuntimeWsClient`（纯传输）与 `TldrawRuntimeAdapter`（业务翻译）分离。CLI 顶层 `start / stop / status` 为本地命令（不走 RPC），`canvas / command` 为 Host RPC 适配器。

**技术栈：** TypeScript 5.8 / `@stricli/core`（CLI 框架）/ `rolldown`（bundle）/ `ws`（Node WebSocket）/ `react` + `tldraw`（浏览器 runtime 宿主）/ `zod@4`（schema）/ `vitest`（测试）/ `tsx`（Node 跑 TS）。

---

## 执行约束（用户指定）

- **自主推进**：按 task 顺序直接执行，不在计划里留决策给用户。
- **不自动 commit**：每个 task 末尾只打"提交点"标记，由用户手动 git commit。
- **组建 teams，遵循 leader 规范**：详见下一节"团队分工"。

## 团队分工（遵循 `~/.claude/CLAUDE.md` leader 规范）

按文件冲突隔离拆为 6 个 team，每个 team 一名 sonnet subagent：

| Team | 负责目录 | 依赖 | 任务数 |
|---|---|---|---|
| **T0 基础配置** | `package.json` / `tsconfig.json` / `vitest.config.ts` / `rolldown.config.ts` | 无 | 3 |
| **T1 协议契约** | `shared/rpc/**` | T0 | 5 |
| **T2 Host 侧** | `host/**` | T1 | 11 |
| **T3 浏览器端** | `client/runtime/**` + `client/App.tsx` | T1 | 5 |
| **T4 CLI 适配器** | `cli/**` | T1 | 12 |
| **T5 集成 / 文档** | `__tests__/e2e/**` + `README.md` + `CLAUDE.md` | T2/T3/T4 | 3 |

执行顺序：`T0 → T1 → {T2, T3, T4 并行} → T5`。

`package.json` 与 `tsconfig.json` 只由 T0 修改，后续不再动。`client/App.tsx` 只由 T3 修改一次。

---

## 非目标（第一版不做）

- AuthN / AuthZ（本地 loopback 默认关）
- `expectedRevision` CAS 检查（先做 last-write-wins）
- 幂等 `idempotencyKey` 去重（仅接收字段，不做去重）
- 重试 / 限流 / 背压 / 链路追踪 / metrics / 审计（预留字段，空实现）
- 多 runtime 并发（单 runtime，`RuntimeRouter` 取第一个）
- `canvas.delete`（危险、用户可手删）
- revision 持久化（runtime 生命周期内有效；重启归零；LLM 用 `canvas.snapshot` 重建基线）
- diff 条目 prune（history entries 第一版全量保留）
- 非 `create-geo-shape` 的命令（`update-shape` / `delete-shape` / 其它几何类型等，后续迭代）

## 规范 RPC 方法（7 个）

- `session.status`
- `canvas.list` / `canvas.snapshot` / `canvas.diff` / `canvas.create` / `canvas.select`
- `command.apply`

## CLI 命令结构

```
tldraw-cli
├── start                       # 本地：spawn host + 打开浏览器
├── stop                        # 本地：POST /admin/shutdown + 清理
├── status                      # 混合：读 pid + 调 session.status RPC
├── canvas
│   ├── list                    # → canvas.list
│   ├── snapshot [--canvas ID]  # → canvas.snapshot
│   ├── diff --since N [--canvas ID]  # → canvas.diff
│   ├── create [--title NAME]   # → canvas.create
│   └── select --canvas ID      # → canvas.select
└── command
    └── apply [--canvas ID]     # → command.apply（stdin JSON）
```

## 文件结构

```
cli/                                  # 新建（T4）
├── main.ts                           # stricli application 入口
├── context.ts                        # LocalContext
├── commands/
│   ├── start.ts
│   ├── stop.ts
│   ├── status.ts
│   ├── canvas.ts
│   └── command.ts
├── hostClient/
│   ├── JsonRpcClient.ts
│   ├── readStdin.ts
│   ├── sessionFile.ts                # ~/.tldraw-cli/session.json 读写
│   └── openBrowser.ts                # 跨平台 opener
└── __tests__/
    ├── JsonRpcClient.test.ts
    ├── sessionFile.test.ts
    ├── canvas.test.ts
    ├── command.test.ts
    └── status.test.ts

host/                                 # 新建（T2）
├── HostProcess.ts
├── ApiGateway.ts
├── ApplicationServices/
│   ├── SessionService.ts
│   ├── CanvasService.ts              # list / snapshot / diff / create / select
│   └── CommandService.ts
├── domain/
│   ├── Revision.ts
│   ├── Session.ts
│   ├── Canvas.ts
│   └── CommandBatch.ts
├── infra/
│   ├── RuntimeGateway.ts
│   ├── RuntimeRegistry.ts
│   ├── RuntimeRouter.ts
│   ├── WsRuntimeTransport.ts         # 含 broadcastShutdown()
│   └── errors.ts
└── __tests__/
    ├── RuntimeRegistry.test.ts
    ├── SessionService.test.ts
    ├── CanvasService.test.ts
    ├── CommandService.test.ts
    └── ApiGateway.test.ts

client/runtime/                       # 新建（T3）
├── RuntimeWsClient.ts
├── RuntimeAdapter.ts                 # 接口
├── TldrawRuntimeAdapter.ts           # 7 method 实现 + history entries
├── RuntimeMount.tsx                  # 挂适配器 + shutdown toast
└── __tests__/
    └── TldrawRuntimeAdapter.test.ts

client/App.tsx                        # 修改（T3）

shared/rpc/                           # 新建（T1）
├── envelope.ts
├── errors.ts
├── capability.ts
├── methods.ts                        # 7 method schema + HistoryEntry
├── index.ts
└── __tests__/
    ├── envelope.test.ts
    └── methods.test.ts

__tests__/e2e/                        # 新建（T5）
└── host-cli-runtime.e2e.test.ts

package.json                          # 修改（T0，改 name/bin + 新依赖）
tsconfig.json                         # 修改（T0，include 加 cli/host）
vitest.config.ts                      # 新建（T0）
rolldown.config.ts                    # 新建（T0）
```

---

# Team T0：基础配置

### Task 1: `package.json` —— 改名 / 加 bin / 加依赖 / 加脚本

**涉及文件：**
- 修改：`package.json`

- [ ] **Step 1.1: 整体替换 `package.json`**

```json
{
	"name": "tldraw-cli",
	"version": "0.0.0",
	"private": true,
	"homepage": "https://tldraw.dev",
	"license": "MIT",
	"author": { "name": "tldraw GB Ltd.", "email": "hello@tldraw.com" },
	"type": "module",
	"bin": {
		"tldraw-cli": "dist/cli.mjs"
	},
	"scripts": {
		"build": "vite build",
		"build:cli": "rolldown -c rolldown.config.ts",
		"dev": "vite",
		"host": "tsx host/HostProcess.ts",
		"cli": "tsx cli/main.ts",
		"preview": "vite preview",
		"test": "vitest run",
		"test:watch": "vitest"
	},
	"dependencies": {
		"@ai-sdk/anthropic": "^2.0.2",
		"@ai-sdk/google": "^2.0.14",
		"@ai-sdk/openai": "^2.0.24",
		"@cloudflare/vite-plugin": "^1.13.2",
		"@google/generative-ai": "^0.24.1",
		"@stricli/core": "^1.1.1",
		"@tldraw/tlschema": "^4.5.9",
		"@worker-tools/json-stream": "^0.1.0-pre.12",
		"ai": "^5.0.63",
		"best-effort-json-parser": "^1.1.3",
		"itty-router": "^5.0.18",
		"react": "^19.2.1",
		"react-dom": "^19.2.1",
		"react-markdown": "^10.1.0",
		"tldraw": "^4.5.9",
		"wrangler": "^4.67.0",
		"ws": "^8.18.0",
		"zod": "^4.1.8"
	},
	"devDependencies": {
		"@cloudflare/workers-types": "^4.20250913.0",
		"@types/node": "^22.9.0",
		"@types/react": "^19.2.7",
		"@types/react-dom": "^19.2.3",
		"@types/ws": "^8.5.13",
		"@vitejs/plugin-react-swc": "^3.10.2",
		"rolldown": "^1.0.0-beta.9",
		"tsx": "^4.20.5",
		"typescript": "^5.8.3",
		"vite": "^7.0.1",
		"vitest": "^3.2.4"
	}
}
```

- [ ] **Step 1.2: 装依赖**

运行：`npm install`
预期：成功，新增 `@stricli/core` / `ws` / `@types/ws` / `@types/node` / `rolldown` / `tsx` / `vitest`。

- [ ] **Step 1.3: 提交点**

---

### Task 2: `tsconfig.json` include + `vitest.config.ts`

**涉及文件：**
- 修改：`tsconfig.json`
- 新建：`vitest.config.ts`

- [ ] **Step 2.1: 改 `tsconfig.json` 的 `include`**

把 `"include": ["client", "shared", "worker"]` 改成：

```json
"include": ["cli", "client", "host", "shared", "worker"]
```

- [ ] **Step 2.2: 新建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: [
			'cli/**/__tests__/**/*.test.ts',
			'host/**/__tests__/**/*.test.ts',
			'shared/rpc/**/__tests__/**/*.test.ts',
			'client/runtime/**/__tests__/**/*.test.ts',
			'__tests__/**/*.test.ts',
		],
		testTimeout: 10_000,
	},
})
```

- [ ] **Step 2.3: 空套件 smoke**

运行：`npx vitest run`
预期：无测试也无错（exit 0 或 "No test files found"）。

- [ ] **Step 2.4: 提交点**

---

### Task 3: `rolldown.config.ts`

**涉及文件：**
- 新建：`rolldown.config.ts`

- [ ] **Step 3.1: 实现**

```ts
import { defineConfig } from 'rolldown'

export default defineConfig([
	{
		input: 'cli/main.ts',
		output: {
			file: 'dist/cli.mjs',
			format: 'esm',
			banner: '#!/usr/bin/env node',
		},
		platform: 'node',
		external: ['ws', /^node:/],
	},
	{
		input: 'host/HostProcess.ts',
		output: { file: 'dist/host.mjs', format: 'esm' },
		platform: 'node',
		external: ['ws', /^node:/],
	},
])
```

- [ ] **Step 3.2: 提交点**

Team T0 收工。

---

# Team T1：协议契约（`shared/rpc/**`）

### Task 4: `shared/rpc/envelope.ts`

**涉及文件：**
- 新建：`shared/rpc/envelope.ts`
- 新建：`shared/rpc/__tests__/envelope.test.ts`

- [ ] **Step 4.1: 写失败测试**

```ts
// shared/rpc/__tests__/envelope.test.ts
import { describe, expect, it } from 'vitest'
import {
	JsonRpcRequestSchema,
	JsonRpcSuccessSchema,
	JsonRpcErrorResponseSchema,
} from '../envelope'

describe('JsonRpcRequestSchema', () => {
	it('accepts valid request', () => {
		const p = JsonRpcRequestSchema.parse({
			jsonrpc: '2.0', id: 1, method: 'session.status', params: {},
		})
		expect(p.method).toBe('session.status')
	})
	it('rejects non-2.0 jsonrpc', () => {
		expect(() => JsonRpcRequestSchema.parse({ jsonrpc: '1.0', id: 1, method: 'x' })).toThrow()
	})
})

describe('response shapes', () => {
	it('accepts success', () => {
		expect(() => JsonRpcSuccessSchema.parse({ jsonrpc: '2.0', id: 1, result: {} })).not.toThrow()
	})
	it('accepts error', () => {
		expect(() =>
			JsonRpcErrorResponseSchema.parse({
				jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' },
			}),
		).not.toThrow()
	})
})
```

- [ ] **Step 4.2: 跑确认失败**

运行：`npx vitest run shared/rpc/__tests__/envelope.test.ts`
预期：FAIL（模块未建）。

- [ ] **Step 4.3: 实现**

```ts
// shared/rpc/envelope.ts
import { z } from 'zod'

const idSchema = z.union([z.number(), z.string(), z.null()])

export const JsonRpcRequestSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	method: z.string(),
	params: z.unknown().optional(),
})
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>

export const JsonRpcErrorBodySchema = z.object({
	code: z.number(),
	message: z.string(),
	data: z.unknown().optional(),
})
export type JsonRpcErrorBody = z.infer<typeof JsonRpcErrorBodySchema>

export const JsonRpcSuccessSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	result: z.unknown(),
})
export type JsonRpcSuccess = z.infer<typeof JsonRpcSuccessSchema>

export const JsonRpcErrorResponseSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: idSchema,
	error: JsonRpcErrorBodySchema,
})
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>

export const JsonRpcResponseSchema = z.union([JsonRpcSuccessSchema, JsonRpcErrorResponseSchema])
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>

export function isSuccess(r: JsonRpcResponse): r is JsonRpcSuccess {
	return 'result' in r
}
```

- [ ] **Step 4.4: 跑确认通过**

运行：`npx vitest run shared/rpc/__tests__/envelope.test.ts`
预期：PASS（4 个）。

- [ ] **Step 4.5: 提交点**

---

### Task 5: `shared/rpc/errors.ts`

**涉及文件：**
- 新建：`shared/rpc/errors.ts`

- [ ] **Step 5.1: 实现**

```ts
// shared/rpc/errors.ts
export const ErrorCodes = {
	parseError: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internal: -32603,
	runtimeUnavailable: 1001,
	revisionConflict: 1002,
	timeout: 1003,
	unauthorized: 1004,
	tooBusy: 1005,
	canvasNotFound: 1006,
} as const
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
```

- [ ] **Step 5.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 5.3: 提交点**

---

### Task 6: `shared/rpc/capability.ts`

**涉及文件：**
- 新建：`shared/rpc/capability.ts`

- [ ] **Step 6.1: 实现**

```ts
// shared/rpc/capability.ts
import { z } from 'zod'

export const RuntimeCapabilitySchema = z.object({
	protocolVersion: z.string(),
	methods: z.array(z.string()),
	flags: z.array(z.string()).default([]),
	schemaFingerprint: z.string(),
})
export type RuntimeCapability = z.infer<typeof RuntimeCapabilitySchema>

export const HandshakeRequestSchema = z.object({
	type: z.literal('handshake'),
	capability: RuntimeCapabilitySchema,
})
export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>

export const HandshakeAckSchema = z.object({
	type: z.literal('handshake-ack'),
	runtimeId: z.string(),
	accepted: z.boolean(),
})
export type HandshakeAck = z.infer<typeof HandshakeAckSchema>

export const SessionShutdownNoticeSchema = z.object({
	type: z.literal('session.shutdown'),
	reason: z.string(),
})
export type SessionShutdownNotice = z.infer<typeof SessionShutdownNoticeSchema>

export const CURRENT_PROTOCOL_VERSION = '1'
```

- [ ] **Step 6.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 6.3: 提交点**

---

### Task 7: `shared/rpc/methods.ts` —— 7 个方法 schema + HistoryEntry

**涉及文件：**
- 新建：`shared/rpc/methods.ts`
- 新建：`shared/rpc/__tests__/methods.test.ts`

- [ ] **Step 7.1: 写失败测试**

```ts
// shared/rpc/__tests__/methods.test.ts
import { describe, expect, it } from 'vitest'
import {
	SessionStatusResultSchema,
	CanvasListResultSchema,
	CanvasSnapshotParamsSchema,
	CanvasSnapshotResultSchema,
	CanvasDiffParamsSchema,
	CanvasDiffResultSchema,
	CanvasCreateParamsSchema,
	CanvasSelectParamsSchema,
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	MethodMap,
} from '../methods'

describe('MethodMap', () => {
	it('contains 7 MVP methods', () => {
		expect(Object.keys(MethodMap).sort()).toEqual([
			'canvas.create',
			'canvas.diff',
			'canvas.list',
			'canvas.select',
			'canvas.snapshot',
			'command.apply',
			'session.status',
		])
	})
})

describe('SessionStatusResultSchema', () => {
	it('accepts zero runtimes', () => {
		expect(() =>
			SessionStatusResultSchema.parse({
				host: { version: '0.0.1', uptimeMs: 0 },
				runtimes: [],
				activeCanvasId: null,
				canvasCount: 0,
			}),
		).not.toThrow()
	})
})

describe('CanvasListResultSchema', () => {
	it('accepts items', () => {
		const r = CanvasListResultSchema.parse({
			items: [{ id: 'page:1', title: 'Page 1', revision: 0 }],
		})
		expect(r.items).toHaveLength(1)
	})
})

describe('CanvasSnapshot', () => {
	it('params optional canvasId', () => {
		expect(() => CanvasSnapshotParamsSchema.parse({})).not.toThrow()
	})
	it('result has shapes array', () => {
		expect(() =>
			CanvasSnapshotResultSchema.parse({
				canvasId: 'page:1',
				revision: 0,
				shapes: [
					{ kind: 'geo', shapeId: 'shape:1', x: 0, y: 0, w: 10, h: 10, geo: 'rectangle' },
				],
			}),
		).not.toThrow()
	})
})

describe('CanvasDiff', () => {
	it('requires since >= 0', () => {
		expect(() => CanvasDiffParamsSchema.parse({ since: -1 })).toThrow()
	})
	it('result entries can be empty', () => {
		expect(() =>
			CanvasDiffResultSchema.parse({
				canvasId: 'page:1',
				fromRevision: 0,
				toRevision: 0,
				entries: [],
			}),
		).not.toThrow()
	})
	it('result accepts shape-created entry', () => {
		expect(() =>
			CanvasDiffResultSchema.parse({
				canvasId: 'page:1',
				fromRevision: 0,
				toRevision: 1,
				entries: [
					{
						kind: 'shape-created',
						revision: 1,
						shapeId: 'shape:1',
						x: 0, y: 0, w: 10, h: 10, geo: 'rectangle',
					},
				],
			}),
		).not.toThrow()
	})
})

describe('CanvasCreate / Select', () => {
	it('create allows empty params', () => {
		expect(() => CanvasCreateParamsSchema.parse({})).not.toThrow()
	})
	it('select requires canvasId', () => {
		expect(() => CanvasSelectParamsSchema.parse({} as unknown)).toThrow()
	})
})

describe('CommandApply', () => {
	it('requires at least one command', () => {
		expect(() => CommandApplyParamsSchema.parse({ commands: [] })).toThrow()
	})
	it('accepts create-geo-shape', () => {
		const p = CommandApplyParamsSchema.parse({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 100, h: 50 }],
		})
		expect(p.commands[0].kind).toBe('create-geo-shape')
	})
	it('result requires revision as number', () => {
		expect(() =>
			CommandApplyResultSchema.parse({ canvasId: 'page:1', revision: 'wrong', results: [] }),
		).toThrow()
	})
})
```

- [ ] **Step 7.2: 跑确认失败**

运行：`npx vitest run shared/rpc/__tests__/methods.test.ts`
预期：FAIL。

- [ ] **Step 7.3: 实现**

```ts
// shared/rpc/methods.ts
import { z } from 'zod'

// ---------- session.status ----------
export const SessionStatusParamsSchema = z.object({}).strict()
export type SessionStatusParams = z.infer<typeof SessionStatusParamsSchema>

const RuntimeSummarySchema = z.object({
	id: z.string(),
	state: z.enum(['connecting', 'ready', 'closing', 'closed']),
	methods: z.array(z.string()),
	protocolVersion: z.string(),
})

export const SessionStatusResultSchema = z.object({
	host: z.object({ version: z.string(), uptimeMs: z.number() }),
	runtimes: z.array(RuntimeSummarySchema),
	activeCanvasId: z.string().nullable(),
	canvasCount: z.number(),
})
export type SessionStatusResult = z.infer<typeof SessionStatusResultSchema>

// ---------- canvas.list ----------
export const CanvasListParamsSchema = z.object({}).strict()
export type CanvasListParams = z.infer<typeof CanvasListParamsSchema>

const CanvasSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	revision: z.number().int().nonnegative(),
})

export const CanvasListResultSchema = z.object({
	items: z.array(CanvasSummarySchema),
})
export type CanvasListResult = z.infer<typeof CanvasListResultSchema>

// ---------- shape (shared) ----------
const GeoShapeSchema = z.object({
	kind: z.literal('geo'),
	shapeId: z.string(),
	x: z.number(),
	y: z.number(),
	w: z.number().positive(),
	h: z.number().positive(),
	geo: z.enum(['rectangle', 'ellipse']),
})
export type GeoShape = z.infer<typeof GeoShapeSchema>
export const SnapshotShapeSchema = GeoShapeSchema

// ---------- canvas.snapshot ----------
export const CanvasSnapshotParamsSchema = z.object({
	canvasId: z.string().optional(),
})
export type CanvasSnapshotParams = z.infer<typeof CanvasSnapshotParamsSchema>

export const CanvasSnapshotResultSchema = z.object({
	canvasId: z.string(),
	revision: z.number().int().nonnegative(),
	shapes: z.array(SnapshotShapeSchema),
})
export type CanvasSnapshotResult = z.infer<typeof CanvasSnapshotResultSchema>

// ---------- canvas.diff ----------
export const CanvasDiffParamsSchema = z.object({
	canvasId: z.string().optional(),
	since: z.number().int().nonnegative(),
})
export type CanvasDiffParams = z.infer<typeof CanvasDiffParamsSchema>

const ShapeCreatedEntrySchema = z.object({
	kind: z.literal('shape-created'),
	revision: z.number().int().positive(),
	shapeId: z.string(),
	x: z.number(),
	y: z.number(),
	w: z.number().positive(),
	h: z.number().positive(),
	geo: z.enum(['rectangle', 'ellipse']),
})
export const HistoryEntrySchema = z.discriminatedUnion('kind', [ShapeCreatedEntrySchema])
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

export const CanvasDiffResultSchema = z.object({
	canvasId: z.string(),
	fromRevision: z.number().int().nonnegative(),
	toRevision: z.number().int().nonnegative(),
	entries: z.array(HistoryEntrySchema),
})
export type CanvasDiffResult = z.infer<typeof CanvasDiffResultSchema>

// ---------- canvas.create ----------
export const CanvasCreateParamsSchema = z.object({
	title: z.string().optional(),
})
export type CanvasCreateParams = z.infer<typeof CanvasCreateParamsSchema>

export const CanvasCreateResultSchema = z.object({
	canvasId: z.string(),
	title: z.string(),
	revision: z.number().int().nonnegative(),
})
export type CanvasCreateResult = z.infer<typeof CanvasCreateResultSchema>

// ---------- canvas.select ----------
export const CanvasSelectParamsSchema = z.object({
	canvasId: z.string(),
})
export type CanvasSelectParams = z.infer<typeof CanvasSelectParamsSchema>

export const CanvasSelectResultSchema = z.object({
	activeCanvasId: z.string(),
})
export type CanvasSelectResult = z.infer<typeof CanvasSelectResultSchema>

// ---------- command.apply ----------
export const CreateGeoShapeCommandSchema = z.object({
	kind: z.literal('create-geo-shape'),
	geo: z.enum(['rectangle', 'ellipse']),
	x: z.number(),
	y: z.number(),
	w: z.number().positive(),
	h: z.number().positive(),
})
export const CommandSchema = CreateGeoShapeCommandSchema
export type Command = z.infer<typeof CommandSchema>

export const CommandApplyParamsSchema = z.object({
	canvasId: z.string().optional(),
	expectedRevision: z.number().int().nonnegative().optional(),
	idempotencyKey: z.string().optional(),
	commands: z.array(CommandSchema).min(1),
})
export type CommandApplyParams = z.infer<typeof CommandApplyParamsSchema>

const CommandResultSchema = z.object({ shapeId: z.string() })

export const CommandApplyResultSchema = z.object({
	canvasId: z.string(),
	revision: z.number().int().nonnegative(),
	results: z.array(CommandResultSchema),
})
export type CommandApplyResult = z.infer<typeof CommandApplyResultSchema>

// ---------- 方法表 ----------
export const MethodMap = {
	'session.status': { params: SessionStatusParamsSchema, result: SessionStatusResultSchema },
	'canvas.list': { params: CanvasListParamsSchema, result: CanvasListResultSchema },
	'canvas.snapshot': { params: CanvasSnapshotParamsSchema, result: CanvasSnapshotResultSchema },
	'canvas.diff': { params: CanvasDiffParamsSchema, result: CanvasDiffResultSchema },
	'canvas.create': { params: CanvasCreateParamsSchema, result: CanvasCreateResultSchema },
	'canvas.select': { params: CanvasSelectParamsSchema, result: CanvasSelectResultSchema },
	'command.apply': { params: CommandApplyParamsSchema, result: CommandApplyResultSchema },
} as const
export type MethodName = keyof typeof MethodMap

export const SCHEMA_FINGERPRINT = 'mvp-v1'
```

- [ ] **Step 7.4: 跑确认通过**

运行：`npx vitest run shared/rpc/__tests__/methods.test.ts`
预期：PASS。

- [ ] **Step 7.5: 提交点**

---

### Task 8: `shared/rpc/index.ts`

**涉及文件：**
- 新建：`shared/rpc/index.ts`

- [ ] **Step 8.1: 实现**

```ts
// shared/rpc/index.ts
export * from './envelope'
export * from './errors'
export * from './capability'
export * from './methods'
```

- [ ] **Step 8.2: 跑全部已写测试**

运行：`npx vitest run shared/rpc`
预期：全部 PASS。

- [ ] **Step 8.3: 提交点**

Team T1 收工。

---

# Team T2：Host 侧（`host/**`）

### Task 9: `host/infra/errors.ts`

**涉及文件：**
- 新建：`host/infra/errors.ts`

- [ ] **Step 9.1: 实现**

```ts
// host/infra/errors.ts
import { ErrorCodes } from '../../shared/rpc'

export class DomainError extends Error {
	constructor(
		public readonly code: number,
		message: string,
		public readonly data?: unknown,
	) {
		super(message)
		this.name = 'DomainError'
	}
}

export class RuntimeUnavailableError extends DomainError {
	constructor() { super(ErrorCodes.runtimeUnavailable, 'No runtime available') }
}
export class TimeoutError extends DomainError {
	constructor(ms: number) { super(ErrorCodes.timeout, `Timed out after ${ms}ms`) }
}
export class CanvasNotFoundError extends DomainError {
	constructor(id: string) { super(ErrorCodes.canvasNotFound, `Canvas not found: ${id}`, { id }) }
}
export class InvalidParamsError extends DomainError {
	constructor(message: string, data?: unknown) { super(ErrorCodes.invalidParams, message, data) }
}
export class MethodNotFoundError extends DomainError {
	constructor(method: string) {
		super(ErrorCodes.methodNotFound, `Method not found: ${method}`, { method })
	}
}
```

- [ ] **Step 9.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 9.3: 提交点**

---

### Task 10: `host/infra/RuntimeGateway.ts`

**涉及文件：**
- 新建：`host/infra/RuntimeGateway.ts`

- [ ] **Step 10.1: 实现**

```ts
// host/infra/RuntimeGateway.ts
import type { MethodName, RuntimeCapability } from '../../shared/rpc'

export type RuntimeId = string & { readonly _brand: 'RuntimeId' }
export type GatewayState = 'connecting' | 'ready' | 'closing' | 'closed'

export interface RequestOptions {
	signal?: AbortSignal
	timeoutMs?: number
	idempotencyKey?: string
	traceparent?: string
}

export interface RuntimeGateway {
	readonly id: RuntimeId
	readonly capability: RuntimeCapability
	readonly state: GatewayState
	request<M extends MethodName>(method: M, params: unknown, options?: RequestOptions): Promise<unknown>
	close(reason?: string): Promise<void>
}
```

- [ ] **Step 10.2: 提交点**

---

### Task 11: `host/infra/RuntimeRegistry.ts`

**涉及文件：**
- 新建：`host/infra/RuntimeRegistry.ts`
- 新建：`host/__tests__/RuntimeRegistry.test.ts`

- [ ] **Step 11.1: 写失败测试**

```ts
// host/__tests__/RuntimeRegistry.test.ts
import { describe, expect, it } from 'vitest'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

function gw(id: string): RuntimeGateway {
	return {
		id: id as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], schemaFingerprint: 'mvp-v1' },
		state: 'ready',
		async request() { return null },
		async close() {},
	}
}

describe('RuntimeRegistry', () => {
	it('register + list', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'))
		r.register(gw('b'))
		expect(r.size()).toBe(2)
		expect(r.list().map((g) => g.id)).toEqual(['a', 'b'])
	})
	it('unregister', () => {
		const r = new RuntimeRegistry()
		r.register(gw('a'))
		r.unregister('a' as RuntimeId)
		expect(r.size()).toBe(0)
	})
	it('get unknown returns undefined', () => {
		expect(new RuntimeRegistry().get('x' as RuntimeId)).toBeUndefined()
	})
})
```

- [ ] **Step 11.2: 跑确认失败**

运行：`npx vitest run host/__tests__/RuntimeRegistry.test.ts`
预期：FAIL。

- [ ] **Step 11.3: 实现**

```ts
// host/infra/RuntimeRegistry.ts
import type { RuntimeGateway, RuntimeId } from './RuntimeGateway'

export class RuntimeRegistry {
	private readonly gateways = new Map<RuntimeId, RuntimeGateway>()
	register(gateway: RuntimeGateway): void { this.gateways.set(gateway.id, gateway) }
	unregister(id: RuntimeId): void { this.gateways.delete(id) }
	get(id: RuntimeId): RuntimeGateway | undefined { return this.gateways.get(id) }
	list(): RuntimeGateway[] { return Array.from(this.gateways.values()) }
	size(): number { return this.gateways.size }
}
```

- [ ] **Step 11.4: 跑确认通过**

运行：`npx vitest run host/__tests__/RuntimeRegistry.test.ts`
预期：PASS（3 个）。

- [ ] **Step 11.5: 提交点**

---

### Task 12: `host/infra/RuntimeRouter.ts`

**涉及文件：**
- 新建：`host/infra/RuntimeRouter.ts`

- [ ] **Step 12.1: 实现**

```ts
// host/infra/RuntimeRouter.ts
import { RuntimeUnavailableError } from './errors'
import type { RuntimeGateway } from './RuntimeGateway'
import type { RuntimeRegistry } from './RuntimeRegistry'

export class RuntimeRouter {
	constructor(private readonly registry: RuntimeRegistry) {}
	pick(): RuntimeGateway {
		const [first] = this.registry.list()
		if (!first) throw new RuntimeUnavailableError()
		return first
	}
}
```

- [ ] **Step 12.2: 提交点**

---

### Task 13: `host/infra/WsRuntimeTransport.ts`（含 `broadcastShutdown`）

**涉及文件：**
- 新建：`host/infra/WsRuntimeTransport.ts`

- [ ] **Step 13.1: 实现**

```ts
// host/infra/WsRuntimeTransport.ts
import { WebSocket, WebSocketServer } from 'ws'
import {
	HandshakeRequestSchema,
	type RuntimeCapability,
} from '../../shared/rpc'
import { TimeoutError } from './errors'
import type {
	GatewayState,
	RequestOptions,
	RuntimeGateway,
	RuntimeId,
} from './RuntimeGateway'
import { RuntimeRegistry } from './RuntimeRegistry'

export interface WsRuntimeTransportOptions {
	port: number
	registry: RuntimeRegistry
	handshakeTimeoutMs?: number
}

export class WsRuntimeTransport {
	private readonly server: WebSocketServer
	private readonly registry: RuntimeRegistry
	private readonly handshakeTimeoutMs: number
	private nextRuntimeSeq = 0

	constructor(options: WsRuntimeTransportOptions) {
		this.registry = options.registry
		this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000
		this.server = new WebSocketServer({ port: options.port })
		this.server.on('connection', (ws) => this.acceptConnection(ws))
	}

	get port(): number {
		const addr = this.server.address()
		if (typeof addr === 'object' && addr !== null) return addr.port
		throw new Error('WsRuntimeTransport has no bound address')
	}

	broadcastShutdown(reason = 'requested'): void {
		const msg = JSON.stringify({ type: 'session.shutdown', reason })
		for (const client of this.server.clients) {
			if (client.readyState === WebSocket.OPEN) {
				try { client.send(msg) } catch { /* ignore per-client send errors */ }
			}
		}
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			for (const client of this.server.clients) client.terminate()
			this.server.close((err) => (err ? reject(err) : resolve()))
		})
	}

	private acceptConnection(ws: WebSocket): void {
		let settled = false
		const timer = setTimeout(() => {
			if (!settled) { settled = true; ws.terminate() }
		}, this.handshakeTimeoutMs)
		ws.once('message', (raw) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			try {
				const parsed = HandshakeRequestSchema.parse(JSON.parse(String(raw)))
				this.onHandshake(ws, parsed.capability)
			} catch {
				ws.close(1008, 'invalid handshake')
			}
		})
	}

	private onHandshake(ws: WebSocket, capability: RuntimeCapability): void {
		const id = `rt-${++this.nextRuntimeSeq}` as RuntimeId
		const gateway = new WsRuntimeGateway(ws, id, capability)
		this.registry.register(gateway)
		ws.send(JSON.stringify({ type: 'handshake-ack', runtimeId: id, accepted: true }))
		ws.on('close', () => {
			gateway.markClosed()
			this.registry.unregister(id)
		})
	}
}

interface PendingRequest {
	resolve: (value: unknown) => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout
}

class WsRuntimeGateway implements RuntimeGateway {
	public readonly id: RuntimeId
	public readonly capability: RuntimeCapability
	private currentState: GatewayState = 'ready'
	private readonly pending = new Map<number, PendingRequest>()
	private nextReqId = 0

	constructor(private readonly ws: WebSocket, id: RuntimeId, capability: RuntimeCapability) {
		this.id = id
		this.capability = capability
		this.ws.on('message', (raw) => this.onMessage(String(raw)))
	}

	get state(): GatewayState { return this.currentState }

	markClosed(): void {
		this.currentState = 'closed'
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer)
			entry.reject(new Error('Runtime connection closed'))
		}
		this.pending.clear()
	}

	request(method: string, params: unknown, options?: RequestOptions): Promise<unknown> {
		const id = ++this.nextReqId
		const timeoutMs = options?.timeoutMs ?? 30_000
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pending.delete(id)) reject(new TimeoutError(timeoutMs))
			}, timeoutMs)
			this.pending.set(id, { resolve, reject, timer })
			try {
				this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
			} catch (err) {
				clearTimeout(timer)
				this.pending.delete(id)
				reject(err as Error)
				return
			}
			options?.signal?.addEventListener('abort', () => {
				const entry = this.pending.get(id)
				if (!entry) return
				this.pending.delete(id)
				clearTimeout(entry.timer)
				entry.reject(new Error('Cancelled'))
			})
		})
	}

	async close(): Promise<void> {
		this.currentState = 'closing'
		this.ws.close()
	}

	private onMessage(raw: string): void {
		let msg: unknown
		try { msg = JSON.parse(raw) } catch { return }
		if (!msg || typeof msg !== 'object') return
		const m = msg as { id?: number; result?: unknown; error?: { message?: string; code?: number } }
		if (typeof m.id !== 'number') return
		const entry = this.pending.get(m.id)
		if (!entry) return
		this.pending.delete(m.id)
		clearTimeout(entry.timer)
		if ('result' in m) entry.resolve(m.result)
		else if (m.error) entry.reject(new Error(m.error.message ?? 'Runtime error'))
		else entry.reject(new Error('Malformed runtime response'))
	}
}
```

- [ ] **Step 13.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 13.3: 提交点**

---

### Task 14: `host/domain/*.ts`

**涉及文件：**
- 新建：`host/domain/Revision.ts`
- 新建：`host/domain/Session.ts`
- 新建：`host/domain/Canvas.ts`
- 新建：`host/domain/CommandBatch.ts`

- [ ] **Step 14.1: 实现 Revision.ts**

```ts
// host/domain/Revision.ts
export type Revision = number
export const INITIAL_REVISION: Revision = 0
```

- [ ] **Step 14.2: 实现 Session.ts**

```ts
// host/domain/Session.ts
export interface SessionSnapshot {
	readonly hostVersion: string
	readonly startedAt: number
	readonly activeCanvasId: string | null
}
```

- [ ] **Step 14.3: 实现 Canvas.ts**

```ts
// host/domain/Canvas.ts
import type { Revision } from './Revision'

export interface CanvasSummary {
	readonly id: string
	readonly title: string
	readonly revision: Revision
}
```

- [ ] **Step 14.4: 实现 CommandBatch.ts**

```ts
// host/domain/CommandBatch.ts
import type { Command } from '../../shared/rpc'

export interface CommandBatch {
	readonly canvasId: string | undefined
	readonly expectedRevision: number | undefined
	readonly idempotencyKey: string | undefined
	readonly commands: readonly Command[]
}
```

- [ ] **Step 14.5: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 14.6: 提交点**

---

### Task 15: `host/ApplicationServices/SessionService.ts`

**涉及文件：**
- 新建：`host/ApplicationServices/SessionService.ts`
- 新建：`host/__tests__/SessionService.test.ts`

- [ ] **Step 15.1: 写失败测试**

```ts
// host/__tests__/SessionService.test.ts
import { describe, expect, it } from 'vitest'
import { SessionService } from '../ApplicationServices/SessionService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

function gw(id: string, canvasCount: number): RuntimeGateway {
	return {
		id: id as RuntimeId,
		capability: { protocolVersion: '1', methods: ['canvas.list'], flags: [], schemaFingerprint: 'mvp-v1' },
		state: 'ready',
		async request(method) {
			if (method === 'canvas.list') {
				return { items: Array.from({ length: canvasCount }, (_, i) => ({
					id: `page:${i + 1}`, title: `Page ${i + 1}`, revision: 0,
				})) }
			}
			throw new Error(`unexpected ${method}`)
		},
		async close() {},
	}
}

describe('SessionService', () => {
	it('reports zero runtimes', async () => {
		const svc = new SessionService(new RuntimeRegistry(), { hostVersion: '0.0.1', startedAt: 0 })
		const r = await svc.status()
		expect(r.runtimes).toEqual([])
		expect(r.canvasCount).toBe(0)
		expect(r.activeCanvasId).toBeNull()
	})
	it('aggregates canvasCount from runtimes', async () => {
		const reg = new RuntimeRegistry()
		reg.register(gw('rt-1', 2))
		const svc = new SessionService(reg, { hostVersion: '0.0.1', startedAt: Date.now() - 20 })
		const r = await svc.status()
		expect(r.runtimes).toHaveLength(1)
		expect(r.canvasCount).toBe(2)
		expect(r.host.uptimeMs).toBeGreaterThanOrEqual(0)
	})
})
```

- [ ] **Step 15.2: 跑确认失败**

运行：`npx vitest run host/__tests__/SessionService.test.ts`
预期：FAIL。

- [ ] **Step 15.3: 实现**

```ts
// host/ApplicationServices/SessionService.ts
import type { SessionStatusResult } from '../../shared/rpc'
import type { RuntimeRegistry } from '../infra/RuntimeRegistry'

export interface SessionContext {
	readonly hostVersion: string
	readonly startedAt: number
}

export class SessionService {
	constructor(
		private readonly registry: RuntimeRegistry,
		private readonly ctx: SessionContext,
	) {}

	async status(): Promise<SessionStatusResult> {
		const gateways = this.registry.list()
		let canvasCount = 0
		for (const gw of gateways) {
			try {
				const res = (await gw.request('canvas.list', {})) as { items?: unknown[] }
				if (Array.isArray(res.items)) canvasCount += res.items.length
			} catch { /* runtime 可能正在关闭；对 status 不致命 */ }
		}
		return {
			host: { version: this.ctx.hostVersion, uptimeMs: Math.max(0, Date.now() - this.ctx.startedAt) },
			runtimes: gateways.map((gw) => ({
				id: gw.id,
				state: gw.state,
				methods: gw.capability.methods,
				protocolVersion: gw.capability.protocolVersion,
			})),
			activeCanvasId: null,
			canvasCount,
		}
	}
}
```

- [ ] **Step 15.4: 跑确认通过**

运行：`npx vitest run host/__tests__/SessionService.test.ts`
预期：PASS。

- [ ] **Step 15.5: 提交点**

---

### Task 16: `host/ApplicationServices/CanvasService.ts`（list / snapshot / diff / create / select）

**涉及文件：**
- 新建：`host/ApplicationServices/CanvasService.ts`
- 新建：`host/__tests__/CanvasService.test.ts`

- [ ] **Step 16.1: 写失败测试**

```ts
// host/__tests__/CanvasService.test.ts
import { describe, expect, it } from 'vitest'
import { CanvasService } from '../ApplicationServices/CanvasService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'
import { RuntimeUnavailableError } from '../infra/errors'

function gw(handler: (method: string, params: unknown) => unknown): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], schemaFingerprint: 'mvp-v1' },
		state: 'ready',
		async request(method, params) { return handler(method, params) },
		async close() {},
	}
}

function svcWith(g: RuntimeGateway): CanvasService {
	const r = new RuntimeRegistry(); r.register(g)
	return new CanvasService(new RuntimeRouter(r))
}

describe('CanvasService', () => {
	it('list forwards', async () => {
		const s = svcWith(gw(() => ({ items: [{ id: 'page:1', title: 'P1', revision: 3 }] })))
		const r = await s.list()
		expect(r.items[0].id).toBe('page:1')
	})

	it('snapshot forwards params', async () => {
		const s = svcWith(gw((m, p) => {
			if (m !== 'canvas.snapshot') throw new Error('wrong method')
			const cid = (p as { canvasId?: string }).canvasId ?? 'page:1'
			return { canvasId: cid, revision: 0, shapes: [] }
		}))
		const r = await s.snapshot({ canvasId: 'page:7' })
		expect(r.canvasId).toBe('page:7')
	})

	it('diff forwards since', async () => {
		const s = svcWith(gw((m, p) => {
			if (m !== 'canvas.diff') throw new Error('wrong method')
			const pp = p as { since: number }
			return { canvasId: 'page:1', fromRevision: pp.since, toRevision: pp.since, entries: [] }
		}))
		const r = await s.diff({ since: 5 })
		expect(r.fromRevision).toBe(5)
	})

	it('create returns new canvas id', async () => {
		const s = svcWith(gw(() => ({ canvasId: 'page:new', title: 'Untitled', revision: 0 })))
		const r = await s.create({})
		expect(r.canvasId).toBe('page:new')
	})

	it('select returns active id', async () => {
		const s = svcWith(gw((_m, p) => ({ activeCanvasId: (p as { canvasId: string }).canvasId })))
		const r = await s.select({ canvasId: 'page:2' })
		expect(r.activeCanvasId).toBe('page:2')
	})

	it('throws RuntimeUnavailableError when no runtime', async () => {
		const s = new CanvasService(new RuntimeRouter(new RuntimeRegistry()))
		await expect(s.list()).rejects.toBeInstanceOf(RuntimeUnavailableError)
	})
})
```

- [ ] **Step 16.2: 跑确认失败**

运行：`npx vitest run host/__tests__/CanvasService.test.ts`
预期：FAIL。

- [ ] **Step 16.3: 实现**

```ts
// host/ApplicationServices/CanvasService.ts
import {
	CanvasCreateParamsSchema,
	CanvasCreateResultSchema,
	CanvasDiffParamsSchema,
	CanvasDiffResultSchema,
	CanvasListResultSchema,
	CanvasSelectParamsSchema,
	CanvasSelectResultSchema,
	CanvasSnapshotParamsSchema,
	CanvasSnapshotResultSchema,
	type CanvasCreateParams,
	type CanvasCreateResult,
	type CanvasDiffParams,
	type CanvasDiffResult,
	type CanvasListResult,
	type CanvasSelectParams,
	type CanvasSelectResult,
	type CanvasSnapshotParams,
	type CanvasSnapshotResult,
} from '../../shared/rpc'
import { InvalidParamsError } from '../infra/errors'
import type { RuntimeRouter } from '../infra/RuntimeRouter'
import type { MethodName } from '../../shared/rpc'
import type { ZodTypeAny } from 'zod'

export class CanvasService {
	constructor(private readonly router: RuntimeRouter) {}

	list(): Promise<CanvasListResult> {
		return this.forward('canvas.list', {}, CanvasListResultSchema)
	}
	snapshot(params: CanvasSnapshotParams): Promise<CanvasSnapshotResult> {
		return this.forward('canvas.snapshot', CanvasSnapshotParamsSchema.parse(params), CanvasSnapshotResultSchema)
	}
	diff(params: CanvasDiffParams): Promise<CanvasDiffResult> {
		return this.forward('canvas.diff', CanvasDiffParamsSchema.parse(params), CanvasDiffResultSchema)
	}
	create(params: CanvasCreateParams): Promise<CanvasCreateResult> {
		return this.forward('canvas.create', CanvasCreateParamsSchema.parse(params), CanvasCreateResultSchema)
	}
	select(params: CanvasSelectParams): Promise<CanvasSelectResult> {
		return this.forward('canvas.select', CanvasSelectParamsSchema.parse(params), CanvasSelectResultSchema)
	}

	private async forward<T>(method: MethodName, params: unknown, schema: ZodTypeAny): Promise<T> {
		const gateway = this.router.pick()
		const raw = await gateway.request(method, params)
		const parsed = schema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError(`Runtime returned invalid ${method} result`, parsed.error.issues)
		}
		return parsed.data as T
	}
}
```

- [ ] **Step 16.4: 跑确认通过**

运行：`npx vitest run host/__tests__/CanvasService.test.ts`
预期：6 个 PASS。

- [ ] **Step 16.5: 提交点**

---

### Task 17: `host/ApplicationServices/CommandService.ts`

**涉及文件：**
- 新建：`host/ApplicationServices/CommandService.ts`
- 新建：`host/__tests__/CommandService.test.ts`

- [ ] **Step 17.1: 写失败测试**

```ts
// host/__tests__/CommandService.test.ts
import { describe, expect, it } from 'vitest'
import { CommandService } from '../ApplicationServices/CommandService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

function gw(): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: { protocolVersion: '1', methods: [], flags: [], schemaFingerprint: 'mvp-v1' },
		state: 'ready',
		async request(_m, params) {
			const p = params as { commands: unknown[]; canvasId?: string }
			return {
				canvasId: p.canvasId ?? 'page:1',
				revision: 1,
				results: p.commands.map(() => ({ shapeId: 'shape:1' })),
			}
		},
		async close() {},
	}
}

describe('CommandService', () => {
	it('applies commands', async () => {
		const r = new RuntimeRegistry(); r.register(gw())
		const s = new CommandService(new RuntimeRouter(r))
		const out = await s.apply({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})
		expect(out.revision).toBe(1)
		expect(out.results).toHaveLength(1)
	})
	it('rejects empty commands', async () => {
		const r = new RuntimeRegistry(); r.register(gw())
		const s = new CommandService(new RuntimeRouter(r))
		await expect(s.apply({ commands: [] } as unknown as Parameters<typeof s.apply>[0])).rejects.toThrow()
	})
})
```

- [ ] **Step 17.2: 跑确认失败**

运行：`npx vitest run host/__tests__/CommandService.test.ts`
预期：FAIL。

- [ ] **Step 17.3: 实现**

```ts
// host/ApplicationServices/CommandService.ts
import {
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	type CommandApplyParams,
	type CommandApplyResult,
} from '../../shared/rpc'
import { InvalidParamsError } from '../infra/errors'
import type { RuntimeRouter } from '../infra/RuntimeRouter'

export class CommandService {
	constructor(private readonly router: RuntimeRouter) {}

	async apply(params: CommandApplyParams): Promise<CommandApplyResult> {
		const validated = CommandApplyParamsSchema.parse(params)
		const gateway = this.router.pick()
		const raw = await gateway.request('command.apply', validated)
		const parsed = CommandApplyResultSchema.safeParse(raw)
		if (!parsed.success) {
			throw new InvalidParamsError('Runtime returned invalid command.apply result', parsed.error.issues)
		}
		return parsed.data
	}
}
```

- [ ] **Step 17.4: 跑确认通过**

运行：`npx vitest run host/__tests__/CommandService.test.ts`
预期：PASS（2 个）。

- [ ] **Step 17.5: 提交点**

---

### Task 18: `host/ApiGateway.ts`（含 `/admin/shutdown`）

**涉及文件：**
- 新建：`host/ApiGateway.ts`
- 新建：`host/__tests__/ApiGateway.test.ts`

- [ ] **Step 18.1: 写失败测试**

```ts
// host/__tests__/ApiGateway.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiGateway } from '../ApiGateway'
import { SessionService } from '../ApplicationServices/SessionService'
import { CanvasService } from '../ApplicationServices/CanvasService'
import { CommandService } from '../ApplicationServices/CommandService'
import { RuntimeRegistry } from '../infra/RuntimeRegistry'
import { RuntimeRouter } from '../infra/RuntimeRouter'
import type { RuntimeGateway, RuntimeId } from '../infra/RuntimeGateway'

function stubGateway(): RuntimeGateway {
	return {
		id: 'rt-1' as RuntimeId,
		capability: {
			protocolVersion: '1',
			methods: ['canvas.list','canvas.snapshot','canvas.diff','canvas.create','canvas.select','command.apply'],
			flags: [],
			schemaFingerprint: 'mvp-v1',
		},
		state: 'ready',
		async request(method, params) {
			switch (method) {
				case 'canvas.list': return { items: [{ id: 'page:1', title: 'P1', revision: 0 }] }
				case 'canvas.snapshot': return { canvasId: 'page:1', revision: 0, shapes: [] }
				case 'canvas.diff': return { canvasId: 'page:1', fromRevision: 0, toRevision: 0, entries: [] }
				case 'canvas.create': return { canvasId: 'page:new', title: 'Untitled', revision: 0 }
				case 'canvas.select': {
					const p = params as { canvasId: string }
					return { activeCanvasId: p.canvasId }
				}
				case 'command.apply': {
					const p = params as { commands: unknown[] }
					return { canvasId: 'page:1', revision: 1, results: p.commands.map(() => ({ shapeId: 'shape:1' })) }
				}
			}
			throw new Error('unexpected')
		},
		async close() {},
	}
}

describe('ApiGateway', () => {
	let gateway: ApiGateway
	let baseUrl: string
	let shutdownSpy: ReturnType<typeof vi.fn>

	beforeEach(async () => {
		const registry = new RuntimeRegistry(); registry.register(stubGateway())
		const router = new RuntimeRouter(registry)
		shutdownSpy = vi.fn()
		gateway = new ApiGateway({
			port: 0,
			session: new SessionService(registry, { hostVersion: '0.0.1', startedAt: Date.now() }),
			canvas: new CanvasService(router),
			command: new CommandService(router),
			onShutdown: () => { shutdownSpy(); return Promise.resolve() },
		})
		await gateway.listen()
		baseUrl = `http://127.0.0.1:${gateway.port}`
	})

	afterEach(async () => { await gateway.close() })

	async function rpc(body: unknown) {
		const res = await fetch(`${baseUrl}/rpc`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
		return res.json() as Promise<{ result?: unknown; error?: { code: number; message: string } }>
	}

	it('dispatches session.status', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'session.status', params: {} })
		expect(r.error).toBeUndefined()
	})
	it('dispatches canvas.list', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'canvas.list', params: {} })
		expect((r.result as { items: unknown[] }).items).toHaveLength(1)
	})
	it('dispatches canvas.snapshot', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 3, method: 'canvas.snapshot', params: {} })
		expect((r.result as { canvasId: string }).canvasId).toBe('page:1')
	})
	it('dispatches canvas.diff with since', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 4, method: 'canvas.diff', params: { since: 0 } })
		expect(r.result).toBeDefined()
	})
	it('dispatches canvas.create', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 5, method: 'canvas.create', params: {} })
		expect((r.result as { canvasId: string }).canvasId).toBe('page:new')
	})
	it('dispatches canvas.select', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 6, method: 'canvas.select', params: { canvasId: 'page:2' } })
		expect((r.result as { activeCanvasId: string }).activeCanvasId).toBe('page:2')
	})
	it('dispatches command.apply', async () => {
		const r = await rpc({
			jsonrpc: '2.0', id: 7, method: 'command.apply',
			params: { commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }] },
		})
		expect((r.result as { revision: number }).revision).toBe(1)
	})
	it('returns methodNotFound for unknown', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 8, method: 'x.y', params: {} })
		expect(r.error?.code).toBe(-32601)
	})
	it('returns parseError for invalid JSON', async () => {
		const res = await fetch(`${baseUrl}/rpc`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{not json',
		})
		const r = (await res.json()) as { error?: { code: number } }
		expect(r.error?.code).toBe(-32700)
	})
	it('returns invalidParams on schema failure', async () => {
		const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'command.apply', params: { commands: [] } })
		expect(r.error?.code).toBe(-32602)
	})
	it('POST /admin/shutdown triggers onShutdown', async () => {
		const res = await fetch(`${baseUrl}/admin/shutdown`, { method: 'POST' })
		expect(res.status).toBe(202)
		// onShutdown 是异步触发，给它一点时间
		await new Promise((r) => setTimeout(r, 30))
		expect(shutdownSpy).toHaveBeenCalledOnce()
	})
	it('rejects non-loopback /admin/shutdown', async () => {
		// 本测试运行在 127.0.0.1，已是 loopback；这里用 URL 路径模拟非 /admin/shutdown
		const res = await fetch(`${baseUrl}/admin/other`, { method: 'POST' })
		expect(res.status).toBe(404)
	})
})
```

- [ ] **Step 18.2: 跑确认失败**

运行：`npx vitest run host/__tests__/ApiGateway.test.ts`
预期：FAIL。

- [ ] **Step 18.3: 实现**

```ts
// host/ApiGateway.ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
	ErrorCodes,
	JsonRpcRequestSchema,
	type JsonRpcErrorResponse,
	type JsonRpcSuccess,
	type MethodName,
} from '../shared/rpc'
import type { CanvasService } from './ApplicationServices/CanvasService'
import type { CommandService } from './ApplicationServices/CommandService'
import type { SessionService } from './ApplicationServices/SessionService'
import { DomainError, MethodNotFoundError } from './infra/errors'

export interface ApiGatewayOptions {
	port: number
	session: SessionService
	canvas: CanvasService
	command: CommandService
	onShutdown?: () => Promise<void>
}

export class ApiGateway {
	private readonly server: Server
	private readonly opts: ApiGatewayOptions
	private boundPort = 0

	constructor(options: ApiGatewayOptions) {
		this.opts = options
		this.server = createServer((req, res) => { void this.handle(req, res) })
	}

	get port(): number { return this.boundPort }

	listen(): Promise<void> {
		return new Promise((resolve) => {
			this.server.listen(this.opts.port, '127.0.0.1', () => {
				const addr = this.server.address()
				if (typeof addr === 'object' && addr !== null) this.boundPort = addr.port
				resolve()
			})
		})
	}

	close(): Promise<void> {
		return new Promise((resolve, reject) =>
			this.server.close((err) => (err ? reject(err) : resolve())))
	}

	private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
		if (req.method === 'POST' && req.url === '/admin/shutdown') {
			res.writeHead(202).end()
			if (this.opts.onShutdown) queueMicrotask(() => { void this.opts.onShutdown!() })
			return
		}
		if (req.method !== 'POST' || req.url !== '/rpc') {
			res.writeHead(404).end()
			return
		}
		const body = await readBody(req)
		let requestId: number | string | null = null
		try {
			const json = JSON.parse(body)
			const parsed = JsonRpcRequestSchema.parse(json)
			requestId = parsed.id
			const result = await this.dispatch(parsed.method as MethodName, parsed.params)
			const success: JsonRpcSuccess = { jsonrpc: '2.0', id: requestId, result }
			this.sendJson(res, 200, success)
		} catch (err) {
			this.sendJson(res, 200, this.toErrorResponse(requestId, err))
		}
	}

	private async dispatch(method: MethodName | string, params: unknown): Promise<unknown> {
		switch (method) {
			case 'session.status': return this.opts.session.status()
			case 'canvas.list': return this.opts.canvas.list()
			case 'canvas.snapshot': return this.opts.canvas.snapshot(params as Parameters<CanvasService['snapshot']>[0])
			case 'canvas.diff': return this.opts.canvas.diff(params as Parameters<CanvasService['diff']>[0])
			case 'canvas.create': return this.opts.canvas.create(params as Parameters<CanvasService['create']>[0])
			case 'canvas.select': return this.opts.canvas.select(params as Parameters<CanvasService['select']>[0])
			case 'command.apply': return this.opts.command.apply(params as Parameters<CommandService['apply']>[0])
			default: throw new MethodNotFoundError(method)
		}
	}

	private toErrorResponse(id: number | string | null, err: unknown): JsonRpcErrorResponse {
		if (err instanceof SyntaxError) {
			return { jsonrpc: '2.0', id, error: { code: ErrorCodes.parseError, message: 'Parse error' } }
		}
		if (err instanceof DomainError) {
			return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } }
		}
		if (err && typeof err === 'object' && 'issues' in err) {
			return {
				jsonrpc: '2.0', id,
				error: {
					code: ErrorCodes.invalidParams,
					message: 'Invalid params',
					data: (err as { issues: unknown }).issues,
				},
			}
		}
		const message = err instanceof Error ? err.message : 'Internal error'
		return { jsonrpc: '2.0', id, error: { code: ErrorCodes.internal, message } }
	}

	private sendJson(res: ServerResponse, status: number, body: unknown): void {
		res.writeHead(status, { 'content-type': 'application/json' })
		res.end(JSON.stringify(body))
	}
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on('data', (c) => chunks.push(c as Buffer))
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
		req.on('error', reject)
	})
}
```

- [ ] **Step 18.4: 跑确认通过**

运行：`npx vitest run host/__tests__/ApiGateway.test.ts`
预期：12 个 PASS。

- [ ] **Step 18.5: 提交点**

---

### Task 19: `host/HostProcess.ts`（含 shutdown 串联）

**涉及文件：**
- 新建：`host/HostProcess.ts`

- [ ] **Step 19.1: 实现**

```ts
// host/HostProcess.ts
import { ApiGateway } from './ApiGateway'
import { CanvasService } from './ApplicationServices/CanvasService'
import { CommandService } from './ApplicationServices/CommandService'
import { SessionService } from './ApplicationServices/SessionService'
import { RuntimeRegistry } from './infra/RuntimeRegistry'
import { RuntimeRouter } from './infra/RuntimeRouter'
import { WsRuntimeTransport } from './infra/WsRuntimeTransport'

const HOST_VERSION = '0.0.1'

export interface HostConfig {
	readonly httpPort: number
	readonly wsPort: number
}

export class HostProcess {
	readonly registry: RuntimeRegistry
	readonly router: RuntimeRouter
	readonly apiGateway: ApiGateway
	readonly wsTransport: WsRuntimeTransport
	private stopping = false

	constructor(config: HostConfig) {
		const startedAt = Date.now()
		this.registry = new RuntimeRegistry()
		this.router = new RuntimeRouter(this.registry)
		const session = new SessionService(this.registry, { hostVersion: HOST_VERSION, startedAt })
		const canvas = new CanvasService(this.router)
		const command = new CommandService(this.router)
		this.wsTransport = new WsRuntimeTransport({ port: config.wsPort, registry: this.registry })
		this.apiGateway = new ApiGateway({
			port: config.httpPort,
			session, canvas, command,
			onShutdown: () => this.stop('requested'),
		})
	}

	async start(): Promise<void> {
		await this.apiGateway.listen()
	}

	async stop(reason = 'signal'): Promise<void> {
		if (this.stopping) return
		this.stopping = true
		try { this.wsTransport.broadcastShutdown(reason) } catch { /* best effort */ }
		// 给 runtime 一小段时间收到通知
		await new Promise((r) => setTimeout(r, 100))
		await this.wsTransport.close()
		await this.apiGateway.close()
	}
}

async function main(): Promise<void> {
	const host = new HostProcess({ httpPort: 8787, wsPort: 8788 })
	await host.start()
	// eslint-disable-next-line no-console
	console.log(
		`[tldraw-host] ready: http=127.0.0.1:${host.apiGateway.port} ws=127.0.0.1:${host.wsTransport.port}`,
	)
	const shutdown = async (reason: string) => {
		await host.stop(reason)
		process.exit(0)
	}
	process.on('SIGINT', () => { void shutdown('SIGINT') })
	process.on('SIGTERM', () => { void shutdown('SIGTERM') })
}

const invokedDirectly =
	typeof import.meta.url === 'string' &&
	typeof process.argv[1] === 'string' &&
	import.meta.url === new URL(`file://${process.argv[1]}`).href

if (invokedDirectly) void main()
```

- [ ] **Step 19.2: 跑类型检查 + 手动 smoke**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

运行：`npm run host`
预期：输出 `[tldraw-host] ready: http=127.0.0.1:8787 ws=127.0.0.1:8788`。
Ctrl-C：干净退出。

- [ ] **Step 19.3: 提交点**

Team T2 收工。

---

# Team T3：浏览器端（`client/runtime/**` + `client/App.tsx`）

### Task 20: `client/runtime/RuntimeAdapter.ts`

**涉及文件：**
- 新建：`client/runtime/RuntimeAdapter.ts`

- [ ] **Step 20.1: 实现**

```ts
// client/runtime/RuntimeAdapter.ts
export interface RuntimeInvokeContext {
	readonly requestId: number
	readonly traceparent?: string
}

export interface RuntimeAdapter {
	invoke(method: string, params: unknown, ctx: RuntimeInvokeContext): Promise<unknown>
}
```

- [ ] **Step 20.2: 提交点**

---

### Task 21: `client/runtime/TldrawRuntimeAdapter.ts`（7 个方法 + history entries）

**涉及文件：**
- 新建：`client/runtime/TldrawRuntimeAdapter.ts`
- 新建：`client/runtime/__tests__/TldrawRuntimeAdapter.test.ts`

- [ ] **Step 21.1: 写失败测试**

```ts
// client/runtime/__tests__/TldrawRuntimeAdapter.test.ts
import { describe, expect, it } from 'vitest'
import { TldrawRuntimeAdapter } from '../TldrawRuntimeAdapter'

interface FakePage { id: string; name: string }
interface FakeShape {
	id: string; type: string; x: number; y: number; parentId: string
	props: { geo: 'rectangle' | 'ellipse'; w: number; h: number }
}

class FakeEditor {
	pages: FakePage[] = [{ id: 'page:1', name: 'Page 1' }]
	currentPageId = 'page:1'
	shapes: FakeShape[] = []
	nextShape = 1
	nextPage = 2
	getPages() { return this.pages }
	getCurrentPageId() { return this.currentPageId }
	setCurrentPage(id: string) { this.currentPageId = id }
	batch(fn: () => void) { fn() }
	createShape(partial: Omit<FakeShape, 'id' | 'parentId'>) {
		const id = `shape:${this.nextShape++}`
		this.shapes.push({ ...partial, id, parentId: this.currentPageId } as FakeShape)
	}
	getCurrentPageShapes() { return this.shapes.filter((s) => s.parentId === this.currentPageId) }
	createPage(opts: { name?: string }) {
		const id = `page:${this.nextPage++}`
		this.pages.push({ id, name: opts.name ?? 'Untitled' })
		return { id }
	}
}

function mk(): { a: TldrawRuntimeAdapter; e: FakeEditor } {
	const e = new FakeEditor()
	const a = new TldrawRuntimeAdapter(e as unknown as import('tldraw').Editor)
	return { a, e }
}

describe('TldrawRuntimeAdapter', () => {
	it('canvas.list returns pages', async () => {
		const { a } = mk()
		const r = (await a.invoke('canvas.list', {}, { requestId: 1 })) as {
			items: Array<{ id: string; title: string; revision: number }>
		}
		expect(r.items).toEqual([{ id: 'page:1', title: 'Page 1', revision: 0 }])
	})

	it('canvas.snapshot returns shapes', async () => {
		const { a } = mk()
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		}, { requestId: 2 })
		const r = (await a.invoke('canvas.snapshot', {}, { requestId: 3 })) as {
			canvasId: string; revision: number; shapes: unknown[]
		}
		expect(r.canvasId).toBe('page:1')
		expect(r.revision).toBe(1)
		expect(r.shapes).toHaveLength(1)
	})

	it('canvas.diff returns shape-created entries since revision', async () => {
		const { a } = mk()
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'ellipse', x: 1, y: 1, w: 5, h: 5 }],
		}, { requestId: 4 })
		await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 2, y: 2, w: 5, h: 5 }],
		}, { requestId: 5 })
		const r = (await a.invoke('canvas.diff', { since: 1 }, { requestId: 6 })) as {
			fromRevision: number; toRevision: number; entries: Array<{ revision: number; kind: string }>
		}
		expect(r.fromRevision).toBe(1)
		expect(r.toRevision).toBe(2)
		expect(r.entries).toHaveLength(1)
		expect(r.entries[0].kind).toBe('shape-created')
		expect(r.entries[0].revision).toBe(2)
	})

	it('canvas.create adds a page', async () => {
		const { a, e } = mk()
		const r = (await a.invoke('canvas.create', { title: 'New' }, { requestId: 7 })) as { canvasId: string }
		expect(e.pages).toHaveLength(2)
		expect(r.canvasId).toBe('page:2')
	})

	it('canvas.select switches active page', async () => {
		const { a, e } = mk()
		await a.invoke('canvas.create', {}, { requestId: 8 })
		await a.invoke('canvas.select', { canvasId: 'page:2' }, { requestId: 9 })
		expect(e.currentPageId).toBe('page:2')
	})

	it('command.apply falls back to active canvas when canvasId omitted', async () => {
		const { a, e } = mk()
		await a.invoke('canvas.create', {}, { requestId: 10 })
		await a.invoke('canvas.select', { canvasId: 'page:2' }, { requestId: 11 })
		const r = (await a.invoke('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		}, { requestId: 12 })) as { canvasId: string }
		expect(r.canvasId).toBe('page:2')
		expect(e.shapes[0].parentId).toBe('page:2')
	})

	it('unknown method throws', async () => {
		const { a } = mk()
		await expect(a.invoke('mystery', {}, { requestId: 99 })).rejects.toThrow()
	})
})
```

- [ ] **Step 21.2: 跑确认失败**

运行：`npx vitest run client/runtime/__tests__/TldrawRuntimeAdapter.test.ts`
预期：FAIL。

- [ ] **Step 21.3: 实现**

```ts
// client/runtime/TldrawRuntimeAdapter.ts
import { createShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import {
	CanvasCreateParamsSchema,
	CanvasCreateResultSchema,
	CanvasDiffParamsSchema,
	CanvasDiffResultSchema,
	CanvasListResultSchema,
	CanvasSelectParamsSchema,
	CanvasSelectResultSchema,
	CanvasSnapshotParamsSchema,
	CanvasSnapshotResultSchema,
	CommandApplyParamsSchema,
	CommandApplyResultSchema,
	type CanvasCreateResult,
	type CanvasDiffResult,
	type CanvasListResult,
	type CanvasSelectResult,
	type CanvasSnapshotResult,
	type CommandApplyResult,
	type HistoryEntry,
} from '../../shared/rpc'
import type { RuntimeAdapter, RuntimeInvokeContext } from './RuntimeAdapter'

interface PerCanvasState {
	revision: number
	history: HistoryEntry[]
}

export class TldrawRuntimeAdapter implements RuntimeAdapter {
	private readonly state = new Map<string, PerCanvasState>()

	constructor(private readonly editor: Editor) {}

	async invoke(method: string, params: unknown, _ctx: RuntimeInvokeContext): Promise<unknown> {
		switch (method) {
			case 'canvas.list': return this.canvasList()
			case 'canvas.snapshot': return this.canvasSnapshot(params)
			case 'canvas.diff': return this.canvasDiff(params)
			case 'canvas.create': return this.canvasCreate(params)
			case 'canvas.select': return this.canvasSelect(params)
			case 'command.apply': return this.commandApply(params)
			default: throw new Error(`Method not found: ${method}`)
		}
	}

	private stateFor(canvasId: string): PerCanvasState {
		let s = this.state.get(canvasId)
		if (!s) { s = { revision: 0, history: [] }; this.state.set(canvasId, s) }
		return s
	}

	private canvasList(): CanvasListResult {
		const items = this.editor.getPages().map((p) => ({
			id: String(p.id),
			title: p.name,
			revision: this.stateFor(String(p.id)).revision,
		}))
		return CanvasListResultSchema.parse({ items })
	}

	private resolveCanvasId(requested: string | undefined): string {
		if (requested) return requested
		return String(this.editor.getCurrentPageId())
	}

	private canvasSnapshot(params: unknown): CanvasSnapshotResult {
		const parsed = CanvasSnapshotParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const pageShapes = this.editor.getCurrentPageShapes().filter(
			(s: TLShape) => String(s.parentId) === canvasId,
		)
		const shapes = pageShapes
			.filter((s) => s.type === 'geo')
			.map((s) => {
				const props = s.props as { w?: number; h?: number; geo?: string }
				return {
					kind: 'geo' as const,
					shapeId: String(s.id),
					x: s.x,
					y: s.y,
					w: props.w ?? 0,
					h: props.h ?? 0,
					geo: (props.geo === 'ellipse' ? 'ellipse' : 'rectangle') as 'rectangle' | 'ellipse',
				}
			})
		return CanvasSnapshotResultSchema.parse({
			canvasId,
			revision: this.stateFor(canvasId).revision,
			shapes,
		})
	}

	private canvasDiff(params: unknown): CanvasDiffResult {
		const parsed = CanvasDiffParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const s = this.stateFor(canvasId)
		const entries = s.history.filter((e) => e.revision > parsed.since)
		return CanvasDiffResultSchema.parse({
			canvasId,
			fromRevision: parsed.since,
			toRevision: s.revision,
			entries,
		})
	}

	private canvasCreate(params: unknown): CanvasCreateResult {
		const parsed = CanvasCreateParamsSchema.parse(params)
		const title = parsed.title ?? 'Untitled'
		const { id } = this.editor.createPage({ name: title })
		return CanvasCreateResultSchema.parse({ canvasId: String(id), title, revision: 0 })
	}

	private canvasSelect(params: unknown): CanvasSelectResult {
		const parsed = CanvasSelectParamsSchema.parse(params)
		this.editor.setCurrentPage(parsed.canvasId as never)
		return CanvasSelectResultSchema.parse({ activeCanvasId: parsed.canvasId })
	}

	private commandApply(params: unknown): CommandApplyResult {
		const parsed = CommandApplyParamsSchema.parse(params)
		const canvasId = this.resolveCanvasId(parsed.canvasId)
		const s = this.stateFor(canvasId)
		const nextRev = s.revision + 1
		const results: Array<{ shapeId: string }> = []
		const newEntries: HistoryEntry[] = []

		this.editor.batch(() => {
			for (const cmd of parsed.commands) {
				const id: TLShapeId = createShapeId()
				this.editor.createShape({
					id,
					type: 'geo',
					x: cmd.x,
					y: cmd.y,
					props: { geo: cmd.geo, w: cmd.w, h: cmd.h },
				})
				results.push({ shapeId: String(id) })
				newEntries.push({
					kind: 'shape-created',
					revision: nextRev,
					shapeId: String(id),
					x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h, geo: cmd.geo,
				})
			}
		})

		s.revision = nextRev
		s.history.push(...newEntries)
		return CommandApplyResultSchema.parse({ canvasId, revision: nextRev, results })
	}
}
```

- [ ] **Step 21.4: 跑确认通过**

运行：`npx vitest run client/runtime/__tests__/TldrawRuntimeAdapter.test.ts`
预期：7 个 PASS。

- [ ] **Step 21.5: 提交点**

---

### Task 22: `client/runtime/RuntimeWsClient.ts`（含 shutdown handler）

**涉及文件：**
- 新建：`client/runtime/RuntimeWsClient.ts`

- [ ] **Step 22.1: 实现**

```ts
// client/runtime/RuntimeWsClient.ts
import {
	CURRENT_PROTOCOL_VERSION,
	JsonRpcRequestSchema,
	SCHEMA_FINGERPRINT,
	SessionShutdownNoticeSchema,
	type RuntimeCapability,
} from '../../shared/rpc'
import type { RuntimeAdapter } from './RuntimeAdapter'

export interface RuntimeWsClientOptions {
	url: string
	adapter: RuntimeAdapter
	methods: string[]
	onError?: (err: Error) => void
	onReady?: (runtimeId: string) => void
	onShutdown?: (reason: string) => void
}

export class RuntimeWsClient {
	private ws: WebSocket | null = null
	private closed = false
	private shutdownReceived = false

	constructor(private readonly opts: RuntimeWsClientOptions) {
		this.connect()
	}

	close(): void {
		this.closed = true
		this.ws?.close()
	}

	private connect(): void {
		if (this.closed) return
		const ws = new WebSocket(this.opts.url)
		this.ws = ws
		ws.addEventListener('open', () => this.sendHandshake())
		ws.addEventListener('message', (ev) => { void this.onMessage(String(ev.data)) })
		ws.addEventListener('close', () => {
			if (this.closed || this.shutdownReceived) return
			setTimeout(() => this.connect(), 1_000)
		})
		ws.addEventListener('error', () => {
			this.opts.onError?.(new Error('RuntimeWsClient connection error'))
		})
	}

	private sendHandshake(): void {
		const capability: RuntimeCapability = {
			protocolVersion: CURRENT_PROTOCOL_VERSION,
			methods: this.opts.methods,
			flags: [],
			schemaFingerprint: SCHEMA_FINGERPRINT,
		}
		this.ws?.send(JSON.stringify({ type: 'handshake', capability }))
	}

	private async onMessage(raw: string): Promise<void> {
		let msg: unknown
		try { msg = JSON.parse(raw) } catch { return }
		if (msg && typeof msg === 'object') {
			const t = (msg as { type?: string }).type
			if (t === 'handshake-ack') {
				this.opts.onReady?.((msg as { runtimeId: string }).runtimeId)
				return
			}
			if (t === 'session.shutdown') {
				const parsed = SessionShutdownNoticeSchema.safeParse(msg)
				if (parsed.success) {
					this.shutdownReceived = true
					this.closed = true
					this.opts.onShutdown?.(parsed.data.reason)
					this.ws?.close()
				}
				return
			}
		}
		const parsed = JsonRpcRequestSchema.safeParse(msg)
		if (!parsed.success) return
		const req = parsed.data
		const id = req.id
		try {
			const result = await this.opts.adapter.invoke(req.method, req.params, {
				requestId: typeof id === 'number' ? id : 0,
			})
			this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id, result }))
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Adapter error'
			this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } }))
		}
	}
}
```

- [ ] **Step 22.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 22.3: 提交点**

---

### Task 23: `client/runtime/RuntimeMount.tsx`（带 toast 提示）

**涉及文件：**
- 新建：`client/runtime/RuntimeMount.tsx`

- [ ] **Step 23.1: 实现**

```tsx
// client/runtime/RuntimeMount.tsx
import { useEffect } from 'react'
import { useEditor, useToasts } from 'tldraw'
import { RuntimeWsClient } from './RuntimeWsClient'
import { TldrawRuntimeAdapter } from './TldrawRuntimeAdapter'

const DEFAULT_WS_URL = 'ws://127.0.0.1:8788'
const SUPPORTED_METHODS = [
	'canvas.list',
	'canvas.snapshot',
	'canvas.diff',
	'canvas.create',
	'canvas.select',
	'command.apply',
]

export function RuntimeMount({ wsUrl = DEFAULT_WS_URL }: { wsUrl?: string }) {
	const editor = useEditor()
	const { addToast } = useToasts()

	useEffect(() => {
		const adapter = new TldrawRuntimeAdapter(editor)
		const client = new RuntimeWsClient({
			url: wsUrl,
			adapter,
			methods: SUPPORTED_METHODS,
			onShutdown: (reason) => {
				addToast({
					title: 'Host 已停止',
					description: `画布进入只读状态（${reason}）。请手动关闭此标签。`,
					severity: 'info',
					keepOpen: true,
				})
			},
		})
		return () => client.close()
	}, [editor, wsUrl, addToast])

	return null
}
```

- [ ] **Step 23.2: 提交点**

---

### Task 24: 修改 `client/App.tsx`

**涉及文件：**
- 修改：`client/App.tsx`

- [ ] **Step 24.1: 加 import**

在 `client/App.tsx` 既有 import 之后，加：

```tsx
import { RuntimeMount } from './runtime/RuntimeMount'
```

- [ ] **Step 24.2: 在 `<Tldraw>` 内加 `<RuntimeMount />`**

找到：

```tsx
<Tldraw
	persistenceKey="tldraw-agent-demo"
	tools={tools}
	overrides={overrides}
	components={components}
>
	<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
</Tldraw>
```

改成：

```tsx
<Tldraw
	persistenceKey="tldraw-agent-demo"
	tools={tools}
	overrides={overrides}
	components={components}
>
	<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
	<RuntimeMount />
</Tldraw>
```

- [ ] **Step 24.3: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 24.4: 提交点**

Team T3 收工。

---

# Team T4：CLI 适配器（`cli/**`）

### Task 25: `cli/hostClient/JsonRpcClient.ts`

**涉及文件：**
- 新建：`cli/hostClient/JsonRpcClient.ts`
- 新建：`cli/__tests__/JsonRpcClient.test.ts`

- [ ] **Step 25.1: 写失败测试**

```ts
// cli/__tests__/JsonRpcClient.test.ts
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonRpcClient, JsonRpcError } from '../hostClient/JsonRpcClient'

describe('JsonRpcClient', () => {
	let server: ReturnType<typeof createServer>
	let url: string

	beforeEach(async () => {
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				res.writeHead(200, { 'content-type': 'application/json' })
				if (body.method === 'ok.one') {
					res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { echoed: body.params } }))
				} else {
					res.end(JSON.stringify({
						jsonrpc: '2.0', id: body.id,
						error: { code: -32601, message: 'Method not found' },
					}))
				}
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		const addr = server.address() as AddressInfo
		url = `http://127.0.0.1:${addr.port}/rpc`
	})

	afterEach(async () => {
		await new Promise<void>((r) => server.close(() => r()))
	})

	it('returns result on success', async () => {
		const c = new JsonRpcClient(url)
		expect(await c.call('ok.one', { x: 1 })).toEqual({ echoed: { x: 1 } })
	})

	it('throws JsonRpcError on server error', async () => {
		const c = new JsonRpcClient(url)
		await expect(c.call('bad', {})).rejects.toBeInstanceOf(JsonRpcError)
	})

	it('throws on non-loopback URL host', async () => {
		const c = new JsonRpcClient('http://example.com/rpc')
		await expect(c.call('x', {})).rejects.toThrow(/loopback/)
	})
})
```

- [ ] **Step 25.2: 跑确认失败**

运行：`npx vitest run cli/__tests__/JsonRpcClient.test.ts`
预期：FAIL。

- [ ] **Step 25.3: 实现**

```ts
// cli/hostClient/JsonRpcClient.ts
export class JsonRpcError extends Error {
	constructor(public readonly code: number, message: string, public readonly data?: unknown) {
		super(message); this.name = 'JsonRpcError'
	}
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export class JsonRpcClient {
	private nextId = 0
	constructor(private readonly url: string) {
		const host = new URL(url).hostname
		if (!LOOPBACK_HOSTS.has(host)) {
			// 第一版仅允许本机；远程部署需经 AuthN，独立迭代
			throw new Error(`JsonRpcClient only accepts loopback hosts, got: ${host}`)
		}
	}

	async call(method: string, params: unknown): Promise<unknown> {
		const id = ++this.nextId
		const response = await fetch(this.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
		})
		if (!response.ok) throw new JsonRpcError(-32603, `HTTP ${response.status}`)
		const body = (await response.json()) as
			| { result: unknown }
			| { error: { code: number; message: string; data?: unknown } }
		if ('error' in body) throw new JsonRpcError(body.error.code, body.error.message, body.error.data)
		return body.result
	}
}
```

注意：`new JsonRpcClient` 在构造时就会抛非 loopback 错，所以失败测试的 `it('throws on non-loopback ...')` 会在 `new JsonRpcClient('http://example.com/rpc')` 行直接抛。调整测试的预期：

把原失败测试里 `await expect(c.call('x', {})).rejects.toThrow(/loopback/)` 替换为：

```ts
expect(() => new JsonRpcClient('http://example.com/rpc')).toThrow(/loopback/)
```

（这是测试修正，直接替换最初测试里第三个 it 的内部实现。）

- [ ] **Step 25.4: 跑确认通过**

运行：`npx vitest run cli/__tests__/JsonRpcClient.test.ts`
预期：3 个 PASS。

- [ ] **Step 25.5: 提交点**

---

### Task 26: `cli/hostClient/readStdin.ts`

**涉及文件：**
- 新建：`cli/hostClient/readStdin.ts`

- [ ] **Step 26.1: 实现**

```ts
// cli/hostClient/readStdin.ts
import type { Readable } from 'node:stream'

export async function readStdinJson(stdin: Readable & { isTTY?: boolean }): Promise<unknown> {
	if (stdin.isTTY) {
		throw new Error('command apply requires JSON on stdin; pipe a body or redirect a file')
	}
	const chunks: string[] = []
	for await (const chunk of stdin) {
		chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8'))
	}
	const raw = chunks.join('').trim()
	if (!raw) throw new Error('Missing JSON body on stdin')
	try { return JSON.parse(raw) } catch { throw new Error('Invalid JSON body on stdin') }
}
```

- [ ] **Step 26.2: 提交点**

---

### Task 27: `cli/hostClient/sessionFile.ts`

**涉及文件：**
- 新建：`cli/hostClient/sessionFile.ts`
- 新建：`cli/__tests__/sessionFile.test.ts`

- [ ] **Step 27.1: 写失败测试**

```ts
// cli/__tests__/sessionFile.test.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	readSessionFile, writeSessionFile, clearSessionFile, type SessionFile,
} from '../hostClient/sessionFile'

describe('sessionFile', () => {
	let dir: string
	let path: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tldraw-cli-'))
		path = join(dir, 'session.json')
	})
	afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

	it('read returns null when missing', () => {
		expect(readSessionFile(path)).toBeNull()
	})

	it('write + read round trip', () => {
		const s: SessionFile = { hostPid: 123, httpPort: 8787, wsPort: 8788, startedAt: Date.now() }
		writeSessionFile(path, s)
		const r = readSessionFile(path)
		expect(r?.hostPid).toBe(123)
	})

	it('clear removes file', () => {
		writeSessionFile(path, { hostPid: 1, httpPort: 1, wsPort: 1, startedAt: 0 })
		clearSessionFile(path)
		expect(readSessionFile(path)).toBeNull()
	})
})
```

- [ ] **Step 27.2: 跑确认失败**

运行：`npx vitest run cli/__tests__/sessionFile.test.ts`
预期：FAIL。

- [ ] **Step 27.3: 实现**

```ts
// cli/hostClient/sessionFile.ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'

export interface SessionFile {
	readonly hostPid: number
	readonly httpPort: number
	readonly wsPort: number
	readonly startedAt: number
}

export const DEFAULT_SESSION_PATH = join(homedir(), '.tldraw-cli', 'session.json')

const Schema = z.object({
	hostPid: z.number().int().positive(),
	httpPort: z.number().int().positive(),
	wsPort: z.number().int().positive(),
	startedAt: z.number().int().nonnegative(),
})

export function readSessionFile(path = DEFAULT_SESSION_PATH): SessionFile | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, 'utf8')
		return Schema.parse(JSON.parse(raw))
	} catch { return null }
}

export function writeSessionFile(path: string, session: SessionFile): void
export function writeSessionFile(session: SessionFile): void
export function writeSessionFile(a: string | SessionFile, b?: SessionFile): void {
	const path = typeof a === 'string' ? a : DEFAULT_SESSION_PATH
	const session = typeof a === 'string' ? (b as SessionFile) : a
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, JSON.stringify(Schema.parse(session), null, 2) + '\n', 'utf8')
}

export function clearSessionFile(path = DEFAULT_SESSION_PATH): void {
	rmSync(path, { force: true })
}

export function isProcessAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true } catch { return false }
}
```

- [ ] **Step 27.4: 跑确认通过**

运行：`npx vitest run cli/__tests__/sessionFile.test.ts`
预期：3 个 PASS。

- [ ] **Step 27.5: 提交点**

---

### Task 28: `cli/hostClient/openBrowser.ts`

**涉及文件：**
- 新建：`cli/hostClient/openBrowser.ts`

- [ ] **Step 28.1: 实现**

```ts
// cli/hostClient/openBrowser.ts
import { spawn } from 'node:child_process'

export function openBrowser(url: string): void {
	const platform = process.platform
	const opener =
		platform === 'darwin' ? { cmd: 'open', args: [url] } :
		platform === 'win32' ? { cmd: 'cmd', args: ['/c', 'start', '', url] } :
		{ cmd: 'xdg-open', args: [url] }
	const child = spawn(opener.cmd, opener.args, { detached: true, stdio: 'ignore' })
	child.unref()
}
```

- [ ] **Step 28.2: 提交点**

（无独立单元测试——跨平台 open 的实际行为不适合在 CI 里测；Task 30 做人工 smoke。）

---

### Task 29: `cli/context.ts`

**涉及文件：**
- 新建：`cli/context.ts`

- [ ] **Step 29.1: 实现**

```ts
// cli/context.ts
import type { CommandContext } from '@stricli/core'
import { JsonRpcClient } from './hostClient/JsonRpcClient'
import { DEFAULT_SESSION_PATH, readSessionFile } from './hostClient/sessionFile'

export interface LocalContext extends CommandContext {
	readonly process: NodeJS.Process
	readonly sessionPath: string
	readonly buildClient: () => JsonRpcClient
}

export function buildLocalContext(proc: NodeJS.Process): LocalContext {
	const sessionPath = proc.env.TLDRAW_SESSION_FILE ?? DEFAULT_SESSION_PATH
	return {
		process: proc,
		sessionPath,
		buildClient: () => {
			const override = proc.env.TLDRAW_HOST_URL
			if (override) return new JsonRpcClient(override)
			const s = readSessionFile(sessionPath)
			if (!s) throw new Error('Host not running. Use: tldraw-cli start')
			return new JsonRpcClient(`http://127.0.0.1:${s.httpPort}/rpc`)
		},
	}
}
```

- [ ] **Step 29.2: 提交点**

---

### Task 30: `cli/commands/canvas.ts`

**涉及文件：**
- 新建：`cli/commands/canvas.ts`
- 新建：`cli/__tests__/canvas.test.ts`

- [ ] **Step 30.1: 写失败测试**

```ts
// cli/__tests__/canvas.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { application } from '../main'
import { run } from '@stricli/core'
import { JsonRpcClient } from '../hostClient/JsonRpcClient'

function mkProc(args: string[], url: string): { proc: NodeJS.Process; out: string[] } {
	const out: string[] = []
	const proc = {
		argv: ['node', 'cli', ...args],
		env: { TLDRAW_HOST_URL: url },
		stdin: Object.assign(Readable.from([]), { isTTY: true }),
		stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
		stderr: new Writable({ write(_c, _e, cb) { cb() } }),
		exit(_c?: number) {},
	} as unknown as NodeJS.Process
	return { proc, out }
}

describe('canvas commands', () => {
	let server: Server
	let url: string
	let calls: Array<{ method: string; params: unknown }>
	let response: unknown

	beforeEach(async () => {
		calls = []
		response = {}
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				calls.push({ method: body.method, params: body.params })
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: response }))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	async function runWith(args: string[]): Promise<string> {
		const { proc, out } = mkProc(args, url)
		const { buildLocalContext } = await import('../context')
		await run(application, proc.argv.slice(2), buildLocalContext(proc))
		return out.join('')
	}

	it('canvas list hits canvas.list', async () => {
		response = { items: [{ id: 'page:1', title: 'P1', revision: 0 }] }
		const text = await runWith(['canvas', 'list'])
		expect(calls[0].method).toBe('canvas.list')
		expect(text).toContain('page:1')
	})

	it('canvas snapshot passes canvasId', async () => {
		response = { canvasId: 'page:7', revision: 0, shapes: [] }
		await runWith(['canvas', 'snapshot', '--canvas', 'page:7'])
		expect(calls[0].method).toBe('canvas.snapshot')
		expect((calls[0].params as { canvasId: string }).canvasId).toBe('page:7')
	})

	it('canvas diff passes since', async () => {
		response = { canvasId: 'page:1', fromRevision: 3, toRevision: 3, entries: [] }
		await runWith(['canvas', 'diff', '--since', '3'])
		expect(calls[0].method).toBe('canvas.diff')
		expect((calls[0].params as { since: number }).since).toBe(3)
	})

	it('canvas create passes title', async () => {
		response = { canvasId: 'page:2', title: 'New', revision: 0 }
		await runWith(['canvas', 'create', '--title', 'New'])
		expect(calls[0].method).toBe('canvas.create')
		expect((calls[0].params as { title: string }).title).toBe('New')
	})

	it('canvas select requires canvasId', async () => {
		response = { activeCanvasId: 'page:2' }
		await runWith(['canvas', 'select', '--canvas', 'page:2'])
		expect(calls[0].method).toBe('canvas.select')
		expect((calls[0].params as { canvasId: string }).canvasId).toBe('page:2')
	})
})
```

- [ ] **Step 30.2: 跑确认失败**

运行：`npx vitest run cli/__tests__/canvas.test.ts`
预期：FAIL（main.ts、canvas.ts 都没创建）。

- [ ] **Step 30.3: 实现 `cli/commands/canvas.ts`**

```ts
// cli/commands/canvas.ts
import { buildCommand, buildRouteMap } from '@stricli/core'
import type { LocalContext } from '../context'

function print(this: LocalContext, obj: unknown): void {
	this.process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}

// canvas list
async function listHandler(this: LocalContext): Promise<void> {
	const r = await this.buildClient().call('canvas.list', {})
	print.call(this, r)
}
const listCmd = buildCommand({
	loader: async () => listHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: { brief: 'List canvases (pages) on the current runtime' },
})

// canvas snapshot [--canvas <id>]
async function snapshotHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const params = flags.canvas ? { canvasId: flags.canvas } : {}
	const r = await this.buildClient().call('canvas.snapshot', params)
	print.call(this, r)
}
const snapshotCmd = buildCommand({
	loader: async () => snapshotHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: 'Canvas id (page id); omit to use active', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: { brief: 'Read current shapes from a canvas' },
})

// canvas diff --since N [--canvas <id>]
async function diffHandler(this: LocalContext, flags: { canvas?: string; since: number }): Promise<void> {
	const params: { canvasId?: string; since: number } = { since: flags.since }
	if (flags.canvas) params.canvasId = flags.canvas
	const r = await this.buildClient().call('canvas.diff', params)
	print.call(this, r)
}
const diffCmd = buildCommand({
	loader: async () => diffHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: 'Canvas id', optional: true },
			since: { kind: 'parsed', parse: (s: string) => {
				const n = Number.parseInt(s, 10)
				if (!Number.isFinite(n) || n < 0) throw new Error('--since must be >= 0')
				return n
			}, brief: 'Baseline revision' },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: { brief: 'Get shape-level diff since a revision' },
})

// canvas create [--title <name>]
async function createHandler(this: LocalContext, flags: { title?: string }): Promise<void> {
	const params = flags.title ? { title: flags.title } : {}
	const r = await this.buildClient().call('canvas.create', params)
	print.call(this, r)
}
const createCmd = buildCommand({
	loader: async () => createHandler,
	parameters: {
		flags: {
			title: { kind: 'parsed', parse: String, brief: 'Canvas title', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: { brief: 'Create a new canvas (page)' },
})

// canvas select --canvas <id>
async function selectHandler(this: LocalContext, flags: { canvas: string }): Promise<void> {
	const r = await this.buildClient().call('canvas.select', { canvasId: flags.canvas })
	print.call(this, r)
}
const selectCmd = buildCommand({
	loader: async () => selectHandler,
	parameters: {
		flags: { canvas: { kind: 'parsed', parse: String, brief: 'Canvas id to activate' } },
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: { brief: 'Set the active canvas' },
})

export const canvasRoutes = buildRouteMap({
	routes: { list: listCmd, snapshot: snapshotCmd, diff: diffCmd, create: createCmd, select: selectCmd },
	docs: { brief: 'Canvas commands' },
})
```

- [ ] **Step 30.4: 实现 `cli/main.ts`（最小版，supports canvas tests 通过）**

```ts
// cli/main.ts
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { buildLocalContext } from './context'
import { canvasRoutes } from './commands/canvas'
import { commandRoutes } from './commands/command'
import { startCommand } from './commands/start'
import { stopCommand } from './commands/stop'
import { statusCommand } from './commands/status'

const rootRoutes = buildRouteMap({
	routes: {
		start: startCommand,
		stop: stopCommand,
		status: statusCommand,
		canvas: canvasRoutes,
		command: commandRoutes,
	},
	docs: { brief: 'tldraw-cli' },
})

export const application = buildApplication(rootRoutes, {
	name: 'tldraw-cli',
	versionInfo: { currentVersion: '0.0.1' },
})

export async function runCli(proc: NodeJS.Process): Promise<void> {
	await run(application, proc.argv.slice(2), buildLocalContext(proc))
}

const invokedDirectly =
	typeof import.meta.url === 'string' &&
	typeof process.argv[1] === 'string' &&
	import.meta.url === new URL(`file://${process.argv[1]}`).href

if (invokedDirectly) void runCli(process)
```

*注意：* 此步会引 `commands/command.ts` / `commands/start.ts` / `commands/stop.ts` / `commands/status.ts`，它们在 Task 31-34 创建。为让 Task 30 的测试先通过，先**只**创建 canvas 路由 + 一个 stub main，待 T31-T34 完成后再换成完整版。

Task 30 实际只写到这一步（完整 main 在 T34 结束时写）。Task 30 的测试仅用 `canvasRoutes`，可以在先前版本的 main.ts 里只挂 `canvas`。为避免 main.ts 双重编辑，把 Task 30 的 main 写成最终完整版，但那些 command files 要存在。

**修正 step 顺序**：Task 30 只创建 `cli/commands/canvas.ts` 和**不**创建 main.ts；把 main.ts 放到 Task 34 之后（Task 35）。Task 30 的测试先跳过 `application` 验证，改为**直接构建 canvasRoutes + 手动 run**。

替换 Task 30.1 测试的 `import { application } from '../main'` 为：

```ts
import { buildApplication, buildRouteMap } from '@stricli/core'
import { canvasRoutes } from '../commands/canvas'

const testApp = buildApplication(
	buildRouteMap({ routes: { canvas: canvasRoutes }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)
```

并把测试里 `application` 替换为 `testApp`。这样 Task 30 不依赖后续文件。

- [ ] **Step 30.5: 跑确认通过**

运行：`npx vitest run cli/__tests__/canvas.test.ts`
预期：5 个 PASS。

- [ ] **Step 30.6: 提交点**

---

### Task 31: `cli/commands/command.ts`

**涉及文件：**
- 新建：`cli/commands/command.ts`
- 新建：`cli/__tests__/command.test.ts`

- [ ] **Step 31.1: 写失败测试**

```ts
// cli/__tests__/command.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { commandRoutes } from '../commands/command'
import { buildLocalContext } from '../context'

const app = buildApplication(
	buildRouteMap({ routes: { command: commandRoutes }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

describe('command apply', () => {
	let server: Server
	let url: string
	let lastBody: { method: string; params: unknown } | null = null

	beforeEach(async () => {
		lastBody = null
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				lastBody = { method: body.method, params: body.params }
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({
					jsonrpc: '2.0', id: body.id,
					result: { canvasId: 'page:1', revision: 1, results: [{ shapeId: 'shape:1' }] },
				}))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`
	})
	afterEach(async () => { await new Promise<void>((r) => server.close(() => r())) })

	it('reads stdin JSON and sends command.apply', async () => {
		const stdinBody = JSON.stringify({
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'command', 'apply'],
			env: { TLDRAW_HOST_URL: url },
			stdin: Object.assign(Readable.from([stdinBody]), { isTTY: false }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		expect(lastBody?.method).toBe('command.apply')
		expect((lastBody?.params as { commands: unknown[] }).commands).toHaveLength(1)
		expect(out.join('')).toContain('shape:1')
	})
})
```

- [ ] **Step 31.2: 跑确认失败**

运行：`npx vitest run cli/__tests__/command.test.ts`
预期：FAIL。

- [ ] **Step 31.3: 实现**

```ts
// cli/commands/command.ts
import { buildCommand, buildRouteMap } from '@stricli/core'
import type { LocalContext } from '../context'
import { readStdinJson } from '../hostClient/readStdin'

async function applyHandler(this: LocalContext, flags: { canvas?: string }): Promise<void> {
	const body = (await readStdinJson(this.process.stdin)) as Record<string, unknown>
	const params = flags.canvas ? { ...body, canvasId: flags.canvas } : body
	const r = await this.buildClient().call('command.apply', params)
	this.process.stdout.write(JSON.stringify(r, null, 2) + '\n')
}

const applyCmd = buildCommand({
	loader: async () => applyHandler,
	parameters: {
		flags: {
			canvas: { kind: 'parsed', parse: String, brief: 'Target canvas id (overrides stdin)', optional: true },
		},
		positional: { kind: 'tuple', parameters: [] },
	},
	docs: { brief: 'Apply a batch of commands (JSON body on stdin)' },
})

export const commandRoutes = buildRouteMap({
	routes: { apply: applyCmd },
	docs: { brief: 'Command commands' },
})
```

- [ ] **Step 31.4: 跑确认通过**

运行：`npx vitest run cli/__tests__/command.test.ts`
预期：PASS。

- [ ] **Step 31.5: 提交点**

---

### Task 32: `cli/commands/start.ts`

**涉及文件：**
- 新建：`cli/commands/start.ts`

功能：读 session.json；若存在且进程仍活则拒绝；否则 `spawn tsx host/HostProcess.ts`；等 HTTP 端口可连；写 session.json；调用 openBrowser(http://localhost:5173/)；打印结果。

- [ ] **Step 32.1: 实现**

```ts
// cli/commands/start.ts
import { buildCommand } from '@stricli/core'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { LocalContext } from '../context'
import { isProcessAlive, readSessionFile, writeSessionFile } from '../hostClient/sessionFile'
import { openBrowser } from '../hostClient/openBrowser'

const HTTP_PORT = 8787
const WS_PORT = 8788
const FRONTEND_URL = 'http://127.0.0.1:5173/'

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const ok = await new Promise<boolean>((resolveP) => {
			const socket = createConnection({ port, host: '127.0.0.1' })
			socket.once('connect', () => { socket.end(); resolveP(true) })
			socket.once('error', () => { resolveP(false) })
		})
		if (ok) return
		if (Date.now() > deadline) throw new Error(`Host HTTP port ${port} not ready within ${timeoutMs}ms`)
		await new Promise((r) => setTimeout(r, 100))
	}
}

function repoRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url))
	return resolve(here, '..', '..')
}

async function startHandler(this: LocalContext): Promise<void> {
	const existing = readSessionFile(this.sessionPath)
	if (existing && isProcessAlive(existing.hostPid)) {
		this.process.stderr.write(`Host already running (pid ${existing.hostPid}). Use: tldraw-cli stop\n`)
		this.process.exitCode = 1
		return
	}

	const hostScript = resolve(repoRoot(), 'host', 'HostProcess.ts')
	const child = spawn('npx', ['tsx', hostScript], {
		cwd: repoRoot(),
		detached: true,
		stdio: 'ignore',
		env: { ...this.process.env },
	})
	child.unref()
	if (typeof child.pid !== 'number') throw new Error('Failed to spawn host')

	await waitForPort(HTTP_PORT, 10_000)

	writeSessionFile(this.sessionPath, {
		hostPid: child.pid,
		httpPort: HTTP_PORT,
		wsPort: WS_PORT,
		startedAt: Date.now(),
	})

	openBrowser(FRONTEND_URL)

	this.process.stdout.write(JSON.stringify({
		state: 'running', hostPid: child.pid, httpPort: HTTP_PORT, wsPort: WS_PORT, frontendUrl: FRONTEND_URL,
	}, null, 2) + '\n')
}

export const startCommand = buildCommand({
	loader: async () => startHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: { brief: 'Start host process and open the browser runtime' },
})
```

- [ ] **Step 32.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

（start 的 smoke 测试放到 Task 36 人工执行；这里不做自动化测试。）

- [ ] **Step 32.3: 提交点**

---

### Task 33: `cli/commands/stop.ts`

**涉及文件：**
- 新建：`cli/commands/stop.ts`

- [ ] **Step 33.1: 实现**

```ts
// cli/commands/stop.ts
import { buildCommand } from '@stricli/core'
import type { LocalContext } from '../context'
import { clearSessionFile, isProcessAlive, readSessionFile } from '../hostClient/sessionFile'

async function postShutdown(port: number, timeoutMs: number): Promise<boolean> {
	try {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeoutMs)
		const res = await fetch(`http://127.0.0.1:${port}/admin/shutdown`, {
			method: 'POST', signal: controller.signal,
		})
		clearTimeout(timer)
		return res.ok
	} catch { return false }
}

async function waitProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return true
		await new Promise((r) => setTimeout(r, 100))
	}
	return !isProcessAlive(pid)
}

async function stopHandler(this: LocalContext): Promise<void> {
	const s = readSessionFile(this.sessionPath)
	if (!s) {
		this.process.stdout.write(JSON.stringify({ state: 'not-running' }, null, 2) + '\n')
		return
	}
	if (!isProcessAlive(s.hostPid)) {
		clearSessionFile(this.sessionPath)
		this.process.stdout.write(JSON.stringify({ state: 'stale-cleared' }, null, 2) + '\n')
		return
	}
	const gracefulOk = await postShutdown(s.httpPort, 3_000)
	const exited = await waitProcessExit(s.hostPid, 5_000)
	if (!exited) {
		try { process.kill(s.hostPid, 'SIGTERM') } catch { /* ignore */ }
		await waitProcessExit(s.hostPid, 2_000)
	}
	clearSessionFile(this.sessionPath)
	this.process.stdout.write(JSON.stringify({
		state: 'stopped', graceful: gracefulOk, hostPid: s.hostPid,
	}, null, 2) + '\n')
}

export const stopCommand = buildCommand({
	loader: async () => stopHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: { brief: 'Stop running host process' },
})
```

- [ ] **Step 33.2: 跑类型检查**

运行：`npx tsc -p tsconfig.json --noEmit`
预期：无错误。

- [ ] **Step 33.3: 提交点**

---

### Task 34: `cli/commands/status.ts`

**涉及文件：**
- 新建：`cli/commands/status.ts`
- 新建：`cli/__tests__/status.test.ts`

- [ ] **Step 34.1: 写失败测试（覆盖 not-running 与 running 两路）**

```ts
// cli/__tests__/status.test.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { statusCommand } from '../commands/status'
import { writeSessionFile } from '../hostClient/sessionFile'
import { buildLocalContext } from '../context'

const app = buildApplication(
	buildRouteMap({ routes: { status: statusCommand }, docs: { brief: 't' } }),
	{ name: 'tldraw-cli', versionInfo: { currentVersion: '0.0.1' } },
)

describe('status command', () => {
	let dir: string
	let sessionPath: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tldraw-cli-status-'))
		sessionPath = join(dir, 'session.json')
	})
	afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

	function mkProc(env: Record<string, string>): { proc: NodeJS.Process; out: string[] } {
		const out: string[] = []
		const proc = {
			argv: ['node', 'cli', 'status'],
			env: { TLDRAW_SESSION_FILE: sessionPath, ...env },
			stdin: Object.assign(Readable.from([]), { isTTY: true }),
			stdout: new Writable({ write(c, _e, cb) { out.push(String(c)); cb() } }),
			stderr: new Writable({ write(_c, _e, cb) { cb() } }),
			exit(_c?: number) {},
		} as unknown as NodeJS.Process
		return { proc, out }
	}

	it('reports not-running when no session file', async () => {
		const { proc, out } = mkProc({})
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		const parsed = JSON.parse(out.join(''))
		expect(parsed.state).toBe('not-running')
	})

	it('merges RPC session.status when running', async () => {
		const server: Server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end(JSON.stringify({
					jsonrpc: '2.0', id: body.id,
					result: {
						host: { version: '0.0.1', uptimeMs: 42 },
						runtimes: [],
						activeCanvasId: null,
						canvasCount: 0,
					},
				}))
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		const port = (server.address() as AddressInfo).port

		writeSessionFile(sessionPath, {
			hostPid: process.pid, httpPort: port, wsPort: port + 1, startedAt: Date.now(),
		})

		const { proc, out } = mkProc({})
		await run(app, proc.argv.slice(2), buildLocalContext(proc))
		const parsed = JSON.parse(out.join(''))
		expect(parsed.state).toBe('running')
		expect(parsed.hostPid).toBe(process.pid)
		expect(parsed.rpc.host.version).toBe('0.0.1')

		await new Promise<void>((r) => server.close(() => r()))
	})
})
```

- [ ] **Step 34.2: 跑确认失败**

运行：`npx vitest run cli/__tests__/status.test.ts`
预期：FAIL。

- [ ] **Step 34.3: 实现**

```ts
// cli/commands/status.ts
import { buildCommand } from '@stricli/core'
import type { LocalContext } from '../context'
import { clearSessionFile, isProcessAlive, readSessionFile } from '../hostClient/sessionFile'
import { JsonRpcClient } from '../hostClient/JsonRpcClient'

async function statusHandler(this: LocalContext): Promise<void> {
	const s = readSessionFile(this.sessionPath)
	if (!s) {
		this.process.stdout.write(JSON.stringify({ state: 'not-running' }, null, 2) + '\n')
		return
	}
	if (!isProcessAlive(s.hostPid)) {
		clearSessionFile(this.sessionPath)
		this.process.stdout.write(JSON.stringify({ state: 'stale', hostPid: s.hostPid }, null, 2) + '\n')
		return
	}
	let rpc: unknown = null
	try {
		const client = new JsonRpcClient(`http://127.0.0.1:${s.httpPort}/rpc`)
		rpc = await client.call('session.status', {})
	} catch (err) {
		rpc = { error: err instanceof Error ? err.message : 'unknown' }
	}
	this.process.stdout.write(JSON.stringify({
		state: 'running',
		hostPid: s.hostPid,
		httpPort: s.httpPort,
		wsPort: s.wsPort,
		startedAt: s.startedAt,
		rpc,
	}, null, 2) + '\n')
}

export const statusCommand = buildCommand({
	loader: async () => statusHandler,
	parameters: { positional: { kind: 'tuple', parameters: [] } },
	docs: { brief: 'Show host and runtime status' },
})
```

- [ ] **Step 34.4: 跑确认通过**

运行：`npx vitest run cli/__tests__/status.test.ts`
预期：2 个 PASS。

- [ ] **Step 34.5: 提交点**

---

### Task 35: `cli/main.ts`（完整 application 入口）

**涉及文件：**
- 新建：`cli/main.ts`

- [ ] **Step 35.1: 实现**

```ts
// cli/main.ts
import { buildApplication, buildRouteMap, run } from '@stricli/core'
import { buildLocalContext } from './context'
import { canvasRoutes } from './commands/canvas'
import { commandRoutes } from './commands/command'
import { startCommand } from './commands/start'
import { stopCommand } from './commands/stop'
import { statusCommand } from './commands/status'

const rootRoutes = buildRouteMap({
	routes: {
		start: startCommand,
		stop: stopCommand,
		status: statusCommand,
		canvas: canvasRoutes,
		command: commandRoutes,
	},
	docs: { brief: 'tldraw-cli' },
})

export const application = buildApplication(rootRoutes, {
	name: 'tldraw-cli',
	versionInfo: { currentVersion: '0.0.1' },
})

export async function runCli(proc: NodeJS.Process): Promise<void> {
	await run(application, proc.argv.slice(2), buildLocalContext(proc))
}

const invokedDirectly =
	typeof import.meta.url === 'string' &&
	typeof process.argv[1] === 'string' &&
	import.meta.url === new URL(`file://${process.argv[1]}`).href

if (invokedDirectly) void runCli(process)
```

- [ ] **Step 35.2: 跑全部 CLI 测试**

运行：`npx vitest run cli`
预期：JsonRpcClient / sessionFile / canvas / command / status 全部 PASS。

- [ ] **Step 35.3: 提交点**

---

### Task 36: CLI 手动 smoke（端到端 happy path）

**涉及文件：** 仅执行命令。

- [ ] **Step 36.1: 干净起 + 起 Vite**

终端 A：`npm run dev`
打开 `http://127.0.0.1:5173/`（先看到画布、WS 会重试连到 8788，尚未连上，正常）

- [ ] **Step 36.2: `tldraw-cli start`**

终端 B：`npm run cli -- start`
预期：输出含 `state: 'running'`、`httpPort: 8787`、`wsPort: 8788`；终端 A 的浏览器连上 WS 并握手成功；如果 start 触发了 `openBrowser`，会再弹一个新标签（可关掉，原有画布仍连）。

- [ ] **Step 36.3: 状态 / 列画布**

```bash
npm run cli -- status
npm run cli -- canvas list
```

预期：status 返回 running + 1 个 runtime；canvas list 含 `page:1`。

- [ ] **Step 36.4: 多 page 场景**

```bash
npm run cli -- canvas create --title "Notes"
npm run cli -- canvas list
npm run cli -- canvas select --canvas <新 page id>
```

预期：浏览器切到新 page（标签可见）；`canvas.list` 含两条。

- [ ] **Step 36.5: 写 + 读 + diff**

```bash
echo '{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":100,"y":100,"w":200,"h":120}]}' | npm run cli -- command apply
npm run cli -- canvas snapshot
npm run cli -- canvas diff --since 0
```

预期：浏览器画布上出现矩形；snapshot 返回该 shape；diff 返回 1 条 `shape-created` entry。

- [ ] **Step 36.6: `tldraw-cli stop`**

```bash
npm run cli -- stop
```

预期：CLI 输出 `state: 'stopped', graceful: true`；浏览器画布弹出 toast "Host 已停止"；pid 文件被清；再跑 `npm run cli -- status` 返回 `not-running`。

- [ ] **Step 36.7: 提交点**

Team T4 收工。

---

# Team T5：集成 / 文档

### Task 37: E2E 测试

**涉及文件：**
- 新建：`__tests__/e2e/host-cli-runtime.e2e.test.ts`

- [ ] **Step 37.1: 实现**

```ts
// __tests__/e2e/host-cli-runtime.e2e.test.ts
import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HostProcess } from '../../host/HostProcess'
import { JsonRpcClient } from '../../cli/hostClient/JsonRpcClient'
import {
	CURRENT_PROTOCOL_VERSION,
	JsonRpcRequestSchema,
	SCHEMA_FINGERPRINT,
} from '../../shared/rpc'

let host: HostProcess
let runtimeWs: WebSocket
const state = new Map<string, { revision: number; history: Array<Record<string, unknown>> }>()

function stateFor(id: string) {
	let s = state.get(id)
	if (!s) { s = { revision: 0, history: [] }; state.set(id, s) }
	return s
}

async function connectFakeRuntime(wsPort: number): Promise<WebSocket> {
	const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`)
	await new Promise<void>((r, j) => { ws.once('open', () => r()); ws.once('error', j) })
	ws.send(JSON.stringify({
		type: 'handshake',
		capability: {
			protocolVersion: CURRENT_PROTOCOL_VERSION,
			methods: ['canvas.list','canvas.snapshot','canvas.diff','canvas.create','canvas.select','command.apply'],
			flags: [],
			schemaFingerprint: SCHEMA_FINGERPRINT,
		},
	}))
	await new Promise<void>((r) => { ws.once('message', () => r()) })

	const pages: Array<{ id: string; title: string }> = [{ id: 'page:1', title: 'P1' }]
	let activeId = 'page:1'
	let nextShape = 1
	let nextPage = 2

	ws.on('message', (raw) => {
		const parsed = JsonRpcRequestSchema.safeParse(JSON.parse(String(raw)))
		if (!parsed.success) return
		const req = parsed.data
		const send = (result: unknown) =>
			ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }))
		switch (req.method) {
			case 'canvas.list':
				send({ items: pages.map((p) => ({ id: p.id, title: p.title, revision: stateFor(p.id).revision })) })
				return
			case 'canvas.snapshot': {
				const p = req.params as { canvasId?: string }
				const id = p.canvasId ?? activeId
				send({ canvasId: id, revision: stateFor(id).revision, shapes: [] })
				return
			}
			case 'canvas.diff': {
				const p = req.params as { canvasId?: string; since: number }
				const id = p.canvasId ?? activeId
				const s = stateFor(id)
				send({
					canvasId: id,
					fromRevision: p.since,
					toRevision: s.revision,
					entries: s.history.filter((e) => (e.revision as number) > p.since),
				})
				return
			}
			case 'canvas.create': {
				const p = req.params as { title?: string }
				const id = `page:${nextPage++}`
				pages.push({ id, title: p.title ?? 'Untitled' })
				send({ canvasId: id, title: p.title ?? 'Untitled', revision: 0 })
				return
			}
			case 'canvas.select': {
				const p = req.params as { canvasId: string }
				activeId = p.canvasId
				send({ activeCanvasId: activeId })
				return
			}
			case 'command.apply': {
				const p = req.params as { commands: Array<Record<string, unknown>>; canvasId?: string }
				const id = p.canvasId ?? activeId
				const s = stateFor(id)
				s.revision += 1
				const results = p.commands.map(() => ({ shapeId: `shape:${nextShape++}` }))
				for (const r of results) {
					s.history.push({ kind: 'shape-created', revision: s.revision, shapeId: r.shapeId, x: 0, y: 0, w: 10, h: 10, geo: 'rectangle' })
				}
				send({ canvasId: id, revision: s.revision, results })
				return
			}
		}
	})
	await new Promise((r) => setTimeout(r, 50))
	return ws
}

beforeAll(async () => {
	host = new HostProcess({ httpPort: 0, wsPort: 0 })
	await host.start()
	runtimeWs = await connectFakeRuntime(host.wsTransport.port)
})

afterAll(async () => {
	runtimeWs.close()
	await host.stop()
})

function client(): JsonRpcClient {
	return new JsonRpcClient(`http://127.0.0.1:${host.apiGateway.port}/rpc`)
}

describe('Host + fake runtime e2e', () => {
	it('session.status', async () => {
		const r = (await client().call('session.status', {})) as { runtimes: unknown[]; canvasCount: number }
		expect(r.runtimes).toHaveLength(1)
		expect(r.canvasCount).toBe(1)
	})
	it('canvas.create + list', async () => {
		await client().call('canvas.create', { title: 'Two' })
		const r = (await client().call('canvas.list', {})) as { items: Array<{ id: string }> }
		expect(r.items).toHaveLength(2)
	})
	it('canvas.select', async () => {
		const r = (await client().call('canvas.select', { canvasId: 'page:2' })) as { activeCanvasId: string }
		expect(r.activeCanvasId).toBe('page:2')
	})
	it('command.apply + canvas.snapshot + canvas.diff', async () => {
		const apply = (await client().call('command.apply', {
			commands: [{ kind: 'create-geo-shape', geo: 'rectangle', x: 0, y: 0, w: 10, h: 10 }],
		})) as { revision: number; results: Array<{ shapeId: string }> }
		expect(apply.revision).toBeGreaterThanOrEqual(1)
		const snap = (await client().call('canvas.snapshot', {})) as { canvasId: string; revision: number }
		expect(snap.canvasId).toBe('page:2')
		const diff = (await client().call('canvas.diff', { since: 0 })) as { entries: unknown[] }
		expect(diff.entries.length).toBeGreaterThan(0)
	})
})
```

- [ ] **Step 37.2: 跑全部测试（不只 e2e）**

运行：`npx vitest run`
预期：所有套件 PASS。

- [ ] **Step 37.3: 提交点**

---

### Task 38: 构建验证

**涉及文件：** 仅执行命令。

- [ ] **Step 38.1: `rolldown` 打包**

运行：`npm run build:cli`
预期：生成 `dist/cli.mjs` 与 `dist/host.mjs`；CLI 文件首行 `#!/usr/bin/env node`。

- [ ] **Step 38.2: 直接用 bundle 跑一遍 happy path**

```bash
node dist/host.mjs &
HOST_PID=$!
sleep 1
node dist/cli.mjs status
kill $HOST_PID
```

预期：`status` 输出 `runtimes: []`（没起浏览器）、端口信息合理。

- [ ] **Step 38.3: Vite 前端 build**

运行：`npm run build`
预期：Vite 构建成功，无 TS 错误。

- [ ] **Step 38.4: 提交点**

---

### Task 39: 更新 `README.md` 与 `CLAUDE.md`

**涉及文件：**
- 修改：`README.md`
- 修改：`CLAUDE.md`

- [ ] **Step 39.1: 在 `README.md` 顶部新增"tldraw-cli 第一版"段落**

在 `# tldraw agent` 标题之后、第一段 `This starter kit...` 之前，插入：

```markdown
> **tldraw-cli 第一版**：本仓库已接入 Host-RPC CLI，外部 LLM / 脚本可通过 CLI 驱动一个正在运行的 tldraw 画布：
>
> ```bash
> # 一键拉起（host + browser + runtime 自动握手）
> tldraw-cli start
>
> # 查询状态
> tldraw-cli status
>
> # 画布 CRUD
> tldraw-cli canvas list
> tldraw-cli canvas snapshot [--canvas <id>]
> tldraw-cli canvas diff --since <revision> [--canvas <id>]
> tldraw-cli canvas create [--title "Notes"]
> tldraw-cli canvas select --canvas <id>
>
> # 下命令（stdin JSON）
> echo '{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":100,"h":60}]}' \
>   | tldraw-cli command apply
>
> # 一键关闭（浏览器画布会收到 toast 提示，请用户手动关闭标签）
> tldraw-cli stop
> ```
>
> 架构设计见 `docs/superpowers/specs/2026-04-16-host-rpc-architecture-summary.md`。
> 下方 starter 文档为 tldraw 官方 starter kit 原生内容，作为实现参考保留。
```

- [ ] **Step 39.2: 更新 `CLAUDE.md`**

第三节整体替换为：

```markdown
## 三、当前仓库状态

第一版已落地，端到端路径跑通：

| 目录 | 当前内容 | 与目标架构的关系 |
|---|---|---|
| `cli/` | stricli CLI 入口：顶层 `start/stop/status` 本地命令 + `canvas/command` RPC 子路由；`hostClient/*` 含 JSON-RPC 客户端、stdin 读取、session 文件、跨平台 opener | Host 之上的 CLI 适配器 |
| `host/` | `HostProcess` + `ApiGateway`（含 `/admin/shutdown`）+ `ApplicationServices/*` + `infra/*`（含 `WsRuntimeTransport.broadcastShutdown`） | Host 六角色全落地 |
| `client/runtime/` | `RuntimeWsClient`（含 shutdown 处理）+ `TldrawRuntimeAdapter`（7 个方法 + history entries）+ `RuntimeMount`（挂适配器 + toast） | 浏览器端传输与业务翻译 |
| `shared/rpc/` | envelope / errors / capability（含 `session.shutdown` 通知）/ methods（7 个规范方法 + `HistoryEntry`） | 协议契约单一来源 |
| `client/`（其余） | starter 的 React app：`agent/`、`actions/`、`modes/` 等 | 未剥离的 legacy，作为实现参考 |
| `worker/` | starter 的 Cloudflare Worker | **不在** CLI 产品边界内 |
| `shared/`（`cli/` / `format/` / `schema/` 等） | starter 原生 schema 与格式 | 后续扩展 shape 格式时的参考 |
| `scripts/` / `public/` | Vite 插件辅助 / 静态资产 | 保留 |
| `docs/superpowers/specs/` | 架构 spec | 设计基准 |
```

第五节"常用脚本"替换为：

```markdown
## 五、常用脚本

- `npm run dev` —— 启动 Vite（浏览器 runtime）
- `npm run host` —— 启动 Host 进程（HTTP 8787 / WS 8788）
- `npm run cli -- <cmd>` —— 直接跑 CLI（开发用）
- `npm run build:cli` —— rolldown 打包 `dist/cli.mjs` + `dist/host.mjs`；bin 名 `tldraw-cli`
- `npm run build` —— Vite 前端打包
- `npm run test` / `npm run test:watch` —— vitest

已发布到 npm 后，`tldraw-cli` 可在全局直接调用（见 package.json 的 `bin` 字段）。
```

- [ ] **Step 39.3: 提交点**

Team T5 收工。全部计划结束。

---

# 自我审查

## 1. Spec 覆盖

| Spec 章节 | 覆盖 |
|---|---|
| 一 概述 | ✓ 贯穿 T1-T4 |
| 二 规范 RPC 方法（7 个） | ✓ T7 定义全部 7 个 schema；T16 / T17 / T21 实现全部服务端 + runtime 端 |
| 三 逻辑分层 | ✓ T2 四层（Interface / Application / Domain / Infrastructure）到位 |
| 四 部署形态 | ✓ T19 HostProcess + T24 挂载 + T36 手动 smoke |
| 五 模块职责 | ✓ 六角色全到位（T10-T19） |
| 六 传输抽象契约 | ✓ T10 `RuntimeGateway` + `RequestOptions` + `RuntimeCapability` |
| 七 Adapter vs WsClient | ✓ T21 业务 vs T22 传输分离；T23 组合 |
| 八 扩展机制 | △ T6 capability + 握手版本协商；deprecation meta 列"非目标" |
| 九 并发 / 事务 | △ revision per-canvas + command.apply 原子；CAS + persist 列"非目标" |
| 十 横切 | △ timeout + error 映射 + loopback AuthN 边界；其余列"非目标"、字段预留 |
| 十一 典型请求流程 | ✓ T37 e2e 验证 command.apply 全链路 |
| 十二 设计约束 | ✓ 计划决策与之一致 |
| 十三 CLI 本地命令 | ✓ T32 / T33 / T34 + T19 的 `/admin/shutdown` + T13 的 `broadcastShutdown` |

## 2. Placeholder 扫描

无 "TODO" / "TBD" / "implement later" / "fill in details" / "Similar to Task N" 等。所有 step 含具体代码或具体命令。

## 3. 类型 / 命名一致性

- `RuntimeId` / `RuntimeGateway` / `RequestOptions`（T10）在 T11 / T13 / T15-T17 / T37 一致使用
- `MethodName` / `MethodMap` / `SCHEMA_FINGERPRINT` / `CURRENT_PROTOCOL_VERSION`（T6 / T7）在 T13 / T22 / T37 一致引用
- `HistoryEntry` 的 discriminator `kind: 'shape-created'`（T7）在 T21 生成、T37 stub 一致
- `SessionShutdownNotice`（T6）在 T13 broadcast、T22 接收、T23 toast 链路一致
- `SessionFile` 形状（T27）在 T29 / T32 / T33 / T34 一致读写
- `JsonRpcClient` 构造时的 loopback 校验（T25）被 T29 在未设 `TLDRAW_HOST_URL` 时从 session 文件 pid/port 组出 `127.0.0.1` URL，不会触发校验错
- bin 名 `tldraw-cli`（Task 1）贯穿 README / CLAUDE.md / 错误信息 "Host not running. Use: tldraw-cli start"
- 端口 8787 / 8788（Task 19 / 32）一致

## 4. 依赖 / 并行完整性

- T0 → T1 → {T2, T3, T4 并行} → T5 的拓扑无环
- T2 / T3 / T4 之间不触碰同一文件：T2 改 `host/**`、T3 改 `client/runtime/**` + `client/App.tsx` 一处、T4 改 `cli/**`
- T5 仅读取前序产物 + 新增 `__tests__/e2e/**` + 修改 `README.md` / `CLAUDE.md`

---

# 执行交接

Plan 已保存到 `docs/superpowers/plans/2026-04-16-host-rpc-mvp.md`。

按用户约束"**自主推进、不征询意见**"+"**组建 teams，遵循 leader 规范**"，默认采用 **Subagent-Driven** 执行（REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`）：

- **Leader（我）**：不亲自写代码；按 T0 → T1 → {T2, T3, T4 并行} → T5 顺序调度 sonnet subagent；每 task 完成后只验证两件事 ——（a）交付物是否齐全，（b）测试是否全绿；未达标则回退让 subagent 修订
- **subagent prompt 模板**：任务编号、文件列表、完整 step 指引（从 plan 截取）、"测试必须真跑通"、"不要 commit"；尾部统一："**结构化汇报（发现 / 决策 / 未决项），不超过 500 中文字、不凑字数**"；显式 `model: "sonnet"`
- **提交点**：每个 task 末尾仅标记"提交点"，由你手动 `git add` + `git commit`
- **文件冲突**：已在 team 划分中隔离

无需再等用户确认，按上述约束直接进入执行阶段。
