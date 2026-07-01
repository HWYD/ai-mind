# Plan 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Planning
版本: v0.4.0
日期: 2026-07-01
Spec: [spec.md](./spec.md)

## Summary

v0.4.0 将 `/delivery-chain` 从当前 `DeliveryChainGraph` 固定 stage workflow，替换为只服务 `/delivery-chain` 的 `ControlledDeliveryManager`。

本版要证明的是 Agent-as-tool 架构雏形，而不是普通函数 runner 改名。Manager 通过模型 tool-calling 调用三个受控子 Agent tools：

- `plan-subagent`
- `task-subagent`
- `review-subagent`

Manager 仍由代码层 `DelegationPolicy` 控制顺序、次数、输入 artifact 和失败行为。模型可以发起 tool call，但不能自由选择任意工具、不能乱序、不能 parallel、不能 nested、不能超过 3 次。

## Technical Context

**Language / Runtime**: TypeScript, Next.js App Router, Node.js server runtime。

**Primary Dependencies**:

- 复用 LangChain chat model / `bindTools` 能力，现有类型位于 `apps/webapp/lib/ai/model-provider/types.ts`。
- 复用现有 tool contract 心智模型：`apps/webapp/lib/ai/tools/registry.ts` 中的 `ChatToolDefinition`、Zod `schema`、LangChain `StructuredToolInterface`。
- 复用现有 tool call schema 校验思路：`apps/webapp/lib/ai/runtime/tool-runtime/validation.ts`。
- 复用统一 tool 执行核心：`apps/webapp/lib/ai/runtime/tool-runtime/execution.ts` 已承载 tool invoke、`ToolMessage` 包装和 `rawResult` 回传；v0.4.0 只需要在 `delivery-chain-manager` scope 下静默分流普通 `tool-*` / `resource-*` transcript。
- 复用模型能力 fail-closed 机制：`apps/webapp/lib/ai/model-provider/catalog/resolve-model-selection.ts` 已支持 `requireToolCalling` 和 `MODEL_DOES_NOT_SUPPORT_TOOL_CALLING`。
- 复用当前 `/delivery-chain` demo resource boundary、stage prompt 和 report heading。
- 不新增数据库、Prisma migration、PostgresSaver、message bus 或 multi-agent framework dependency。

**Storage**:

- 不新增持久化。
- `RuntimeArtifact`、`SubagentToolInvocation`、`SubagentToolResult`、`SubagentToolInvocationTrace` 都只在单次 run 内存在。
- 不写 DB，不写 frontend `message.artifacts`，不写 `artifact-*` stream chunks。

**Testing**:

- Vitest focused tests。
- fake tool-call model 作为 Manager 主测试入口。
- 不把真实 provider 调用作为验收硬门槛。
- 必须覆盖 delivery-chain、tasklist、stream schema、frontend reducer、`@demo://` boundary 的 non-regression。

**Target Platform**:

- Webapp server runtime + existing chat stream UI。

**Performance Goal**:

- Tool-calling loop 最多 3 次子 Agent tool call。
- 不 parallel，不 nested，不扫描真实仓库。
- 不引入等待人工 HITL / checkpoint resume 的长链路。

**Constraints**:

- Public surface 保持 `/delivery-chain`。
- 子 Agent tools 不进入普通用户可选 tool 列表，不进入全局 Agent Catalog。
- 统一 tool registry 如需承接内部 tools，只允许新增最小 `ToolRuntimeScope` 过滤；不新增独立 `ToolVisibility`。
- 当前模型不支持 tool-calling 或 runtime 没有可用 `bindTools` 时 fail closed。
- Tool result 使用强 JSON Schema；无法解析或 schema 不合法时 fail closed。
- 旧 `DeliveryChainGraph` 不保留为 `/delivery-chain` 主执行路径，避免双主控。
- `workflow-progress-*` 只承载 curated safe summary。
- 不改 Tasklist Agent Graph、HITL、checkpoint、resume、AgentRun 数据层。

**Scale / Scope**:

- 单 route、单 manager、三个子 Agent tools、三次固定 delegation、一个最终 report。
- Level C runtime extension，不进入 Level D 数据层或多 Agent 平台。

## Constitution Check

### Controlled Agent First

通过。Manager 只服务 `/delivery-chain`，工具集合固定，顺序固定，资源来源固定。模型只能在代码 policy 内发起 tool call。

### GraphState Is Runtime Source of Truth

不适用为硬要求。该条约束针对 Tasklist Agent。v0.4.0 不修改 Tasklist Agent GraphState。Delivery Chain 新 runtime 使用 run-local Manager state / RuntimeArtifact，不引入 Tasklist GraphState 或旧 AgentState adapter。

### Review Node Must Be Side-effect Free

通过。v0.4.0 不触发 Tasklist HITL review node。`review-subagent` 只生成 review JSON result / markdown，不写 DB、不写文件、不触发 interrupt。

### Business State and Checkpoint Must Stay Separate

通过。v0.4.0 不新增 AgentRun、AgentInterrupt、PostgresSaver 或 checkpoint tables。

### Stream Compatibility Is a Hard Constraint

通过。继续复用 `workflow-progress-*` 和 final report text，不新增 stream chunk，不修改 stream-core union，不把 RuntimeArtifact 塞进 stream。

### Public DTO Must Be Strict and Safe

通过。子 Agent tool result 使用强 JSON Schema。对用户可见的 progress / failure summary 不包含 raw prompt、raw response、provider config、stack、API key、cookie 或真实路径。

### Minimal Abstraction

有风险但可控。允许新增 delivery-chain 内部 contracts，因为它们承载明确边界：Manager policy、Subagent tool result、RuntimeArtifact。禁止抽成全局 Agent Catalog 或跨 route Agent platform。

### Tests Before Broad Integration

通过。先写 contract / policy / tool result schema tests，再接 Manager loop，再接 `/delivery-chain`。

### Spec Drift Must Be Blocked

通过。本 plan 明确 v0.4.0 是 Agent-as-tool，不是 runner fallback。若实现阶段发现 selected model / provider 无法稳定支持 tool-calling，应 fail closed 或回到 spec 决策，不得私自改回普通 stage workflow。

### Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

通过。本资产按 Spec Kit plan / checklist / tasks / analyze 人工等价流程生成，事实源仍为当前 spec、plan、tasks、ADR、architecture docs 和真实代码。

## Current Baseline

当前真实实现基线：

