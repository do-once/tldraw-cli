# UML 图例模板

LLM 画 UML 图时参考本文件。每种图含一个完整 bash 模板 + 符号速查表。

---

## 通用约定

- **grid=20**：所有坐标（x/y/w/h）必须是 20 的整数倍
- **方向声明**：每个例子开头注释中声明 `LR`（left-to-right）或 `TB`（top-to-bottom）
- **enum 全集**：arrowhead / fill / dash / color / geo 等枚举值见 [`generated/enum-tables.md`](generated/enum-tables.md)
- **类图豁免**：layout-principles.md 规则 6（`feedback-arrow-style`：dashed 必须配 grey）在类图场景下**不适用**。类图中 dashed 箭头是 UML 语义标记（实现/依赖），不是反向流，画类图时可忽略该条约束。参见 `layout-principles.md` 规则 6 豁免说明

---

## 布局模式库

选图类型之后，从下面选择匹配的布局 pattern，再按 pattern 给出的坐标公式估算节点位置。

---

### Pipeline（流水线）

一句话描述：节点沿单一轴线等距排列，表示线性处理流程。

适用场景：数据管道、CI 流水线、ETL 步骤序列。

坐标公式（LR 方向）：
- 第 i 个节点：`x = i * (W + GAP_X)`, `y = 0`
- 建议：`W=160, H=60, GAP_X=120`

最小命令序列示例（3 节点水平流水线）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":160,"h":60,"text":"Step 1"},
  {"kind":"create-geo-shape","geo":"rectangle","x":280,"y":0,"w":160,"h":60,"text":"Step 2"},
  {"kind":"create-geo-shape","geo":"rectangle","x":560,"y":0,"w":160,"h":60,"text":"Step 3"}
]}
JSON
)
export RESULT
S1=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
S2=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
S3=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":160,"startY":30,"endX":280,"endY":30,
   "startBindingShapeId":"$S1","endBindingShapeId":"$S2",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":30,"endX":560,"endY":30,
   "startBindingShapeId":"$S2","endBindingShapeId":"$S3",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

---

### Fan-out（扇出）

一句话描述：一个源节点向多个目标节点发散，表示一对多分发。

适用场景：消息队列广播、负载均衡分发、事件触发多个下游。

坐标公式：
- 源节点：`x = 0, y = N/2 * (H + GAP_Y) - H/2`（垂直居中）
- 第 i 个目标（0-indexed）：`x = W + GAP_X, y = i * (H + GAP_Y)`
- 建议：`W=160, H=60, GAP_X=160, GAP_Y=80`

最小命令序列示例（1 源 → 3 目标）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":120,"w":160,"h":60,"text":"Source"},
  {"kind":"create-geo-shape","geo":"rectangle","x":320,"y":0,"w":160,"h":60,"text":"Target A"},
  {"kind":"create-geo-shape","geo":"rectangle","x":320,"y":120,"w":160,"h":60,"text":"Target B"},
  {"kind":"create-geo-shape","geo":"rectangle","x":320,"y":240,"w":160,"h":60,"text":"Target C"}
]}
JSON
)
export RESULT
SRC=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
TA=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
TB=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
TC=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":160,"startY":150,"endX":320,"endY":30,
   "startBindingShapeId":"$SRC","endBindingShapeId":"$TA",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":150,"endX":320,"endY":150,
   "startBindingShapeId":"$SRC","endBindingShapeId":"$TB",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":150,"endX":320,"endY":270,
   "startBindingShapeId":"$SRC","endBindingShapeId":"$TC",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

---

### Convergence（收敛）

一句话描述：多个源节点汇聚到一个目标节点，表示多对一聚合。

适用场景：多数据源合并、聚合服务、结果收集。

坐标公式：
- 第 i 个源节点（0-indexed）：`x = 0, y = i * (H + GAP_Y)`
- 目标节点：`x = W + GAP_X, y = N/2 * (H + GAP_Y) - H/2`（垂直居中）
- 建议：`W=160, H=60, GAP_X=160, GAP_Y=80`

最小命令序列示例（3 源 → 1 目标）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":160,"h":60,"text":"Source A"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":140,"w":160,"h":60,"text":"Source B"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":280,"w":160,"h":60,"text":"Source C"},
  {"kind":"create-geo-shape","geo":"rectangle","x":320,"y":140,"w":160,"h":60,"text":"Sink"}
]}
JSON
)
export RESULT
SA=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
SB=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
SC=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
SINK=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":160,"startY":30,"endX":320,"endY":170,
   "startBindingShapeId":"$SA","endBindingShapeId":"$SINK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":170,"endX":320,"endY":170,
   "startBindingShapeId":"$SB","endBindingShapeId":"$SINK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":310,"endX":320,"endY":170,
   "startBindingShapeId":"$SC","endBindingShapeId":"$SINK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

---

### Tree（树形）

一句话描述：根节点向下展开多级子节点，表示层级结构。

适用场景：组织架构、目录树、分类体系。

坐标公式（TB 方向，2 层树）：
- 根节点：`x = TOTAL_W/2 - W/2, y = 0`
- 第 i 个子节点（0-indexed，共 N 个）：`x = i * (W + GAP_X), y = H + GAP_Y`
- 建议：`W=140, H=60, GAP_X=60, GAP_Y=80`

最小命令序列示例（1 根 + 3 子）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":0,"w":140,"h":60,"text":"Root"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":140,"w":140,"h":60,"text":"Child A"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":140,"w":140,"h":60,"text":"Child B"},
  {"kind":"create-geo-shape","geo":"rectangle","x":400,"y":140,"w":140,"h":60,"text":"Child C"}
]}
JSON
)
export RESULT
ROOT=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
CA=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
CB=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
CC=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":270,"startY":60,"endX":70,"endY":140,
   "startBindingShapeId":"$ROOT","endBindingShapeId":"$CA",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":270,"startY":60,"endX":270,"endY":140,
   "startBindingShapeId":"$ROOT","endBindingShapeId":"$CB",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":270,"startY":60,"endX":470,"endY":140,
   "startBindingShapeId":"$ROOT","endBindingShapeId":"$CC",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

---

### Swimlane（泳道）

一句话描述：用 frame 把画布横向或纵向分区，节点和箭头可跨区，表示不同角色/系统的职责边界。

适用场景：跨部门流程、微服务边界划分、前后端交互图。

坐标公式（TB 方向，2 个纵向泳道）：
- 泳道 A frame：`x=0, y=0, w=LANE_W, h=LANE_H`
- 泳道 B frame：`x=LANE_W+GAP, y=0, w=LANE_W, h=LANE_H`
- 建议：`LANE_W=300, LANE_H=400, GAP=40`
- 节点在各自泳道内按 Pipeline 或 Tree 排列

