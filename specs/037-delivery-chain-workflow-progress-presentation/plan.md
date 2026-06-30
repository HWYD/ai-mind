# Plan 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30
Spec: [spec.md](./spec.md)

## Summary

v0.3.7 在 v0.3.6 `DeliveryChainGraph` 的固定顺序 workflow 上新增轻量、通用、向后兼容的 workflow progress stream surface。

推荐技术路线：

- 在 `@ai-mind/stream-core` 新增 `workflow-progress-start`、`workflow-progress-step`、`workflow-progress-end` chunk 类型。
- 在 webapp `chatStreamChunkSchema`、stream reducer、message type 中新增 workflow progress part。
- 在 `/delivery-chain` runtime 中围绕五个 graph 节点 emit progressive step events。
- 在 message-list 中新增通用 Workflow Progress component，但 v0.3.7 只绑定 `/delivery-chain` 消费。
- Report presentation 先走 UI-level Markdown section parsing，失败时 fallback 到原始 Markdown。
- 保留 v0.3.6 resource compact grouping，不影响 `/tasklist` 和普通 ResourcePanel。

## Technical Context

**Language / Runtime**: TypeScript, Next.js App Router, React, Node.js server runtime。

**Primary Dependencies**:

- 复用 `@ai-mind/stream-core` 作为 stream protocol 类型事实源。
- 复用 webapp `chatStreamChunkSchema` 做 runtime chunk 校验。
- 复用现有 `StreamMessageReducer` / `MindMessagePart` / message-list 架构。
- 复用 v0.3.6 `DeliveryChainGraph` 和 `DeliveryChainGraphState`。
- 不新增数据库、checkpointer、multi-agent framework 或 observability dependency。

**Storage**:

- 不新增持久化。
- Workflow progress 只存在于当前 stream / frontend message tree。
- 不写 DB、PostgresSaver、checkpoint、artifact store 或 event store。

**Testing**:

- stream-core protocol tests。
- webapp stream chunk schema tests。
- reducer tests。
- delivery-chain runtime progress emission tests。
- message-list workflow progress UI tests。
- delivery-chain report section fallback tests。
- `/tasklist` AgentTracePanel 和 ResourcePanel regression tests。

**Target Platform**:

- Webapp server runtime + browser chat UI。

**Performance Goal**:

- Progress chunk 数量随固定五步 workflow 线性增长。
- 不引入 token 级 progress 更新。
- 不引入长列表日志或完整 observability trace。

**Constraints**:

- 只对 `/delivery-chain` emit / consume workflow progress。
- 新 stream chunk 必须向后兼容。
- 不复用 `agent-graph-*`，避免落入 Tasklist Agent 时间线 UI。
- 不把任意 tool/resource/prompt chunk 自动桥接成 workflow progress transcript。
- 不显示 raw node id、raw provider error、raw GraphState、真实路径或 debug metadata。
- 不改 Tasklist Agent HITL / graph topology / checkpointer。
- 不新增 DB schema / Prisma migration / PostgresSaver schema。

## Constitution Check

### Controlled Agent First

通过。`/delivery-chain` 仍是显式 public command，workflow progress 只是该受控 workflow 的展示面，不扩大 Agent 权限、不新增自由工具调用或多 Agent 编排。

### GraphState Is Runtime Source of Truth

通过。Delivery Chain 的业务状态仍来自 `DeliveryChainGraphState`。Workflow progress 是从 runtime state / node boundary 派生出来的 public presentation DTO，不成为第二套业务事实源。

### Review Node Must Be Side-effect Free

通过。ReviewStage 仍只生成评审内容。新增 progress event 由 runtime presentation boundary 负责，不让 review node 写 DB、触发 HITL 或读取额外资源。

### Business State and Checkpoint Must Stay Separate

通过。本版本不新增 AgentRun / AgentInterrupt / checkpoint 状态，不接 PostgresSaver。Progress 不具备 resume 或 durable execution 语义。

### Stream Compatibility Is a Hard Constraint

有受控变更。v0.3.7 明确允许新增 additive stream chunks，但必须同步 `stream-core` 类型、webapp schema、reducer tests、UI tests 和 contracts/docs。不得修改现有 chunk 语义。

### Public DTO Must Be Strict and Safe

通过。`workflow-progress-*` 只能包含脱敏 title、summary、details、duration、status、workflow kind。不得输出 raw provider error、prompt、GraphState、真实路径或 resolver internals。

