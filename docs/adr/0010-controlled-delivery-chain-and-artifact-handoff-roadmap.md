# ADR-0010: Controlled Delivery Chain and Artifact Handoff Roadmap

状态: Accepted
日期: 2026-06-30

## 背景

v0.3.5 已经把 public Agent demo 的文件资源收口到 `examples/agent-demo/` 和 `@demo://`。这解决了“Agent 能读什么”的问题。

下一步需要证明 AI Mind 不只是 `/tasklist`，还可以承载“需求 -> 方案 -> 任务 -> 评审”的 AI coding / delivery workflow。但如果一次性暴露 `/plan`、`/task`、`/review`，或直接引入多 Agent、artifact handoff、chat persistence，会让 v0.3.6 同时跨过过多边界。

因此 v0.3.6 需要一个受控交付链路 MVP，同时为后续 artifact-first handoff 和 multi-agent orchestration 留下清晰路线。

## 决策

v0.3.6 只暴露一个 public command:

```text
/delivery-chain
```

`/delivery-chain` 必须显式触发，不自动接管普通聊天输入。

内部采用固定 stage graph:

```text
DeliveryChainGraph
  -> loadDeliveryChainContext
  -> PlanStage
  -> TaskStage
  -> ReviewStage
  -> BuildReport
```

`DeliveryChainGraph` 是 LangGraph-controlled sequential workflow，不是自由多 Agent group chat。

v0.3.6 支持两种输入:

- `/delivery-chain + @demo://scenarios/*/requirement.md`
- `/delivery-chain <inline requirement text>`

资源读取继续只允许 `@demo://`。Scenario-backed 模式的入口只能是 `@demo://scenarios/*/requirement.md`。

v0.3.6 不暴露:

```text
/plan
/task
/review
```

v0.3.6 不实现:

- PostgresSaver integration
- checkpoint
- interrupt
- HITL
- `@artifact://`
- artifact handoff
- artifact persistence
- chat persistence
- nested HITL
- true multi-agent orchestration
- Agent message bus

后续多 Agent 演进优先走 artifact-first handoff，由 graph-orchestrated workflow 控制流程，而不是自由 group chat 或 Agent 随意互相调用。

## 影响

正向影响:

- v0.3.6 的范围可控。
- public demo 能从 Tasklist Agent 扩展到完整交付链路。
- resource boundary 延续 v0.3.5，不重新打开真实 repo 读取。
- v0.3.6 就统一到 LangGraph 心智模型，后续 v0.4.x 可自然把 stage 演进为 specialist agent node 或 subgraph。
- 后续 artifact handoff / multi-agent / persistence 有清晰路线。

代价:

- v0.3.6 的 TaskStage 不能直接复用现有 Tasklist Agent HITL 能力。
- Delivery Chain Report 暂时不能作为可被后续命令引用的持久 artifact。
- `/plan`、`/task`、`/review` 的独立体验需要等 artifact handoff 后再设计。
- 需要在当前版本内把既有 sequential runner 迁移成轻量 `StateGraph`，但仍保持输出等价和无持久化。

明确限制:

- 不得通过 v0.3.6 顺手新增 DB schema。
- 不得为了 report 展示修改 stream protocol 或 frontend reducer 数据结构。
- 不得因为引入 LangGraph 就顺手接入 PostgresSaver、checkpoint、interrupt 或 HITL。
- 不得把 future roadmap 转成当前实现任务。
- 不得在 `/delivery-chain` 内嵌套 Tasklist Agent HITL。

## 备选方案

同时暴露 `/plan`、`/task`、`/review`:

- 优点是命令看起来完整。
- 缺点是在没有 `@artifact://` 的情况下无法自然交接产物，并且扩大 parser / UI / docs / tests 范围。

直接做 multi-agent orchestration:

- 优点是叙事完整。
- 缺点是缺少 Agent catalog、handoff contract、artifact persistence 和 HITL-aware resume 设计，容易变成不可控 group chat。

在 v0.3.6 内嵌套调用 Tasklist Agent HITL:

- 优点是复用已有能力。
- 缺点是引入 nested interrupt / resume / checkpoint 合并问题，明显超过 MVP。

先做 chat persistence:

- 优点是为 artifact 历史打底。
- 缺点是会牵动 DB schema、message restore、artifact ownership 和 UI 状态恢复，不适合和 Delivery Chain MVP 混在一版。

## 后续事项

- 在 `specs/036-controlled-delivery-chain-mvp/` 记录 spec、plan、tasks、acceptance、decisions 和 contracts。
- 新增 `docs/architecture/agent-runtime-roadmap.md`。
- v0.3.6 实现完成后同步 README、release docs 和 package version。
- v0.4.0 前不得引入 `@artifact://`。
- v0.4.2 前不得将 PlanStage / TaskStage / ReviewStage 升级为 specialist agents。
- v0.3.6 graph 化完成后，需要补 graph happy path / node order / no-checkpointer focused tests。
