---
"@doonce/tldraw-cli": minor
---

修复多个文档/产品偏差，由竞争假说审查发现：

**产品 fix：text 字段支持多行**

`create-geo-shape` / `create-text` / `create-arrow` / `create-note` / `update-shape` 的 `text` 字段中的 `\n` 之前会被静默丢弃（tldraw 自带 `toRichText` 不拆 `\n`，加上 extractor 用空串 join 多 paragraph）。现改为：

- 写入侧：按 `\n` 拆分成多 paragraph 的 ProseMirror 结构
- 读出侧：`canvas snapshot` / `canvas diff` 在 paragraph 之间用 `\n` join，与写入对称

LLM 现在可以写多行便签和带换行的标题。

**update-shape 字段补齐**

`UpdateShapeCommandSchema` 之前缺 `labelColor` / `font` / `size` / `textAlign` 四个字段（文档已声称支持但 schema 拒绝）。现已补齐 schema 并由 executor 透传到 tldraw。

**文档校正**

- `FillEnum` 实际有 5 个值（`none`/`semi`/`solid`/`fill`/`pattern`），文档之前漏了 `fill`，现已补
- `command-details.md` 的 snapshot 示例里 `textAlign` 默认从 `"middle"` 改为正确的 `"start"`
- `SKILL.md` 的"对比方案" Example 之前 `canvas create` 后未带 `--canvas` 导致 apply 落到默认画布，现改用 `--canvas $A` / `--canvas $B` 显式指定
- `SKILL.md` 行为规则 #1 改写：原文"不要手动打开浏览器"受众错位（LLM 没"手动"动作），现改为针对 LLM 的"start 之后不要再起额外 Runtime"
