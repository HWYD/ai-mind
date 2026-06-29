# Agent Runtime Roadmap

状态: Active
日期: 2026-06-29

## Purpose

本文记录 AI Mind Agent Runtime 从受控单 Agent 到受控交付链路、再到 artifact-first multi-agent workflow 的演进方向。

这不是当前版本的实现清单。每个版本只能实现自身 spec / tasks 中明确列出的能力。

## Current baseline

截至 v0.3.6:

- Public Agent demo resource root 已收口到 `examples/agent-demo/`。
- Public Agent demo 文件资源只使用 `@demo://`。
- Tasklist Agent public demo 入口是 `/tasklist + @demo://version-plans/*.md`。
- `/delivery-chain` 已支持 demo scenario 和 inline requirement 两类输入。
- `/delivery-chain` 已支持 demo scenario 和 inline requirement 两类输入。
- v0.3.6 的内部推荐口径是 `DeliveryChainGraph`：使用 LangGraph `StateGraph` 表达固定顺序 workflow，并输出非持久化 Delivery Chain Report。
- `@docs://`、`docs://versions/*.md` 不再作为 public Agent demo 输入。
- `examples/agent-demo/scenarios/`、`rubrics/`、`governance/` 已作为后续 Delivery Chain 的 demo corpus 存在。

当前受控 Agent Runtime 的核心约束:

- 显式 command 触发。
- Runtime 控制流程。
- Resource boundary 先于模型执行。
- GraphState / runtime state 不存敏感对象。
- 可以使用 LangGraph 表达受控 workflow，但不自动等于 checkpoint、interrupt 或 HITL。
- Stream protocol 和 frontend reducer 保持兼容。
- Artifact 先作为展示产物，不作为持久化交接协议。

## v0.3.6: Controlled Delivery Chain MVP

目标:

- 新增一个 public command: `/delivery-chain`。
- 支持 demo scenario 输入。
- 支持 inline requirement 输入。
- 内部使用 LangGraph `StateGraph` 固定执行 `loadDeliveryChainContext -> PlanStage -> TaskStage -> ReviewStage -> BuildReport`。
- 输出非持久化 Delivery Chain Report。
- 继续只读取 `@demo://`。

明确不做:

- 不暴露 `/plan`、`/task`、`/review`。
- 不接 PostgresSaver。
- 不做 checkpoint。
- 不做 interrupt。
- 不实现真正多 Agent。
- 不实现 `@artifact://`。
- 不做 artifact persistence。
- 不做 nested HITL。
- 不做 chat persistence。

价值:

```text
先把“需求 -> 方案 -> 任务 -> 评审”的交付链路跑起来。
```

## v0.3.7: Delivery Chain Presentation and Trace

目标:

- 优化 Delivery Chain Report 展示。
- 将 Plan / Task / Review 分段展示。
- 增加 stage trace。
- 优化 AgentTracePanel。
- 优化 quick access 和 demo UX。

价值:

```text
让用户和 reviewer 看懂 Delivery Chain graph 是怎么一步步执行的。
```

## v0.4.0: Session Artifact Handoff

目标:

- 支持当前会话内 artifact handoff。
- 支持类似:

```text
@artifact://last-plan
@artifact://last-tasks
@artifact://last-review
```

- 不做数据库持久化。
- 不做跨刷新恢复。

价值:

```text
让上一步产物可以交给下一步，不再只依赖一次性报告。
```

## v0.4.1: Agent Catalog and Runtime Contract

目标:

- 统一 AgentDefinition。
- 统一 AgentInputEnvelope。
- 统一 AgentOutputEnvelope。
- 统一 AgentArtifact。
- 统一 HandoffContract。
- 统一 StageResult。

价值:

```text
把多 Agent 前的公共协议定下来，避免每个 Agent 重复设计输入输出。
```

## v0.4.2: Controlled Multi-agent Orchestration

目标:

- 将内部 stage 演进为受控 specialist agents:

```text
DeliveryChainGraph
  -> Plan Agent
  -> Tasklist Agent
  -> Review Agent
```

- Orchestrator 控制流程。
- Agent 之间通过 artifact-first handoff 通信。
- 不做自由 group chat。
- 不做 Agent 随意互相调用。

价值:

```text
正式进入受控多 Agent 编排。
```

## v0.4.3: HITL-aware Multi-agent

目标:

- 支持多 Agent 链路中的 Tasklist Agent HITL 暂停恢复。
- 允许链路在 Tasklist 阶段暂停。
- 用户 approve / reject 后，主链路可以继续或停止。
- resume 后 Review Agent 可以继续消费 Tasklist artifact。

价值:

```text
让现有 Tasklist Agent HITL 能接入多 Agent workflow。
```

## v0.5.0: Chat Persistence Foundation

目标:

- 新增 Conversation。
- 新增 Message。
- 新增 MessagePart。
- 新增 Artifact。
- 支持刷新后历史会话恢复。
- 支持 assistant message 状态保存。
- 支持 artifact 与 message 关联。

价值:

```text
把 AI Mind 从当前会话 demo 升级为有历史记录的产品化 AI 应用。
```

## Guardrails

- Roadmap 不是当前版本任务清单。
- v0.3.6 不得实现 v0.3.7-v0.5.0 的能力。
- v0.3.6 的 LangGraph 使用范围仅限受控 sequential workflow，不包含 checkpointer、interrupt、resume 或 HITL。
- `@artifact://` 必须等待 artifact handoff spec。
- 真正多 Agent 必须等待 Agent Catalog / Runtime Contract。
- Chat persistence 必须等待 DB schema spec。
- 如果某个实现必须修改 stream protocol、frontend reducer、Prisma schema 或 PostgresSaver schema，必须提升或重开 spec，而不能塞进当前版本。
