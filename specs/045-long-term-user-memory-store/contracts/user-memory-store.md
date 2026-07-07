# Contract: UserMemory Store

## Purpose

定义 `apps/webapp/lib/ai/runtime/user-memory/` 对内部 runtime 暴露的 Store service contract。它不是 public API，不进入 hydration payload、stream chunk 或 frontend reducer state。

## Provider Contract

### `UserMemoryStoreMode`

```ts
type UserMemoryStoreMode = 'memory' | 'postgres'
```

### `getUserMemoryStore(config, env)`

```ts
function getUserMemoryStore(config?: UserMemoryRuntimeConfig, env?: Record<string, string | undefined>): BaseStore
```

Requirements:

- `memory` mode 返回 process-level shared `InMemoryStore`。
- `postgres` mode 返回 process-level shared `PostgresStore`。
- postgres provider 使用 schema `langgraph_user_memory`。
- 不允许在同一 process 内静默切换 `DATABASE_URL`。
- provider 初始化失败必须由 service read/write 层捕获并降级，不能向用户暴露 raw error。

## Service Contract

### `processCompletedTurnForMemory`

```ts
async function processCompletedTurnForMemory(input: {
    sessionId: string
    sourceConversationId: string
    latestUserText: string
    assistantFinalText: string
    safeShortTermContext?: {
        summary?: string
        pinnedDecisions?: string[]
    }
    path: 'ordinary_chat' | 'tool_assisted_ordinary_chat'
}): Promise<UserMemoryExtractionResult>
```

Behavior:

- 只在 assistant final turn completed 后调用。
- 只处理 ordinary text chat 和 tool-assisted ordinary chat completed turn。
- 不处理 Tasklist / Delivery / failed / cancelled / rejected / missing source conversation turn。
- v0.4.5 调用方 MUST 为每个 eligible completed ordinary turn enqueue 一个 in-process best-effort job；本合约不要求 durable queue、worker 或 retry scheduler。
- extraction input MUST be bounded to latest user text, assistant final text, and allowlisted safe short-term context; it MUST NOT include full messages, raw transcript, raw tool result, GraphState, RuntimeArtifact, workflow progress, raw prompt, raw provider response, API key, cookie, or provider config.
- 调用模型结构化输出带 `stability` 和 structured `identity` 的 `0..N` UserMemory candidates。
- 模型输出只能作为 candidate，不是最终 Store document。
- 每个 candidate 继续走 deterministic validation / stable key / dedupe / suppression / write path。
- extraction 或 Store failure 返回安全结果，不 throw 到主 chat path。

### `putCandidate`

```ts
async function putCandidate(input: { sessionId: string; candidate: UserMemoryCandidate }): Promise<UserMemoryWriteResult>
```

Behavior:

- 派生 session scope hash namespace。
- deterministic validation。
- `stability=temporary/speculative` 的 candidate 在 deterministic validation 中直接拒绝。
- 基于 structured `identity` 生成 stable key，不引入代码内的中文句子语义解析 helper 作为主路径。
- 如果 candidate 表达 forget / negation，持久标记匹配 document 为 `suppressed`。
- 如果 active equivalent document 已存在，更新同 stable key document，不创建重复项。
- 如果 validation 失败，返回 rejected result，不 throw 给主 chat path。

### `retrieveRelevantMemories`

```ts
async function retrieveRelevantMemories(input: { sessionId: string; latestUserText: string }): Promise<SelectedUserMemory[]>
```

Behavior:

- 只查当前 browser session namespace。
- 只返回 `status === 'active'` 且 `confidence >= 0.7` 的 memory。
- 按 type / structured tags / normalized text overlap / text search / recency 做规则相关性过滤，不维护代码内的 food / clothing / activity 二级领域词表。
- 最多返回 3 条。
- 每条 text 最多 300 中文字符。
- 总 text 最多 900 中文字符。
- 无相关 memory 返回 `[]`。
- Store read failure 返回 `[]`，不 throw 到主 chat path。

### `promotePinnedDecisionDiff`

```ts
async function promotePinnedDecisionDiff(input: {
    sessionId: string
    sourceConversationId: string
    previousPinnedDecisions: string[]
    nextPinnedDecisions: string[]
}): Promise<UserMemoryPromotionResult>
```

Behavior:

- 只评估新增或变化的 pinnedDecision。
- 不读取完整 conversation transcript。
- 不把 summary 作为 candidate。
- 每个 promotion candidate 走同一 validation / stable key / dedupe / write path。
- 失败只记录安全日志，不影响 compaction write。

## Write Result

```ts
type UserMemoryExtractionResult =
    | { status: 'processed'; candidates: number; written: number; updated: number; suppressed: number; rejected: number }
    | { status: 'skipped'; reason: 'ineligible-path' | 'missing-session' | 'missing-source-conversation' | 'empty-turn' }
    | { status: 'failed'; reason: 'extractor-unavailable' | 'store-unavailable' | 'unsafe-error' }
```

```ts
type UserMemoryWriteResult =
    | { status: 'written'; stableKey: string }
    | { status: 'updated'; stableKey: string }
    | { status: 'suppressed'; stableKey: string }
    | { status: 'rejected'; reason: UserMemoryRejectionReason }
    | { status: 'skipped'; reason: 'store-unavailable' | 'missing-session' | 'missing-source-conversation' }
```

## Rejection Reasons

```text
empty
too_long
low_confidence
temporary
speculative
unsupported_type
sensitive_personal_information
raw_runtime_state
full_transcript
duplicate
irrelevant
unsafe
```

## Public Safety

UserMemory Store contract 输出不得直接透传给：

- `/api/chat/thread` hydration payload
- `/api/chat/conversations` registry payload
- stream-core chunks
- frontend reducer public state
- Tasklist Agent GraphState / interrupt payload
- Delivery RuntimeArtifact
