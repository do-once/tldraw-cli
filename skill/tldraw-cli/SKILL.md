---
name: tldraw-cli
description: Drive a live tldraw canvas from CLI — create shapes, read snapshots, track changes, undo/redo. Use this skill whenever the user wants to draw diagrams, whiteboard, visualize architecture, create flowcharts, sketch layouts, or do any visual collaboration on a tldraw canvas. Also use when the user mentions tldraw-cli, drawing shapes, canvas operations, or asks you to draw or sketch a diagram.
allowed-tools: Bash(tldraw-cli:*) Bash(npx:*) Bash(npm:*)
---

# tldraw-cli — 画布驱动

通过 CLI 命令操作浏览器中运行的 tldraw 画布。创建图形、读取状态、感知变化、撤销重做。人和 LLM 共用同一块画布，互相可见。

## Quick start

```bash
tldraw-cli start                    # 启动 Host + 浏览器自动打开 http://localhost:8787/
tldraw-cli canvas snapshot          # 读取画布全量状态（shapes + revision）
echo '{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":100,"y":100,"w":200,"h":120,"text":"Hello"}]}' \
  | tldraw-cli command apply        # 创建一个矩形
tldraw-cli canvas diff --since 0    # 查看所有变更历史
tldraw-cli command undo             # 撤销上一步
tldraw-cli stop                     # 关闭
```

所有命令输出 JSON 到 stdout。用 `node -p`（取单个值）或 `node -e`（多行 / 需要 `console.log` 显式输出）解析——跨平台不依赖 jq。

## 详尽参考索引

字段全集、错误码、HTTP RPC 等细节都在 references/ 文件里。遇到字段不全或想看默认值时**先翻下面**，不要在主文档里硬猜：

- [命令详解](references/command-details.md) — 想看 `--since` / `--canvas` 等参数默认值、命令输出 JSON 字段名、边界情况时翻
- [Shape 字段](references/shape-reference.md) — 想看 `update-shape` 哪些字段可用、`fill` / `dash` 枚举值、`arrowheadStart/End` 默认值时翻
- [RPC 方法](references/rpc-methods.md) — 想绕开 CLI 直接 curl HTTP JSON-RPC 时翻
- [错误码](references/error-codes.md) — CLI 报错或 JSON-RPC 错误码不认识时翻
- [会话与环境](references/session-management.md) — 改端口、找 session 文件位置、查环境变量时翻
- [布局规则](references/layout-principles.md) — 画图时的硬规则 + 自检 + 理论出处
- [图表模板](references/diagram-recipes.md) — 活动/状态/用例/ER/时序/类图模板 + 符号速查
- [选区工作流](references/selection-workflow.md) — Observe-Select-Act 完整示例 + 边界情况

## 行为规则

1. **`tldraw-cli start` 之后不要再起额外的 Runtime**：start 已经把浏览器开到 `http://localhost:8787/`，那一个 tab 就是 Runtime。**不要再调** `tldraw-cli start` 之外的 open 命令、不要让另一个 agent / playwright-cli / 任何脚本去访问 `/` 把页面又加载一次——多一个 tab 就多一个 Runtime 连接，每条 `command apply` 会被两侧同时执行，画布上出现重复 shape。需要让人类看到画布时，告诉对方"浏览器里已经有那个 tab 了"，不要自己再开。
2. **批量优先**：`command apply` 的 `commands` 数组支持混合多种 kind。把同一轮要做的所有操作（创建、修改、删除）合并到一次调用，减少 CLI 冷启动和网络往返。只有当后续命令依赖前一次返回的 `shapeId`（如先建图形再建绑定箭头）时才分两次。
3. **多行 JSON 必须用 heredoc**：`echo '{"text":"第一行\n第二行"}'` 这种写法里，shell 单引号中的物理换行会直接落进 `text` 字段，JSON 规范不允许裸换行，`command apply` 会报 `Invalid JSON body`。推荐用 `tldraw-cli command apply <<'JSON' ... JSON`——块内物理换行只出现在对象/数组的结构位（合法空白），而字符串字段里要换行用 `\n` 字面两字符。
4. **变量跨步首选同调用，必要时文件桥接**：Claude Code 的 Bash 工具每次调用都是独立 shell，上一次 `RESULT=$(...)` / `export` 不跨到下一次。"apply → 提取 shapeId → 用 shapeId 再 apply" **首选串成同一条 Bash 命令**（最简单、最少出错）。若中间必须回到 LLM 做推理再继续，用 `/tmp/tldraw-*` 临时文件桥接：上次调用 `echo "$SHAPE_ID" > /tmp/tldraw-shape-id`，下次调用 `SHAPE_ID=$(cat /tmp/tldraw-shape-id)`——能用但笨。千万别跨调用直接引用 `$SHAPE_ID`，它会是空串，`create-arrow` 会触发参数校验错误。
5. **布局硬约束建议遵守**：画图时节点 x/y/w/h 落在 grid=20 网格，水平间距 ≥ 100，垂直间距 ≥ 80，反向流用 `dash='dashed'` + `color='grey'`。画图前后按 references/layout-principles.md 中的约束自行核查。完整规则和出处见 references/layout-principles.md。

