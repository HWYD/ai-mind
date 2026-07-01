# Data Model 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Planning
版本: v0.4.0
日期: 2026-07-01

## Overview

本版本的数据模型全部是 run-local runtime contract，不是 DB model，不是 frontend message model，也不是 stream protocol model。

## RuntimeArtifact

Purpose:

- 在 Manager 本轮运行内交接 plan、tasks、review 和 delivery_report。

Fields:

```ts
type RuntimeArtifactKind = 'plan' | 'tasks' | 'review' | 'delivery_report'

type RuntimeArtifact = {
    id: string
    kind: RuntimeArtifactKind
    title: string
    markdown: string
    source: {
        subagentId?: SubagentToolId
        stage?: string
    }
    metadata?: Record<string, unknown>
}
```

Validation:

- `kind = 'plan'` 只来自 `plan-subagent` completed result。
- `kind = 'tasks'` 只来自 `task-subagent` completed result。
- `kind = 'review'` 可来自 `review-subagent` completed / blocked result。
- `kind = 'delivery_report'` 只由 Manager synthesis 生成。
- `markdown` 不得为空。
- 不允许包含 raw prompt、raw response、provider config、stack、API key、cookie 或真实文件路径。

Persistence:

- 不进入 DB。
- 不进入 `artifact-*` stream chunks。
- 不进入 frontend `message.artifacts`。

## SubagentToolDefinition

Purpose:

- 描述 delivery-chain-local 子 Agent tool 的角色、输入输出边界和非目标。

Fields:

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

Validation:

- `roleInstruction` 必须按子 Agent 独立定义。
- `allowedTools` 在 v0.4.0 应为空或只包含明确允许的内部能力；不得包含 Tasklist Agent HITL Graph。
- `inputArtifactKinds` 必须和 DelegationPolicy 对齐。

## SubagentToolInvocation

Purpose:

- 记录 Manager 对某个子 Agent tool 的一次受控调用。

Fields:

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

Validation:

- 只存在于本轮 run。
- `inputArtifacts` 只能来自本轮已完成 result。
- 不保存 raw prompt、raw response、provider config、API key、cookie 或 stack。

## SubagentToolJsonResult

Purpose:

- 子 Agent tool 的 raw structured output。它是 tool result schema 的事实源。

Fields:

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

Validation:

- 必须通过 Zod schema。
- `status = 'completed'` 时 `markdown` 必须能生成对应 output artifact。
- `status = 'failed'` 时不得生成正式 RuntimeArtifact。
- `summaryForManager` 必须是安全摘要。

## SubagentToolResult

Purpose:

- Manager 看到的规范化子 Agent result，由 schema 合法的 `SubagentToolJsonResult` 包装而来。

Fields:

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

Validation:

- `completed` 可以携带正式 artifact。
- `failed` 不得携带正式 artifact。
- review `blocked` 可以携带 `kind='review'` 且 metadata 标注 blocked 的 artifact。

## DelegationPolicy

Purpose:

- 固定 Manager 可接受的工具、顺序和数量。

Fields:

```ts
type DelegationPolicy = {
    allowedSubagentTools: SubagentToolId[]
    maxToolCalls: 3
    allowParallel: false
    allowNestedDelegation: false
    requirePlanBeforeTask: true
    requireTasksBeforeReview: true
    rejectUnregisteredTools: true
    rejectOutOfOrderToolCalls: true
}
```

Validation:

- 第一合法 tool call 必须是 `plan-subagent`。
- 第二合法 tool call 必须是 `task-subagent`，且已有 plan artifact。
- 第三合法 tool call 必须是 `review-subagent`，且已有 plan + tasks artifact。
- 任何违反 policy 的调用都 fail closed。

## SubagentToolInvocationTrace

Purpose:

- 保存本轮 run 的安全 delegation trace，可作为 workflow progress summary 来源。

Fields:

```ts
type SubagentToolInvocationTrace = {
    workflowId: string
    invocations: Array<{
        invocationId: string
        subagentId: SubagentToolId
        status: 'running' | 'completed' | 'blocked' | 'failed'
        summary: string
        startedAt: string
        endedAt?: string
    }>
}
```

Validation:

- 不进入 DB。
- 不等于 observability event store。
- 不暴露 raw prompt、raw response、stack 或 RuntimeArtifact markdown。

## State Transitions

```text
initialized
  -> context_loaded
  -> plan_delegated
  -> plan_completed
  -> task_delegated
  -> task_completed
  -> review_delegated
  -> review_completed | review_blocked
  -> report_synthesized
  -> completed | failed
```

Failure transitions:

- invalid model capability -> failed
- invalid tool call -> failed
- invalid JSON result -> failed
- policy violation -> failed
- provider/tool execution error -> failed safe summary
