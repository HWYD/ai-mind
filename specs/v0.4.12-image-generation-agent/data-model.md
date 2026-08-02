# Data Model: Image Generation Agent

**Feature**: v0.4.12 Image Generation Agent  
**Date**: 2026-07-28

## Model Boundaries

本版本存在三种状态，必须保持边界：

| State                    | Source of Truth                  | Lifetime                         | Contains                                                                         |
| ------------------------ | -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Graph execution state    | `ImageGenerationGraphState`      | 单次进程内 graph invocation      | raw description、internal ImageBrief、internal prompt、inspection、hard counters |
| Business run state       | `ImageGenerationRun`             | 短期 PostgreSQL metadata         | public brief、stage、counters、safe error、private provider URL、active lease    |
| Transport/recovery state | existing `StreamRun/StreamEvent` | existing stream retention window | idempotency、owner、cursor、public chunks、cancel intent、terminal status        |

不得把 GraphState、business state 和 StreamEvent 互相复制成完整镜像。

原始描述由既有 user chat message 生命周期保留，并在一次运行内作为 immutable `GraphState.input.rawDescription` 使用；`ImageGenerationRun`、`StreamEvent`、public DTO、日志和 provider metadata 均不复制 raw description、internal ImageBrief 或 internal prompt。任务终态后，Image Agent 不再新增一份这些内部数据的持久副本。

## Entity: Image Daily Quota Bucket

这是服务端限流存储中的进程内计数桶，不是 PostgreSQL 业务实体，也不进入 StreamEvent 或客户端 DTO。

| Field       | Type             | Rules                                              |
| ----------- | ---------------- | -------------------------------------------------- |
| `scope`     | `image`          | 与普通聊天、Tasklist、Delivery Chain 计数桶隔离    |
| `dimension` | `ip` / `session` | IP 作为防刷维度，Session 作为产品配额维度          |
| `key`       | string           | 服务端派生的 IP 或 Session 标识；不向客户端暴露    |
| `day`       | `YYYY-MM-DD`     | 服务端 UTC 自然日边界                              |
| `count`     | positive integer | Session 默认上限 3；IP 默认上限 10，可配置为 10–20 |

### Quota Counting Rules

- 仅新建且通过活动租约校验的 `/image` 任务计数一次。
- 无效/不支持请求、幂等重放和活动任务冲突不计数；已接受任务后续失败、取消或 Provider 失败仍保留计数。
- 达到任一维度上限后拒绝新任务；普通聊天请求不读取或增加 image 桶。
- 当前实现为进程内存桶，进程重启清零，多实例不共享；后续接入集中式存储时不得改变上述计数语义。

## Entity: ImageGenerationRun

新增 Prisma model，字段命名以实际 migration 为准：

| Field                      | Type                          | Rules                                                                       |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `id`                       | UUID                          | Primary key                                                                 |
| `streamRunId`              | UUID                          | Unique FK to `StreamRun`; one image run per stream run                      |
| `conversationId`           | string                        | Existing chat conversation identity                                         |
| `assistantMessageId`       | string                        | Associated assistant message                                                |
| `ownerSessionHash`         | varchar(64)                   | Server-derived; never public                                                |
| `activeOwnerSessionHash`   | varchar(64), nullable, unique | Equals owner while active; cleared atomically at terminal                   |
| `activeLeaseExpiresAt`     | timestamptz, nullable         | Bounds stale active lease                                                   |
| `status`                   | enum                          | `running`, `completed`, `failed`, `cancelled`                               |
| `stage`                    | enum                          | See lifecycle below                                                         |
| `promptRevisionCount`      | int                           | `0..1`                                                                      |
| `imageGenerationCount`     | int                           | `0..1`                                                                      |
| `publicBriefSummaryJson`   | JSON                          | Strict `PublicImageBriefSummary`, no internal prompt                        |
| `provider`                 | string                        | Fixed `doubao`                                                              |
| `providerModel`            | string                        | Fixed `doubao-seedream-5.0-lite`                                            |
| `providerRequestId`        | string, nullable              | Safe operational correlation only                                           |
| `providerResultUrl`        | text, nullable                | Server-private temporary URL; never log/stream/public DTO                   |
| `providerResultStatus`     | enum                          | `none`, `ready`, `expired`, `discarded`                                     |
| `providerResultMimeType`   | string, nullable              | Allowlisted value after validation                                          |
| `providerResultWidth`      | int, nullable                 | Positive if known                                                           |
| `providerResultHeight`     | int, nullable                 | Positive if known                                                           |
| `providerResultByteLength` | int, nullable                 | Set after content proxy validates bytes                                     |
| `providerResultExpiresAt`  | timestamptz, nullable         | Required for `ready`; `min(reliable provider expiry, readyAt + 10 minutes)` |
| `failureCode`              | string, nullable              | Stable safe code                                                            |
| `publicFailureMessage`     | varchar(1000), nullable       | Safe user-facing message                                                    |
| `createdAt`                | timestamptz                   | Creation time                                                               |
| `updatedAt`                | timestamptz                   | Last transition                                                             |
| `completedAt`              | timestamptz, nullable         | Terminal completion                                                         |
| `failedAt`                 | timestamptz, nullable         | Terminal failure                                                            |
| `cancelledAt`              | timestamptz, nullable         | Terminal cancellation                                                       |

