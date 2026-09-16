# Pencil Sources

此目录保存 AI Mind 可由 Pencil MCP 读取的 canonical `.pen` 设计原稿。

v0.6.0 General ReAct Agent 的 canonical 文件为 `agent-ui.pen`。实施 UI 前必须通过 Pencil MCP 读取该文件的节点、组件、状态和布局；`design/exports/` 下的 PNG 仅用于评审与代码 Review，不是开发事实源。画布只定义 AI 回复中的 General ReAct Trace；用户消息气泡只是页面上下文，实际实现继续沿用现有 `UserMessage` presentation。正常完成后的 public-safe Trace 与最终回答复用现有浏览器 IndexedDB 会话快照恢复；取消标题固定为“已停止思考”，取消/失败/部分回答不提交稳定快照。
