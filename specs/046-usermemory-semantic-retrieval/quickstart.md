# Quickstart: Validate UserMemory Semantic Retrieval

## Prerequisites

- Install dependencies with `pnpm install`.
- For focused unit tests, no external embedding API is required.
- For local development and real semantic integration validation, prepare `DATABASE_URL` and run Store setup with `PostgresStore` vector search support.
- For real embedding validation, configure an independent UserMemory 火山引擎 Ark OpenAI-compatible embedding provider, fixed to `doubao-embedding-vision`, and reuse the same `baseUrl` / `api key` source as the existing Doubao provider line.
- Focused tests 可以在测试侧使用 fake / mocked store/search 或显式 test doubles，但正式 runtime 不保留测试专用 store/provider/retrieval 分支。

## Focused Validation

Run webapp tests:

```bash
pnpm --dir apps/webapp test
```

Focused commands executed for v0.4.6:

```bash
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-retrieval.test.ts tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts tests/lib/ai/runtime/user-memory-retrieval.test.ts tests/lib/ai/runtime/user-memory-context-builder.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts
pnpm --dir apps/webapp test -- --run tests/app/api/chat/route-user-memory-draft.test.ts tests/app/api/chat/conversations/route.test.ts tests/components/instamind/use-chat-stream-hydration.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/app/api/agent-runs/route.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts
pnpm --filter @ai-mind/stream-core test
```

Recorded results:

- Runtime alignment focused revalidation: pass, `4` files / `38` tests
- Focused provider / service / validation / extraction / retrieval / orchestrator suite: pass
- Route / hydration / reducer / Tasklist / Delivery non-regression suite: pass
- `@ai-mind/stream-core` protocol suite: pass

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

Recorded results:

- `pnpm typecheck`: pass
- `pnpm lint:webapp`: pass with 5 pre-existing `react-refresh/only-export-components` warnings in shared UI/layout files; no new errors from this runtime alignment change
- `git diff --check`: pass

Expected outcomes:

- TypeScript compilation passes.
- Lint passes without unrelated formatting churn.

## Real Store Semantic Validation

Prepare durable Store:

```bash
pnpm db:user-memory:setup
```

Then run a local webapp session with semantic provider config enabled. Local development is expected to use the same `PostgresStore` semantic path as real runtime validation.

Expected runtime constraints:

- Semantic Store path uses `PostgresStore` vector search only.
- Semantic Store path does not use `PostgresStore` hybrid/text search.
- Real embedding provider path uses `doubao-embedding-vision`.
- Retrieval query only uses deterministic normalization and clipping, with an 800-character cap and first-400 / last-400 retention.
- Semantic candidate retrieval starts with `topK = 8`.
- Final injected candidate threshold uses `semantic score >= 0.32`.
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
- rule-based / lexical retrieval is absent from the formal runtime path.

## Full Validation

Executed:

```bash
pnpm --dir apps/webapp test
```

Recorded result:

- `pnpm --dir apps/webapp test`: pass, `110 passed | 6 skipped` test files, `698 passed | 20 skipped` tests
