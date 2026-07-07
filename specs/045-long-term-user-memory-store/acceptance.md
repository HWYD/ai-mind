# Acceptance 045: Long-term User Memory Store Baseline

**Status**: Implemented / verified  
**Version**: v0.4.5  
**Date**: 2026-07-06

## Release Gate

v0.4.5 只有在以下条目满足后，才可进入 release close。

- [x] Browser-session scoped UserMemory Store is implemented with LangGraph Store abstraction
- [x] PostgresStore durable provider is supported and has an independent setup script
- [x] InMemoryStore development/test fallback is available without changing production requirements
- [x] Every eligible completed ordinary turn enqueues one in-process best-effort UserMemory extraction job only after assistant final turn completion
- [x] v0.4.5 does not require a durable job queue, worker system, or retry scheduler for UserMemory extraction
- [x] Main assistant does not receive a direct memory-write tool
- [x] Structured extraction can output `0..N` UserMemory candidates
- [x] Extraction job input is bounded to latest user text, assistant final text, and allowlisted safe short-term context before any model call
- [x] Newly added or changed pinnedDecisions can be evaluated for promotion after successful compaction
- [x] All UserMemory candidates pass deterministic validation before any Store write
- [x] Conflict/update/forget signals suppress old contradictory memory without physical delete
- [x] Relevant UserMemory retrieval works for ordinary text chat and tool-assisted ordinary chat only
- [x] Tasklist and Delivery do not use UserMemory retrieval
- [x] Tasklist and Delivery do not enqueue UserMemory extraction jobs
- [x] Store read/write failures degrade to no-long-term-memory mode without breaking chat
- [x] UserMemory does not enter ThreadState, hydration payload, Conversation Registry, stream-core chunks, frontend reducer public state, ChatMessage history, GraphState, or RuntimeArtifact
- [x] v0.4.3 final-turn memory and v0.4.4 multi-conversation short-term memory isolation remain compatible

## Functional Acceptance

- [x] Every eligible persisted ordinary completed turn 会 enqueue 一个 in-process best-effort UserMemory extraction job，不阻塞主回答
- [x] 在 persisted conversation 中发送明确记忆请求，例如 `记住我喜欢吃桃子。`，extraction job 可以写入一条 active UserMemory
- [x] 没有长期记忆价值的 completed turn 可以结构化输出 0 条 candidate，且不写入无关记忆
- [x] UserMemory extraction/write 记录 safe `sourceConversationId`，不保存 draft identity 或 raw checkpoint identity
- [x] Extraction 或 Store write failure 不回滚用户可见回答，不破坏 selected conversation ThreadState，不影响 streaming finish
- [x] Assistant 可以用普通回答文本自然确认记忆，但不得新增 remembered-status stream chunk、UI state 或 reducer state

## Store And Setup Acceptance

- [x] UserMemory Store namespace scoped to current browser session only
- [x] Namespace/key 不暴露 raw browser session id、checkpoint id、API key、cookie、provider config 或 internal runtime state
- [x] `AI_MIND_USER_MEMORY_STORE=memory|postgres` 生效
- [x] development/test default uses memory mode
- [x] production default uses postgres mode
- [x] PostgresStore uses independent schema `langgraph_user_memory`
- [x] `pnpm --dir apps/webapp db:user-memory:setup` initializes UserMemory Store schema
- [x] `pnpm db:user-memory:setup` delegates to the webapp setup script
- [x] UserMemory setup is separate from Prisma migrations, checkpoint setup, chat-memory setup, pgvector, and embedding setup
- [x] Setup script does not print raw `DATABASE_URL`

## Validation And Safety Acceptance

