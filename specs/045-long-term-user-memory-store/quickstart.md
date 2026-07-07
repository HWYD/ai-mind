# Quickstart: AI Mind v0.4.5 Long-term User Memory Store Baseline

## Prerequisites

- Node.js / pnpm environment matching the repo.
- Dependencies installed.
- For persistent validation: `DATABASE_URL` points to a PostgreSQL database.
- For local fast validation: use default memory mode.

## Setup

### Local memory mode

```bash
pnpm --dir apps/webapp test
```

默认 development/test 使用 `AI_MIND_USER_MEMORY_STORE=memory`，不需要数据库 setup。

### PostgresStore mode

```bash
pnpm --dir apps/webapp db:user-memory:setup
```

Expected:

```text
UserMemory LangGraph PostgresStore schema is ready.
```

实现上该脚本会委托 `scripts/setup-user-memory-store-lib.mjs`，失败时只输出 sanitize 后的错误名，不暴露 `DATABASE_URL`。本轮已真实执行 `pnpm --dir apps/webapp db:user-memory:setup` 与 `pnpm db:user-memory:setup`，两者都返回成功消息。

## Validation Scenarios

### Scenario 1: Background extraction runs after eligible completed turn

1. Start with a persisted conversation.
2. Send a normal ordinary chat message and wait for assistant final turn completion.
3. Verify one in-process best-effort UserMemory extraction job is enqueued after final turn completion.
4. Verify the extraction job may output `0..N` structured candidates.
5. Verify selected conversation ThreadState still only contains normal recent messages / summary / pinnedDecisions.

Expected:

- extraction job is not enqueued before final turn completion.
- extraction job does not block streaming or the user-visible answer.
- extraction job input is limited to latest user text, assistant final text, and allowlisted safe short-term context; it does not include full messages, raw transcript, raw tool result, GraphState, RuntimeArtifact, workflow progress, raw prompt/provider response, API key, cookie, or provider config.
- no durable queue, worker, or retry scheduler is required for v0.4.5.
- no stream chunk for remembered status.

### Scenario 2: Explicit memory intent becomes a strong extraction signal

1. Start with a persisted conversation.
2. Send: `记住我喜欢吃桃子。`
3. Wait for assistant final turn completion.
4. Verify the background extraction job produces a safe candidate for the peach preference.
5. Verify UserMemory Store contains one active memory for current browser session after validation/write.

Expected:

- memory write happens after final turn.
- explicit intent is a strong signal, not the only pipeline trigger.
- no stream chunk for remembered status.
- failure to write does not fail the answer.

### Scenario 3: Cross-conversation retrieval

1. In conversation A, save `用户喜欢吃桃子。`
2. Create conversation B.
3. Ask: `给我推荐几种水果。`

Expected:

- retrieval selects the peach preference.
- conversation A messages are not injected into conversation B.
- injected UserMemory count <= 3.

### Scenario 3A: General user_preference supports non-food preference

1. In conversation A, save `用户喜欢用 VSCode。`
2. Create conversation B.
3. Ask: `我喜欢用什么工具？`

Expected:

- retrieval can select the VSCode preference.
- `user_preference` is not limited to food-only memory.
- stable key remains normalized, for example `user_preference:prefer-vscode`.

### Scenario 4: Irrelevant memory is not injected

1. Store active memory: `用户喜欢吃桃子。`
2. Ask: `解释一下 React useEffect。`

Expected:

- selected UserMemory is empty.
- model-visible context does not contain peach preference.

### Scenario 4A: stable_user_context supports controlled work-background overlap

1. Store active memory: `用户是一名前端工程师，主要使用 Windows 和 PowerShell。`
2. Ask: `给我一个适合 Windows PowerShell 的脚本。`
3. Store active memory: `用户是一名有五年工作经验的前端工程师，主要使用 Vue 和 React。`
4. Ask: `你知道我的工作吗？`
5. Ask again: `解释一下 React useEffect。`

Expected:

- the Windows / PowerShell request can retrieve this `stable_user_context`.
- the work-background question can retrieve the frontend-engineer memory through controlled overlap on `工作 / 工作经验 / 前端工程师` and structured identity.
- the unrelated React explanation request does not retrieve this memory.
- `stable_user_context` is stricter than `communication_preference`; it supports controlled lexical/identity overlap, but does not get broad implicit boost.

