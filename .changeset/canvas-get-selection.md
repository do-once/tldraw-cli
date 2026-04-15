---
"@doonce/tldraw-cli": minor
---

新增 canvas.getSelection RPC 方法 + CLI canvas get-selection 子命令

支持读取用户在浏览器中当前框选的 shapeId 集合，用于"LLM 画粗版 → 用户框选局部 → LLM 只改选中"迭代工作流（Observe-Select-Act）。
