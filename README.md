# @doonce/tldraw-cli

通过 CLI 和 HTTP JSON-RPC 操作浏览器中的 [tldraw](https://github.com/tldraw/tldraw) 画布——创建图形、读取状态、跟踪变更。支持 Code Agent 通过 skill 自主驱动画布，也支持脚本和 SDK 通过 RPC 直接调用。人和 AI 共用同一块画布，互相可见。

## 快速开始

### 1. 安装

```bash
npm install -g @doonce/tldraw-cli
```

### 2. 一键启动

```bash
tldraw-cli start     # 启动 Host + 打开浏览器
```

启动后浏览器自动打开 `http://localhost:8787/`。或不全局安装，直接用 `npx @doonce/tldraw-cli start`。

## Skill

tldraw-cli 提供 [skill 文件](skill/tldraw-cli/SKILL.md)，安装后 LLM 能自主驱动画布，无需人工逐条指导。

### 安装 Skill

```bash
# Claude Code（安装到当前项目）
tldraw-cli install --skills claude

# 其他 agent 框架
tldraw-cli install --skills agents

# 安装到用户级（所有项目可用）
tldraw-cli install --skills claude --global
```

安装后 agent 在对应项目中即可调用 tldraw-cli skill。

### 使用场景：人机共画迭代架构图

你在设计一个微服务架构，想用 tldraw 画布和 LLM 协作迭代：

1. **启动画布**：告诉 Claude "启动 tldraw，帮我画一个包含用户服务、订单服务、网关的架构图"
2. **LLM 绘制初稿**：Claude 通过 skill 调用 `command apply`，在画布上创建矩形（服务）和箭头（调用关系）
3. **你在浏览器上调整**：拖动模块位置、修改文字、添加注释
4. **LLM 感知你的修改**：Claude 调用 `canvas diff` 看到你的调整，理解你的意图
5. **继续迭代**："把消息队列加上，订单服务和库存服务之间用异步通信"
6. **循环往复**：每轮 LLM 读取最新画布状态，基于你的手动调整继续完善

整个过程中，画布是你和 LLM 的共享白板——你画的 LLM 能看到，LLM 画的你也能看到。

## CLI 常用命令

```bash
tldraw-cli start                             # 启动
tldraw-cli stop                              # 关闭
tldraw-cli status                            # 查看运行状态
tldraw-cli canvas list                       # 列出所有画布
tldraw-cli canvas create --title "草图"       # 新建画布
tldraw-cli canvas select --canvas <id>       # 切换画布
tldraw-cli canvas snapshot                   # 全量快照
tldraw-cli canvas diff --since <revision>    # 增量变更
tldraw-cli command apply                     # 批量写入（stdin 读 JSON）
tldraw-cli command undo                      # 撤销
tldraw-cli command redo                      # 重做
tldraw-cli install --skills claude            # 安装 skill（支持 claude / agents）
```

完整命令参数、输出格式、错误码见 [命令速查表](skill/tldraw-cli/references/command-reference.md)。

## 文档

- [架构](docs/00-architecture.md) — 三端分离、Host 分层、RPC 方法、并发一致性
- [本地开发](docs/01-development.md) — 开发/生产模式、调试流程、脚本、测试、构建
- [扩展能力](docs/02-extensibility.md) — HTTP JSON-RPC 直接调用、版本协商、适配器扩展（REST / SDK / MCP）
- [架构设计 spec](docs/superpowers/specs/2026-04-16-tldraw-cli-implementation-spec.md) — 详细架构设计文档

## 许可证

本项目是 tldraw SDK 的一部分，遵循 [tldraw SDK 许可证](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)。

tldraw SDK 可用于商业和非商业项目，前提是保留画布上的 "Made with tldraw" 水印。如需移除水印，可购买[商业许可证](https://tldraw.dev/pricing)。免费试用 key 可在 https://tldraw.dev/pricing 获取（100 天免费试用）。更多信息请访问 [tldraw.dev](https://tldraw.dev)。