- `/delivery-chain` 入口在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`，导出 `resolveDeliveryChainInvocation()`、`startDeliveryChainRun()`、`createDeliveryChainGraph()`、`runDeliveryChainGraph()`。
- 当前 Delivery Chain 使用 LangGraph `StateGraph`，状态定义在 `apps/webapp/lib/ai/runtime/delivery-chain/graph-state.ts`。
- 当前 graph 固定节点为 `loadDeliveryChainContext -> runPlanStage -> runTaskStage -> runReviewStage -> buildDeliveryChainReport`。
- 当前 stage prompt 和 report builder 位于 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`。
- 当前 workflow progress helper 位于 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`，stream contract 位于 `packages/stream-core/src/protocol/chat-stream-chunk.ts`。
- 当前前端 reducer 已消费 `workflow-progress-*`，入口位于 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`。
- 当前 tool registry 位于 `apps/webapp/lib/ai/tools/registry.ts`，普通 tool runtime 位于 `apps/webapp/lib/ai/runtime/tool-runtime/`。
- 当前 Tasklist Agent 位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/**`，包含 Graph、HITL、checkpoint / resume、AgentRun 协调等能力，本版不得复用为 delivery-chain 子 Agent。

## Target Architecture

```text
/delivery-chain request
  -> resolveDeliveryChainInvocation
  -> load demo context
  -> ControlledDeliveryManager
       -> bind plan/task/review subagent tools to manager model
       -> receive manager tool call
       -> validate tool call with DelegationPolicy
       -> execute plan-subagent tool
       -> parse strong JSON result
       -> create RuntimeArtifact(kind='plan')
       -> receive manager tool call
       -> validate plan artifact before task
       -> execute task-subagent tool
       -> create RuntimeArtifact(kind='tasks')
       -> receive manager tool call
       -> validate plan + tasks before review
       -> execute review-subagent tool
       -> create RuntimeArtifact(kind='review')
       -> synthesize RuntimeArtifact(kind='delivery_report')
  -> write final report text
```

### Manager boundary

- `ControlledDeliveryManager` replaces the old DeliveryChainGraph as `/delivery-chain` main runtime.
- Manager owns policy validation, tool-call ordering, trace, RuntimeArtifact collection and final synthesis.
- Manager does not expose raw `SubagentToolInvocation` or raw `SubagentToolResult` to stream/UI.
- Manager uses fake tool-call model in tests.

### Subagent tool boundary

- Subagent tools are delivery-chain-local capabilities.
- They may reuse existing stage prompt content from current Delivery Chain.
- They must return strong JSON result parsed by schema.
- They do not directly call each other.
- They do not call Tasklist Agent.
- They do not write stream chunks directly unless routed through Manager-safe progress helpers.

### Tool system integration strategy

Use existing patterns where they are a contract fit:

- `ChatToolDefinition` shape and `StructuredToolInterface` style from `apps/webapp/lib/ai/tools/registry.ts`。
- 统一 tool registry 可增加最小 `ToolRuntimeScope` 过滤，区分 `skill-binding` 与 `delivery-chain-manager`。
- Zod schema validation from current tool definitions。
- Tool call normalization and validation patterns from `apps/webapp/lib/ai/runtime/tool-runtime/validation.ts`。
- Model `bindTools` from `apps/webapp/lib/ai/runtime/chat-session.ts` and provider handle types。

Use the unified tool execution core with scope-based transcript suppression:

- `executeToolCall()` in `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts` already owns tool invoke, result extraction, `ToolMessage` wrapping and `rawResult` handoff.
- v0.4.0 should reuse that execution core, but `runtimeScope='delivery-chain-manager'` must suppress user-visible `tool-*` / `resource-*` chunks.
- Manager still emits only `workflow-progress-*` curated summaries; delivery-chain subagent delegation does not become a public debug transcript.
- 不要求把 delivery-chain artifact / manager contract 全部提升到全局 tools 层；只统一 `ChatToolDefinition` 与 scope-aware execution 入口。

## Recommended File Changes

### Runtime

- `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
    - keep invocation parsing and public entry.
    - change `startDeliveryChainRun()` to call `ControlledDeliveryManager` instead of `runDeliveryChainGraph()`.
    - keep current fail-closed boundary messages.
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts`
    - define `RuntimeArtifact`, `SubagentToolDefinition`, `SubagentToolInvocation`, `SubagentToolResult`, `SubagentToolInvocationTrace`。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`
    - define policy and validation helpers。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tool-schemas.ts`
    - define strong JSON schemas for tool args and tool result。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
    - define local `plan-subagent` / `task-subagent` / `review-subagent` tool definitions。
- `apps/webapp/lib/ai/tools/registry.ts`
    - add minimal `ToolRuntimeScope` type and scope-aware registry helpers。
- `apps/webapp/lib/ai/tools/index.ts`
    - expose scope-filtered tool-definition helpers for capability binding and internal runtimes。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
    - implement tool-calling loop, safe trace, artifact handoff, report synthesis。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/workflow-progress.ts`
    - map manager stages to safe `workflow-progress-*` summaries if extracting from current `index.ts` improves readability。

### Tests

- `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
    - update entry regression around `startDeliveryChainRun()`。
- `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
    - contract / policy / result schema tests。
- `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
    - fake tool-call model tests for serial delegation。
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
    - non-regression for `/tasklist`, `/delivery-chain` entry selection and no ordinary tool fallback。
- Existing stream / reducer tests:
    - `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
    - `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
    - `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`
    - `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

### Docs

- `specs/040-controlled-agent-as-tool-delivery-manager-mvp/*`
- `docs/architecture/agent-runtime-roadmap.md`
- `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md`

## Implementation Phases

### Phase 1: Contract and schema foundation

目标：新增 delivery-chain-local contracts、Zod schemas 和 DelegationPolicy。

涉及文件：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tool-schemas.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`
- `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`

风险：抽象外溢成全局 Agent Catalog。

验收标准：类型只在 delivery-chain 内部使用；schema tests 通过；没有 import Tasklist Agent。

### Phase 2: Subagent tools

目标：实现 plan/task/review 子 Agent tools，复用现有 stage prompt，但输出强 JSON result。

涉及文件：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 中现有 prompt 可被迁移或复用。
- `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`

风险：tool 变成普通函数 runner；缺少输入/输出 boundary。

验收标准：缺 plan 时 task 不能 completed；缺 plan/tasks 时 review 不能 completed；failed 不生成正式 artifact。

补充约束：如果复用统一 tool registry，只允许通过 `ToolRuntimeScope` 做最小过滤，不新增 `ToolVisibility`。

### Phase 3: ControlledDeliveryManager

目标：实现受控 tool-calling loop、policy validation、safe trace、RuntimeArtifact handoff 和 final report synthesis。

涉及文件：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/workflow-progress.ts`
- `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`

风险：被误解成自由 Supervisor；模型乱序 tool call 后处理不一致。

验收标准：Manager trace 有 3 次合法 delegation；`maxToolCalls` 生效；非法 tool call fail closed；没有 correction loop。

### Phase 4: `/delivery-chain` integration

目标：让 `startDeliveryChainRun()` 调用 Manager，旧 `DeliveryChainGraph` 不再作为主执行路径。

涉及文件：

- `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

风险：graph 和 manager 双主控；模型 capability 校验位置不清。

验收标准：`/delivery-chain` happy path 输出兼容当前 report UI；模型不支持 tool-calling 时安全失败；boundary fail-closed 行为不变。

### Phase 5: Regression and docs close

目标：补 non-regression，确认 public surface、Tasklist Agent、stream/reducer、demo boundary 均不退化。

涉及文件：

- `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
- `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`
- `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- `docs/architecture/agent-runtime-roadmap.md`
- `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md`

风险：为了测试而改 public schema；文档和实现漂移。

验收标准：focused tests / typecheck / lint / `git diff --check` 通过；文档不描述未实现能力。

## Risks

### P0: tool-calling 被实现成 runner fallback

风险：如果模型不支持 tool-calling 时自动回退普通函数调用，v0.4.0 的 Agent-as-tool 价值会变虚。

规避：fail closed；测试覆盖 `bindTools` 缺失和 `requireToolCalling` 能力缺失。

### P0: graph 和 manager 双主控

风险：保留旧 `DeliveryChainGraph` 同时新增 Manager 会形成两个 orchestration source of truth。

规避：主链路由 Manager 替代 graph；旧 graph 不作为执行路径保留。

### P1: 普通 tool transcript 泄露到 UI

风险：如果 scope 分流不完整，直接复用 `executeToolCall()` 仍会发 `tool-start/tool-end` 或 `resource-start/resource-end`。

规避：在 `executeToolCall()` 内按 `runtimeScope='delivery-chain-manager'` 走静默 transcript 分流；Manager 只 emit `workflow-progress-*` curated summary。

### P1: RuntimeArtifact 过早全局化

风险：抽成全局 artifact / Agent Catalog 会引出 `@artifact://`、DB、frontend artifact chip 和 persistence。

规避：放在 `delivery-chain/manager/` 内部，不导出给 frontend message。

### P1: Tasklist Agent 污染

风险：误把 `task-subagent` 接到现有 Tasklist Agent HITL Graph。

规避：子 Agent tool 不 import `version-plan-tasklist-agent/**`；non-regression test 冻结 `/tasklist`。

### P2: 测试数量增加

风险：contract / manager / integration / regression tests 会增多。

规避：fake model 主测，stream/reducer 只做 schema non-regression，不新增 UI 大改。

## Post-design Constitution Check

通过。设计未新增 DB、stream protocol、HITL、checkpoint、resume 或 public route；新增抽象只限 delivery-chain 内部，符合 Controlled Agent First 和 Minimal Abstraction。
