# Plan 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30
Spec: [spec.md](./spec.md)

## Summary

v0.3.6 在 v0.3.5 `@demo://` public Agent resource boundary 基础上，新增一个受控交付链路入口 `/delivery-chain`。

本轮不是扩 scope，而是修正内部实现口径。推荐技术路线调整为:

- 新增 `/delivery-chain` route type 和 command invocation 解析。
- 在 graph 外完成 `resolveDeliveryChainInvocation()` 与边界 fail-closed。
- 使用 LangGraph `StateGraph` 实现 `DeliveryChainGraph`。
- 固定执行 `loadDeliveryChainContext -> runPlanStage -> runTaskStage -> runReviewStage -> buildDeliveryChainReport`。
- Scenario-backed 输入只接受 `@demo://scenarios/*/requirement.md`。
- Inline requirement 输入只基于用户文本和 demo governance / rubrics。
- 复用 v0.3.5 demo resource resolver。
- Delivery Chain Report 使用非持久化输出，优先复用现有 assistant message / text artifact 表达。
- 不新增 DB schema、stream chunk、frontend reducer 数据结构、nested HITL、`@artifact://` 或 checkpointer integration。

## Technical Context

**Language / Runtime**: TypeScript, Next.js App Router, Node.js server runtime。

**Primary Dependencies**:

- 复用现有 chat route、command parser、runtime orchestration 和 Vitest。
- 复用现有 `@langchain/langgraph` 依赖，实现 lightweight `StateGraph`。
- 复用 v0.3.5 demo resource resolver。
- 不新增 database dependency。
- 不新增 multi-agent framework dependency。
- 不接入 `@langchain/langgraph-checkpoint-postgres`。

**Storage**:

- 不新增持久化。
- GraphState 只存在于单次 run 的 runtime state。
- Delivery Chain Report 不写入 DB。

**Testing**:

- Route type / command parsing tests。
- Delivery Chain input parser tests。
- Demo scenario resource boundary tests。
- Delivery ChainGraph node order / happy path / soft fail tests。
- Report output shape tests。
- Frontend slash command / quick access / resource picker tests。

**Target Platform**:

- Webapp server runtime + public demo UI。

**Performance Goal**:

- Scenario resource read 只读取固定小文件。
- 不扫描真实 repo。
- 不引入长链路 nested agent / HITL 等待。

**Constraints**:

- 只显式 `/delivery-chain` 触发。
- 只读取 `@demo://`。
- 不写文件。
- 不改 stream protocol。
- 不改 frontend reducer 数据结构。
- 不改 Prisma / PostgresSaver。
- 不改现有 Tasklist Agent HITL。
- 不给 Delivery Chain graph 接入 PostgresSaver。

## Constitution Check

### Controlled Agent First

通过。`/delivery-chain` 是显式 public command，内部 stage 顺序固定，资源来源固定，不允许 Agent 自由扫描仓库或自由调用其他 Agent。

### GraphState Is Runtime Source of Truth

通过。v0.3.6 修正后明确使用 LangGraph，Delivery ChainGraphState 只保存脱敏的 input、resource bundle、stage result、warnings、report markdown 和状态字段，不保存 raw fs path、resolver internals、raw Error、API key、cookie 或 private config。

### Review Node Must Be Side-effect Free

通过。ReviewStage 只基于 requirement、context、PlanStage output、TaskStage output 和 rubric 做交付评审，不读取真实源码，不写文件，不触发 HITL。

### Business State and Checkpoint Must Stay Separate

通过。v0.3.6 不修改 AgentRun、AgentInterrupt、PostgresSaver 或 Tasklist Agent checkpoint resume 语义。Delivery ChainGraph 不新增 checkpoint。

### Stream Compatibility Is a Hard Constraint

通过。Delivery Chain Report 必须用现有 stream/message 表达能力承载。若需要新增 stream chunk 或 reducer state shape，则该方案超出 v0.3.6。

### Public DTO Must Be Strict and Safe

通过。API response 和错误提示不得暴露真实绝对路径、project root、raw provider error、raw stack、session cookie、API key 或私有目录内容。

### Minimal Abstraction

通过。允许新增 `DeliveryChainGraph`、graph nodes 和 graph state，因为它们承载明确的业务边界。不得提前抽象 Agent Catalog、AgentDefinition、HandoffContract、MessageBus 或 persistent Artifact store。

### Tests Before Broad Integration

通过。先补 graph happy path、node order、resource boundary、report shape 和 no-checkpointer tests，再做 broader UI 验证。

### Spec Drift Must Be Blocked

通过。本轮修正就是一次 spec drift 收口：当前手写 sequential runner 不再视为 v0.3.6 最终口径。后续实现必须与本 plan 一致；如果实现中发现必须修改 stream protocol、frontend reducer、Prisma schema、PostgresSaver schema、Tasklist Agent HITL contract 或新增 `@artifact://`，必须暂停并更新 spec，不得顺手扩大范围。

### Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

通过。本 plan 按 official Spec Kit workflow 产出，但真实事实源仍以 specs、ADR、architecture docs、代码和测试为准。

## Current Baseline

来自 v0.3.5:

- `examples/agent-demo/` 是 public Agent demo resource root。
- `@demo://` 是 public Agent demo 文件资源 scheme。
- `/tasklist + @demo://version-plans/*.md` 已可作为 Tasklist Agent public demo 入口。
- `@docs://`、`docs://versions/*.md` 不再作为 Tasklist Agent public demo 输入。
- `examples/agent-demo/scenarios/*/requirement.md`、`context.md`、sample artifacts、rubrics、governance 已作为 demo corpus 存在。
- v0.3.5 明确未实现 `/delivery-chain`、`/plan`、`/task`、`/review`、`@artifact://` 或 artifact handoff。

本轮修正前的 v0.3.6 实现基线:

- `/delivery-chain` 已有 route type、resource boundary 和 report output。
- runtime 仍是手写 sequential workflow。
- `startDeliveryChainRun()` 同时承担 invocation parsing 之后的 input loading、Plan / Task / Review 顺序 await、report 组装与最终输出。
- 这能工作，但和 Tasklist Agent / future multi-agent 的 LangGraph 心智模型不一致。

## Target Architecture

```text
User input
  -> /delivery-chain command parser
  -> resolveDeliveryChainInvocation
       -> scenario-backed: @demo://scenarios/<id>/requirement.md
       -> inline requirement: text after command
       -> invalid / forbidden / wrong-entry fail-closed
  -> build initial DeliveryChainGraphState
  -> DeliveryChainGraph (LangGraph StateGraph)
       -> loadDeliveryChainContext
       -> runPlanStage
       -> runTaskStage
       -> runReviewStage
       -> buildDeliveryChainReport
  -> non-persistent Delivery Chain Report output
```

### Graph boundary

- command parsing 和 boundary reject 保持在 graph 外。
- graph 从“可执行输入”开始，不负责 command surface 解释。
- `loadDeliveryChainContext` 进入 graph，作为正式 workflow 的第一步。
- `startDeliveryChainRun()` 只负责:
    - resolve invocation
    - emit fail-closed message
    - build initial graph state
    - invoke compiled graph
    - emit final report
    - handle soft fail

## Scenario-backed mode

允许入口:

```text
/delivery-chain + @demo://scenarios/<id>/requirement.md
```

允许读取:

```text
@demo://scenarios/<id>/requirement.md
@demo://scenarios/<id>/context.md
@demo://rubrics/plan-rubric.md
@demo://rubrics/task-rubric.md
@demo://rubrics/review-rubric.md
@demo://governance/delivery-boundaries.md
@demo://governance/engineering-rules.md
```

`plan.sample.md`、`tasks.sample.md`、`review.expected.md` 只能作为 fixture / reference / documentation，不作为用户入口，不要求最终输出逐字复制。

## Inline requirement mode

允许入口:

```text
/delivery-chain <requirement text>
```

Inline 模式不读取真实项目目录。它可以读取 demo rubrics / governance，或在缺失时使用内置最低限度规则，但必须保留 no-code-write 和 resource boundary。

## GraphState design

建议使用轻量、可序列化的 `DeliveryChainGraphState`:

```ts
type DeliveryChainGraphState = {
    input: DeliveryChainInput
    resources?: DeliveryChainResourceBundle
    plan?: DeliveryChainStageResult
    task?: DeliveryChainStageResult
    review?: DeliveryChainStageResult
    reviewDisposition?: 'pass' | 'needs_changes' | 'blocked'
    reportMarkdown?: string
    warnings: string[]
    status: 'running' | 'completed' | 'blocked' | 'failed'
    failureMessage?: string
}
```

硬边界:

- 不存 raw fs path。
- 不存 request / response / writer / AbortSignal。
- 不存 raw Error。
- 不存 API key / provider config / session cookie。
- 不做 chat history persistence。

## Stage Design

### loadDeliveryChainContext

输入:

- normalized `DeliveryChainInput`

输出:

- requirementText
- contextText
- plan/task/review rubrics
- governanceText
- sourceRefs
- warnings

### PlanStage

输入:

- `resources.requirementText`
- `resources.contextText`
- `resources.planRubricText`
- `resources.governanceText`

输出:

- 需求理解
- 实现方案
- 涉及模块
- 非目标
- 风险
- 验收标准建议

不做:

- 不拆详细任务。
- 不写代码。
- 不做 review 结论。
- 不读取真实源码。

### TaskStage

输入:

- requirementText
- contextText
- PlanStage output
- task rubric
- governance constraints

