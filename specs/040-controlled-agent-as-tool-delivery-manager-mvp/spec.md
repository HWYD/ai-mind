# Spec 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Planning
版本: v0.4.0
日期: 2026-07-01
建议 Change Level: Level C - Controlled Agent Runtime Extension

## 评估结论

v0.4.0 的正式目标是把 `/delivery-chain` 从固定 LangGraph stage workflow 推进为 **Controlled Agent-as-tool Delivery Manager MVP**。

本版本不是自由 Supervisor，不是全局 Agent Catalog，也不是开放式多 Agent 平台。它只服务 `/delivery-chain`，只允许 `ControlledDeliveryManager` 通过受控 tool-calling loop 调用三个子 Agent tools：

```text
plan-subagent tool
task-subagent tool
review-subagent tool
```

所有 tool call 都必须经过代码层 `DelegationPolicy` 校验。模型可以发起 tool call，但不能突破固定顺序、次数、输入 artifact 和允许列表。

子 Agent tool 必须优先复用项目现有 tool 体系的注册、Zod schema 校验和模型 tool binding 心智模型，但 v0.4.0 不把这三个子 Agent tool 加入全局用户可选工具列表。tool result 采用强 JSON Schema 契约；Manager runtime 负责把合法 JSON result 转换成 run-local `RuntimeArtifact` 和最终报告。

## Summary

目标架构：

```text
/delivery-chain request
  -> resolveDeliveryChainInvocation
  -> load demo context
  -> ControlledDeliveryManager
       -> controlled tool-calling loop
       -> call plan-subagent tool
       -> receive PlanSubagentToolResult
       -> call task-subagent tool with plan artifact
       -> receive TaskSubagentToolResult
       -> call review-subagent tool with plan + tasks artifacts
       -> receive ReviewSubagentToolResult
       -> synthesize Delivery Chain Report
  -> output final report
```

v0.4.0 的核心变化是内部 runtime 形态变化。Public surface 保持不变：

- 仍然只有 `/delivery-chain`。
- 不新增 `/plan`、`/task`、`/review`。
- 不新增用户可选 subagent picker。
- 不新增 `@artifact://`。
- 不新增 DB / persistence。

## Goals

- 新增只服务 `/delivery-chain` 的 `ControlledDeliveryManager`。
- 新增受控 tool-calling loop，让 Manager 通过模型 tool call 调用子 Agent tools。
- 新增 `plan-subagent tool`、`task-subagent tool`、`review-subagent tool`。
- 子 Agent tool result 必须通过强 JSON Schema 校验，不接受自由格式 raw text 作为正式 result。
- 新增 run-local `RuntimeArtifact`，用于 plan、tasks、review、delivery_report 的内部交接。
- 新增 `SubagentToolDefinition`、`SubagentToolInvocation`、`SubagentToolResult`、`SubagentToolInvocationTrace` 和 `DelegationPolicy`。
- 固定执行顺序为 `plan -> task -> review -> manager synthesis`。
- 复用现有 `/delivery-chain` demo context boundary。
- 复用现有 `workflow-progress-*`，只展示安全摘要。
- 保持最终 Delivery Chain Report 的展示格式兼容现有 UI。
- 保持 `/tasklist`、Tasklist Agent Graph、HITL、checkpoint / resume、AgentRun 持久化边界不变。
- 当前模型不支持 tool-calling 时必须 fail closed，不得自动降级成普通 runner / fixed stage workflow。

## Non-goals

v0.4.0 不做：

- 不做自由 Supervisor Agent。
- 不做无约束 LLM dynamic routing。
- 不做开放式 tool registry。
- 不做用户可见的全局 subagent tool registry。
- 不做全局 Agent Catalog。
- 不做用户可选 Agent。
- 不做 Agent group chat。
- 不做 subagent-to-subagent 通信。
- 不做 Agent message bus。
- 不做 nested subagent。
- 不做 parallel subagents。
- 不做 HITL。
- 不做 checkpoint。
- 不做 resume。
- 不做 DB / persistence。
- 不新增 `/plan`、`/task`、`/review`。
- 不新增 `@artifact://`。
- 不修改 `@` 菜单。
- 不新增 composer artifact chip。
- 不让 `/delivery-chain` 调用 Tasklist Agent HITL Graph。
- 不把 Tasklist Agent 包装成 Delivery Chain 子 Agent tool。
- 不把 RuntimeArtifact 写入 frontend `message.artifacts`。
- 不把 RuntimeArtifact 写入 `artifact-*` stream chunks。
- 不暴露 raw prompt、raw response、provider config、API key、cookie、stack 或真实文件路径。
- 不把非法 tool call 交给模型二次纠错；MVP 直接 fail closed。
- 不保留旧 `DeliveryChainGraph` 作为 `/delivery-chain` 主执行路径。