### Minimal Abstraction

通过。抽象边界只到 `WorkflowProgressPart` 和通用 component，因为用户已明确后续新 Agent 大概率复用这种展示方式。v0.3.7 不建立 Agent Catalog、AgentOutputEnvelope 或 HandoffContract。

### Tests Before Broad Integration

通过。先从 stream protocol/schema/reducer/runtime tests 做起，再扩展 message-list UI 和 regression。

### Spec Drift Must Be Blocked

通过。本 plan 明确将 stream/reducer 变更纳入 v0.3.7 范围；如果实现中需要 DB、artifact、checkpoint、HITL 或 Tasklist topology change，必须暂停并更新版本边界。

### Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

通过。本资产按 official Spec Kit workflow 人工等价创建；事实源仍是 specs、ADR、architecture docs、代码和测试。

## Current Baseline

截至 v0.3.6：

- `/delivery-chain` 是唯一 public Delivery Chain command。
- `/delivery-chain` 支持 scenario-backed input 和 inline requirement。
- 内部 `DeliveryChainGraph` 固定执行：

```text
loadDeliveryChainContext
-> runPlanStage
-> runTaskStage
-> runReviewStage
-> buildDeliveryChainReport
```

- runtime 当前会 emit `resource-start/resource-end`，再用 `writeStaticTextPart()` 输出最终报告。
- 前端当前有 `/delivery-chain` resource compact grouping，避免内部 demo resources 展开成多个大 ResourcePanel。
- 前端当前有 `agent-graph-*` -> `AgentTracePanel`，主要服务 Tasklist Agent graph/HITL。
- 当前没有 workflow progress chunk、WorkflowProgressPart 或 Delivery Chain stage progress presentation。

## Target Architecture

```text
/delivery-chain request
  -> resolveDeliveryChainInvocation
  -> workflow-progress-start
  -> DeliveryChainGraph
       -> workflow-progress-step(load running)
       -> loadDeliveryChainContext
       -> workflow-progress-step(load completed)
       -> workflow-progress-step(plan running)
       -> runPlanStage
       -> workflow-progress-step(plan completed | failed)
       -> workflow-progress-step(task running)
       -> runTaskStage
       -> workflow-progress-step(task completed | failed)
       -> workflow-progress-step(review running)
       -> runReviewStage
       -> workflow-progress-step(review completed | failed)
       -> workflow-progress-step(report running)
       -> buildDeliveryChainReport
       -> workflow-progress-step(report completed | failed)
  -> workflow-progress-end
  -> final Delivery Chain Report text
```

### Event ordering

- `workflow-progress-start` 必须在第一个 step 之前。
- 每个 step 先 emit `running`，完成后 emit `completed` 或 `failed`。
- 未来 step 不提前 emit。
- `workflow-progress-end` 应在最终 report text 输出前 emit，便于前端自动折叠 progress panel。

### UI boundary

- Workflow Progress component 是通用组件。
- v0.3.7 只在 `/delivery-chain` assistant message 中实际消费。
- 不复用 `AgentTracePanel`。
- 不做 tasklist timeline。
- 不展示 raw node id。

## Workflow Progress Contract

核心 contract 见 [contracts/workflow-progress-stream.md](./contracts/workflow-progress-stream.md)。

建议第一版字段保持小而够用：

- `partId`
- `workflowId`
- `workflowKind`
- `title`
- `stepId`
- `status`
- `summary`
- `details`
- `startedAt`
- `endedAt`
- `durationMs`
- `failureMessage`

字段均为 public presentation DTO，不代表 durable trace。

## Delivery Chain Step Mapping

```text
loadDeliveryChainContext -> 读取上下文
runPlanStage -> 方案规划
runTaskStage -> 任务拆解
runReviewStage -> 交付评审
buildDeliveryChainReport -> 生成交付计划报告
```

展示文案建议：

```text
正在生成交付计划...

已读取 demo 上下文 6 项
包含需求、场景上下文、评审规则和治理规则

方案规划
调用模型：生成方案 (plan)

任务拆解
调用模型：拆解任务 (tasks)

交付评审
调用模型：交付评审 (review)

生成交付计划报告
汇总并生成最终报告
```

## Report Presentation

当前 v0.3.6 report 已有稳定 heading：

