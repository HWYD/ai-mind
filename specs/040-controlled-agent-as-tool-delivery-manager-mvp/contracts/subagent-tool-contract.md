# Contract 040: Subagent Tool and RuntimeArtifact

状态: Planning
版本: v0.4.0
日期: 2026-07-01

## Purpose

定义 `/delivery-chain` 内部 `ControlledDeliveryManager` 与三个子 Agent tools 的 contract。

本 contract 不是 public API，不是 DB schema，不是 frontend artifact schema。

## Tool ids

```ts
type SubagentToolId = 'plan-subagent' | 'task-subagent' | 'review-subagent'
```

Allowed tools:

- `plan-subagent`
- `task-subagent`
- `review-subagent`

Forbidden:

- Any unregistered tool.
- Tasklist Agent HITL Graph.
- User-selected arbitrary tools.
- MCP tools unless explicitly whitelisted in a later version.

## Tool input schema

每个子 Agent tool 都必须有 Zod input schema。建议 shape：

```ts
type SubagentToolInput = {
    instruction: string
    contextBlocks: Array<{
        kind: string
        title: string
        markdown: string
    }>
    inputArtifacts: Array<{
        id: string
        kind: 'plan' | 'tasks' | 'review' | 'delivery_report'
        title: string
        markdown: string
        source: {
            subagentId?: SubagentToolId
            stage?: string
        }
        metadata?: Record<string, unknown>
    }>
    constraints: string[]
}
```

Validation:

- `plan-subagent.inputArtifacts` must be empty.
- `task-subagent.inputArtifacts` must include exactly one `plan` artifact.
- `review-subagent.inputArtifacts` must include `plan` and `tasks` artifacts.
- `instruction` and context markdown must not include raw provider config, API key, cookie, stack, real filesystem path, or raw prompt transcript.

## Tool output schema

Raw tool result must be strong JSON:

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

- Must pass Zod schema.
- Unknown fields may be rejected or stripped, but sensitive fields must never pass through.
- `status='completed'` requires non-empty `markdown`.
- `status='failed'` must not produce formal artifact.
- `status='blocked'` is only expected for `review-subagent` in v0.4.0.
- `summaryForManager` must be curated and safe.

## Normalized result

Manager wraps schema-valid JSON into:

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

Rules:

- A failed result has `artifacts = []`.
- A completed plan result creates one `RuntimeArtifact(kind='plan')`.
- A completed task result creates one `RuntimeArtifact(kind='tasks')`.
- A completed review result creates one `RuntimeArtifact(kind='review')`.
- A blocked review result may create one `RuntimeArtifact(kind='review', metadata: { blocked: true })`.

## Delegation policy

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

Policy failures:

- Return safe failure summary.
- Do not ask model to retry.
- Do not execute the invalid tool call.
- Do not generate formal RuntimeArtifact.

## RuntimeArtifact contract

```ts
type RuntimeArtifact = {
    id: string
    kind: 'plan' | 'tasks' | 'review' | 'delivery_report'
    title: string
    markdown: string
    source: {
        subagentId?: SubagentToolId
        stage?: string
    }
    metadata?: Record<string, unknown>
}
```

Non-persistence:

- Not DB.
- Not stream artifact.
- Not frontend message artifact.
- Not chat persistence.
- Not cross-session handoff.

Security:

- No raw prompt.
- No raw response.
- No provider config.
- No stack.
- No API key.
- No cookie.
- No real filesystem path.

## Model capability contract

Manager must require tool-calling:

- If selected catalog model lacks tool-calling capability: fail closed.
- If model handle lacks `bindTools`: fail closed.
- No runner fallback.

## Existing tool system compatibility

Implementation should align with:

- `apps/webapp/lib/ai/tools/registry.ts`
- `apps/webapp/lib/ai/runtime/tool-runtime/validation.ts`
- existing Zod-based tool definitions under `apps/webapp/lib/ai/tools/`

Implementation must not directly leak ordinary tool execution display chunks:

- `tool-start`
- `tool-end`
- raw tool validation transcript

If existing `executeToolCall()` is reused internally, it must provide a `delivery-chain-manager` silent transcript path so generic tool/resource chunks are not emitted for subagent delegation.