## User Stories

### US1: Manager 通过受控 tool-calling 执行 Delivery Chain

作为 reviewer，我希望 `/delivery-chain` 不再只是固定 stage workflow，而是由 `ControlledDeliveryManager` 通过受控 tool call 调用 Plan / Task / Review 子 Agent tools，这样可以展示 AI Mind 的 Agent-as-tool 架构雏形。

独立验收：

- `/delivery-chain` 进入 `ControlledDeliveryManager`。
- Manager 可以调用 `plan-subagent tool`。
- Manager 可以在 plan artifact 完成后调用 `task-subagent tool`。
- Manager 可以在 plan + tasks artifact 完成后调用 `review-subagent tool`。
- Manager 最终综合生成 Delivery Chain Report。

### US2: 非法 tool call fail closed

作为维护者，我希望模型即使发出乱序、重复、超次数或未注册 tool call，也不能破坏受控流程。

独立验收：

- 缺少 plan artifact 时，`task-subagent tool` 不得 completed。
- 缺少 plan 或 tasks artifact 时，`review-subagent tool` 不得 completed。
- 未注册 tool call 必须 fail closed。
- 超过 `maxToolCalls = 3` 必须 fail closed。
- 乱序 tool call 必须 fail closed。
- failed tool result 不得伪装成正式 artifact。

### US3: RuntimeArtifact 只在 run-local 内部交接

作为维护者，我希望 plan / tasks / review / delivery_report artifact 只在 Manager 本轮运行内部使用，不变成 public artifact 或持久化数据。

独立验收：

- `RuntimeArtifact(kind = "plan")` 只来自 `plan-subagent tool` completed result。
- `RuntimeArtifact(kind = "tasks")` 只来自 `task-subagent tool` completed result。
- `RuntimeArtifact(kind = "review")` 只来自 `review-subagent tool` completed / blocked result。
- `RuntimeArtifact(kind = "delivery_report")` 只由 Manager synthesis 生成。
- RuntimeArtifact 不进入 frontend `message.artifacts`。
- RuntimeArtifact 不进入 `artifact-*` stream chunks。
- RuntimeArtifact 不进入 DB。

### US4: Workflow progress 只展示安全摘要

作为用户，我希望仍能看到 `/delivery-chain` 的执行进度，但不看到底层 raw tool call transcript。

独立验收：

- progress step 可以展示“Manager 调用 Plan Subagent Tool”等安全摘要。
- progress chunk 不包含 raw `SubagentToolInvocation`。
- progress chunk 不包含 raw `SubagentToolResult`。
- progress chunk 不包含 RuntimeArtifact。
- progress panel 不变成 debug transcript。

### US5: Tasklist Agent 不退化

作为维护者，我希望 v0.4.0 不影响已有 `/tasklist`。

独立验收：

- `/tasklist` 路由不变。
- Tasklist Agent Graph topology 不变。
- Tasklist Agent HITL decision contract 不变。
- `/tasklist` 不使用 `ControlledDeliveryManager`。
- `/delivery-chain` 子 Agent tools 不调用 Tasklist Agent HITL Graph。

## Functional Requirements

### Public Surface

- FR-040-01: 系统必须继续只通过 `/delivery-chain` 触发本能力。
- FR-040-02: 系统不得新增 `/plan`、`/task`、`/review`。
- FR-040-03: 系统不得新增用户可选 subagent picker。
- FR-040-04: 系统不得修改 `@` 菜单或新增 `@artifact://`。
- FR-040-05: 系统必须继续支持 demo scenario input。
- FR-040-06: 系统必须继续支持 inline requirement input。

### Controlled Manager

- FR-040-07: 系统必须新增 `ControlledDeliveryManager` 作为 `/delivery-chain` 的主控 runtime。
- FR-040-08: `ControlledDeliveryManager` 必须只服务 `/delivery-chain`。
- FR-040-09: `ControlledDeliveryManager` 不得读取真实 repo resources。
- FR-040-10: `ControlledDeliveryManager` 不得写 DB。
- FR-040-11: `ControlledDeliveryManager` 不得触发 HITL、checkpoint 或 resume。
- FR-040-12: `ControlledDeliveryManager` 必须记录 run-local safe trace。
- FR-040-13: 当前模型未声明 tool-calling 能力或运行时没有 `bindTools` 时，`ControlledDeliveryManager` 必须 fail closed，不得降级为 runner。