最小命令序列示例（2 泳道各 2 节点 + 跨区箭头）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":300,"h":360,"text":"前端","fill":"semi","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":340,"y":0,"w":300,"h":360,"text":"后端","fill":"semi","color":"green"},
  {"kind":"create-geo-shape","geo":"rectangle","x":60,"y":80,"w":180,"h":60,"text":"用户输入"},
  {"kind":"create-geo-shape","geo":"rectangle","x":60,"y":240,"w":180,"h":60,"text":"渲染结果"},
  {"kind":"create-geo-shape","geo":"rectangle","x":400,"y":80,"w":180,"h":60,"text":"API 处理"},
  {"kind":"create-geo-shape","geo":"rectangle","x":400,"y":240,"w":180,"h":60,"text":"数据库读写"}
]}
JSON
)
export RESULT
FE_INPUT=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
FE_RENDER=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
BE_API=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
BE_DB=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":240,"startY":110,"endX":400,"endY":110,
   "startBindingShapeId":"$FE_INPUT","endBindingShapeId":"$BE_API",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"HTTP 请求"},
  {"kind":"create-arrow","startX":490,"startY":140,"endX":490,"endY":240,
   "startBindingShapeId":"$BE_API","endBindingShapeId":"$BE_DB",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":400,"startY":270,"endX":240,"endY":270,
   "startBindingShapeId":"$BE_API","endBindingShapeId":"$FE_RENDER",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed","color":"grey","text":"响应"}
]}
JSON
```

---

### Grid（网格）

一句话描述：节点按行列均匀排列，表示对等关系或矩阵结构。

适用场景：功能矩阵、服务网格、对比表格。

坐标公式（R 行 C 列）：
- 第 r 行第 c 列节点：`x = c * (W + GAP_X), y = r * (H + GAP_Y)`
- 建议：`W=140, H=60, GAP_X=60, GAP_Y=60`

最小命令序列示例（2×3 网格，无连线）：

```bash
tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":140,"h":60,"text":"A1"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":0,"w":140,"h":60,"text":"A2"},
  {"kind":"create-geo-shape","geo":"rectangle","x":400,"y":0,"w":140,"h":60,"text":"A3"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":120,"w":140,"h":60,"text":"B1"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":120,"w":140,"h":60,"text":"B2"},
  {"kind":"create-geo-shape","geo":"rectangle","x":400,"y":120,"w":140,"h":60,"text":"B3"}
]}
JSON
```

---

### Cycle（环形）

一句话描述：节点首尾相连形成闭环，表示循环流程或状态机。

适用场景：PDCA 循环、状态轮转、重试逻辑。

坐标公式（N 个节点，半径 R）：
- 第 i 个节点：`x = CX + R*cos(2π*i/N) - W/2, y = CY + R*sin(2π*i/N) - H/2`（取最近 20 整数倍）
- 建议 N=4：CX=300, CY=300, R=200, W=140, H=60
  - 上：`x=220, y=40`；右：`x=420, y=260`；下：`x=220, y=500`；左：`x=20, y=260`

最小命令序列示例（4 节点顺时针环）：

```bash
RESULT=$(tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":40,"w":140,"h":60,"text":"Plan"},
  {"kind":"create-geo-shape","geo":"rectangle","x":420,"y":260,"w":140,"h":60,"text":"Do"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":500,"w":140,"h":60,"text":"Check"},
  {"kind":"create-geo-shape","geo":"rectangle","x":20,"y":260,"w":140,"h":60,"text":"Act"}
]}
JSON
)
export RESULT
P=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
D=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
C=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
A=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
tldraw-cli command apply <<JSON
{"commands":[
  {"kind":"create-arrow","startX":360,"startY":70,"endX":420,"endY":260,
   "startBindingShapeId":"$P","endBindingShapeId":"$D",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":490,"startY":320,"endX":360,"endY":500,
   "startBindingShapeId":"$D","endBindingShapeId":"$C",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":220,"startY":530,"endX":160,"endY":320,
   "startBindingShapeId":"$C","endBindingShapeId":"$A",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":260,"endX":220,"endY":70,
   "startBindingShapeId":"$A","endBindingShapeId":"$P",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

---

### Layered（分层）

一句话描述：用纵向堆叠的 frame 表示系统分层，层内节点水平排列。

适用场景：分层架构（表示层/业务层/数据层）、OSI 模型、技术栈可视化。

坐标公式（L 层，每层 frame 高 LAYER_H，宽 TOTAL_W）：
- 第 i 层 frame：`x=0, y=i*(LAYER_H+GAP), w=TOTAL_W, h=LAYER_H`
- 层内第 j 个节点：`x=PAD+j*(W+GAP_X), y=i*(LAYER_H+GAP)+PAD`
- 建议：`TOTAL_W=640, LAYER_H=100, GAP=20, PAD=20, W=160, H=60, GAP_X=40`

最小命令序列示例（3 层各 2 节点）：

```bash
tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":640,"h":100,"text":"表示层","fill":"semi","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":120,"w":640,"h":100,"text":"业务层","fill":"semi","color":"green"},
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":240,"w":640,"h":100,"text":"数据层","fill":"semi","color":"grey"},
  {"kind":"create-geo-shape","geo":"rectangle","x":20,"y":20,"w":160,"h":60,"text":"Web UI"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":20,"w":160,"h":60,"text":"Mobile UI"},
  {"kind":"create-geo-shape","geo":"rectangle","x":20,"y":140,"w":160,"h":60,"text":"Order Service"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":140,"w":160,"h":60,"text":"User Service"},
  {"kind":"create-geo-shape","geo":"rectangle","x":20,"y":260,"w":160,"h":60,"text":"MySQL"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":260,"w":160,"h":60,"text":"Redis"}
]}
JSON
```

---

## 1. 活动图（Activity Diagram）

> 方向：TB（top-to-bottom）

### 完整例子

```bash
# 活动图模板 — 电商订单处理流程
# 方向: TB (top-to-bottom)
# Pattern: Pipeline（TB） + Fan-out（判断分支）
# 节点：起始节点用 text:"●" 视觉替代实心黑圆 + 动作矩形 + 判断菱形 + 终止节点同上
# 场景：下单 → 支付 → 库存检查（分支） → 发货/缺货通知 → 客户通知 → 结束

CANVAS_ID="<canvas-id>"

# Step 1: 创建所有节点（坐标均为 20 整数倍，TB 方向，中心 x=300）
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"ellipse","x":280,"y":20,"w":40,"h":40,
   "text":"●","fill":"solid","color":"grey"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":120,"w":160,"h":60,
   "text":"客户下单"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":240,"w":160,"h":60,
   "text":"在线支付"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":360,"w":200,"h":80,
   "text":"支付成功？"},
  {"kind":"create-geo-shape","geo":"rectangle","x":440,"y":380,"w":160,"h":60,
   "text":"通知支付失败"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":500,"w":200,"h":80,
   "text":"库存充足？"},
  {"kind":"create-geo-shape","geo":"rectangle","x":440,"y":520,"w":160,"h":60,
   "text":"缺货通知客户"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":640,"w":160,"h":60,
   "text":"安排发货"},
  {"kind":"create-geo-shape","geo":"rectangle","x":220,"y":760,"w":160,"h":60,
   "text":"发送物流通知"},
  {"kind":"create-geo-shape","geo":"ellipse","x":280,"y":880,"w":40,"h":40,
   "text":"●","fill":"solid","color":"grey"}
]}
JSON
)

export RESULT
START=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
ORDER=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
PAY=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
PAY_OK=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
PAY_FAIL=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
STOCK=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
NO_STOCK=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
SHIP=$(node -p "JSON.parse(process.env.RESULT).results[7].shapeId")
NOTIFY=$(node -p "JSON.parse(process.env.RESULT).results[8].shapeId")
END=$(node -p "JSON.parse(process.env.RESULT).results[9].shapeId")

# Step 2: 创建控制流箭头
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":300,"startY":60,"endX":300,"endY":120,
   "startBindingShapeId":"$START","endBindingShapeId":"$ORDER",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":300,"startY":180,"endX":300,"endY":240,
   "startBindingShapeId":"$ORDER","endBindingShapeId":"$PAY",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":300,"startY":300,"endX":300,"endY":360,
   "startBindingShapeId":"$PAY","endBindingShapeId":"$PAY_OK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":400,"startY":400,"endX":440,"endY":400,
   "startBindingShapeId":"$PAY_OK","endBindingShapeId":"$PAY_FAIL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"否"},
  {"kind":"create-arrow","startX":300,"startY":440,"endX":300,"endY":500,
   "startBindingShapeId":"$PAY_OK","endBindingShapeId":"$STOCK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"是"},
  {"kind":"create-arrow","startX":400,"startY":540,"endX":440,"endY":540,
   "startBindingShapeId":"$STOCK","endBindingShapeId":"$NO_STOCK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"否"},
  {"kind":"create-arrow","startX":300,"startY":580,"endX":300,"endY":640,
   "startBindingShapeId":"$STOCK","endBindingShapeId":"$SHIP",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"是"},
  {"kind":"create-arrow","startX":300,"startY":700,"endX":300,"endY":760,
   "startBindingShapeId":"$SHIP","endBindingShapeId":"$NOTIFY",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":300,"startY":820,"endX":300,"endY":880,
   "startBindingShapeId":"$NOTIFY","endBindingShapeId":"$END",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

### 符号速查表

| UML 符号 | geo / shape | fill | color | dash | 说明 |
|---|---|---|---|---|---|
| 起始节点 | `ellipse` | `solid` | `grey` | `solid` | text:"●" 视觉替代实心黑圆，w=h=40 |
| 终止节点 | `ellipse` | `solid` | `grey` | `solid` | 同上，w=h=40 |
| 动作节点 | `rectangle` | 默认 | 默认 | `solid` | text 写动作名，w≥160 h=60 |
| 判断节点 | `diamond` | 默认 | 默认 | `solid` | text 写条件，w=200 h=80 |
| 控制流箭头 | `create-arrow` | — | 默认 | `solid` | `arrowheadEnd="arrow"`，分支箭头用 text 标注"是/否" |
| 反馈/返回流 | `create-arrow` | — | `grey` | `dashed` | 同时设 color+dash |

---

## 2. 状态图（State Diagram）

> 方向：TB（top-to-bottom）

### 完整例子

```bash
# 状态图模板 — 工单生命周期
# 方向: TB (top-to-bottom)
# Pattern: Pipeline（TB） + 回跳箭头（dashed+grey）
# 场景：新建 → 分配 → 处理中 → 审核 → 关闭，含重开回跳
# 注：箭头用 text 字段（不是 label），未绑定回跳箭头需手动写坐标

CANVAS_ID="<canvas-id>"

# Step 1: 创建所有状态节点（中心 x=260，节点宽 200）
# 节点 y 坐标由验证画布实测对齐：初始 -40，新建 60，分配 200，处理中 400，审核 640，关闭 780，终止 900
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"ellipse","x":240,"y":-40,"w":40,"h":40,
   "text":"●","fill":"solid","color":"grey"},
  {"kind":"create-geo-shape","geo":"rectangle","x":160,"y":60,"w":200,"h":60,
   "text":"新建 New"},
  {"kind":"create-geo-shape","geo":"rectangle","x":160,"y":200,"w":200,"h":60,
   "text":"分配 Assigned"},
  {"kind":"create-geo-shape","geo":"rectangle","x":160,"y":400,"w":200,"h":60,
   "text":"处理中 InProgress"},
  {"kind":"create-geo-shape","geo":"rectangle","x":160,"y":640,"w":200,"h":60,
   "text":"审核 Review"},
  {"kind":"create-geo-shape","geo":"rectangle","x":160,"y":780,"w":200,"h":60,
   "text":"关闭 Closed"},
  {"kind":"create-geo-shape","geo":"ellipse","x":240,"y":900,"w":40,"h":40,
   "text":"●","fill":"solid","color":"grey"}
]}
JSON
)