- [x] Safe long-term preference candidate can be accepted when confidence `>= 0.7`
- [x] `user_preference` is not limited to food; ordinary non-sensitive preferences such as `用户喜欢穿卫衣。` can pass validation and stable key normalization
- [x] Structured extraction schema constrains candidate fields, including explicit `stability`, and allows an empty candidate list
- [x] Structured extraction schema includes structured `identity`, and stable key generation is based on that identity rather than sentence regex parsing
- [x] Extraction job input is bounded to completed turn payload and allowlisted safe short-term context before any model call
- [x] Unsupported memory type is rejected
- [x] Missing persisted source conversation is rejected or skipped
- [x] Low-confidence candidate is rejected
- [x] Empty or oversized text is rejected
- [x] Temporary emotion is not persisted as long-term memory when no stable long-term intent exists
- [x] `stability=temporary` and `stability=speculative` candidates are deterministically rejected without relying on narrow keyword deny-lists
- [x] Speculative or unconfirmed content is primarily filtered by extraction guidance and structured `stability` output, not narrow deterministic keyword deny-lists
- [x] Sensitive personal information is rejected by default
- [x] Full conversation transcript is rejected
- [x] Raw tool result, MCP raw envelope, raw resource content, GraphState, RuntimeArtifact, workflow progress, raw prompt, raw provider response, stack, API key, cookie, and provider config are rejected
- [x] Duplicate equivalent memory updates or rejects by stable key instead of creating contradictory duplicates
- [x] Validation diagnostics remain request-local and are not persisted as UserMemory document content
- [x] Model output never decides final namespace, stable key, document status, sourceConversationId, or write/no-write decision
- [x] Stable key uses normalized `identity.subject / facet / polarity` and structured identity normalization

## Retrieval And Context Acceptance

- [x] Retrieval only searches the current browser session namespace
- [x] Retrieval only returns `status === active` and confidence `>= 0.7`
- [x] Retrieval selects no more than 3 UserMemory entries
- [x] Each injected memory text is bounded to at most 300 Chinese characters
- [x] Total injected UserMemory text is bounded to at most 900 Chinese characters
- [x] Relevant memory can be selected across conversations in the same browser session
- [x] Retrieval relevance is based on structured tags / normalized text overlap and bounded rules, not code-maintained food / clothing / activity domain keyword taxonomies
- [x] Self-preference questions such as `我喜欢用什么工具？` can retrieve relevant non-food `user_preference`
- [x] Irrelevant memory produces zero UserMemory injection
- [x] Generic wording such as `推荐` does not by itself cause unrelated `user_preference` injection
- [x] `stable_user_context` uses controlled lexical and structured-identity overlap for work/background queries, while still avoiding broad injection into unrelated technical questions
- [x] UserMemory context is injected as supplemental model-visible context, separately from selected conversation ThreadState
- [x] Latest user message remains higher priority than selected UserMemory
- [x] Conversation A messages never leak into conversation B through UserMemory retrieval
- [x] UserMemory retrieval is not run during hydration, sidebar loading, or conversation switching
- [x] Tool-assisted ordinary chat can use selected UserMemory in planning/final-answer context without changing tool authority or raw tool input
- [x] Eligible tool-assisted ordinary chat enqueues background extraction after final answer completion without exposing a memory-write tool to the main assistant

## PinnedDecision Promotion Acceptance

- [x] Promotion runs only after conversation compaction succeeds
- [x] Promotion evaluates only newly added or changed pinnedDecisions
- [x] Promotion does not scan full conversation transcript
- [x] Promotion does not write compaction summary directly as UserMemory
- [x] Promotion does not write all pinnedDecisions by default
- [x] Promotion candidates reuse the same validation, stable key, dedupe, and suppression path as explicit memory intent
- [x] Promotion failure does not roll back compaction or affect completed user-facing answer

## Conflict And Draft Acceptance

- [x] Natural-language forget or explicit negation marks matching old UserMemory as `inactive` or `suppressed`
- [x] Suppressed memory is not returned by later retrieval
- [x] v0.4.5 does not physically delete memory for natural-language forget/update flow
- [x] Draft first message with explicit memory intent or another memory signal completes draft promotion before any UserMemory extraction enqueue
- [x] UserMemory write requires a persisted source conversation identity
- [x] Draft first message failure, cancellation, or rejection writes zero UserMemory
- [x] v0.4.5 does not create ghost conversation solely for UserMemory write