## 工作流：Plan → Draw → Verify → Select-Act

LLM 画图时遵循以下 4 步循环。每步之间不要猜测——靠命令输出拿到事实再继续。

### Step 1 — Plan（规划）

- 确定图类型 → 查 [references/diagram-recipes.md](references/diagram-recipes.md) 找对应模板
- 选布局 pattern → 查 [references/diagram-recipes.md](references/diagram-recipes.md) 中"布局模式库"章节
- 估算 shape 数量和坐标（grid=20，落在 20 整数倍上）

### Step 2 — Draw（绘制）

批量 `command apply`，遵循 [references/layout-principles.md](references/layout-principles.md) 约束。

绘制期间遵守以下规则：

1. **不要重复启动 Runtime**（见"行为规则 #1"）
2. **批量优先**：同一轮操作合并进一次 `command apply`（见"行为规则 #2"）
3. **多行 JSON 用 heredoc**（见"行为规则 #3"）
4. **变量跨步首选同调用**（见"行为规则 #4"）
5. **坐标落在 grid=20**，水平间距 ≥ 100，垂直间距 ≥ 80（见"行为规则 #5"）

### Step 3 — Verify（验证）

```bash
# 读全量快照，核查 shape 数量、坐标、箭头连接
SNAP=$(tldraw-cli canvas snapshot)
export SNAP
node -e "
  const s = JSON.parse(process.env.SNAP);
  console.log('shapes:', s.shapes.length, 'revision:', s.revision);
  s.shapes.forEach(x => console.log(x.shapeId, x.kind, x.x, x.y, x.text ?? ''));
"

# 有截图能力时，用截图直接看渲染结果
tldraw-cli canvas screenshot
# 返回 {"imagePath": "/tmp/tldraw-screenshot-<timestamp>.png"}
# 用 Read 工具读取图片文件，直接看是否符合预期
```

检查清单：
- shape 数量与 Plan 步骤估算一致
- 箭头的 `startBindingShapeId` / `endBindingShapeId` 不是空串
- 坐标在合理范围内（无大幅偏移）
- 发现问题 → `command undo` 或直接 `update-shape` 修正 → 重回 Verify

### Step 4 — Select-Act（用户框选触发，可选）

用于"LLM 画粗版 → 用户框选局部 → LLM 只改选中"迭代。

```bash
# 用户在浏览器框选后 LLM 读取选区
SEL=$(tldraw-cli canvas get-selection)
export SEL

# 检查是否有选中内容
node -p "JSON.parse(process.env.SEL).shapeIds.length"

# 只改选中的 shape（同一次 Bash 调用里处理）
node -e "
  const sel = JSON.parse(process.env.SEL);
  const cmds = sel.shapeIds.map(id => ({kind:'update-shape', shapeId:id, color:'blue'}));
  console.log(JSON.stringify({commands: cmds}));
" | tldraw-cli command apply

# 改完回到 Step 3 验证
```

**关键注意**：`get-selection` 只读——只读取用户已有选区，不能通过 CLI 设置选区。完整说明见 [references/selection-workflow.md](references/selection-workflow.md)。

## Session · 速查

> 高频命令 + 幂等规则。完整字段、端口管理见 [references/session-management.md](references/session-management.md) 和 [references/command-details.md](references/command-details.md)。

```bash
tldraw-cli start                              # 启动（默认 http://localhost:8787/）
tldraw-cli start --port 9000 --ws-port 9001   # 自定义端口
tldraw-cli status                             # 查看运行状态 + Runtime 是否就绪
tldraw-cli stop                               # 停止 Host（自动清理 session）
```

**`start` 是幂等的**——重复调用不会报错也不会起第二个 Host：

- 已有 Host 在跑 → `state: "already-running"`，exit 0
- 默认端口被外部 Host 占（无 session 文件）→ 同 `already-running`，附 `note`
- 显式 `--port N` 与现有端口不一致 → `state: "error"`，exit 1（须先 `stop`）

各态完整字段、Runtime 就绪检查代码见 [references/command-details.md](references/command-details.md)。

## Canvas read · 速查

> 读画布的高频命令。完整 shape 字段表见 [references/shape-reference.md](references/shape-reference.md)。

