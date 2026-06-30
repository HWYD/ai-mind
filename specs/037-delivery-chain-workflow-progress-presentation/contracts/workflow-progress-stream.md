# Contract 037: Workflow Progress Stream

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

## Purpose

`workflow-progress-*` 是一个通用、轻量、可流式更新的执行过程展示 contract。

v0.3.7 的唯一生产者和消费者是 `/delivery-chain`，但命名和字段为未来 Agent / workflow 复用预留。

## Chunk types

### `workflow-progress-start`

```ts
{
    type: 'workflow-progress-start'
    partId: string
    workflowId: string
    workflowKind: string
    title: string
    summary?: string
    startedAt?: number
}
```

语义：

- 创建一个 `workflow-progress` message part。
- UI 默认 expanded。
- 不包含完整 step list。

### `workflow-progress-step`

```ts
{
    type: 'workflow-progress-step'
    partId: string
    workflowId: string
    stepId: string
    title: string
    status: 'running' | 'completed' | 'failed'
    summary?: string
    details?: string[]
    startedAt?: number
    endedAt?: number
    durationMs?: number
    failureMessage?: string
}
```

语义：

- 根据 `stepId` upsert 一个 step。
- step 首次出现时追加到 steps 列表末尾。
- step 后续更新时保持原位置。
- future step 不应提前 emit。

### `workflow-progress-end`

```ts
{
    type: 'workflow-progress-end'
    partId: string
    workflowId: string
    status: 'completed' | 'failed'
    summary?: string
    endedAt?: number
    durationMs?: number
    failureMessage?: string
}
```

语义：

- 标记 workflow progress part 完成。
- UI 默认 collapsed。
- 推荐在 final report text 输出前 emit。

## Delivery Chain event order

Scenario-backed happy path：

```text
start
step(load running)
step(load completed)
step(plan running)
step(plan completed)
step(task running)
step(task completed)
step(review running)
step(review completed)
step(report running)
step(report completed)
end(completed)
text-start/text-delta/text-end(report)
```

Inline requirement happy path：

```text
start
step(load running)
step(load completed)
step(plan running)
step(plan completed)
step(task running)
step(task completed)
step(review running)
step(review completed)
step(report running)
step(report completed)
end(completed)
text-start/text-delta/text-end(report)
```

Boundary fail-closed path：

```text
text-start/text-delta/text-end(boundary message)
```

说明：

- 空 `/delivery-chain`、forbidden resource、wrong scenario entry 不 emit workflow progress。
- 因为这些请求没有真正进入 workflow。

Soft fail path：

```text
start
step(...)
step(failed)
...
end(failed | completed with failed steps)
text-start/text-delta/text-end(safe report)
```

## Safety contract

Allowed fields：

- user-facing title
- safe summary
- safe detail lines
- public workflow kind
- public step id
- duration / timestamps for display
- sanitized failure message

Forbidden fields：

- raw GraphState
- raw Error object
- stack trace
- provider response body
- provider config
- prompt text
- API key
- session cookie
- real filesystem path
- private folder path
- resolver internals
- PostgresSaver checkpoint
- AgentRun / AgentInterrupt database row

Detail construction rule:

- `details` must be curated, presentation-safe summaries explicitly emitted by the runtime.
- `details` must not become an automatic replay channel for ordinary tool/resource/prompt events.

## Compatibility contract

- New chunks are additive.
- Existing chunk names and fields must not change.
- Unknown `workflowKind` must not affect existing reducers that do not consume this part.
- `/tasklist` must continue emitting `agent-graph-*` and must not be migrated to this contract in v0.3.7.
- Resource/tool/prompt chunks keep existing semantics.

## Presentation contract

The default `/delivery-chain` visual behavior:

- running: expanded panel
- completed / failed: collapsed panel
- summary: `已处理 <duration>` if `durationMs` exists, otherwise use safe `summary`
- click: toggle expanded/collapsed
- style: compact process panel, not a timeline
- detail: show a small number of safe lines per step

## Non-persistence contract

Workflow progress is not:

- persistent trace
- artifact
- checkpoint
- Agent event store entry
- database MessagePart schema
- resume state
- LangSmith trace UI

If a future version needs persistence or restore, it must define a new data-layer spec.
