# Internal Contract: Chat Context Budget

**Status**: Planned for v0.5.4
**Scope**: Server Runtime only

## Purpose

该 contract 固定 selected model 从物理窗口到可发送模型输入的完整决策链。它不是 chat input HTTP API，也不允许向 browser、stream consumer 或 Agent GraphState 暴露 raw context、预算明细或 Provider 配置。唯一例外是下文明确的只读用量聚合投影。

## Inputs

- selected model catalog item with `contextWindowTokens`
- provider environment (`cloud` or `ollama`)
- `chatMaxOutputTokens`
- operational cap config
- fully assembled non-memory model messages
- optional persisted `AiMindThreadState`
- optional dynamic tool definitions / capability context

## Budget Contract

```text
effectiveWindow = min(physicalWindow, environmentOperationalCap)
runtimeReserve = max(8192, ceil(effectiveWindow * 0.10))
hardInput = effectiveWindow - maxOutput - runtimeReserve
trigger = floor(hardInput * 0.70)
target = floor(hardInput * 0.35)
```

Default exact outputs:

```text
cloud:  effective=128000 reserve=12800 hard=111104 trigger=77772 target=38886
ollama: effective=32768  reserve=8192  hard=20480  trigger=14336 target=7168
```

Invalid configuration MUST fail before a Provider request; it MUST NOT silently fall back to the old character limit.

## Token Estimate Contract

- Count every Provider-visible role, text field and structured payload.
- Serialize tool call arguments/results and additional payload deterministically.
- Add 8 framing tokens per message and 3 per request.
- Apply 10% safety margin and round up.
- Return numbers only; never return raw content through logs or public DTO.

## Persistent Compaction Contract

Persistent compaction is eligible when either:

```text
chatMemoryTokens >= compactionTrigger
OR completeInputTokens > hardInput
```

One request may start at most one persistent attempt. A candidate is accepted only when all conditions hold:

```text
strict schema valid
AND complete-turn retention
AND candidateTokens <= target
AND candidateTokens < originalMemoryTokens
```

The generator covers previous summary, pins and all messages; its output is capped at 3,000 tokens. Persisted and generated `pinnedDecisions` are interpreted oldest-to-newest, with the newest item at the final index. Runtime—not the model—selects raw retained turns and sets `lastCompactedAt`.

## Cancellation Contract

The request `AbortSignal` MUST be forwarded unchanged from the Orchestrator through preflight and the memory service to the compaction generator and its structured model invocation. The runtime MUST check the signal before durable reads, after model completion and before durable writes.

If the signal is aborted or the generator raises `AbortError`, the error is control flow rather than a compaction failure: preserve the existing checkpoint, emit a terminal failed status when compaction has started, rethrow to the Orchestrator, and do not build an ephemeral fit or invoke the answer model. A cancellation observed before compaction begins emits no artificial started status.

## Preflight Contract

Every model call that injects chat memory MUST call the same preparation boundary after dynamic input assembly. The boundary returns exactly one of:

- `ready`: original input fits.
- `persistent-compaction`: valid persisted candidate was loaded and rebuilt input fits.
- `ephemeral-fit`: request-local memory projection fits; persisted state is unchanged.
- `non-memory-overflow`: non-chat-memory content alone exceeds hard input; throw existing `InputLengthExceededError`.

Provider implementations MUST receive a prepared input and MUST NOT apply an independent history deletion policy.

## Ephemeral Fit Contract

The projection MUST reserve non-memory content first and then consider, in order:

1. traverse the oldest-to-newest durable `pinnedDecisions` array from its final index and retain newest complete pins that fit; omit older pins from this request only when pins exceed the available memory budget
2. existing summary, request-local shortened if necessary
3. newest complete user/assistant turns

The result MUST be recounted and fit `hardInput`. Individual pins MUST NOT be truncated. The projection MUST NOT be persisted or returned by hydration; omitted pins remain unchanged in the durable checkpoint.

## Failure Contract

| Failure                             | Durable memory                                                                                 | Request behavior                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| generator throws/times out          | preserve summary/pins/lastCompactedAt; independently append completed turn after answer        | ephemeral fit                                        |
| output schema invalid               | same                                                                                           | ephemeral fit                                        |
| candidate not smaller/over target   | same                                                                                           | ephemeral fit                                        |
| candidate save fails                | preserve last durable checkpoint; independently attempt raw completed-turn append after answer | ephemeral fit                                        |
| request cancellation / `AbortError` | preserve existing checkpoint; no new durable write after cancellation is observed              | rethrow; no ephemeral fit or answer-model invocation |
| raw completed-turn append fails     | preserve last durable checkpoint; emit sanitized `raw-append-failed`                           | keep already produced answer valid                   |
| non-memory overflow                 | no destructive write                                                                           | standard input-length error                          |

## Public Compatibility Contract

Unchanged:

- `/api/ai/models` public fields
- `GET /api/chat/thread`
- `thread-memory-status` chunk schema
- frontend reducer and message part shape
- Prisma schema and checkpoint namespaces
- Tasklist/Delivery GraphState and RuntimeArtifact boundaries

## Client Completion Boundary

客户端仅在 protocol finish 后递增本地 completion revision，供 idle memory usage 刷新；不进入 DTO、snapshot 或持久存储。滚动不再依赖该 revision。展示身份、持久意图和测量边界定义于 [Chat Scroll Policy](chat-scroll-policy.md)。

## Read-only Chat Memory Usage Contract

`GET /api/chat/context-usage?conversationId={id}&modelId={id}` 是独立于 hydration 的 session-authorized read-only endpoint。它必须先验证 `conversationId`、当前 browser session 的 registry ownership 和 selected chat model 的 catalog/provider availability，再读取该会话 checkpoint。

它只可返回。生产者与消费者共同使用 `apps/webapp/lib/ai/runtime/chat-memory/context-usage-contract.ts` 的 strict schema，额外字段必须作为无效响应拒绝：

```ts
interface ChatMemoryUsageSummary {
    effectiveWindowTokens: number
    usedPercent: number
}
```

计算为：

```text
memoryTokens = estimateChatMemoryTokens(persistedThreadState)
usedPercent = round(memoryTokens / deriveContextBudget(selectedModel).effectiveWindowTokens * 100)
```

`memoryTokens` 只用于本次服务端计算，不能返回给 browser。不得改变 `GET /api/chat/thread`、hydration DTO 或 stream chunk。无 session ownership、无会话、模型不可用或 checkpoint 读取失败使用现有 route 风格的 sanitized error；client 隐藏提示且不阻断聊天。

## Observability Contract

Allowed log values are model IDs and numeric/enum diagnostics. Forbidden values include raw messages, summary, pins, prompt, tool payloads, raw provider errors, cookie/session values, API keys, base URLs and provider config.