### Subagent Tools

- FR-040-14: 系统必须定义 `plan-subagent tool`。
- FR-040-15: 系统必须定义 `task-subagent tool`。
- FR-040-16: 系统必须定义 `review-subagent tool`。
- FR-040-17: 每个 `SubagentToolDefinition` 必须包含独立 roleInstruction。
- FR-040-18: 每个 `SubagentToolDefinition` 必须包含 input artifact boundary。
- FR-040-19: 每个 `SubagentToolDefinition` 必须包含 output artifact boundary。
- FR-040-20: 每个 `SubagentToolDefinition` 必须包含 nonGoals。
- FR-040-21: 子 Agent Tool 不得直接互相调用。
- FR-040-22: 子 Agent Tool 不得控制最终用户输出。
- FR-040-23: 子 Agent Tool 必须优先复用现有 tool 体系的 `ChatToolDefinition`、Zod schema 和 LangChain structured tool 适配方式。
- FR-040-24: 子 Agent Tool 不得注册到普通聊天用户可选 tool 列表或 capability catalog；如果复用统一 tool registry / tool runtime，必须通过 runtime scope filtering 将其限制在 `delivery-chain-manager` scope，并阻止普通 `tool-*` / `resource-*` transcript 暴露到用户 UI。

### Tool-calling Policy

- FR-040-25: Manager 必须通过受控 tool-calling loop 调用子 Agent tools。
- FR-040-26: 允许注册的子 Agent tools 只能是 `plan-subagent`、`task-subagent`、`review-subagent`。
- FR-040-27: `maxToolCalls` 必须为 3。
- FR-040-28: 不允许 parallel tool calls。
- FR-040-29: 不允许 nested delegation。
- FR-040-30: Plan 必须先于 Task。
- FR-040-31: Task 必须消费 Plan artifact。
- FR-040-32: Review 必须消费 Plan + Tasks artifact。
- FR-040-33: 违反 policy 必须 fail closed 或返回安全失败摘要。
- FR-040-34: 非法、乱序、重复、parallel 或未注册 tool call 不进入二次纠错 loop。

### RuntimeArtifact

- FR-040-35: `RuntimeArtifact` 必须只在单次 run 内使用。
- FR-040-36: `RuntimeArtifactKind` 至少包含 `plan`、`tasks`、`review`、`delivery_report`。
- FR-040-37: `RuntimeArtifact` 不得进入 frontend `message.artifacts`。
- FR-040-38: `RuntimeArtifact` 不得进入 `artifact-*` stream chunks。
- FR-040-39: `RuntimeArtifact` 不得进入 DB。
- FR-040-40: `RuntimeArtifact` 不得暴露 raw prompt、raw response、provider config、stack 或真实文件路径。

### Stream and UI Boundary

- FR-040-41: 系统必须继续复用 `workflow-progress-*`。
- FR-040-42: progress detail 只能包含 curated safe summary。
- FR-040-43: progress chunk 不得包含 raw tool invocation、raw tool result 或 RuntimeArtifact。
- FR-040-44: 不得新增完整 Agent trace UI。
- FR-040-45: 最终 report 格式必须兼容现有 Delivery Chain Report UI。
- FR-040-46: 子 Agent tool 执行不得泄露为普通 `tool-start/tool-end` transcript 或完整 debug transcript。

### Tasklist Agent Non-regression

- FR-040-47: `/tasklist` 路由必须不变。
- FR-040-48: Tasklist Agent Graph topology 必须不变。
- FR-040-49: Tasklist Agent HITL decision contract 必须不变。
- FR-040-50: `/tasklist` 不得使用 `ControlledDeliveryManager`。
- FR-040-51: `/delivery-chain` 子 Agent tools 不得调用 Tasklist Agent HITL Graph。

### Strong Tool Result Schema

- FR-040-52: 子 Agent tool 的 raw result 必须先通过强 JSON Schema 校验，再被转换为 `SubagentToolResult`。
- FR-040-53: `SubagentToolResult.status = "failed"` 时不得生成正式 `RuntimeArtifact`。
- FR-040-54: `summaryForManager` 必须是安全摘要，不得包含 prompt、raw provider error、stack、provider config、API key、cookie 或真实文件路径。

## Key Entities and Contracts

### RuntimeArtifact

