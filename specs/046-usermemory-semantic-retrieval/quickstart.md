# Quickstart: Validate UserMemory Semantic Retrieval

## Prerequisites

- Install dependencies with `pnpm install`.
- For focused unit tests, no external embedding API is required.
- For real semantic integration validation, prepare `DATABASE_URL` and run Store setup with `PostgresStore` vector search support.
- For real embedding validation, configure an independent UserMemory 火山引擎 Ark OpenAI-compatible embedding provider, fixed to `doubao-embedding-vision`, and reuse the same `baseUrl` / `api key` source as the existing Doubao provider line.
- `InMemoryStore` is only for focused deterministic tests, not real semantic retrieval validation.

## Focused Validation

Run webapp tests:

```bash
pnpm --dir apps/webapp test
```

Expected outcomes:

- semantic retrieval can select communication preference when query wording differs.
- semantic retrieval can select dietary preference when query does not contain exact saved keyword.
- unrelated UserMemory is not injected.
- suppressed / inactive memory is not injected.
- semantic failure returns `[]` and ordinary chat continues.
- retrieval query uses latest user input directly; LLM query rewrite is not invoked.
- `UserMemory` does not enter ThreadState, hydration, stream payload or frontend reducer public state.

## Type And Lint Validation

Run:

```bash
pnpm typecheck
pnpm lint:webapp
```

Expected outcomes:

- TypeScript compilation passes.
- Lint passes without unrelated formatting churn.

## Real Store Semantic Validation

Prepare durable Store:

```bash
pnpm db:user-memory:setup
```

Then run a local webapp session with semantic provider config enabled.

Expected runtime constraints:

- Semantic Store path uses `PostgresStore` vector search only.
- Semantic Store path does not use `PostgresStore` hybrid/text search.
- Real embedding provider path uses `doubao-embedding-vision`.
- Retrieval query only uses deterministic normalization and clipping, with an 800-character cap and first-400 / last-400 retention.
- Semantic candidate retrieval starts with `topK = 8`.
- Final injected candidate threshold uses `semantic score >= 0.70`.
- Future keyword / hybrid search, if added later, must search field-allowlisted clean payload only.
- Semantic retrieval timeout defaults to 1500ms and fails open.

Manual acceptance flow:

1. In conversation A, save: `以后解释技术问题时，先用大白话，再补充专业说明。`
2. In conversation B within the same browser session, ask: `LangGraph Store 是什么？别讲太抽象。`
3. Expected: selected UserMemory includes the communication preference and answer style follows it.
4. Save: `记住我不吃香菜。`
5. Ask: `今天适合吃什么清淡点？`
6. Expected: selected UserMemory includes avoiding cilantro and answer avoids cilantro-heavy suggestions.
7. Ask an unrelated technical question after saving dietary memory.
8. Expected: dietary memory is not injected.

## Excluded Path Validation

Run ordinary Tasklist / Delivery flows after v0.4.6 implementation.

Expected outcomes:

- Tasklist path does not trigger semantic retrieval or embedding query.
- Delivery path does not trigger semantic retrieval or embedding query.
- HITL checkpoint/resume behavior remains unchanged.
- workflow progress payload remains unchanged.
- stream-core chunk union remains unchanged.

## Failure Validation

Simulate:

- embedding provider unavailable
- semantic Store timeout
- semantic search throws
- semantic result has missing/unstable score
- accidental hybrid/text search usage
- accidental full JSON keyword search usage

Expected outcomes:

- ordinary chat still completes.
- streaming continues.
- no raw provider/database/store error reaches the user.
- selected UserMemory becomes `[]`.
- UserMemory Store is not corrupted.
- hybrid/text search is not used as semantic retrieval path.
- full UserMemory JSON is not used as keyword / text search content.
- rule-based / lexical fallback is not required for v0.4.6 acceptance.
- rule-based / lexical runtime wiring is absent from formal release-closing runtime path.