```text
输入来源
需求摘要
默认假设
实现方案
任务拆解
交付评审
风险
非目标
下一步建议
```

v0.3.7 可以先做 UI-level section parsing：

- 成功解析：按 section 更清晰展示。
- 解析失败：原样展示完整 Markdown。
- 不新增 report artifact contract。
- 不把 report section 写入 DB 或 `@artifact://`。

如果实现中发现 LLM 输出漂移导致 section parsing 不稳定，优先收紧 prompt/report builder headings，并保持 fallback Markdown。

## Recommended File Changes

### Protocol and schema

- `packages/stream-core/src/protocol/chat-stream-chunk.ts`
- `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- `apps/webapp/lib/ai/stream-chunk-schema.ts`
- `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`

### Runtime

- `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/graph-state.ts` only if presentation-safe metadata genuinely needs state support
- `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`

### Frontend stream and model

- `apps/webapp/lib/ai/types/message.ts`
- `apps/webapp/components/instamind/chat-stream/message-factory.ts`
- `apps/webapp/components/instamind/chat-stream/message-operations.ts`
- `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`
- `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`

### Frontend presentation

- `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx`
- `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`
- `apps/webapp/components/chat/message-list/parts/text-part.tsx` only if report section parsing is placed there
- `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`

### Docs

- `specs/037-delivery-chain-workflow-progress-presentation/**`
- `docs/architecture/agent-runtime-roadmap.md`
- Release docs only at version closeout.

## Implementation Phases

### P0: Spec / contract close

Finalize spec, decisions, data model, stream contract, acceptance and tasks. Confirm v0.3.7 is allowed to add additive stream chunks and reducer handling.

### P1: Protocol and schema

Add `workflow-progress-*` chunk types to stream-core and webapp schema. Add protocol/schema tests first.

### P2: Runtime event emission

Emit workflow progress around `/delivery-chain` graph execution. Keep resource reads and report generation semantics unchanged.

### P3: Reducer and message model

Introduce `WorkflowProgressPart` and reducer updates. Do not touch `agent-step` semantics.

### P4: Frontend component

Build generic Workflow Progress component. Bind first consumer to `/delivery-chain`; expanded while running, collapsed after end, clickable toggle.

### P5: Report presentation

Add report section parsing and fallback. Keep report non-persistent.

### P6: Regression and release close

Run focused tests, typecheck, lint and `git diff --check`. Manually confirm no DB, HITL, checkpoint, Tasklist topology or artifact handoff changes.

## Risks

### Progress channel becomes accidental observability platform

风险：一旦有通用 stream chunk，容易把 raw node id、debug metadata、provider error 和完整 trace 都塞进去。

规避：

- Contract 明确只允许 safe title / summary / details / duration / status。
- Debug trace、LangSmith deep trace、Agent event store 都后置。

### Reusing Tasklist Agent trace UI causes UX mismatch

风险：复用 `agent-graph-*` 会自然落到 `AgentTracePanel` 时间线，界面不符合本版“整洁 process panel”的目标。

规避：

- 新增 `workflow-progress-*`。
- 新增 Workflow Progress component。
- `/tasklist` 保持原有 AgentTracePanel。

### Workflow progress drifts into generic event replay

风险：为了显示“做了什么”，实现可能把任意 tool/resource/prompt 事件逐条塞进 panel，进而把本版做成半套 observability transcript。
规避：

- step details 只允许 runtime 显式构造的安全摘要。
- 普通 tool/resource/prompt 继续走现有面板，不接入 workflow progress。
- 如需真正通用事件回放，必须在后续版本单开 spec。

### Report section parsing is brittle

风险：LLM output 或 report builder heading 漂移会让 section UI 失败。

规避：

- 只做 UI-level parsing。
- 失败时 fallback Markdown。
- 测试覆盖 heading drift 和 fallback。

### Stream/reducer change breaks old messages

风险：新增 part 类型时影响已有 message rendering。

规避：

- Additive schema。
- Reducer tests 覆盖旧 chunks。
- AssistantMessage 对未知或不存在 workflow part 保持现有路径。

## Out-of-scope Validation

以下不属于 v0.3.7 最小验证：

- DB migration test。
- PostgresSaver schema migration test。
- Artifact persistence test。
- `@artifact://` handoff test。
- Multi-agent orchestration test。
- HITL resume integration test。
- LangSmith trace UI test。
