# Spec 023：Tasklist Agent Graph Runtime Consolidation Baseline

状态：Released Baseline
版本：v0.2.3
归档日期：2026-06-28

## 摘要

本目录沉淀 `v0.2.3` 已发布的 graph-only runtime 收口基线。

`v0.2.3` 不是功能扩张版本，而是一次重要架构收口：把 Tasklist Agent 从 `legacy runner + graph runner` 双路线，正式收口为 Graph Runtime 单路线，并删除运行期选择与迁移期 fallback。

## 适用范围

`v0.2.3` 的收口只作用于：

```text
/tasklist + @docs://versions/*.md
```

普通聊天、skills、tool calling、MCP、模型 provider runtime 等非 tasklist 链路不应被这次收口牵连。

## 已发布用户行为

- 用户触发 `/tasklist + @docs://versions/*.md` 时，已不再感知 legacy / graph 两种执行模式。
- 对外 `/tasklist` 入口保持不变。
- 最终 tasklist artifact、graph trace 和 debug summary 展示保持兼容。
- 不新增 HITL、resume、Run History 或数据库可见能力。

## 已发布系统行为

- Tasklist Agent 固定走 Graph Runtime。
- `AI_MIND_TASKLIST_AGENT_RUNTIME` 变为历史变量，不再参与执行路径判断。
- legacy runner、legacy wrapper、runtime selector 从生产路径移除。
- GraphState 成为 graph-first 的内部运行态承载结构，按分区组织状态。
- Graph routes 基于显式 state 字段判断，而不是隐式 fallback。
- stream / debug / trace 继续保持兼容，不因 graph-only 收口而破坏既有消费者。

## GraphState 版本边界

需要特别说明：

- `v0.2.3` 已经进入 graph-only runtime。
- 但它还不是最终单状态模型版本。
- GraphState 在本版已成为 graph-first 分区运行态，但生产路径中仍保留部分旧 AgentState 适配层。
- 完整的 “GraphState 单事实源” 收口发生在 `v0.2.4`。

## 外部兼容性

`v0.2.3` 发布时保持不变的外部行为包括：

- `/tasklist` 入口
- tasklist markdown artifact
- `artifact-start` / `artifact-delta` / `artifact-end`
- graph events
- Graph Debug Summary
- `AgentTracePanel` 消费结构

## 非目标

`v0.2.3` 不实现：

- HITL
- `interrupt()`
- durable AgentRun
- Resume API
- Run History
- 数据库持久化
- 新 Agent 类型
- 自由 tool calling
- 大规模前端改版
- Model Provider Runtime 改造

## 历史资料来源

本 baseline 主要提炼自以下真实仓库资料：

- `docs/versions/v0.2.3-tasklist-agent-graph-runtime-consolidation.md`
- `docs/releases/v0.2.3.md`
- `docs/tasklists/v0.2.3-tasklist.md`
- `private-folder/plans/plan-2026-06-16-v0.2.3-tasklist-agent-graph-runtime-consolidation.md`
- `private-folder/tasklists/plan-2026-06-16-v0.2.3-tasklist-agent-graph-runtime-consolidation-tasklist.md`
