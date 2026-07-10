# Contract: UserMemory Semantic Retrieval

## Purpose

定义 v0.4.6 内部 runtime 的 UserMemory semantic retrieval contract。它不是 public API，不进入 hydration payload、stream chunk 或 frontend reducer state。

## Retrieval Entry

```ts
async function retrieveRelevantMemories(input: {
    sessionId: string
    latestUserText: string
    path?: 'ordinary_chat' | 'tool_assisted_ordinary_chat'
}): Promise<SelectedUserMemory[]>
```

## Behavior

- MUST 只在 current browser session namespace 内检索。
- MUST 在 semantic query 前确认 request path eligible。
- MUST 支持 ordinary text chat。
- MUST 支持 ordinary chat boundary 内的 tool-assisted ordinary chat。
- `reader-skill` 的 runtime-controlled capability-context final answer stage 在仍处于 ordinary chat context boundary 内时 MAY 复用同一套 retrieval context assembly。
- MUST NOT 在 Tasklist、Delivery、HITL checkpoint/resume、workflow progress、hydration、sidebar list 或 conversation switching 中触发 semantic retrieval。
- MUST NOT 让 semantic retrieval 流入 MCP / remote capability 的 raw resource / raw prompt fetch/input path。
- MUST use latest user input directly as retrieval query in v0.4.6.
- MUST NOT perform LLM query rewrite、query transformation、HyDE、query expansion or other generative retrieval preprocessing in v0.4.6.
- MUST normalize retrieval query deterministically with trim、whitespace folding and an 800-character cap.
- MUST keep the first 400 and last 400 characters when the latest user input exceeds the cap.
- MUST collect semantic vector candidates only in v0.4.6.
- semantic candidates MUST come from `PostgresStore` vector search in real semantic retrieval.
- semantic path MUST NOT use `PostgresStore` hybrid/text search.
- real embedding provider path MUST use the Volcengine Ark OpenAI-compatible route with fixed model id `doubao-embedding-vision`.
- Future keyword / hybrid signal MAY be added only if it searches field-allowlisted clean UserMemory payload, not full document JSON or raw `store.value::text`.
- v0.4.6 MUST NOT introduce, expand, or rely on rule-based / lexical / metadata candidates.
- automated tests MAY use test-side fake / mocked store/search or explicit test doubles, but the formal runtime MUST NOT add dedicated store/provider/retrieval branches just for tests.
- MUST 以 `stableKey` 去重。
- MUST 统一排序，再执行 final budget selection。
- MUST start semantic vector search with `topK = 8`.
- MUST 允许返回 `[]`。

## Candidate Merge Rules

- 同一 `stableKey` 出现在多个 semantic vector hits 中时，只保留一个 candidate。
- semantic score 可作为排序信号，但不能绕过 active/confidence/suppression 过滤。
- `semanticScore < 0.32` MUST NOT enter the final selected list.
- lexical / metadata score、matchedFields、rank fusion 和 RRF 不属于 v0.4.6 contract。
- latest user input conflict must be resolved after retrieval by existing context priority rules, not by rewrite.
- suppressed 或 inactive document MUST NOT 进入最终 selected list。
- `confidence < 0.7` MUST NOT 进入最终 selected list。
- 当当前用户输入与 memory 冲突时，当前输入优先。

## Filter Order

Formal retrieval order MUST be:

1. eligibility check
2. deterministic query normalization and clipping
3. browser-session namespace scoping
4. `PostgresStore` vector semantic search
5. active/inactive/suppression filtering
6. semantic score threshold filtering
7. `stableKey` dedupe
8. conflict handling
9. final context budget selection

## Budget Rules

- selected memories 最多 3 条。
- 每条 text 最多 300 中文字符。
- 总 text 最多 900 中文字符。
- 如果 clip 后没有可用内容，返回 `[]` 或跳过该 memory。

## Failure Behavior

- semantic search failure MUST NOT throw to ordinary chat path。
- embedding provider failure MUST NOT throw to ordinary chat path。
- Store timeout MUST NOT throw to ordinary chat path。
- default semantic retrieval timeout is 1500ms.
- 如果 semantic path 失败、超时或没有可接受 candidates，MUST 返回 `[]`。
- raw database、embedding、provider、Store error MUST NOT 暴露给用户。
- rule-based / lexical retrieval MUST NOT appear in the formal runtime path or formal acceptance dependency of v0.4.6.

## Observability

Allowed safe log metadata:

- event name
- provider kind
- search mode
- elapsedMs
- candidate count
- selected count
- degradation kind
- error name/category

Forbidden log data:

- raw latest user text
- raw UserMemory text
- raw embedding vector
- raw provider response
- raw provider error payload
- API key / cookie / provider config
