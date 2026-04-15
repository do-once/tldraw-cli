---
"@doonce/tldraw-cli": minor
---

新增 canvas.screenshot RPC 方法 + CLI canvas screenshot 子命令

支持将当前画布导出为 PNG，写入临时文件，返回文件路径。LLM 用 Read 工具读取 imagePath 即可直接看到渲染结果，用于 Plan→Draw→Verify 工作流中的 Verify 步骤。
