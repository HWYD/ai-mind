# Spec 020：Controlled Agent Graph Baseline

状态：Released Baseline
版本：v0.2.0
归档日期：2026-06-28

## 摘要

本目录不是重新规划 `v0.2.0`，而是把已经发布的 `Controlled Agent Graph` 版本沉淀为可复用 baseline。

`v0.2.0` 的核心不是扩张 Agent 权限，而是把既有受控 `/tasklist + @docs://versions/*.md` 主链路，从手写 runner 迁移到 LangGraph `StateGraph` 编排，同时引入更可观察的 graph event、graph route 和脱敏 debug summary。

## 适用范围

`v0.2.0` 的 graph runtime 只作用于：

```text
/tasklist + @docs://versions/*.md
```

它不改变普通聊天、`/summary`、Reader Skill、Utility Skill、Tool Calling、MCP 或其他未进入该入口的能力边界。

## 已发布用户行为

- `/tasklist` 仍然只能处理用户显式引用的 `@docs://versions/*.md` 版本方案。
- Agent 仍然不会自由扫目录、自由读源码、自由写文档或自由调用任意工具。
- 最终 tasklist 仍通过 artifact 面板输出，不直接把完整 tasklist 正文塞进普通 assistant 文本。
- 前端不会出现 “Legacy / Graph Runtime” 切换按钮。
- Graph runtime 启用后，用户可在 Trace 面板看到 node、route、patch summary 等执行过程信息。
- Graph debug view 只显示脱敏摘要，不显示完整 prompt、完整状态或原始资源正文。

## 已发布系统行为

- 引入 LangGraph `StateGraph` 作为 Tasklist Agent 的编排层。
- 生产入口在当时仍支持 `legacy` 与 `graph` 两条运行路径，由服务端 runtime config 在请求开始前选择。
- legacy runner 与 graph runner 复用同一套业务 step operations、guard 和 limits，不维护两套独立业务规则。
- `PlanningDecisionAction` 与 `WarningDisposition` 被映射为 graph conditional edge。
- GraphState 在 `v0.2.0` 仍是对既有 AgentState 的 graph 包装层，不是最终单事实源。
- 新增 graph stream chunks，用于输出 node start/end、route 和 state patch summary。
- `AgentTracePanel` 升级为可消费 graph timeline。
- memory checkpoint 仅作为开发态能力存在，不提供产品级 resume / replay。

## Runtime 配置基线

`v0.2.0` 发布时的关键配置边界：

- `AI_MIND_TASKLIST_AGENT_RUNTIME`：在请求开始前选择 `legacy` 或 `graph`。
- `AI_MIND_GRAPH_EVENTS`：控制是否输出 graph 事件。
- `AI_MIND_GRAPH_CHECKPOINT`：仅允许 `memory` 开发态 checkpoint，不是 durable persistence。
- `AI_MIND_GRAPH_DEBUG_VIEW`：控制是否输出脱敏 debug summary。

约束：

- 配置只影响 tasklist Agent 链路。
- 前端不提供 runtime 切换。
- 不允许 graph 运行到一半再自动 fallback 回 legacy 继续执行。

## 公共边界

对外稳定或新增的产物包括：

- graph timeline 相关 stream chunk
- `AgentTracePanel` 的 graph timeline 消费结构
- 脱敏后的 graph debug summary
- 仍兼容既有 artifact / step chunks

安全边界：

- 不输出完整 GraphState
- 不输出完整 AgentState
- 不输出完整 prompt
- 不输出完整 tasklist draft
- 不输出 tool raw output
- 不输出 API Key、token、env 原值

## 非目标

`v0.2.0` 明确不实现：

- 通用 Agent Runtime
- 多 Agent
- 自由 tool calling
- 自动发现版本文档
- 读源码目录
- 自动写入 `docs/tasklists/*`
- pause / resume
- replay / time travel
- Human-in-the-loop 审批
- 生产级 durable checkpoint
- Run History
- 前端 runtime switch
- graph 失败后的中途自动 fallback

## 历史资料来源

本 baseline 主要提炼自以下真实仓库资料：

- `docs/versions/v0.2.0-controlled-agent-graph.md`
- `docs/releases/v0.2.0.md`
- `docs/tasklists/v0.2.0-tasklist.md`
- `private-folder/plans/plan-2026-06-07-v0.2.0-controlled-agent-graph.md`
- `private-folder/tasklists/plan-2026-06-07-v0.2.0-controlled-agent-graph-tasklist.md`