```bash
# 全量快照 — 返回 {canvasId, revision, shapes[], runtimeSessionId}
tldraw-cli canvas snapshot
tldraw-cli canvas snapshot --canvas page:abc

# 增量变更 — 返回 {fromRevision, toRevision, entries[], runtimeSessionId}
# entries 的 kind: shape-created / shape-updated / shape-deleted
# CLI 自动传 runtimeSessionId；若 Runtime 已重启则报错退出，需先运行 snapshot 重建基线
tldraw-cli canvas diff --since 3
tldraw-cli canvas diff --since 0 --canvas page:abc

# 列出所有画布 — 返回 {items[{id, title, revision}]}
tldraw-cli canvas list
```

**Snapshot shape 结构**：所有字段**全在顶层**（无 `props` 嵌套），主键叫 `shapeId`（**不是 `id`**）。完整字段表见 [references/shape-reference.md](references/shape-reference.md)。

**Kind 名映射规则**：snapshot 里的 `kind` = 命令名去掉 `create-` 前缀；唯一例外 `create-geo-shape` → `geo`。

**大画布瘦身**：若画布接近或超过 100 个 shape，整份 snapshot 进上下文会吃 token。用管道只保留结构字段，样式不进上下文：

```bash
tldraw-cli canvas snapshot | node -e '
  const s = JSON.parse(require("fs").readFileSync(0));
  console.log(JSON.stringify({
    revision: s.revision,
    shapes: s.shapes.map(x => ({id: x.shapeId, kind: x.kind, x: x.x, y: x.y, text: x.text ?? null}))
  }))
'
```

管道里完整 snapshot 只在 shell 内存中短暂存在，进 LLM 上下文的只是 `node -e` 的投影输出。

## Canvas write · 速查

> 写画布的高频命令。完整命令参数见 [references/command-details.md](references/command-details.md)，shape 字段见 [references/shape-reference.md](references/shape-reference.md)。

从 stdin 读取 JSON，批量执行命令。**`results` 与输入 `commands` 按索引一一对应**（这是提取新建 shape 的 `shapeId` 的依据）。完整返回 schema 见 [references/command-details.md](references/command-details.md)。

```bash
# 单条命令
echo '{"commands":[{"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":200,"h":100,"text":"A"}]}' \
  | tldraw-cli command apply

# 批量混合多种 kind（多行 JSON 推荐 heredoc，见行为规则 #3）
tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":200,"h":100,"text":"A"},
  {"kind":"create-geo-shape","geo":"ellipse","x":300,"y":0,"w":150,"h":150,"text":"B"},
  {"kind":"create-note","x":500,"y":0,"text":"多行备注\n第二行","color":"yellow"}
]}
JSON

# 反例 — 用 echo 写多行 text 字段会塞进裸换行：
#   echo '{"commands":[{"kind":"create-note","text":"第一行
#   第二行"}]}' | tldraw-cli command apply   # ❌ Invalid JSON body

# 指定目标画布
echo '{"commands":[...]}' | tldraw-cli command apply --canvas page:abc
```

### 获取 shapeId

`command apply` 返回 `results` 数组，与 `commands` 一一对应。变量传递规则见行为规则 #4——首选整块放同一次 Bash 调用：

```bash
# ↓↓↓ 整块在同一次 Bash 调用里 ↓↓↓
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":200,"h":100,"text":"A"},
  {"kind":"create-geo-shape","geo":"rectangle","x":300,"y":0,"w":200,"h":100,"text":"B"}
]}
JSON
)
export RESULT
A_ID=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
B_ID=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")

# 用 shapeId 创建绑定箭头（heredoc 不加引号可插值变量）
tldraw-cli command apply <<JSON
{"commands":[{"kind":"create-arrow","startX":200,"startY":50,"endX":300,"endY":50,"startBindingShapeId":"$A_ID","endBindingShapeId":"$B_ID"}]}
JSON
```

### Undo / Redo

```bash
tldraw-cli command undo   # 撤销（Ctrl+Z）
tldraw-cli command redo   # 重做（Ctrl+Y）
```

## Canvas manage · 速查

> 画布管理命令。完整参数见 [references/command-details.md](references/command-details.md)。

```bash
tldraw-cli canvas create --title "方案B"       # 新建画布（revision 从 0 开始）
tldraw-cli canvas select --canvas page:abc     # 切换活跃画布
```

## Shape reference · 速查

> 每种 kind 的最简示例。完整字段、默认值、枚举见 [references/shape-reference.md](references/shape-reference.md) 和 [references/generated/enum-tables.md](references/generated/enum-tables.md)——别在主文档里硬猜字段。

