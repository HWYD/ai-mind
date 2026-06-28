# ADR-0002：AgentRun Business State vs LangGraph Checkpoint

状态：Accepted
日期：2026-06-27

## 背景

v0.3.0 为 Tasklist Agent 引入 HITL resume。Resume 同时需要 runtime checkpoint 恢复能力和业务级 run 状态。

LangGraph checkpoint 能恢复某个 thread 的 graph 执行状态，但它不是产品查询模型。前端和 API 还需要 ownership、run status、interrupt status、duplicate resume 防护和 version compatibility。

## 决策

AgentRun / AgentInterrupt 记录业务状态。LangGraph PostgresSaver 记录 checkpoint 状态。

两者可以共用同一个 PostgreSQL 实例，但表、migration 所有权和职责必须分离。

## 影响

- Prisma 只管理 `agent_runs` 和 `agent_interrupts`。
- PostgresSaver 只管理 checkpoint tables。
- Prisma schema 不管理 checkpoint tables。
- AgentRun 不保存 raw checkpoint。
- Graph node 不直接写 AgentRun 或 AgentInterrupt。
- Resume 协调属于 runner / coordinator 和 AgentRunService。

## 备选方案

直接查询 checkpoint tables 作为业务状态。这个方案被放弃，因为 checkpoint rows 是 runtime 实现细节。

把完整 checkpoint payload 存进 AgentRun。这个方案被放弃，因为它会把业务记录耦合到 LangGraph 内部持久化实现。

## 后续事项

未来 Run History、replay 或 `agent_run_events` 必须定义新的业务事件模型，不得复用 checkpoint storage 充当产品事件表。