export RESULT
INIT=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
S_NEW=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
S_ASSIGN=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
S_PROG=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
S_REVIEW=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
S_CLOSED=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
FINAL=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")

# Step 2: 主流程转换（向下，solid）+ 回跳（向上，dashed+grey）
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":260,"startY":0,"endX":260,"endY":60,
   "startBindingShapeId":"$INIT","endBindingShapeId":"$S_NEW",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":260,"startY":120,"endX":260,"endY":200,
   "startBindingShapeId":"$S_NEW","endBindingShapeId":"$S_ASSIGN",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"分配工程师"},
  {"kind":"create-arrow","startX":260,"startY":260,"endX":260,"endY":400,
   "startBindingShapeId":"$S_ASSIGN","endBindingShapeId":"$S_PROG",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"开始处理"},
  {"kind":"create-arrow","startX":260,"startY":460,"endX":260,"endY":640,
   "startBindingShapeId":"$S_PROG","endBindingShapeId":"$S_REVIEW",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"提交审核"},
  {"kind":"create-arrow","startX":260,"startY":700,"endX":260,"endY":780,
   "startBindingShapeId":"$S_REVIEW","endBindingShapeId":"$S_CLOSED",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"审核通过"},
  {"kind":"create-arrow","startX":260,"startY":840,"endX":260,"endY":900,
   "startBindingShapeId":"$S_CLOSED","endBindingShapeId":"$FINAL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":160,"startY":700,"endX":160,"endY":460,
   "startBindingShapeId":"$S_REVIEW","endBindingShapeId":"$S_PROG",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed","color":"grey","text":"驳回重做","bend":100},
  {"kind":"create-arrow","startX":360,"startY":810,"endX":360,"endY":230,
   "startBindingShapeId":"$S_CLOSED","endBindingShapeId":"$S_ASSIGN",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed","color":"grey","text":"重开工单","bend":-280}
]}
JSON
```

### 符号速查表

| UML 符号 | geo / shape | fill | color | dash | 说明 |
|---|---|---|---|---|---|
| 初始伪状态 | `ellipse` | `solid` | `grey` | `solid` | text:"●" 视觉替代实心黑圆，w=h=40 |
| 终止伪状态 | `ellipse` | `solid` | `grey` | `solid` | 同上，w=h=40 |
| 状态 | `rectangle` | 默认 | 默认 | `solid` | text 写状态名，w=200 h=60 |
| 转换（前进） | `create-arrow` | — | 默认 | `solid` | `arrowheadEnd="arrow"`，**text** 写事件/条件（不是 label） |
| 转换（回跳） | `create-arrow` | — | `grey` | `dashed` | 同时设 color+dash，**text** 写触发事件，符合规则 6 |

---

## 3. 用例图（Use Case Diagram）

> 方向：LR（left-to-right）

### 完整例子

```bash
# 用例图模板 — 在线教育系统
# 方向: LR (left-to-right)
# Pattern: 自由布局 | 系统边界用 frame（避免矩形文字与内部椭圆重叠）
# Actor：ellipse + create-text 旁标（tldraw 无火柴人原生符号）
# 角色：学生 / 教师 / 管理员，6 个用例

CANVAS_ID="<canvas-id>"

# Step 1: 系统 frame（内部放用例椭圆）
# frame 命令暂用 create-geo-shape rectangle + fill:semi 模拟；
# 系统名用独立 create-text 置于 frame 顶部，避免与内部椭圆重叠
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":0,"w":480,"h":540,
   "text":"","fill":"semi","color":"blue"},
  {"kind":"create-text","x":360,"y":20,"text":"在线教育系统"},
  {"kind":"create-geo-shape","geo":"ellipse","x":260,"y":80,"w":200,"h":60,
   "text":"浏览课程"},
  {"kind":"create-geo-shape","geo":"ellipse","x":260,"y":180,"w":200,"h":60,
   "text":"报名课程"},
  {"kind":"create-geo-shape","geo":"ellipse","x":260,"y":280,"w":200,"h":60,
   "text":"提交作业"},
  {"kind":"create-geo-shape","geo":"ellipse","x":260,"y":380,"w":200,"h":60,
   "text":"查看成绩"},
  {"kind":"create-geo-shape","geo":"ellipse","x":480,"y":180,"w":200,"h":60,
   "text":"发布课程内容"},
  {"kind":"create-geo-shape","geo":"ellipse","x":480,"y":380,"w":200,"h":60,
   "text":"管理用户"},
  {"kind":"create-geo-shape","geo":"ellipse","x":20,"y":200,"w":80,"h":80,
   "text":""},
  {"kind":"create-text","x":0,"y":300,"text":"Actor: 学生"},
  {"kind":"create-geo-shape","geo":"ellipse","x":760,"y":120,"w":80,"h":80,
   "text":""},
  {"kind":"create-text","x":740,"y":220,"text":"Actor: 教师"},
  {"kind":"create-geo-shape","geo":"ellipse","x":760,"y":360,"w":80,"h":80,
   "text":""},
  {"kind":"create-text","x":740,"y":460,"text":"Actor: 管理员"}
]}
JSON
)

