# Data Model: UserMemory Semantic Retrieval

## UserMemory

`UserMemory` 继续表示当前 browser session 范围内、可跨 conversations 使用的长期用户记忆。v0.4.6 不改变它的产品语义，也不新增写入来源。

### Existing Required Fields

- `schemaVersion`: UserMemory document schema version。
- `stableKey`: 用于 dedupe、update、suppression 和 semantic candidate selection 的稳定 key。
- `type`: 长期记忆类型，例如 `user_preference`、`communication_preference`、`workflow_preference`、`standing_instruction`、`recurring_constraint`、`stable_user_context`、`project_context`、`risk_preference`。
- `text`: 干净、校验后的长期记忆文本。
- `identity`: 用于 stable key 的结构化身份信息。
- `tags`: 少量结构化检索锚点。
- `confidence`: 记忆置信度；最终注入仍要求 `>= 0.7`。
- `status`: `active`、`inactive` 或 `suppressed`。
- `source`: `eligible_completed_turn` 或 `pinned_decision_promotion`。
- `sourceConversationId`: 仅作为内部安全来源关联，不进入 semantic index content。
- `createdAt` / `updatedAt`: 创建和更新事件。

### Semantic Index Fields

允许参与 semantic vector index 的字段只有：

- `text`
- `tags`

`type` 可以作为 filtering、ranking 和 display metadata，但 v0.4.6 不把它作为 standalone vector field 建立 semantic index。

实现时应构建 allowlisted semantic payload，而不是索引完整 UserMemory document JSON。

### Semantic Metadata

`Semantic Index Metadata` 是内部元信息。v0.4.6 MUST 将它写入 `UserMemory` 的内部 document metadata，而不是只保留 runtime-only 临时状态；同时 SHOULD 只保留最小字段：

- `semanticIndexedAt`: 最近一次 semantic index 完成时间。
- `semanticIndexFields`: 本次索引使用的字段 allowlist。
- `embeddingProviderKind`: provider 类型，不包含 API key、base URL 或 provider config。
- `embeddingModelId`: embedding model 的安全标识；v0.4.6 第一版固定为 `doubao-embedding-vision`。
- `embeddingDimensions`: embedding vector 维度。
- `semanticIndexVersion`: semantic index payload 版本。

MUST NOT 包含：

- raw embedding vector
- raw provider response
- raw provider error payload
- raw query text
- raw user message
- raw assistant final text
- sourceConversationId
- suppression reason
- debug metadata
- API key / cookie / provider config

## Semantic Retrieval Request

一次 semantic retrieval request 表示 runtime 为某个 eligible ordinary chat request 发起的 UserMemory 召回。

### Fields

- `sessionId`: 当前 browser session identity，用于 namespace scope。
- `latestUserText`: 当前 latest user input，只能临时作为 query 使用。
- `path`: `ordinary_chat` 或 `tool_assisted_ordinary_chat`。
- `limit`: semantic candidate topK，默认 `8`。
- `timeoutMs`: semantic retrieval runtime budget，默认 1500ms。

### Validation Rules

- `sessionId` 为空时 MUST 返回空候选。
- `latestUserText` 为空时 MUST 返回空候选。
- 非 eligible path MUST NOT 发起 embedding query 或 Store semantic search。
- `latestUserText` MUST NOT 被持久化为 semantic index content、long-term memory content、hydration payload、stream payload 或持久化 debug log。
- `latestUserText` 在 v0.4.6 中 MUST 直接作为 retrieval query 使用；MUST NOT 经过 LLM query rewrite、query transformation、HyDE、query expansion 或其他生成式 preprocessing。
- retrieval query 进入 semantic search 前 MUST 只做 trim、空白折叠和最多 800 字符的确定性长度裁剪；超过上限时 MUST 保留前 400 字符和后 400 字符。
- 真实 semantic retrieval MUST 使用 `PostgresStore` vector search。
- `InMemoryStore` MAY 用于 deterministic tests，但不代表真实 semantic retrieval 能力。
- semantic path MUST NOT 使用 `PostgresStore` hybrid/text search。
- 后续 keyword / hybrid retrieval 如果进入版本，MUST 使用字段白名单 search payload，MUST NOT 搜索完整 UserMemory document JSON 或 raw `store.value::text`。

## Semantic Candidate

`Semantic Candidate` 是 Store semantic search 返回并解析后的内部候选。

### Fields

- `stableKey`: 对应 UserMemory stable key。
- `document`: 解析后的 UserMemory document。
- `semanticScore`: Store 返回的 similarity score，可为空。
- `source`: 固定为 `semantic`。

### Validation Rules

- document 解析失败 MUST 丢弃。
- `status !== active` MUST 丢弃。
- `confidence < 0.7` MUST 丢弃。
- suppressed / inactive memory MUST 丢弃。
- `semanticScore < 0.70` MUST 丢弃。
- score 缺失或不稳定时 SHOULD 保守降权或丢弃。

## Deprecated Rule-based / Lexical Retrieval

v0.4.5 的 rule-based retrieval 不作为 v0.4.6 data model 的正式 candidate entity。

### Rules

- v0.4.6 MUST NOT introduce `LexicalCandidate` / `RuleCandidate` as a formal candidate model.
- v0.4.6 MUST NOT add `lexicalScore`、`matchedFields`、rank fusion 或 semantic + lexical merge state。
- 现有 rule-based retrieval MAY remain as legacy implementation detail, but MUST NOT be used as v0.4.6 acceptance fallback。
- v0.4.6 release-closing 状态中，legacy rule-based retrieval MUST NOT remain wired into any formal runtime path, formal acceptance test path, or formal config path。
- 下一版 hybrid MUST introduce a separate field-allowlisted keyword candidate model if needed。

## Selected UserMemory

最终注入模型上下文的少量长期记忆。

### Fields

- `stableKey`
- `type`
- `text`
- `tags`
- `score`

### Validation Rules

- MUST 已经过 semantic candidate selection 和 dedupe。
- MUST 已通过 active/confidence/suppression 过滤。
- MUST 符合最多 3 条、每条最多 300 中文字符、总计最多 900 中文字符。
- MUST 只作为 supplemental context 注入。
- MUST NOT 进入 ThreadState、hydration payload、stream payload、Conversation Registry 或 frontend reducer public state。

## Embedding Provider

为 LangGraph Store semantic search 提供 embedding 能力的内部 provider。

### Required Behavior

- 接收 semantic index allowlist payload 和临时 query。
- 使用独立 UserMemory runtime config，不跟随当前聊天模型选择器。
- 默认真实 provider 路线固定为火山引擎 Ark OpenAI-compatible embedding path，model id 固定为 `doubao-embedding-vision`，并复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源。
- 不接收完整 transcript、ThreadState、raw tool result、MCP raw resource content、GraphState、RuntimeArtifact、raw prompt、provider response、API key、cookie、provider config 或 debug metadata。
- provider 不可用时 MUST fail open，不影响 ordinary chat。
- automated tests MUST 使用 deterministic provider 或 deterministic semantic behavior。

## State Transitions

```text
validated active UserMemory
  -> semantic index pending
  -> semantic indexed
  -> eligible for semantic retrieval

semantic indexed UserMemory
  -> suppressed / inactive
  -> not eligible for injection

semantic retrieval request
  -> semantic vector candidates
  -> active / suppression filter
  -> semantic score threshold filter
  -> merge by stableKey
  -> conflict handling
  -> budget filter
  -> selected UserMemory[]
```

旧 UserMemory 如果没有 semantic index，不进入 v0.4.6 semantic acceptance 主路径。本版本不要求 migration、reindex 或兼容兜底。