```ts
type RuntimeArtifactKind = 'plan' | 'tasks' | 'review' | 'delivery_report'

type RuntimeArtifact = {
    id: string
    kind: RuntimeArtifactKind
    title: string
    markdown: string
    source: {
        subagentId?: string
        stage?: string
    }
    metadata?: Record<string, unknown>
}
```

### SubagentToolDefinition

```ts
type SubagentToolId = 'plan-subagent' | 'task-subagent' | 'review-subagent'

type SubagentToolDefinition = {
    id: SubagentToolId
    displayName: string
    description: string
    roleInstruction: string
    inputArtifactKinds: RuntimeArtifactKind[]
    outputArtifactKinds: RuntimeArtifactKind[]
    allowedContextKinds: string[]
    allowedTools: string[]
    nonGoals: string[]
}
```

### SubagentToolInvocation

```ts
type SubagentToolInvocation = {
    invocationId: string
    subagentId: SubagentToolId
    instruction: string
    contextBlocks: AgentContextBlock[]
    inputArtifacts: RuntimeArtifact[]
    constraints: string[]
    startedAt: string
}
```

### SubagentToolResult

```ts
type SubagentToolResult = {
    invocationId: string
    subagentId: SubagentToolId
    status: 'completed' | 'blocked' | 'failed'
    markdown: string
    artifacts: RuntimeArtifact[]
    warnings: string[]
    summaryForManager: string
    endedAt: string
}
```

### SubagentToolJsonResult

`SubagentToolJsonResult` 是 tool 的强 JSON Schema 输出。实现时应以 Zod schema 作为事实源，再推导 TypeScript 类型。

```ts
type SubagentToolJsonResult = {
    status: 'completed' | 'blocked' | 'failed'
    markdown: string
    artifactTitle?: string
    warnings: string[]
    summaryForManager: string
    metadata?: Record<string, unknown>
}
```

Manager 只能把 schema 校验通过的 `SubagentToolJsonResult` 转换成 `SubagentToolResult`。自由文本、无法解析 JSON、额外敏感字段或 schema 不合法 result 均按安全失败处理。

### DelegationPolicy

```ts
const deliveryChainDelegationPolicy = {
    allowedSubagentTools: ['plan-subagent', 'task-subagent', 'review-subagent'],
    maxToolCalls: 3,
    allowParallel: false,
    allowNestedDelegation: false,
    requirePlanBeforeTask: true,
    requireTasksBeforeReview: true,
    rejectUnregisteredTools: true,
    rejectOutOfOrderToolCalls: true,
}
```

## Edge Cases

- 模型先调用 `task-subagent tool`：fail closed。
- 模型先调用 `review-subagent tool`：fail closed。
- 模型重复调用 `plan-subagent tool`：超过合法状态时 fail closed。
- 模型调用未注册 tool：fail closed。
- 模型发起 parallel tool calls：fail closed。
- 当前模型不支持 tool-calling：fail closed，不降级为 runner。
- tool result 不是合法 JSON：fail closed，不生成正式 RuntimeArtifact。
- tool result failed：不得生成正式 RuntimeArtifact。
- review blocked：可以生成带 blocked metadata 的 review artifact。
- provider error：只输出安全摘要，不暴露 raw provider error。
- demo context 缺失：按现有 `/delivery-chain` resource boundary fail closed 或安全降级。

## Test Requirements

- plan-subagent completed 输出 plan artifact。
- task-subagent 缺少 plan artifact 时不能 completed。
- review-subagent 缺少 plan/tasks artifact 时不能 completed。
- Manager 按 policy 接受合法 tool call。
- Manager 拒绝乱序 tool call。
- Manager 拒绝未注册 tool call。
- `maxToolCalls` 生效。
- no parallel / no nested delegation。
- failed subagent tool 不生成正式 artifact。
- workflow progress 不暴露 raw invocation / raw result / RuntimeArtifact。
- `/tasklist` non-regression。
- stream schema non-regression。
- frontend reducer non-regression。
- `@demo://` boundary non-regression。

## Success Criteria

v0.4.0 完成后，项目应该能清楚回答：

- `/delivery-chain` 为什么从 fixed stage workflow 演进为 Controlled Agent-as-tool Manager？
- Manager 是如何通过 tool-calling 调用子 Agent tools 的？
- 为什么这不是自由 Supervisor？
- 为什么这不是全局 Agent Catalog？
- 为什么 `task-subagent tool` 不等于现有 Tasklist Agent？
- RuntimeArtifact 为什么只在 run-local 内部使用？
- 为什么本版本仍不做 `@artifact://`、DB、HITL、checkpoint 或 resume？