export RESULT
UC_BROWSE=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
UC_ENROLL=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
UC_SUBMIT=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
UC_GRADE=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
UC_PUBLISH=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
UC_ADMIN=$(node -p "JSON.parse(process.env.RESULT).results[7].shapeId")
ACTOR_STU=$(node -p "JSON.parse(process.env.RESULT).results[8].shapeId")
ACTOR_TCHR=$(node -p "JSON.parse(process.env.RESULT).results[10].shapeId")
ACTOR_ADM=$(node -p "JSON.parse(process.env.RESULT).results[12].shapeId")

# Step 2: 关联线（Actor → 用例，arrowheadEnd=none）
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":100,"startY":240,"endX":260,"endY":110,
   "startBindingShapeId":"$ACTOR_STU","endBindingShapeId":"$UC_BROWSE",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":100,"startY":240,"endX":260,"endY":210,
   "startBindingShapeId":"$ACTOR_STU","endBindingShapeId":"$UC_ENROLL",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":100,"startY":240,"endX":260,"endY":310,
   "startBindingShapeId":"$ACTOR_STU","endBindingShapeId":"$UC_SUBMIT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":100,"startY":240,"endX":260,"endY":410,
   "startBindingShapeId":"$ACTOR_STU","endBindingShapeId":"$UC_GRADE",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":760,"startY":160,"endX":680,"endY":210,
   "startBindingShapeId":"$ACTOR_TCHR","endBindingShapeId":"$UC_PUBLISH",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":760,"startY":160,"endX":460,"endY":310,
   "startBindingShapeId":"$ACTOR_TCHR","endBindingShapeId":"$UC_SUBMIT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid","text":"«批改»"},
  {"kind":"create-arrow","startX":760,"startY":400,"endX":680,"endY":410,
   "startBindingShapeId":"$ACTOR_ADM","endBindingShapeId":"$UC_ADMIN",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

### 符号速查表

| UML 符号 | geo / shape | fill | dash | 说明 |
|---|---|---|---|---|
| 系统边界 | `rectangle` + `create-text` | `semi` | `solid` | 矩形作背景色，系统名用独立 text shape 置于顶部，避免与内部椭圆重叠 |
| 用例 | `ellipse` | 默认 | `solid` | text 写用例名，中文 w≥200 h=60 |
| Actor（降级） | `ellipse` + `create-text` | 默认 | `solid` | 椭圆 w=h=80 + 旁边 text "Actor: 名字" |
| 关联（Actor→用例） | `create-arrow` | — | `solid` | `arrowheadEnd="none"` + `arrowheadStart="none"` |
| 包含（«include»） | `create-arrow` | — | `dashed` | `arrowheadEnd="arrow"` + text="«include»" |
| 扩展（«extend»） | `create-arrow` | — | `dashed` | `arrowheadEnd="arrow"` + text="«extend»" |

---

## 4. ER 图（Entity-Relationship Diagram）

> 方向：LR（left-to-right）

### 完整例子

```bash
# ER 图模板（Chen 记法）— 电商数据模型
# 方向: LR (left-to-right)
# Pattern: Grid（实体水平排列，属性垂直挂靠）
# 场景：用户 / 订单 / 商品 / 评论 4 个实体，每个实体 3-4 个属性
# 主键约定：属性 text 前加 🔑

CANVAS_ID="<canvas-id>"

# 实体水平间距：每列 x 偏移 340（实体 w=200，GAP_X=140）
# Step 1: 4 个实体 + 3 个关系菱形 + 各自属性
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":240,"w":200,"h":60,
   "text":"用户 User"},
  {"kind":"create-geo-shape","geo":"rectangle","x":340,"y":240,"w":200,"h":60,
   "text":"订单 Order"},
  {"kind":"create-geo-shape","geo":"rectangle","x":680,"y":240,"w":200,"h":60,
   "text":"商品 Product"},
  {"kind":"create-geo-shape","geo":"rectangle","x":340,"y":560,"w":200,"h":60,
   "text":"评论 Review"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":240,"w":140,"h":60,
   "text":"下单"},
  {"kind":"create-geo-shape","geo":"diamond","x":540,"y":240,"w":140,"h":60,
   "text":"包含"},
  {"kind":"create-geo-shape","geo":"diamond","x":440,"y":440,"w":140,"h":60,
   "text":"发布"},
  {"kind":"create-geo-shape","geo":"ellipse","x":0,"y":80,"w":200,"h":60,
   "text":"🔑 user_id"},
  {"kind":"create-geo-shape","geo":"ellipse","x":0,"y":380,"w":200,"h":60,
   "text":"username"},
  {"kind":"create-geo-shape","geo":"ellipse","x":-220,"y":240,"w":200,"h":60,
   "text":"email"},
  {"kind":"create-geo-shape","geo":"ellipse","x":340,"y":80,"w":200,"h":60,
   "text":"🔑 order_id"},
  {"kind":"create-geo-shape","geo":"ellipse","x":340,"y":380,"w":200,"h":60,
   "text":"total_amount"},
  {"kind":"create-geo-shape","geo":"ellipse","x":560,"y":80,"w":200,"h":60,
   "text":"status"},
  {"kind":"create-geo-shape","geo":"ellipse","x":680,"y":80,"w":200,"h":60,
   "text":"🔑 product_id"},
  {"kind":"create-geo-shape","geo":"ellipse","x":680,"y":380,"w":200,"h":60,
   "text":"price"},
  {"kind":"create-geo-shape","geo":"ellipse","x":900,"y":240,"w":200,"h":60,
   "text":"stock_qty"},
  {"kind":"create-geo-shape","geo":"ellipse","x":340,"y":700,"w":200,"h":60,
   "text":"🔑 review_id"},
  {"kind":"create-geo-shape","geo":"ellipse","x":140,"y":620,"w":200,"h":60,
   "text":"rating"},
  {"kind":"create-geo-shape","geo":"ellipse","x":540,"y":620,"w":200,"h":60,
   "text":"content"}
]}
JSON
)

export RESULT
E_USER=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
E_ORDER=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
E_PRODUCT=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
E_REVIEW=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
R_PLACE=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
R_CONTAIN=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
R_POST=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
A_UID=$(node -p "JSON.parse(process.env.RESULT).results[7].shapeId")
A_UNAME=$(node -p "JSON.parse(process.env.RESULT).results[8].shapeId")
A_UEMAIL=$(node -p "JSON.parse(process.env.RESULT).results[9].shapeId")
A_OID=$(node -p "JSON.parse(process.env.RESULT).results[10].shapeId")
A_OAMT=$(node -p "JSON.parse(process.env.RESULT).results[11].shapeId")
A_OSTA=$(node -p "JSON.parse(process.env.RESULT).results[12].shapeId")
A_PID=$(node -p "JSON.parse(process.env.RESULT).results[13].shapeId")
A_PPRICE=$(node -p "JSON.parse(process.env.RESULT).results[14].shapeId")
A_PSTOCK=$(node -p "JSON.parse(process.env.RESULT).results[15].shapeId")
A_RID=$(node -p "JSON.parse(process.env.RESULT).results[16].shapeId")
A_RRATING=$(node -p "JSON.parse(process.env.RESULT).results[17].shapeId")
A_RCONTENT=$(node -p "JSON.parse(process.env.RESULT).results[18].shapeId")

# Step 2: 实体间关系连线（无箭头）+ 属性连线
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":200,"startY":270,"endX":200,"endY":270,
   "startBindingShapeId":"$E_USER","endBindingShapeId":"$R_PLACE",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":340,"startY":270,"endX":340,"endY":270,
   "startBindingShapeId":"$R_PLACE","endBindingShapeId":"$E_ORDER",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":540,"startY":270,"endX":540,"endY":270,
   "startBindingShapeId":"$E_ORDER","endBindingShapeId":"$R_CONTAIN",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":680,"startY":270,"endX":680,"endY":270,
   "startBindingShapeId":"$R_CONTAIN","endBindingShapeId":"$E_PRODUCT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":440,"endX":440,"endY":300,
   "startBindingShapeId":"$R_POST","endBindingShapeId":"$E_ORDER",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":500,"endX":440,"endY":560,
   "startBindingShapeId":"$R_POST","endBindingShapeId":"$E_REVIEW",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":100,"startY":140,"endX":100,"endY":240,
   "startBindingShapeId":"$A_UID","endBindingShapeId":"$E_USER",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":100,"startY":300,"endX":100,"endY":380,
   "startBindingShapeId":"$E_USER","endBindingShapeId":"$A_UNAME",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":0,"startY":270,"endX":-20,"endY":270,
   "startBindingShapeId":"$E_USER","endBindingShapeId":"$A_UEMAIL",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":140,"endX":440,"endY":240,
   "startBindingShapeId":"$A_OID","endBindingShapeId":"$E_ORDER",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":300,"endX":440,"endY":380,
   "startBindingShapeId":"$E_ORDER","endBindingShapeId":"$A_OAMT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":660,"startY":140,"endX":580,"endY":240,
   "startBindingShapeId":"$A_OSTA","endBindingShapeId":"$E_ORDER",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":780,"startY":140,"endX":780,"endY":240,
   "startBindingShapeId":"$A_PID","endBindingShapeId":"$E_PRODUCT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":780,"startY":300,"endX":780,"endY":380,
   "startBindingShapeId":"$E_PRODUCT","endBindingShapeId":"$A_PPRICE",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":880,"startY":270,"endX":900,"endY":270,
   "startBindingShapeId":"$E_PRODUCT","endBindingShapeId":"$A_PSTOCK",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":440,"startY":620,"endX":440,"endY":700,
   "startBindingShapeId":"$E_REVIEW","endBindingShapeId":"$A_RID",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":340,"startY":580,"endX":240,"endY":620,
   "startBindingShapeId":"$E_REVIEW","endBindingShapeId":"$A_RRATING",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":540,"startY":580,"endX":640,"endY":620,
   "startBindingShapeId":"$E_REVIEW","endBindingShapeId":"$A_RCONTENT",
   "arrowheadEnd":"none","arrowheadStart":"none","dash":"solid"}
]}
JSON
```

### 符号速查表

| UML 符号 | geo / shape | fill | dash | 说明 |
|---|---|---|---|---|
| 实体 | `rectangle` | 默认 | `solid` | 强实体矩形，text 写实体名，w=200 h=60 |
| 关系 | `diamond` | 默认 | `solid` | text 写动词短语，w=140 h=60 |
| 属性 | `ellipse` | 默认 | `solid` | text 写属性名，w=200 h=60 |
| 主键属性 | `ellipse` | 默认 | `solid` | text 前加 🔑 emoji |
| 连接线 | `create-arrow` | — | `solid` | `arrowheadEnd="none"` + `arrowheadStart="none"` |
| 多值属性（降级） | `ellipse` | 默认 | `dashed` | tldraw 无双椭圆，用 `dash="dashed"` 表示 |

---

## 5. 时序图（Sequence Diagram）

> 方向：LR（left-to-right，消息水平流动），TB（生命线垂直延伸）

### 完整例子

```bash
# 时序图模板：微服务电商结账流程
# 方向: 参与者 LR 排列，消息 LR 水平箭头
# Pattern: Swimlane 变体 | 参与者中心距: 280（w=200 放得下 12 字符英文名如 Notification）
# 生命线：细长竖向 rectangle (w=10, dash=dotted)（视觉特例，非 grid=20 整数倍）
# 激活条：窄竖向 rectangle (w=16)（同上，视觉特例）
# 请求消息：dash=solid；响应/异步消息：dash=dashed
# 同步调用：arrowheadEnd="arrow"；异步通知：arrowheadEnd="arrow" dash="dashed"

CANVAS_ID="<canvas-id>"

# Step 1: 参与者标题栏（7 个参与者，w=200，中心间距 280）
# 参与者 y=20（由验证画布实测）
# 中心 x: 100/380/660/940/1220/1500/1780
# 标题栏 x = 中心-100: 0/280/560/840/1120/1400/1680
# 生命线 x = 中心-5（w=10）: 95/375/655/935/1215/1495/1775
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":20,"w":200,"h":40,"text":"Client"},
  {"kind":"create-geo-shape","geo":"rectangle","x":280,"y":20,"w":200,"h":40,"text":"API Gateway"},
  {"kind":"create-geo-shape","geo":"rectangle","x":560,"y":20,"w":200,"h":40,"text":"Auth"},
  {"kind":"create-geo-shape","geo":"rectangle","x":840,"y":20,"w":200,"h":40,"text":"Order"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1120,"y":20,"w":200,"h":40,"text":"Payment"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1400,"y":20,"w":200,"h":40,"text":"Inventory"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1680,"y":20,"w":200,"h":40,"text":"Notification"},
  {"kind":"create-geo-shape","geo":"rectangle","x":95,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":375,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":655,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":935,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1215,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1495,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1775,"y":80,"w":10,"h":720,"text":"","dash":"dotted"},
  {"kind":"create-geo-shape","geo":"rectangle","x":92,"y":140,"w":16,"h":80,"text":""},
  {"kind":"create-geo-shape","geo":"rectangle","x":372,"y":160,"w":16,"h":100,"text":""},
  {"kind":"create-geo-shape","geo":"rectangle","x":652,"y":180,"w":16,"h":60,"text":""},
  {"kind":"create-geo-shape","geo":"rectangle","x":932,"y":260,"w":16,"h":120,"text":""},
  {"kind":"create-geo-shape","geo":"rectangle","x":1212,"y":340,"w":16,"h":80,"text":""},
  {"kind":"create-geo-shape","geo":"rectangle","x":1492,"y":360,"w":16,"h":60,"text":""}
]}
JSON
)

# Step 2: 消息箭头（同步请求 solid，响应/异步 dashed）
# 消息 1: Client → API Gateway：POST /checkout（同步）
# 消息 2: API Gateway → Auth：验证 token（同步）
# 消息 3: Auth → API Gateway：200 OK（同步响应）
# 消息 4: API Gateway → Order：创建订单（同步）
# 消息 5: Order → Inventory：锁定库存（同步）
# 消息 6: Inventory → Order：库存已锁（同步响应）
# 消息 7: Order → Payment：发起支付（同步）
# 消息 8: Payment → Order：支付成功（同步响应）
# 消息 9: Order → API Gateway：订单确认（同步响应）
# 消息 10: API Gateway → Client：201 Created（同步响应）
# 消息 11: Order → Notification：发送通知（异步）
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-arrow","startX":105,"startY":160,"endX":375,"endY":160,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid",
   "text":"POST /checkout"},
  {"kind":"create-arrow","startX":385,"startY":180,"endX":655,"endY":180,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid",
   "text":"验证 token"},
  {"kind":"create-arrow","startX":655,"startY":220,"endX":385,"endY":220,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"200 OK"},
  {"kind":"create-arrow","startX":385,"startY":260,"endX":935,"endY":260,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid",
   "text":"创建订单"},
  {"kind":"create-arrow","startX":945,"startY":300,"endX":1495,"endY":300,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid",
   "text":"锁定库存"},
  {"kind":"create-arrow","startX":1495,"startY":340,"endX":945,"endY":340,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"库存已锁"},
  {"kind":"create-arrow","startX":945,"startY":380,"endX":1215,"endY":380,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid",
   "text":"发起支付 $99.00"},
  {"kind":"create-arrow","startX":1215,"startY":420,"endX":945,"endY":420,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"支付成功 txn#123"},
  {"kind":"create-arrow","startX":935,"startY":460,"endX":385,"endY":460,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"订单确认 #ORD-001"},
  {"kind":"create-arrow","startX":375,"startY":500,"endX":105,"endY":500,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"201 Created"},
  {"kind":"create-arrow","startX":945,"startY":540,"endX":1775,"endY":540,
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed",
   "text":"发送确认邮件（异步）"}
]}
JSON

# Step 3: 标题
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-text","x":700,"y":-60,"text":"电商结账时序图","font":"sans","size":"xl"}
]}
JSON
```

### 符号速查表

| UML 符号 | geo / shape | w × h | dash | 说明 |
|---|---|---|---|---|
| 参与者标题栏 | `rectangle` | 200×40 | `solid` | 顶部水平排列，y=20，中心间距 280（w=200 可放下 12 字符英文名如"Notification"） |
| 生命线 | `rectangle` | 10×720 | `dotted` | 从标题栏底部向下延伸，x 对齐标题栏中心（视觉特例，w=10 非 grid 整数倍） |
| 激活条 | `rectangle` | 16×(h 按激活时长) | `solid` | 叠在生命线上（视觉特例，w=16 非 grid 整数倍） |
| 同步请求消息 | `create-arrow` | — | `solid` | `arrowheadEnd="arrow"` + `text` 写消息名 |
| 同步响应消息 | `create-arrow` | — | `dashed` | `arrowheadEnd="arrow"` + `text`（不加 grey，不触发规则 6） |
| 异步消息 | `create-arrow` | — | `dashed` | `arrowheadEnd="arrow"` + `text`，通常注明"（异步）" |
| 自调用消息 | `create-arrow` | — | `solid` | 起止绑同一生命线，tldraw 会自动弯曲 |

---

## 6. 类图（Class Diagram）

> 方向：LR（left-to-right）

### 三栏坐标规则

每个类由 3 个堆叠的 rectangle 组成：

| 栏 | x | y | w | h |
|---|---|---|---|---|
| 类名 | cx | cy | 220 | 40 |
| 属性 | cx | cy + 40 | 220 | ceil(行数×28+12 → 取 20 整数倍)，最小 40 |
| 方法 | cx | cy + 40 + H2 | 220 | ceil(行数×28+12 → 取 20 整数倍)，最小 40 |

**h 值计算规则**：tldraw 多行文本每行高约 28px，加 12px 上下 padding，向上取最近 20 整数倍。
例：3 行 → 3×28+12=96 → 取 100；4 行 → 4×28+12=124 → 取 140。

类整体高度 = 40 + H2 + H3。两类水平间距 ≥ 140。

### 完整例子

```bash
# 类图模板：动物继承体系 + 关联类
# 方向: LR (left-to-right)
# Pattern: Tree（父类居右，子类居左） | 水平间距 GAP_X=160
# 类图豁免：dashed 箭头（实现/依赖）是 UML 语义标记，不触发 layout-principles.md 规则 6
# arrowheadEnd="triangle" 限制：tldraw 渲染为实心三角，不是 UML 标准空心三角，
#   视觉上与"继承"语义有出入；若需严格 UML，改用 arrowheadEnd="arrow" 并在注释中说明

CANVAS_ID="<canvas-id>"

# 布局（由验证画布实测，坐标均取最近 20 整数倍）：
#   Animal(父类)      cx=700, cy=60  → W=220, H1=40, H2=140(4行), H3=140(4行)；底部 y=420
#   Dog(子类)         cx=200, cy=60  → W=220, H1=40, H2=100(3行), H3=100(3行)
#   Cat(子类)         cx=1140,cy=60  → W=220, H1=40, H2=100(3行), H3=100(3行)
#   Order(关联类)     cx=700, cy=660 → W=220, H1=40, H2=140(4行), H3=100(3行)
#   Animal 底部 y = 60+40+140+140 = 380→实测 460；Order 顶部 y=660（间距 200）

# Step 1: 创建四个类的三栏 rectangle
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":60,"w":220,"h":40,"text":"Animal"},
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":120,"w":220,"h":140,
   "text":"- name: string\n- age: int\n- weight: float\n- species: string"},
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":280,"w":220,"h":140,
   "text":"+ speak(): void\n+ move(): void\n+ eat(food): void\n+ sleep(): void"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":60,"w":220,"h":40,"text":"Dog"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":120,"w":220,"h":100,
   "text":"- breed: string\n- isVaccinated: bool\n- ownerId: string"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":300,"w":220,"h":100,
   "text":"+ bark(): void\n+ fetch(item): void\n+ guard(): void"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1140,"y":60,"w":220,"h":40,"text":"Cat"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1140,"y":120,"w":220,"h":100,
   "text":"- indoor: bool\n- furColor: string\n- clawLength: int"},
  {"kind":"create-geo-shape","geo":"rectangle","x":1140,"y":300,"w":220,"h":100,
   "text":"+ purr(): void\n+ climb(): void\n+ hunt(): void"},
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":660,"w":220,"h":40,"text":"Order"},
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":720,"w":220,"h":140,
   "text":"- orderId: string\n- amount: float\n- status: string\n- createdAt: Date"},
  {"kind":"create-geo-shape","geo":"rectangle","x":700,"y":940,"w":220,"h":100,
   "text":"+ place(): void\n+ cancel(): void\n+ getItems(): Item[]"}
]}
JSON
)

export RESULT
ANIMAL_ID=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
DOG_ID=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
CAT_ID=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
ORDER_ID=$(node -p "JSON.parse(process.env.RESULT).results[9].shapeId")

# Step 2: 关系箭头
# Dog → Animal 继承（子→父，solid + triangle）：Dog 右端 x=420 → Animal 左端 x=700，y=80 类名栏中心
# Cat → Animal 继承（子→父，solid + triangle）：Cat 左端 x=1140 → Animal 右端 x=920，y=80
# Animal → Order 关联（solid + arrow）：Animal 底实测 y=460，Order 顶 y=660，中心 x=820
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":420,"startY":80,"endX":700,"endY":80,
   "startBindingShapeId":"$DOG_ID","endBindingShapeId":"$ANIMAL_ID",
   "arrowheadEnd":"triangle","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":1140,"startY":80,"endX":920,"endY":80,
   "startBindingShapeId":"$CAT_ID","endBindingShapeId":"$ANIMAL_ID",
   "arrowheadEnd":"triangle","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":820,"startY":460,"endX":820,"endY":660,
   "startBindingShapeId":"$ANIMAL_ID","endBindingShapeId":"$ORDER_ID",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"places"}
]}
JSON

# Step 3: 标题
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-text","x":400,"y":-40,"text":"动物继承体系类图","font":"sans","size":"xl"}
]}
JSON
```

### 关系速查表

| UML 关系 | arrowheadEnd | arrowheadStart | dash | 说明 |
|---|---|---|---|---|
| 继承（Generalization） | `triangle` | `none` | `solid` | tldraw 渲染为实心三角（非标准空心三角），语义正确但视觉与 UML 规范有出入 |
| 实现（Realization） | `triangle` | `none` | `dashed` | 同上限制 + 虚线 |
| 聚合（Aggregation） | `diamond` | `none` | `solid` | 空心菱形 |
| 组合（Composition） | `diamond` | `none` | `solid` | 实心菱形，fill="solid" |
| 关联（Association） | `arrow` | `none` | `solid` | 普通箭头，text 写角色名/多重性 |
| 依赖（Dependency） | `arrow` | `none` | `dashed` | 虚线箭头，«use» |

> **arrowheadEnd="triangle" 限制**：tldraw 当前渲染为实心三角，不是 UML 标准空心三角。若需严格 UML 继承符号，可改用 `arrowheadEnd="arrow"` 并在图旁加文字注释说明语义。
>
> **类图豁免**：layout-principles.md 规则 6 要求 dashed 配 grey，但类图的 dashed 箭头（实现/依赖）是 UML 语义标记，直接忽略规则 6，参见 layout-principles.md 豁免说明。

---

## 7. 架构图（Architecture Diagram）

> 方向：LR（left-to-right）

### 完整例子

```bash
# 架构图模板：C4 Container 级微服务架构
# 方向: LR (left-to-right)
# Pattern: Layered（分区） + Fan-out（服务扩散）
# 分区：前端区 / 后端服务区 / 数据层区（各用大矩形 fill="semi" 作边界）
# 颜色编码：前端 orange / 后端 blue / 存储 green / 外部 grey
# 节点尺寸：w≥220（英文长名防换行）h=60

CANVAS_ID="<canvas-id>"

# Step 1: 分区背景（3 个大矩形作 frame 替代）
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":280,"h":600,
   "text":"前端层","fill":"semi","color":"orange"},
  {"kind":"create-geo-shape","geo":"rectangle","x":320,"y":0,"w":580,"h":600,
   "text":"后端服务层","fill":"semi","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":940,"y":0,"w":320,"h":600,
   "text":"数据层","fill":"semi","color":"green"}
]}
JSON

# Step 2: 服务节点（12 节点）
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":40,"y":120,"w":220,"h":60,
   "text":"Web Browser","color":"orange"},
  {"kind":"create-geo-shape","geo":"rectangle","x":40,"y":240,"w":220,"h":60,
   "text":"Mobile App","color":"orange"},
  {"kind":"create-geo-shape","geo":"rectangle","x":40,"y":360,"w":220,"h":60,
   "text":"Desktop App","color":"orange"},
  {"kind":"create-geo-shape","geo":"rectangle","x":360,"y":80,"w":220,"h":60,
   "text":"API Gateway","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":640,"y":120,"w":220,"h":60,
   "text":"Auth Service","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":640,"y":220,"w":220,"h":60,
   "text":"Order Service","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":640,"y":320,"w":220,"h":60,
   "text":"Payment Service","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":640,"y":420,"w":220,"h":60,
   "text":"Notification Svc","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":640,"y":520,"w":220,"h":60,
   "text":"Inventory Service","color":"blue"},
  {"kind":"create-geo-shape","geo":"rectangle","x":980,"y":120,"w":220,"h":60,
   "text":"PostgreSQL","color":"green"},
  {"kind":"create-geo-shape","geo":"rectangle","x":980,"y":260,"w":220,"h":60,
   "text":"Redis Cache","color":"green"},
  {"kind":"create-geo-shape","geo":"rectangle","x":980,"y":400,"w":220,"h":60,
   "text":"Message Queue","color":"green"}
]}
JSON
)

export RESULT
WEB=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
MOB=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
DESK=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
GW=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
AUTH=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
ORDER=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
PAY=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
NOTIF=$(node -p "JSON.parse(process.env.RESULT).results[7].shapeId")
INV=$(node -p "JSON.parse(process.env.RESULT).results[8].shapeId")
PG=$(node -p "JSON.parse(process.env.RESULT).results[9].shapeId")
REDIS=$(node -p "JSON.parse(process.env.RESULT).results[10].shapeId")
MQ=$(node -p "JSON.parse(process.env.RESULT).results[11].shapeId")

# Step 3: 连线（前端→网关，网关→各服务，服务→数据层）
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":260,"startY":150,"endX":360,"endY":110,
   "startBindingShapeId":"$WEB","endBindingShapeId":"$GW",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"REST"},
  {"kind":"create-arrow","startX":260,"startY":270,"endX":360,"endY":110,
   "startBindingShapeId":"$MOB","endBindingShapeId":"$GW",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"REST"},
  {"kind":"create-arrow","startX":260,"startY":390,"endX":360,"endY":110,
   "startBindingShapeId":"$DESK","endBindingShapeId":"$GW",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"REST"},
  {"kind":"create-arrow","startX":580,"startY":110,"endX":640,"endY":150,
   "startBindingShapeId":"$GW","endBindingShapeId":"$AUTH",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"gRPC"},
  {"kind":"create-arrow","startX":580,"startY":110,"endX":640,"endY":250,
   "startBindingShapeId":"$GW","endBindingShapeId":"$ORDER",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"REST"},
  {"kind":"create-arrow","startX":580,"startY":110,"endX":640,"endY":350,
   "startBindingShapeId":"$GW","endBindingShapeId":"$PAY",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"REST"},
  {"kind":"create-arrow","startX":860,"startY":250,"endX":980,"endY":150,
   "startBindingShapeId":"$ORDER","endBindingShapeId":"$PG",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"SQL"},
  {"kind":"create-arrow","startX":860,"startY":150,"endX":980,"endY":290,
   "startBindingShapeId":"$AUTH","endBindingShapeId":"$REDIS",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"Redis"},
  {"kind":"create-arrow","startX":860,"startY":450,"endX":980,"endY":430,
   "startBindingShapeId":"$NOTIF","endBindingShapeId":"$MQ",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"Kafka"},
  {"kind":"create-arrow","startX":860,"startY":550,"endX":980,"endY":430,
   "startBindingShapeId":"$INV","endBindingShapeId":"$MQ",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"Kafka"}
]}
JSON

# Step 4: 标题
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-text","x":400,"y":-60,"text":"C4 Container — 微服务架构","font":"sans","size":"xl"}
]}
JSON
```

### 符号速查表

| 符号 | geo / shape | fill | color | dash | 说明 |
|---|---|---|---|---|---|
| 分区背景 | `rectangle` | `semi` | 按层色 | `solid` | 大矩形作分区边界，text 写层名 |
| 前端节点 | `rectangle` | 默认 | `orange` | `solid` | w≥220 h=60 |
| 后端节点 | `rectangle` | 默认 | `blue` | `solid` | w≥220 h=60 |
| 存储节点 | `rectangle` | 默认 | `green` | `solid` | w≥220 h=60 |
| 外部系统 | `rectangle` | 默认 | `grey` | `solid` | w≥220 h=60 |
| 调用箭头 | `create-arrow` | — | 默认 | `solid` | `arrowheadEnd="arrow"`，text 写协议（REST/gRPC/Kafka/SQL） |
| 异步/回调流 | `create-arrow` | — | `grey` | `dashed` | 同时设 color+dash，符合规则 6 |
| 标题 | `create-text` | — | 默认 | — | `font="sans"` `size="xl"`，置于图形上方 y=-60 |

---

## 8. 流程图（Flowchart）

> 方向：TB（top-to-bottom）

### 完整例子

```bash
# 流程图模板：用户注册 + 邮件验证流程
# 方向: TB (top-to-bottom)
# Pattern: Pipeline（TB） + Fan-out（判断分支）| GAP_Y=80
# 节点：矩形（步骤，w=200 h=60）+ 菱形（判断，w=200 h=100）
# 标题 y=-80 与第一节点 y=40 保持间距

CANVAS_ID="<canvas-id>"

# Step 1: 创建所有节点（11 节点：5 矩形 + 3 菱形 + 2 起终点椭圆 + 1 等待矩形）
# 主流程 x=200，异常/分支 x=500
RESULT=$(tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"ellipse","x":270,"y":40,"w":60,"h":60,
   "text":"","fill":"solid","color":"black"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":160,"w":200,"h":60,
   "text":"填写注册信息"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":300,"w":200,"h":100,
   "text":"格式校验通过?"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":480,"w":200,"h":60,
   "text":"发送验证邮件"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":620,"w":200,"h":100,
   "text":"用户已点击链接?"},
  {"kind":"create-geo-shape","geo":"diamond","x":200,"y":800,"w":200,"h":100,
   "text":"链接是否过期?"},
  {"kind":"create-geo-shape","geo":"rectangle","x":200,"y":980,"w":200,"h":60,
   "text":"激活账户"},
  {"kind":"create-geo-shape","geo":"ellipse","x":270,"y":1120,"w":60,"h":60,
   "text":"","fill":"solid","color":"black"},
  {"kind":"create-geo-shape","geo":"rectangle","x":500,"y":340,"w":200,"h":60,
   "text":"提示格式错误"},
  {"kind":"create-geo-shape","geo":"rectangle","x":500,"y":660,"w":200,"h":60,
   "text":"等待中（倒计时）"},
  {"kind":"create-geo-shape","geo":"rectangle","x":500,"y":840,"w":200,"h":60,
   "text":"重发验证邮件"}
]}
JSON
)

export RESULT
START=$(node -p "JSON.parse(process.env.RESULT).results[0].shapeId")
FILL=$(node -p "JSON.parse(process.env.RESULT).results[1].shapeId")
CHECK_FMT=$(node -p "JSON.parse(process.env.RESULT).results[2].shapeId")
SEND_EMAIL=$(node -p "JSON.parse(process.env.RESULT).results[3].shapeId")
CHECK_CLICK=$(node -p "JSON.parse(process.env.RESULT).results[4].shapeId")
CHECK_EXPIRE=$(node -p "JSON.parse(process.env.RESULT).results[5].shapeId")
ACTIVATE=$(node -p "JSON.parse(process.env.RESULT).results[6].shapeId")
END=$(node -p "JSON.parse(process.env.RESULT).results[7].shapeId")
FMT_ERR=$(node -p "JSON.parse(process.env.RESULT).results[8].shapeId")
WAIT=$(node -p "JSON.parse(process.env.RESULT).results[9].shapeId")
RESEND=$(node -p "JSON.parse(process.env.RESULT).results[10].shapeId")

# Step 2: 连接箭头
tldraw-cli command apply --canvas "$CANVAS_ID" <<JSON
{"commands":[
  {"kind":"create-arrow","startX":300,"startY":100,"endX":300,"endY":160,
   "startBindingShapeId":"$START","endBindingShapeId":"$FILL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":300,"startY":220,"endX":300,"endY":300,
   "startBindingShapeId":"$FILL","endBindingShapeId":"$CHECK_FMT",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":300,"startY":400,"endX":300,"endY":480,
   "startBindingShapeId":"$CHECK_FMT","endBindingShapeId":"$SEND_EMAIL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"通过"},
  {"kind":"create-arrow","startX":400,"startY":350,"endX":500,"endY":370,
   "startBindingShapeId":"$CHECK_FMT","endBindingShapeId":"$FMT_ERR",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"不通过"},
  {"kind":"create-arrow","startX":300,"startY":540,"endX":300,"endY":620,
   "startBindingShapeId":"$SEND_EMAIL","endBindingShapeId":"$CHECK_CLICK",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":400,"startY":670,"endX":500,"endY":690,
   "startBindingShapeId":"$CHECK_CLICK","endBindingShapeId":"$WAIT",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"未点击"},
  {"kind":"create-arrow","startX":300,"startY":720,"endX":300,"endY":800,
   "startBindingShapeId":"$CHECK_CLICK","endBindingShapeId":"$CHECK_EXPIRE",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"已点击"},
  {"kind":"create-arrow","startX":400,"startY":850,"endX":500,"endY":870,
   "startBindingShapeId":"$CHECK_EXPIRE","endBindingShapeId":"$RESEND",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"已过期"},
  {"kind":"create-arrow","startX":300,"startY":900,"endX":300,"endY":980,
   "startBindingShapeId":"$CHECK_EXPIRE","endBindingShapeId":"$ACTIVATE",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid","text":"未过期"},
  {"kind":"create-arrow","startX":300,"startY":1040,"endX":300,"endY":1120,
   "startBindingShapeId":"$ACTIVATE","endBindingShapeId":"$END",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"solid"},
  {"kind":"create-arrow","startX":500,"startY":370,"endX":400,"endY":220,
   "startBindingShapeId":"$FMT_ERR","endBindingShapeId":"$FILL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed","color":"grey","text":"重新填写"},
  {"kind":"create-arrow","startX":600,"startY":880,"endX":400,"endY":510,
   "startBindingShapeId":"$RESEND","endBindingShapeId":"$SEND_EMAIL",
   "arrowheadEnd":"arrow","arrowheadStart":"none","dash":"dashed","color":"grey","text":"重发"}
]}
JSON

# Step 3: 标题
tldraw-cli command apply --canvas "$CANVAS_ID" <<'JSON'
{"commands":[
  {"kind":"create-text","x":160,"y":-80,"text":"用户注册验证流程","font":"sans","size":"xl"}
]}
JSON
```

### 符号速查表

| 符号 | geo / shape | fill | color | dash | 说明 |
|---|---|---|---|---|---|
| 起始/终止节点 | `ellipse` | `solid` | `black` | `solid` | w=h=60，实心黑圆 |
| 步骤节点 | `rectangle` | 默认 | 默认 | `solid` | w=200 h=60，中文操作名（w≥160 防中文换行） |
| 判断节点 | `diamond` | 默认 | 默认 | `solid` | w=200 h=100，text 写条件，加"?" |
| 正向控制流 | `create-arrow` | — | 默认 | `solid` | `arrowheadEnd="arrow"`，text 写分支标签（通过/否） |
| 反向/异常流 | `create-arrow` | — | `grey` | `dashed` | 同时设 color+dash，符合规则 6 |
| 标题 | `create-text` | — | 默认 | — | `font="sans"` `size="xl"`，置于图形上方 y=-80 |

---

## Demo Canvas 索引

| 图类型 | canvas id | title |
|---|---|---|
| 活动图 | `page:6faP1h1KveblEOKw6xloV` | recipe-01-activity |
| 状态图 | `page:dRnp_yK0L01_8-Y1MuoKD` | recipe-02-state |
| 用例图 | `page:cp_vGhqgLubLgd8TqKGzf` | recipe-03-usecase |
| ER 图 | `page:iaTkbpWbfZd79qPAEJhsg` | recipe-04-er |
| 时序图 | `page:L8Fg3i4nRSLbndvxTeaVD` | recipe-05-sequence |
| 类图 | `page:IX8BTxEc4vWkcwQvLKABk` | recipe-06-class |

这些 canvas 保留不删，供 C6 端到端验证复用。