### Database Invariants

- `streamRunId` unique.
- `activeOwnerSessionHash` unique when non-null; nullable unique provides one active image run per owner.
- Running rows require:
    - `activeOwnerSessionHash = ownerSessionHash`
    - non-null future `activeLeaseExpiresAt`
    - no terminal timestamp
- Terminal rows require:
    - `activeOwnerSessionHash = null`
    - `activeLeaseExpiresAt = null`
    - exactly one matching terminal timestamp
- `promptRevisionCount BETWEEN 0 AND 1`.
- `imageGenerationCount BETWEEN 0 AND 1`.
- `providerResultStatus = ready` requires:
    - `status = completed`
    - non-null HTTPS `providerResultUrl`
    - non-null future `providerResultExpiresAt`
    - `imageGenerationCount = 1`
- `providerResultStatus = expired` requires `providerResultUrl = null`; expiry transition is idempotent.
- `cancelled` or `failed` cannot expose a ready result; a late URL is discarded/not written.
- `providerResultUrl` must never be selected into a public DTO.

Some cross-field checks may be enforced by repository transition methods plus integration tests if Prisma cannot express them directly.

## Existing Entity Extension: StreamRun

Extend enum:

```text
StreamRunKind:
  chat
  tasklist_agent
  delivery_chain
  image_generation
```

No provider-specific fields are added to `StreamRun`.

The existing StreamRun terminal state remains authoritative for stream replay/cancel. `ImageGenerationRun.status` must be transitioned by the coordinator in the same logical operation; reconcile tests must reject conflicting terminal states.

## GraphState

Conceptual strict state:

```ts
interface ImageGenerationGraphState {
    input: {
        rawDescription: string
    }
    brief: {
        internal?: ImageBrief
        publicSummary?: PublicImageBriefSummary
    }
    prompt: {
        current?: string
        inspection?: PromptInspection
        revisionCount: 0 | 1
    }
    generation: {
        generationCount: 0 | 1
        temporaryResult?: InternalTemporaryImageResult
    }
    execution: {
        runId: string
        agentName: 'image-generation-agent'
        stage: ImageGenerationStage
        limits: {
            maxPlanningModelCalls: 5
            maxPromptRevisions: 1
            maxImageGenerations: 1
        }
    }
    output?: {
        status: 'completed' | 'failed' | 'cancelled'
        failureCode?: ImageGenerationFailureCode
        publicMessage?: string
    }
}
```

GraphState must not contain:

- Prisma/database client
- provider client
- `AbortSignal`
- request/response/writer
- API Key or cookie
- raw provider error
- raw LangChain/LangGraph runtime internals

## Value Object: ImageBrief

Internal strict schema:

| Field                     | Type                 | Notes                                 |
| ------------------------- | -------------------- | ------------------------------------- |
| `intent`                  | string               | Intended image purpose                |
| `subjects`                | array                | Main subjects and attributes          |
| `scene`                   | string, optional     | Environment/background                |
| `composition`             | string, optional     | Framing/viewpoint/layout              |
| `style`                   | string, optional     | Visual style                          |
| `lightingAndColor`        | string, optional     | Lighting/palette/mood                 |
| `visibleText`             | array, optional      | Exact text requested in image         |
| `mustInclude`             | array                | User constraints                      |
| `avoid`                   | array                | Negative constraints                  |
| `aspectRatio`             | enum/value, optional | Only supported values                 |
| `assumptions`             | array                | System defaults, explicitly separated |
| `unsupportedCapabilities` | array                | Edit/reference/multi-image etc.       |

The raw user description remains immutable in `input.rawDescription`; ImageBrief cannot overwrite it.

## Public DTO: PublicImageBriefSummary

Safe read-only projection:

```ts
interface PublicImageBriefSummary {
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
```

It excludes:

- internal execution prompt
- inspection suggestions
- model reasoning
- provider config
- moderation details
- raw GraphState

All public-summary fields use the exact item and length limits in `spec.md` §Implementation-Ready Rules; internal ImageBrief may hold no extra public-facing field beyond that schema.

## Value Object: PromptInspection

