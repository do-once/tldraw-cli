# @doonce/tldraw-cli

## 0.1.0

### Minor Changes

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 新增 canvas.getSelection RPC 方法 + CLI canvas get-selection 子命令

  支持读取用户在浏览器中当前框选的 shapeId 集合，用于"LLM 画粗版 → 用户框选局部 → LLM 只改选中"迭代工作流（Observe-Select-Act）。

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 新增 canvas.screenshot RPC 方法 + CLI canvas screenshot 子命令

  支持将当前画布导出为 PNG，写入临时文件，返回文件路径。LLM 用 Read 工具读取 imagePath 即可直接看到渲染结果，用于 Plan→Draw→Verify 工作流中的 Verify 步骤。

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - `tldraw-cli start` 改为幂等语义：重复调用不再报错退出，而是复用既有 Host。跟 `stop` 的"不存在不报错"语义对称，LLM/脚本可以无脑 `start` 而不用先 `status` 判断。

  行为变化：

  - session 存在且 pid 活着 → 输出 `{state: "already-running", hostPid, httpPort, wsPort, frontendUrl, dev}`，exit 0（原先是 stderr 文本 + exit 1）
  - 无 session 但默认端口已被 Host 占用（手动启动的外部 Host） → 输出 `state: "already-running"` + `note` 说明来源，exit 0
  - 显式 `--port N` 与现有 Host 端口不一致 → 输出 `{state: "error", message, hostPid, httpPort}`，exit 1（提示先 stop）
  - stderr 不再输出 `Host already running (pid X)` 文本提示

  所有输出统一为 JSON，便于 parse。详见 `skill/tldraw-cli/references/command-details.md` 的 `tldraw-cli start` 段。

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 新增 `tldraw-cli layout-check` 命令，检测画布中的 grid 对齐、节点间距、反向流视觉（dashed+grey），输出带 `suggested` 字段的可修正建议列表；违规时退出码 1，无违规退出码 0。

  `create-arrow` / `update-shape` 新增对 arrow 的 `fill` 字段支持，可表达 UML 类图中实心/空心菱形头（聚合/组合），使用 `arrowheadEnd: "diamond"` 配合 `fill: "solid"` 或 `fill: "none"` 即可。

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 修复多个文档/产品偏差，由竞争假说审查发现：

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
  - `SKILL.md` 行为规则 [#1](https://github.com/do-once/tldraw-cli/issues/1) 改写：原文"不要手动打开浏览器"受众错位（LLM 没"手动"动作），现改为针对 LLM 的"start 之后不要再起额外 Runtime"

### Patch Changes

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 初始化项目

- [`6378d43`](https://github.com/do-once/tldraw-cli/commit/6378d430ab87861cd7fa8781905f6641c763f901) Thanks [@BryanAdamss](https://github.com/BryanAdamss)! - 完善首版本功能
