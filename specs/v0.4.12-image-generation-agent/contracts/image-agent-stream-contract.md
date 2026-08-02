# Contract: Image Agent Stream

**Transport**: existing NDJSON `ChatStreamChunk` inside `StreamEventEnvelope`  
**Compatibility**: additive; existing chunk semantics remain unchanged

## Entry Contract

Accepted composer command:

```json
{
    "command": {
        "name": "image"
    }
}
```

The last user text supplies the image description. Empty or whitespace-only descriptions are rejected before a `StreamRun` is created.

The command parser accepts only an exact `/image` as the first non-whitespace token. It Unicode-NFC-normalizes the remaining description, trims Unicode whitespace, and requires `1..2000` Unicode code points before a run is created. `/imagex`, embedded `/image`, and ordinary drawing language remain ordinary chat. A request mixing text-to-image with any non-goal edit/reference/multi-result capability is rejected as one `IMAGE_CAPABILITY_UNSUPPORTED` request; it never silently extracts a text-to-image subset.

The server, not the client, selects:

```text
image model = doubao-seedream-5.0-lite
image endpoint = https://ark.cn-beijing.volces.com/api/plan/v3/images/generations
```

## Public Chunk: `image-brief`

Emitted once after ImageBrief succeeds:

```ts
interface ImageBriefChunk {
    type: 'image-brief'
    partId: string
    runId: string
    summary: {
        intent: string
        subjects: string[]
        scene?: string
        composition?: string
        style?: string
        lightingAndColor?: string
        visibleText?: string[]
        mustInclude: string[]
        avoid: string[]
        aspectRatio?: string
        assumptions: string[]
    }
}
```

Rules:

- strict schema; unknown keys rejected
- all strings trimmed and length-bounded
- arrays length-bounded
- read-only UI
- no internal prompt, inspection instruction, reasoning, provider config or moderation data

The exact field/item bounds are owned by `spec.md` §Implementation-Ready Rules and are shared by the internal ImageBrief schema and this public projection.

## Public Chunk: `image-result-ready`

Emitted only after the temporary result is atomically published for an active run:

```ts
interface ImageResultReadyChunk {
    type: 'image-result-ready'
    partId: string
    runId: string
    contentPath: string
    suggestedFileName: string
    temporary: true
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
    width?: number
    height?: number
    expiresAt: string
}
```

Rules:

- `contentPath` must equal `/api/chat/runs/{runId}/image`; absolute/external URLs rejected.
- `suggestedFileName` is server-generated and contains no user path separators.
- `expiresAt` is always present and equals the earlier of a reliable provider expiry and 10 minutes after the result becomes ready; when provider expiry is unavailable, it is ready time plus 10 minutes.
- no provider URL, Base64 or bytes.
- exactly one ready chunk per successful image run.
- never emitted after cancel intent or terminal cancel.

## Progress Contract

Reuse:

```text
workflow-progress-start
workflow-progress-step
workflow-progress-end
```

`workflowKind = "image_generation"` and safe public step IDs:

| Step         | Public title     |
| ------------ | ---------------- |
| `received`   | 已接收生图请求   |
| `brief`      | 正在整理画面需求 |
| `prompt`     | 正在优化生图描述 |
| `generation` | 正在生成图片     |
| `result`     | 正在准备预览     |

Progress is AI Mind runtime progress, not provider percentage. It must not reveal node prompt, issue details or model reasoning.

Terminal-path mapping:

| Path                                             | Final progress/error                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| completed result                                 | `workflow-progress-end(completed)` after `image-result-ready`                       |
| prompt blocked after inspection                  | prompt step failed + `IMAGE_PROMPT_BLOCKED` + failed end                            |
| planning schema/budget failure                   | active brief/prompt step failed + `IMAGE_PROMPT_PLANNING_FAILED` + failed end       |
| provider content rejection                       | generation step failed + `IMAGE_PROVIDER_CONTENT_REJECTED` + failed end             |
| provider auth/busy/unavailable/invalid/ambiguous | generation or result step failed + mapped code + failed end                         |
| user cancellation                                | current step cancelled + `workflow-progress-end(cancelled)`; no error/ready follows |

## Success Event Order

```text
start
workflow-progress-start
workflow-progress-step(received)
workflow-progress-step(brief)
image-brief
workflow-progress-step(prompt)
workflow-progress-step(generation)
workflow-progress-step(result)
image-result-ready
workflow-progress-end(completed)
finish
StreamEvent terminal(completed)
```

The frontend waits for completed assistant state before fetching `contentPath`.