```ts
type PromptIssueCode =
    | 'MISSING_SUBJECT'
    | 'MISSING_CONSTRAINT'
    | 'CONFLICT'
    | 'UNSUPPORTED_CAPABILITY'
    | 'UNFOUNDED_ADDITION'
    | 'AMBIGUOUS_BLOCKING_REQUIREMENT'

interface PromptInspectionIssue {
    code: PromptIssueCode
    severity: 'blocking' | 'non_blocking'
    briefField: string
    revisionInstruction?: string
}

interface PromptInspection {
    decision: 'pass' | 'revise' | 'block'
    issues: PromptInspectionIssue[]
}
```

This is a structured decision, not chain-of-thought.

## Internal Value Object: TemporaryImageResult

```ts
interface InternalTemporaryImageResult {
    providerRequestId?: string
    providerUrl: string
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
    width?: number
    height?: number
    expiresAt?: string
}
```

`providerUrl` is server-private. Public stream uses only AI Mind's same-origin content path.

## Lifecycle

### Stage

```text
received
briefing
prompt_drafting
prompt_inspecting
prompt_revising
prompt_reinspecting
generating
result_validating
completed
failed
cancelled
```

### Valid Transitions

```text
received → briefing
briefing → prompt_drafting | failed | cancelled
prompt_drafting → prompt_inspecting | failed | cancelled
prompt_inspecting → prompt_revising | generating | failed | cancelled
prompt_revising → prompt_reinspecting | failed | cancelled
prompt_reinspecting → generating | failed | cancelled
generating → result_validating | failed | cancelled
result_validating → completed | failed | cancelled
```

Any non-terminal stage can transition to `cancelled`. Terminal states are immutable.

### Generation Counters

- Increment `promptRevisionCount` before entering `prompt_revising`.
- If the current value is already `1`, the edge cannot route to revision.
- Increment `imageGenerationCount` immediately before the external request.
- If the current value is already `1`, generation fails with an invariant error and no request is sent.
- The `0 -> 1` increment, stage change to `generating` and active-run condition are one repository transaction before HTTP invocation. Once committed, the external effect is treated as irrevocable for retry semantics; cancellation may abort the in-flight request but never resets the count.

## Atomic Create / Replay / Conflict

Transaction order:

1. Resolve existing `StreamRequest` by `(ownerSessionHash, idempotencyKey)`.
2. If matching fingerprint exists, return the same `StreamRun` replay descriptor before attempting active lease; the client resumes the original visible assistant message and no duplicate image message/run is created.
3. Expire eligible stale image lease according to repository policy.
4. Create `StreamRun(kind=image_generation)`.
5. Create `ImageGenerationRun` with `activeOwnerSessionHash=ownerSessionHash`.
6. Create `StreamRequest`.
7. Unique conflict on active owner maps to `409 IMAGE_GENERATION_ALREADY_ACTIVE`.

Partial creation must roll back.

## Terminal Transaction

Coordinator terminal operation:

1. Condition on current run still active and expected stage/status.
2. Write image business terminal status/counters/safe failure/result metadata.
3. Clear active lease.
4. Project StreamRun terminal event/status through existing stream recovery boundary.

If cancellation won the race, completion condition affects zero rows; the returned provider result is discarded.

## Retention and Cleanup

- Image bytes are never retained.
- A ready result always has `providerResultExpiresAt = min(reliable provider expiry, readyAt + 10 minutes)`. When provider expiry is unavailable, use `readyAt + 10 minutes`. Provider URL is logically readable only before that timestamp, even when physical cleanup has not run yet.
- The repository exposes one bounded, idempotent expired-result cleanup operation. It is invoked opportunistically before image-run acquisition and during temporary-result lookup, matching the existing bounded retention style instead of introducing a new scheduler in v0.4.12.
- Cleanup updates only a limited batch of rows satisfying `providerResultStatus = ready AND providerResultExpiresAt <= now`, sets `providerResultStatus = expired`, and nulls `providerResultUrl` in the same database operation. Concurrent cleanup/read attempts must preserve the expired result.
- The content service evaluates expiry before selecting or using `providerResultUrl`; therefore an expired URL is never readable even if another transaction has not yet physically scrubbed it.
- Stream event retention remains the existing v0.4.10 policy.
- Stale active leases are released only after checking the associated StreamRun cannot have a healthy active executor; cleanup never starts a second generation.
- Browser stable snapshots exclude `image-result` and Blob URLs.

## Data Classification

| Field class                                                 | Database                                              | Logs                             | Public DTO / browser                                      |
| ----------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| provider URL                                                | server-private `ImageGenerationRun` only until expiry | never                            | never                                                     |
| provider request ID                                         | nullable operational metadata                         | correlation-safe identifier only | never                                                     |
| dimensions / validated byte length / MIME                   | nullable validated metadata                           | safe aggregate fields            | MIME/dimensions only; byte length never required publicly |
| raw description / internal ImageBrief / prompt / inspection | never added to this model                             | never                            | never                                                     |
