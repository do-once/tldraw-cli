# Shape 字段与枚举全集

想查 `update-shape` 哪些字段可用、`fill`/`dash` 枚举值、`arrowheadStart`/`End` 默认值——翻这里，不要去 SKILL.md 里猜。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [RPC 方法](rpc-methods.md) · [错误码](error-codes.md) · [会话与环境](session-management.md)

---

## canvas snapshot 返回的 shape 结构

所有 shape 字段**全部在顶层**，没有 `props` 嵌套层——读 geo 文字直接 `shape.text`，不是 `shape.props.text`。

**公共字段**（每种 kind 都有）：`shapeId`（不是 `id`）、`x`、`y`、`rotation`、`parentId?`（嵌套在 frame 内时存在）

| kind | 专有字段 |
|------|----------|
| `geo` | `w`, `h`, `geo`, `text`, `color`, `fill`, `labelColor` |
| `text` | `w`, `text`, `color`, `font`, `size`, `textAlign` |
| `arrow` | `start{x,y}`, `end{x,y}`, `startBinding{shapeId}`, `endBinding{shapeId}`, `text`, `color`, `fill`, `arrowheadStart`, `arrowheadEnd`, `dash`, `bend` |
| `note` | `text`, `color` |
| `frame` | `w`, `h`, `name` |
| `unknown` | `type`, `w?`, `h?` |

`arrow` 的 `startBinding`/`endBinding` 仅在端点绑定到某个图形时存在。绑定后 tldraw 会把端点自动吸附到图形边缘，坐标不再由命令控制。

---

## 枚举全集

枚举表（arrowhead / dash / fill / color / size / geo 等）见 [generated/enum-tables.md](generated/enum-tables.md)

---

## update-shape 支持的字段（按 kind 分组）

`update-shape` 只需传 `shapeId` + 想改的字段，不传的字段保持不变。传了该 kind 不支持的字段会被静默忽略，不报错。

| kind | 可更新的字段 |
|------|-------------|
| 通用（所有 kind） | `x`, `y`, `rotation`, `w`, `h`, `text`, `color` |
| `geo` 额外支持 | `fill`, `labelColor`, `geo` |
| `text` 额外支持 | `font`, `size`, `textAlign` |
| `arrow` 额外支持 | `arrowheadStart`, `arrowheadEnd`, `dash`, `bend`, `fill` |
| `note` 额外支持 | （无，`color`/`text` 已在通用字段） |
| `frame` 额外支持 | `name` |

`bend` 是数值，约 -1..1，控制箭头弧度，0 为直线。

---

## canvas diff entry kind 说明

来源：`canvas diff` 返回的 `entries` 数组，每项的 `kind` 字段。

| kind | 字段 | 说明 |
|------|------|------|
| `shape-created` | `revision`, `shape`（完整 shape 对象） | 新图形被添加 |
| `shape-updated` | `revision`, `shapeId`, `changes`（变更字段 map） | 已有图形属性改变 |
| `shape-deleted` | `revision`, `shapeId` | 图形被删除 |
