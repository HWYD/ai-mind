# Plan 020：v0.2.0 Released Runtime Architecture

状态：Released Baseline
版本：v0.2.0
归档日期：2026-06-28

## 目的

记录 `v0.2.0` 当时已经落地的真实运行架构，供后续回看 graph 引入初版时的约束与取舍。

这不是待执行计划，而是历史运行基线。

## Chat -> Tasklist Agent 链路

`v0.2.0` 当时的受控链路可概括为：

```text
POST /api/chat
  -> chat route / chat-service / ChatOrchestrator
  -> 识别 /tasklist + @docs://versions/*.md
  -> 读取 tasklist runtime config
  -> 选择 legacy runner 或 graph runner
  -> graph runner 时进入 LangGraph StateGraph
  -> 共享 step operations
  -> graph events / artifact 输出
  -> HTTP stream 完成
```

关键边界：

- 只有 tasklist Agent 进入 graph runtime 选择逻辑。
- runtime 选择发生在请求开始前，不允许运行中切换。
- legacy runner 与 graph runner 复用共享业务步骤，不复制业务规则。

## Graph 主流程

`v0.2.0` 的 graph 主流程以当时版本文档为准，可抽象为：

```text
START
  -> readVersionPlan
  -> evaluatePlanReadiness
  -> planningDecision
  -> routeAfterPlanningDecision
     -> askClarification | stopWithBoundaryMessage | readOptionalContext | recordManualReviewItems | decideTasklistStrategy
  -> draftTasklistV1
  -> validateTasklistV1
  -> decideWarningDisposition
  -> routeAfterWarningDisposition
     -> reviseTasklistV2 | evaluateRevisionEffect
  -> emitFinalArtifact
  -> END
```

其中：

- `PlanningDecisionAction` 对应显式 conditional edge。
- `WarningDisposition` 对应显式 conditional edge。
- optional context 最多读取一次。
- 只允许生成 `v1 -> v2`，不生成 `v3`。

## State 与 Debug 结构

`v0.2.0` 的内部设计仍然保留旧业务状态模型：

- 既有 `VersionPlanTasklistAgentState` 仍承载业务事实。
- GraphState 主要负责包装 agent state，并附加 graph 轨迹字段。
- graph event、debug summary、UI view model 只允许读取脱敏摘要，不允许暴露完整状态。

Debug / Trace 相关结构包括：

- graph node start / end
- graph route
- graph state patch summary
- Graph Debug Summary
- AgentTracePanel graph timeline

## Checkpoint 边界

`v0.2.0` 只提供开发态 memory checkpoint：

```text
AI_MIND_GRAPH_CHECKPOINT=memory
```

约束：

- 仅用于开发调试
- 不提供产品级 resume
- 不提供 replay / time travel
- 不提供历史 run 查询
- production 下不应被当作正式能力承诺

## 关联资料与路径

作为历史架构事实源，优先参考：

- `docs/versions/v0.2.0-controlled-agent-graph.md`
- `docs/releases/v0.2.0.md`
- `docs/tasklists/v0.2.0-tasklist.md`
- `private-folder/plans/plan-2026-06-07-v0.2.0-controlled-agent-graph.md`
- `private-folder/tasklists/plan-2026-06-07-v0.2.0-controlled-agent-graph-tasklist.md`

若需要理解当前仓库如何继承这条演进线，可再对照：

- `docs/architecture/agent-runtime.md`
- `docs/adr/0001-graphstate-source-of-truth.md`
