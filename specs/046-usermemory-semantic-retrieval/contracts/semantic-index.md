# Contract: UserMemory Semantic Index

## Purpose

定义哪些 UserMemory 内容可以进入 semantic index，以及 Store 写入时如何避免把 raw conversation 或 runtime internals 向量化。

## Index Payload

Semantic index payload MUST be built from explicit allowlist fields:

```ts
type UserMemorySemanticIndexPayload = {
    text: string
    tags: string[]
}
```

`UserMemory.type` MAY be used as filtering, ranking, and display metadata, but MUST NOT be indexed as a standalone vector field in v0.4.6.

## Put Contract

当写入 active validated UserMemory 时，Store put 行为 MUST 使用 allowlisted vector index fields。

```ts
await store.put(namespace, stableKey, documentValue, ['text', 'tags'])
```

上面只是 contract-level shape，最终实现必须以当前 LangGraph Store API 类型为准。

## Forbidden Index Content

MUST NOT index:

- full conversation transcript
- `ThreadState.messages`
- raw `ThreadState.summary`
- raw `ThreadState.pinnedDecisions`
- raw user message
- raw assistant final text
- raw tool result
- MCP raw envelope
- MCP raw resource content
- GraphState
- RuntimeArtifact
- workflow progress
- provider response
- raw prompt
- API key / cookie / provider config
- sourceConversationId
- debug metadata
- suppression reason
- full UserMemory document JSON

## Metadata Contract

Semantic index metadata MUST exist as internal UserMemory document metadata in v0.4.6, not runtime-only ephemeral state, and MUST use safe fields only:

- `semanticIndexedAt`
- `semanticIndexFields`
- `semanticIndexVersion`
- `embeddingProviderKind`
- `embeddingModelId`
- `embeddingDimensions`

Metadata MUST NOT include raw vectors, raw query, raw provider payload, source conversation id, suppression reason or sensitive config.

## Backward Data Rule

v0.4.6 does not require:

- migration for old UserMemory data
- semantic reindex for old UserMemory data
- rule-based / lexical fallback guarantee for old UserMemory data

验收只覆盖本版本后具备 semantic eligibility 的 UserMemory。

## Future Keyword / Hybrid Boundary

v0.4.6 MUST NOT use `PostgresStore` hybrid/text search as the semantic path.

Future versions MAY introduce keyword / hybrid retrieval only when keyword search is field-allowlisted. It MAY search clean UserMemory fields or derived clean search payload, but MUST NOT search:

- full UserMemory document JSON
- raw `store.value::text`
- raw user message
- transcript
- sourceConversationId
- debug metadata
- suppression reason
- provider/runtime internals

v0.4.6 MUST NOT pre-implement keyword / hybrid retrieval through rule-based, lexicalScore, matchedFields, RRF, or rank fusion fields. Those belong to the future hybrid version.
