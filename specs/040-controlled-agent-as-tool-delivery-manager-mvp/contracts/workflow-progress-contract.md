# Contract 040: Delivery Manager Workflow Progress

状态: Planning
版本: v0.4.0
日期: 2026-07-01

## Purpose

v0.4.0 继续使用现有 `workflow-progress-*` stream contract 表达 `/delivery-chain` 进度，但 step 语义从 fixed graph stage 调整为 Manager delegation。

本 contract 不新增 stream chunk，不新增 Agent trace UI。

## Existing protocol

现有 protocol 位于 `packages/stream-core/src/protocol/chat-stream-chunk.ts`：

- `workflow-progress-start`
- `workflow-progress-step`
- `workflow-progress-end`

前端 reducer 已在 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 消费这些 chunk。

## Recommended step order

```text
start
step(load-context running)
step(load-context completed)
step(delegate-plan running)
step(delegate-plan completed)
step(delegate-task running)
step(delegate-task completed)
step(delegate-review running)
step(delegate-review completed | failed)
step(synthesize-report running)
step(synthesize-report completed)
end(completed | failed)
text(report)
```

Step ids may use compact stable ids:

- `load-context`
- `delegate-plan`
- `delegate-task`
- `delegate-review`
- `synthesize-report`

## Allowed progress content

Allowed:

- safe title
- safe summary
- safe details
- public workflow id
- duration / timestamps
- sanitized failure message

Examples:

- `Manager 正在委派 Plan Subagent Tool`
- `Plan artifact 已生成`
- `Review Subagent Tool 返回 blocked，已生成安全评审摘要`

## Forbidden progress content

Forbidden:

- raw `SubagentToolInvocation`
- raw `SubagentToolResult`
- `RuntimeArtifact.markdown`
- full JSON tool result
- raw prompt
- raw provider response
- provider config
- API key
- cookie
- stack
- real filesystem path
- Tasklist Agent GraphState
- checkpoint payload
- AgentRun / AgentInterrupt database row

## Boundary failure behavior

Boundary failures should not start workflow progress:

- missing `/delivery-chain` input
- forbidden resource scheme
- wrong scenario entry file
- `@demo://version-plans/*.md` used with `/delivery-chain`
- invalid local resource

These should continue to output static safe text, matching the current boundary behavior.

## Tool policy failure behavior

Policy failure occurs after workflow has started. Expected behavior:

```text
start
step(current-step failed)
end(failed)
text(safe failure summary)
```

Policy failure summary must not include raw tool call args.

## UI behavior

- Running progress remains expanded.
- Completed / failed progress collapses after `workflow-progress-end`.
- Panel remains compact process summary, not timeline, transcript, or debug console.

## Compatibility

- No new chunk type.
- No stream-core union change.
- No reducer state shape change required.
- Existing workflow progress tests should continue to pass after expected step id/title updates.
- Existing artifact/resource/tool chunks keep their current semantics.