```bash
echo '{"commands":[{"kind":"create-geo-shape","geo":"diamond","x":0,"y":0,"w":160,"h":100,"text":"判断","color":"red","fill":"semi"}]}' \
  | tldraw-cli command apply

echo '{"commands":[{"kind":"create-text","x":0,"y":0,"text":"标题","font":"sans","size":"l"}]}' \
  | tldraw-cli command apply

# ⚠️ 绑定后坐标只是初始提示，端点会被 tldraw 自动贴边
echo '{"commands":[{"kind":"create-arrow","startX":0,"startY":0,"endX":200,"endY":0,"text":"调用","dash":"dashed","bend":0.3}]}' \
  | tldraw-cli command apply

echo '{"commands":[{"kind":"create-note","x":0,"y":0,"text":"TODO","color":"yellow"}]}' \
  | tldraw-cli command apply

# 修改：必填 shapeId；其他字段都可选（按 shape 类型不同字段集，详见 references/）
echo '{"commands":[{"kind":"update-shape","shapeId":"shape:abc","text":"改名","color":"blue"}]}' \
  | tldraw-cli command apply

# 删除
echo '{"commands":[{"kind":"delete-shape","shapeId":"shape:abc"}]}' \
  | tldraw-cli command apply
```

## 示例：修改已有图形

snapshot → 找 shapeId → update/delete，全程在**同一次 Bash 调用**里：

```bash
# 1. 读 snapshot
SNAP=$(tldraw-cli canvas snapshot)
export SNAP

# 2. 按文字匹配提取目标 shapeId（也可按 kind/坐标筛）
TARGET=$(node -p "
  JSON.parse(process.env.SNAP).shapes.find(s => s.text === '旧标题').shapeId
")

# 3. 一次 apply 里同时改属性 + 删旁支节点（heredoc 不加引号可插值变量）
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"update-shape","shapeId":"$TARGET","text":"新标题","color":"green"},
  {"kind":"delete-shape","shapeId":"shape:obsolete-xxx"}
]}
JSON
```

## 示例：对比方案

⚠️ `canvas create` **不会自动切换** activeCanvasId——后续 `command apply` 默认仍打到原画布。要么用 `--canvas <id>` 显式指定，要么 `canvas select` 切过去。下面用 `--canvas` 隔离两个方案：

```bash
# 整段在同一次 Bash 调用里执行
A=$(tldraw-cli canvas create --title "方案A" | node -p "JSON.parse(require('fs').readFileSync(0)).canvasId")
B=$(tldraw-cli canvas create --title "方案B" | node -p "JSON.parse(require('fs').readFileSync(0)).canvasId")

tldraw-cli command apply --canvas "$A" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":300,"h":200,"text":"单体架构"},
  {"kind":"create-note","x":0,"y":230,"text":"简单，部署快，但扩展性差"}
]}
JSON

tldraw-cli command apply --canvas "$B" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":150,"h":100,"text":"服务A"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":0,"w":150,"h":100,"text":"服务B"},
  {"kind":"create-note","x":0,"y":130,"text":"微服务，独立部署，复杂度高"}
]}
JSON

# 切换画布让人类看到（也可以让人在浏览器自己点 page 标签切）
tldraw-cli canvas select --canvas "$A"
tldraw-cli canvas snapshot --canvas "$A"
```

## 故障排查 · 速查

> 命令失败或画布异常时按症状对号。完整错误码见 [references/error-codes.md](references/error-codes.md)。

- **`Host not running`** → `tldraw-cli start`（幂等，重复调用无害）
- **Runtime 未连接 / 超时**（`1001` / `1003`）→ `tldraw-cli status` 看 `runtimes`：空就打开 `http://localhost:8787/` 等 2-3 秒再试；非空就刷新该 tab 重建 WebSocket
- **`Invalid JSON body`**（`-32700`）→ 多半是 `echo '...'` 里字符串字段含裸换行，改用 `<<'JSON' ... JSON` heredoc（见行为规则 #3）
- **参数校验失败**（`-32602`）→ 看 message 里 zod 指出的字段；高频原因：`create-arrow` 的 `startBindingShapeId` 传了空串（不绑定就**省略字段**）、`w/h ≤ 0`、`create-text` / `create-note` 缺 `text`
- **`shapeId not found`**（`1007`）→ 先 `canvas snapshot` 核对 id 是否仍在；常见原因是跨 Bash 调用的 `$SHAPE_ID` 变量为空（见行为规则 #4）
- **画布上 shape 重复出现** → 打开了多个 Runtime tab，每条 apply 被执行两次；关掉多余 tab（见行为规则 #1）
- **`command apply` 成功但画布空白** → `status` 确认 `runtimes` 非空；`canvas list` 看活动画布的 `revision` 是否真的递增，不递增说明 apply 打到了别的 `canvasId`
