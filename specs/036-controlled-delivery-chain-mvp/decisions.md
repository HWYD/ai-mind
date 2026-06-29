# Decisions 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30

## D036-01: `/delivery-chain` is the only public command

决定:

v0.3.6 只新增 `/delivery-chain`。

理由:

- 避免 `/plan`、`/task`、`/review` 在没有 artifact handoff 的情况下形成割裂体验。
- 避免 `/task` 和既有 `/tasklist` 混淆。
- 控制 parser、UI、测试和文档范围。

## D036-02: Plan / Task / Review are internal stages

决定:

PlanStage、TaskStage、ReviewStage 是内部 stage，不是独立 Agent。

理由:

- v0.3.6 目标是 MVP。
- 独立 Agent 需要 Agent catalog、handoff contract、trace、memory 或 persistence 等更完整基建。

## D036-03: Explicit command only

决定:

普通聊天裸输入不会自动进入 Delivery Chain。

理由:

- 避免普通聊天和 Agent execution 混淆。
- 延续 AI Mind 受控 Agent Runtime 边界。

## D036-04: Support scenario-backed and inline requirement

决定:

支持 demo scenario 和 inline requirement 两种输入。

理由:

- demo scenario 适合公开演示和可重复测试。
- inline requirement 适合快速体验。

## D036-05: TaskStage does not call Tasklist Agent HITL

决定:

TaskStage 是受控任务拆解 stage，不调用现有 Tasklist Agent HITL Graph。

理由:

- nested HITL 会扩大 checkpoint、resume、interrupt UI 和状态合并问题。
- 现有 `/tasklist` public demo 继续保留独立入口。

## D036-06: Report is non-persistent

决定:

Delivery Chain Report 在 v0.3.6 中不持久化。

理由:

- artifact persistence、chat persistence 和 `@artifact://` 属于后续版本。
- 本版本不新增 DB schema 或 message part schema。

## D036-07: Artifact-first handoff is future direction

决定:

后续多 Agent / multi-stage workflow 优先走 artifact-first handoff，而不是自由 group chat 或 Agent 随意互相调用。

理由:

- Artifact handoff 更适合受控、可审计、可测试的 AI coding workflow。
- 自由 group chat 容易扩大不可控行为和追踪复杂度。

## D036-08: Chat persistence is postponed

决定:

v0.3.6 不做 Conversation / Message / Artifact persistence。

理由:

- 持久化会牵动 DB schema、message restore、artifact ownership 和 UI 状态恢复。
- Delivery Chain MVP 可以先用非持久化报告验证产品价值。

## D036-09: v0.3.6 delivery-chain uses LangGraph-controlled sequential workflow

决定:

`/delivery-chain` 的内部 workflow 从手写 sequential runner 修正为 LangGraph `StateGraph`，统一为 `DeliveryChainGraph` 口径。

理由:

- Tasklist Agent 已经使用 LangGraph；future multi-agent 也确定基于 LangGraph。
- 如果 v0.3.6 继续保留手写 sequential workflow，会让项目同时存在两套编排心智模型。
- 当前 `/delivery-chain` 仍是固定顺序流程，迁移到 lightweight `StateGraph` 的成本最低。
- 这里使用 LangGraph 只为表达受控 workflow，不等于引入多 Agent、checkpoint 或 HITL。

## D036-10: DeliveryChainGraph is graph-only, not checkpoint / interrupt / HITL

决定:

v0.3.6 的 `DeliveryChainGraph` 不接 PostgresSaver，不新增 checkpoint，不引入 interrupt，不新增 HITL，不做 resume。

理由:

- 这些能力会把 MVP 从“受控顺序 workflow”抬升到“durable graph runtime”，明显扩大范围。
- 当前版本只需要固定节点顺序和 GraphState 语义，不需要 durable execution。
- Tasklist Agent 已经覆盖 checkpoint / interrupt / HITL 路径，Delivery Chain 不需要在 v0.3.6 重复实现一套。

## D036-11: Invocation parsing stays outside the graph

决定:

`resolveDeliveryChainInvocation()`、forbidden scheme reject、wrong-entry reject、missing-input fail-closed 保持在 graph 外；graph 只接收可执行的归一化输入。

理由:

- command surface 解析属于 route / runtime entry contract，不属于 graph business state。
- 这样可以让 `DeliveryChainGraph` 聚焦 workflow 本身，并避免把 command parser 细节塞进 GraphState。
