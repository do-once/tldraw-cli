# tldraw-cli — 项目约束

## 一、项目定位

本仓库的目标产品是 **tldraw-cli**（本地 CLI 工具），不是 starter 里的聊天式 agent。starter 代码保留作为**实现参考**（了解 tldraw editor API 的用法），不作为产品接口。

## 二、架构决策（不能从代码读出来的"为什么"）

- **三端分离**（CLI / Host / Runtime 各自独立进程）：让 CLI 可以是短 lived 子进程（LLM skill 每次 spawn 一个），Host 保持长连，Runtime 在浏览器里由用户直接操作。三者之间无共享内存，全靠 JSON-RPC 通信。
- **`session.start/stop` 不是 RPC 方法**：start 的时候 Host 还没启动，RPC 无处可发。它们是 CLI 本地命令（spawn 进程 / kill 进程 / 管 pid 文件）。只有 `session.status` 走 RPC。
- **`tldraw editor/store` 是唯一数据源**：Host 不持有画布状态副本。所有读写最终到 editor 里执行。revision / history entries 由 `TldrawRuntimeAdapter` 在 runtime 侧维护。
- **应用层只依赖 `RuntimeGateway` 抽象**：WebSocket 是当前实现，但 Host 内部不出现 WS 代码（封在 `WsRuntimeTransport` 里）。换传输不改应用层。
- **CLI 是 Host 的适配器，不是核心协议**：REST / SDK / MCP 将来也是适配器。核心是 7 个 RPC 方法。

## 三、RPC 方法扩展规则

- 两个 `resource`（`session` / `canvas`）+ `command` 为**闭集**。新增 resource 视为架构级改动，要先改 spec。
- 同一 resource 下新增 `verb` 视为小改，通过 capability 握手协商暴露。
- **禁止方法名内嵌版本**（不做 `canvas.snapshotV2`）。参数级不兼容用细粒度 capability flag 表达。

## 四、starter 代码边界

- `client/agent/`、`client/actions/`、`client/modes/`、`client/parts/`、`client/tools/`、`client/components/` —— starter 聊天 agent 前端。**不改写、不围绕它建新接口**。
- `worker/` —— starter Cloudflare Worker。**不在 CLI 产品边界内**。
- `shared/schema/`、`shared/format/` —— starter 的 action schema / shape 格式。可作为后续 `command.apply` 扩展命令类型和 `canvas.snapshot` shape 格式的参考来源。
- 新代码放新目录（`cli/`、`host/`、`client/runtime/`、`shared/rpc/`），不就地改写 starter 文件。唯一例外是 `client/App.tsx`（插入 `<RuntimeMount />`）。

## 五、并发与一致性假设

- 第一版假定**单 Host + 单 Runtime + 单 Writer**。
- `revision` 只在 runtime 生命周期内有效，重启归零。LLM 用 `canvas.snapshot` 重建基线。
- `command.apply` 的 `expectedRevision` 字段已预留但不检查（last-write-wins）。启用 CAS 需独立设计。
- `idempotencyKey` 字段已预留但不去重。

## 六、开发约定

- **spec 是锚点**：架构决策如果与 spec 冲突，先改 spec 再改代码，不让代码悄悄偏移。
- **CLI 变更必须同步 skill**：新增、修改、删除 CLI 命令（参数、输出格式、默认值、错误码）或 shape 字段时，必须同步更新 `skill/tldraw-cli/` 下的相关文件。LLM 完全依赖 skill 来使用 CLI，不同步会导致 LLM 调用失败。检查清单：
  - `SKILL.md` — 命令示例、shape reference、geo 枚举、update-shape 字段列表
  - `references/command-details.md` — 命令参数表、输出格式、边界情况
  - `references/shape-reference.md` — shape kind 字段、命令类型表、geo 枚举
  - `references/rpc-methods.md` — RPC 方法表、curl 示例
  - `references/error-codes.md` — 错误码表
  - `references/session-management.md` — 端口、会话文件、环境变量
- **changeset**：对用户有感的变更（新功能、bug 修复、breaking change）必须在提交前运行 `npx changeset`，选择版本类型并写变更描述。纯内部改动（文档、测试、CI、重构）不需要。忘记时 PR 上 changeset-bot 会提醒。
- **区分阶段**：提交信息写清改动属于"starter 复用 / 新架构实现 / legacy 剥离"哪一类。
- **npm 镜像**：内部 registry 缺少部分包（`@stricli/core`、`rolldown`），安装失败时用 `--registry https://registry.npmmirror.com/` 重试，不改 `.npmrc` 全局配置。
- 遵循 `~/.claude/CLAUDE.md` 全局规范（语言禁用清单、子代理委派、Git 中文提交、README 四要素）。

## 七、关键参考

- `docs/superpowers/specs/2026-04-16-tldraw-cli-implementation-spec.md` —— 架构 spec（首要依据）
- `docs/superpowers/plans/2026-04-16-tldraw-cli-implementation-plan.md` —— 实现 plan
