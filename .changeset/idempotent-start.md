---
"@doonce/tldraw-cli": minor
---

`tldraw-cli start` 改为幂等语义：重复调用不再报错退出，而是复用既有 Host。跟 `stop` 的"不存在不报错"语义对称，LLM/脚本可以无脑 `start` 而不用先 `status` 判断。

行为变化：

- session 存在且 pid 活着 → 输出 `{state: "already-running", hostPid, httpPort, wsPort, frontendUrl, dev}`，exit 0（原先是 stderr 文本 + exit 1）
- 无 session 但默认端口已被 Host 占用（手动启动的外部 Host） → 输出 `state: "already-running"` + `note` 说明来源，exit 0
- 显式 `--port N` 与现有 Host 端口不一致 → 输出 `{state: "error", message, hostPid, httpPort}`，exit 1（提示先 stop）
- stderr 不再输出 `Host already running (pid X)` 文本提示

所有输出统一为 JSON，便于 parse。详见 `skill/tldraw-cli/references/command-details.md` 的 `tldraw-cli start` 段。
