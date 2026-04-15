---
"@doonce/tldraw-cli": minor
---

新增 `tldraw-cli layout-check` 命令，检测画布中的 grid 对齐、节点间距、反向流视觉（dashed+grey），输出带 `suggested` 字段的可修正建议列表；违规时退出码 1，无违规退出码 0。

`create-arrow` / `update-shape` 新增对 arrow 的 `fill` 字段支持，可表达 UML 类图中实心/空心菱形头（聚合/组合），使用 `arrowheadEnd: "diamond"` 配合 `fill: "solid"` 或 `fill: "none"` 即可。