## Non-regression Acceptance

- [x] v0.4.4 Conversation Registry behavior remains unchanged
- [x] Per-conversation ThreadState isolation remains unchanged
- [x] v0.4.3 final-turn memory behavior remains compatible
- [x] Tasklist checkpoint/resume semantics remain unchanged
- [x] Tasklist and Delivery do not enqueue UserMemory extraction jobs
- [x] Tasklist GraphState, interrupt payload, and HITL review node remain outside UserMemory
- [x] Delivery run-local semantics remain unchanged
- [x] Delivery RuntimeArtifact, workflow progress, and subagent raw invocation/result remain outside UserMemory
- [x] `@ai-mind/stream-core` chunk union remains unchanged
- [x] Frontend reducer public shape remains unchanged
- [x] No `contextEntries`, `reasoning_summary`, `execution_summary`, or `agent_run_summary` is added

## Required Focused Tests

- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`
- [x] `apps/webapp/tests/app/api/chat/route-user-memory-draft.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] Existing `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] Existing `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] Existing `apps/webapp/tests/app/api/chat/conversations/route.test.ts`
- [x] Existing `apps/webapp/tests/app/api/chat/route.test.ts`
- [x] Existing `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

## Validation Commands

- [x] `pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] `pnpm --dir apps/webapp test -- user-memory chat-orchestrator-user-memory route-user-memory-draft chat-memory-hydration-dto chat-memory-pinned-decision-promotion`
- [x] `pnpm --dir apps/webapp test -- user-memory-retrieval user-memory-context-builder chat-orchestrator-user-memory`
- [x] `pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] `pnpm --filter @ai-mind/stream-core test`
- [x] `pnpm --dir apps/webapp test`
- [x] `pnpm typecheck`
- [x] `pnpm lint:webapp`
- [x] `pnpm --dir apps/webapp db:user-memory:setup`
- [x] `git diff --check`

## Execution Evidence

- focused extractor / validation / service / provider / orchestrator suite：passed
- focused feature suite：`11 passed`, `90 tests passed`
- retrieval/context-builder/orchestrator suite：`3 passed`, `26 tests passed`
- targeted type-strategy suite：`4 passed`, `39 tests passed`
- `pnpm --dir apps/webapp db:user-memory:setup`：passed，返回 `UserMemory LangGraph PostgresStore schema is ready.`
- `pnpm db:user-memory:setup`：passed，root delegate 正常转发到 webapp setup script
- `pnpm --filter @ai-mind/stream-core test`：`5 passed`, `22 tests passed`
- `pnpm typecheck`：passed
- `pnpm lint:webapp`：passed，保留 5 条既有 `react-refresh/only-export-components` warnings
- `pnpm --dir apps/webapp test`：`110 passed`, `6 skipped`, `696 tests passed`, `20 skipped`
- `git diff --check`：passed

## Manual Scope Guardrail

- [x] 不把 UserMemory 扩展成完整聊天历史系统
- [x] 不保存完整 conversation transcript
- [x] 不做 account-level 或 cross-device memory
- [x] 不默认保存敏感个人信息
- [x] 不做 Memory Inspector、memory edit UI、memory delete UI 或 memory management backend
- [x] 不做 embedding retrieval、pgvector 或历史搜索
- [x] 不把 UserMemory 写入 ThreadState、Conversation Registry、hydration payload、stream-core chunk 或 frontend reducer state
- [x] 不把 UserMemory 接入 Tasklist / Delivery retrieval
- [x] 不保存 raw runtime state、raw provider response、raw tool transcript、GraphState、RuntimeArtifact、workflow progress、API key、cookie 或 provider config