## Prompt-blocked Order

```text
start
workflow progress...
image-brief
workflow-progress-step(prompt, failed)
error(IMAGE_PROMPT_BLOCKED)
workflow-progress-end(failed)
finish
StreamEvent terminal(failed)
```

No `image-result-ready`; image generation count remains 0.

## Planning-output-invalid Order

If ImageBrief, PromptInspection or prompt-revision structured output fails strict parsing, the current model call still consumes one `maxPlanningModelCalls` unit. The same failure applies before any node call when the global counter is already 5 and another planning call would be required. The graph emits:

```text
start
workflow progress...
workflow-progress-step(brief or prompt, failed)
error(IMAGE_PROMPT_PLANNING_FAILED)
workflow-progress-end(failed)
finish
StreamEvent terminal(failed)
```

There is no hidden structure-repair model call, automatic retry, provider call or `image-result-ready`.

## Cancel Order

Client immediately shows cancelling/cancelled after the stop action. Server projection:

```text
cancel intent
StreamEvent terminal(cancelled)
```

No later ready or completed event is legal. Replay of a cancelled run remains cancelled.

The one-second UI criterion measures client acknowledgement from user stop action to visible cancelled state. It does not assert that the Provider has stopped inference; HTTP abort remains best-effort.

## Error Codes

Additive `StreamErrorCode` values:

```text
IMAGE_REQUEST_INVALID
IMAGE_CAPABILITY_UNSUPPORTED
IMAGE_GENERATION_ALREADY_ACTIVE
IMAGE_PROMPT_BLOCKED
IMAGE_PROMPT_PLANNING_FAILED
IMAGE_PROVIDER_CONTENT_REJECTED
IMAGE_PROVIDER_AUTH_FAILED
IMAGE_PROVIDER_BUSY
IMAGE_PROVIDER_UNAVAILABLE
IMAGE_GENERATION_AMBIGUOUS
IMAGE_PROVIDER_INVALID_RESULT
IMAGE_RESULT_EXPIRED
IMAGE_RESULT_UNAVAILABLE
```

Messages are stable, safe and actionable. Raw provider messages/request IDs never populate public `message`.

| Code family                                                 | Public wording / action                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `IMAGE_CAPABILITY_UNSUPPORTED`                              | 此版本仅支持单张文生图；移除编辑、参考图或多图要求后重新提交     |
| `IMAGE_PROMPT_BLOCKED`                                      | 描述中的关键要求无法同时满足；补充或澄清 `/image` 描述           |
| `IMAGE_PROMPT_PLANNING_FAILED`                              | 描述暂时无法安全整理；简化并重新提交 `/image` 描述               |
| `IMAGE_PROVIDER_CONTENT_REJECTED`                           | 生图服务拒绝该描述；修改描述后新建任务                           |
| `IMAGE_PROVIDER_AUTH_FAILED` / `IMAGE_PROVIDER_UNAVAILABLE` | 生图服务暂不可用；稍后新建任务                                   |
| `IMAGE_PROVIDER_BUSY`                                       | 生图服务繁忙；稍后新建任务                                       |
| `IMAGE_GENERATION_AMBIGUOUS`                                | 无法确认本次是否已被服务接受；不要自动重试，可稍后手动发起新任务 |
| `IMAGE_RESULT_*`                                            | 使用 temporary-content contract 中的结果可用性提示               |

## Replay Rules

- Strict schema validation applies during live consume and replay.
- Reducer application is idempotent by `partId/runId`.
- Same idempotency key/fingerprint returns the original `StreamRun` descriptor and resumes/replays its original owned assistant message; it never creates a second image run or second image card.
- Replayed `image-result-ready` may reconstruct the UI card only in an active owned stream consumer. Stable local snapshot does not persist it and product does not guarantee refresh recovery.
- A terminal cancelled event dominates any stale in-memory ready part.

## Route Ownership

| Route/action            | Required ownership rule                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `/api/chat` image start | derive current `ownerSessionHash`; idempotency/replay key is scoped to it         |
| stream replay/resume    | existing StreamRun ownership check must match the same session hash               |
| cancel route            | existing run cancellation ownership check must match the same session hash        |
| temporary content route | require the same owner plus completed/ready/non-cancelled/non-expired image state |

## Forbidden Payload Content

All new and existing chunks in an image run must be rejected or redacted if they contain:

```text
prompt
optimizedPrompt
internalBrief
graphState
providerUrl
base64
apiKey
authorization
cookie
rawError
moderationResponse
```

The existing stream projector sensitive-field guard remains a final boundary.