输出:

- 任务拆解
- 推荐任务顺序
- 风险任务标记
- 验收相关任务
- 非目标保护任务

不做:

- 不调用现有 Tasklist Agent HITL Graph。
- 不产生 Strategy Review interrupt。
- 不写文件。
- 不生成完整实现代码。
- 不替代 `/tasklist` public demo。

### ReviewStage

输入:

- requirementText
- contextText
- PlanStage output
- TaskStage output
- review rubric
- governance constraints

输出:

- pass / needs_changes / blocked
- 需求覆盖检查
- plan-task 一致性检查
- non-goals 检查
- scope drift 检查
- acceptance 覆盖检查
- 风险与下一步建议

不做:

- 不做源码级 code review。
- 不读取真实代码。
- 不自动修改 plan / tasks。
- 不触发 HITL。

### buildDeliveryChainReport

Report 必须包含:

```text
1. 输入来源
2. 需求摘要
3. 默认假设
4. 实现方案
5. 任务拆解
6. 交付评审
7. 风险
8. 非目标
9. 下一步建议
```

## Recommended File Changes

### Runtime

- `apps/webapp/lib/ai/model-provider/resolve-route-type.ts`
- `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/**`

### Frontend

- `apps/webapp/components/chat/composer/menu/composer-command-menu.tsx`
- `apps/webapp/components/chat/composer/menu/composer-resource-options.ts`
- `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`
- `apps/webapp/components/chat/message-list/chat-message-list.tsx`
- `apps/webapp/components/chat/message-list/suggestions/empty-state-suggestion-options.ts`

### Tests

- Route type tests for `/delivery-chain`。
- Delivery Chain parser / invocation tests。
- Demo resource resolver reuse tests。
- DeliveryChainGraph tests。
- Resource picker scenario filtering tests。
- Quick access tests。
- delivery-chain message rendering tests。

### Docs

- `specs/036-controlled-delivery-chain-mvp/data-model.md`
- `specs/036-controlled-delivery-chain-mvp/contracts/delivery-chain-runtime.md`
- `docs/architecture/agent-runtime-roadmap.md`
- `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md`

## Implementation Phases

### P0: Spec correction

先修正 `spec.md`、`plan.md`、`tasks.md`、`acceptance.md`、`decisions.md`，再同步 `data-model.md`、`contracts/`、roadmap 和 ADR。

### P1: Graph surface and state

新增 `DeliveryChainGraphState`、resource bundle 和 graph compilation，保留 `resolveDeliveryChainInvocation()` 在 graph 外。

### P2: Graph nodes

将 `loadDeliveryChainContext`、PlanStage、TaskStage、ReviewStage、BuildReport 迁移为 graph nodes。

### P3: Runner simplification

收缩 `startDeliveryChainRun()`，让它只负责:

- resolve invocation
- emit fail-closed
- invoke graph
- emit report
- handle soft fail

### P4: Verification

补 graph happy path / node order / soft fail / no-checkpointer tests，再重跑 delivery-chain display regression、`/tasklist` regression、typecheck、lint 和 `git diff --check`。

## Risks

### 双 runtime 心智模型持续漂移

风险: Tasklist Agent 已经是 LangGraph，而 Delivery Chain 继续维持手写 sequential runner，会让后续 multi-agent 设计出现两套编排模型。

规避:

- 在 v0.3.6 还未发布前完成这次实现口径修正。
- 明确 Delivery ChainGraph 是 LangGraph-controlled sequential workflow，不等于多 Agent。

### Graph 化时误引入 checkpointer / HITL

风险: 因为项目里已经有 PostgresSaver 和 Tasklist HITL，Delivery Chain 迁移到 LangGraph 时被顺手接入。

规避:

- 明确 `@langchain/langgraph` 可用，但 `@langchain/langgraph-checkpoint-postgres` 在 v0.3.6 中禁止接入。
- 把 no checkpoint / no interrupt / no HITL 写入 spec、tasks、acceptance。

### `startDeliveryChainRun()` 迁移时扩大边界

风险: 重构过程中顺手改 stream protocol、frontend reducer 或 `/tasklist` runtime。

规避:

- 只替换 orchestration 层。
- 保留现有 prompt builders、`invokeStageMarkdown()`、report builder 和 writer 行为。

## Out-of-scope Validation

以下不属于 v0.3.6 最小验证:

- DB migration test。
- PostgresSaver schema migration test。
- Delivery Chain checkpoint test。
- Delivery Chain interrupt / HITL resume integration test。
- Multi-agent message bus test。
- Artifact persistence test。

但必须验证现有 Tasklist Agent 相关 focused tests，确保 v0.3.6 没有破坏 `/tasklist`，也必须验证 delivery-chain 资源展示降噪逻辑没有被 graph 迁移破坏。