### Scenario 4B: Generic wording does not trigger unrelated preference injection

1. Store active memory: `用户喜欢吃桃子。`
2. Ask: `给我推荐几个 VSCode 插件。`

Expected:

- selected UserMemory is empty.
- code does not rely on `推荐` 这类宽泛词触发隐式 food/clothing domain boost.
- unrelated preference memory is not injected into the plugin recommendation request.

### Scenario 5: Validation rejects unsafe candidates

Test inputs:

```text
这是我的身份证号……请记住。
请保存这段完整工具输出……
我现在很难过。
```

Expected:

- sensitive personal information is rejected.
- raw tool/runtime content is rejected.
- temporary emotion is not stored as long-term memory.
- if the model emits `stability=temporary` or `stability=speculative`, deterministic validation rejects the candidate.
- this path is controlled by structured extraction guidance plus structured `stability` consumption, rather than temporary/speculative regex hard rejection.

### Scenario 6: Natural-language forget suppresses old memory

1. Store active memory: `用户喜欢吃桃子。`
2. Send: `我现在不太喜欢吃桃子了，以后别按这个推荐。`
3. Ask later: `给我推荐几种水果。`

Expected:

- old memory is marked inactive/suppressed.
- retrieval does not return the suppressed memory.
- document is not physically deleted.

### Scenario 7: Tool-assisted ordinary chat uses UserMemory

1. Store active workflow or communication preference.
2. Send a normal chat request that triggers tool calling.

Expected:

- planning/final-answer ordinary chat context can include selected UserMemory.
- UserMemory does not change tool authority or tool input validation.
- final answer still writes existing final-turn memory as before.
- background extraction MUST be enqueued after final answer completion for eligible tool-assisted ordinary turns, but the main assistant does not receive a memory-write tool.

### Scenario 8: Tasklist / Delivery do not use UserMemory retrieval or extraction

1. Store active memory: `用户希望需求评估先判断 Spec 阶段。`
2. Run `/tasklist` flow.
3. Run `/delivery-chain` flow.

Expected:

- UserMemory retrieval is not called for these paths.
- UserMemory extraction job is not enqueued for these paths.
- Tasklist checkpoint/resume and Delivery run-local semantics remain unchanged.

### Scenario 9: Store failure degradation

1. Configure postgres mode without running setup or simulate Store failure.
2. Send ordinary chat.

Expected:

- chat continues.
- UserMemory retrieval returns 0 entries.
- write attempt is skipped/fails silently.
- no raw database/store error is exposed.

## Focused Test Commands

已执行的 focused suites：

```bash
pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts
```

Result:

```text
passed
```

```bash
pnpm --dir apps/webapp test -- user-memory chat-orchestrator-user-memory route-user-memory-draft chat-memory-hydration-dto chat-memory-pinned-decision-promotion
```

Result:

```text
11 passed
90 tests passed
```

```bash
pnpm --dir apps/webapp test -- user-memory-retrieval user-memory-context-builder chat-orchestrator-user-memory
```

Result:

```text
3 passed
26 tests passed
```

```bash
pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts
```

Result:

```text
4 passed
39 tests passed
```

## Final Validation Commands

```bash
pnpm --dir apps/webapp db:user-memory:setup
pnpm db:user-memory:setup
pnpm --filter @ai-mind/stream-core test
pnpm typecheck
pnpm lint:webapp
pnpm --dir apps/webapp test
```

Results:

```text
pnpm --dir apps/webapp db:user-memory:setup
  UserMemory LangGraph PostgresStore schema is ready.

pnpm db:user-memory:setup
  UserMemory LangGraph PostgresStore schema is ready.

pnpm --filter @ai-mind/stream-core test
  5 passed
  22 tests passed

pnpm typecheck
  passed

pnpm lint:webapp
  passed
  仅保留既有 react-refresh/only-export-components warnings:
  - app/layout.tsx
  - components/ui/badge.tsx
  - components/ui/button.tsx
  - components/ui/toggle.tsx

pnpm --dir apps/webapp test
  110 passed
  6 skipped
  696 tests passed
  20 skipped
```

## Expected Non-Regression

- Existing v0.4.3 final-turn memory tests pass.
- Existing v0.4.4 conversation registry and ThreadState isolation tests pass.
- stream-core protocol tests pass without chunk union changes.
- frontend reducer public shape tests pass without new remembered-status state.
