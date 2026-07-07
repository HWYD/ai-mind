# Tasks: AI Mind v0.4.5 Long-term User Memory Store Baseline

**Input**: Design documents from `/specs/045-long-term-user-memory-store/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), [contracts/](./contracts/)

**Tests**: 本版本是 Level C long-term memory runtime extension；按 constitution 的 Tests Before Broad Integration，包含 focused schema/service/retrieval/orchestrator/route/non-regression tests。

**Organization**: Tasks 按 user story 分组，执行顺序采用推荐拆分：Store/schema -> structured extraction schema -> validation/dedupe/suppression -> background extraction pipeline -> retrieval/context builder -> orchestrator 接入 -> pinnedDecision promotion -> setup/docs/non-regression。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when it touches different files and does not depend on an incomplete task.
- **[Story]**: Maps implementation work to a spec user story.
- 每个任务都包含明确文件路径，便于后续直接实现。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 UserMemory runtime 目录、测试文件骨架和 PostgresStore setup 入口。

- [x] T001 Create UserMemory runtime module directory and public barrel in `apps/webapp/lib/ai/runtime/user-memory/index.ts`
- [x] T002 [P] Create UserMemory setup script placeholder in `apps/webapp/scripts/setup-user-memory-store.mjs`
- [x] T003 [P] Add webapp `db:user-memory:setup` script entry in `apps/webapp/package.json`
- [x] T004 [P] Add root `db:user-memory:setup` script entry in `package.json`
- [x] T005 [P] Create UserMemory provider test file in `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] T006 [P] Create UserMemory validation test file in `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] T007 [P] Create UserMemory extraction pipeline test file in `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] T008 [P] Create UserMemory retrieval test file in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T009 [P] Create UserMemory context builder test file in `apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共享的 Store/schema/provider/validation 基线。完成前不要接入 ChatOrchestrator。

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T010 [P] Define UserMemory document, candidate, selected memory, type, status, source, and result types in `apps/webapp/lib/ai/runtime/user-memory/state-schema.ts`
- [x] T011 [P] Define runtime config constants for mode, schema name, confidence threshold, and context bounds in `apps/webapp/lib/ai/runtime/user-memory/runtime-config.ts`
- [x] T012 [P] Add provider tests for memory/postgres modes, invalid mode fallback, shared store reuse, and schema name in `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] T013 Implement LangGraph Store provider selection using `InMemoryStore` and `PostgresStore` in `apps/webapp/lib/ai/runtime/user-memory/provider.ts`
- [x] T014 [P] Add validation tests for allowed memory types, required sourceConversationId, confidence threshold, text length, and safe tags in `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] T015 Implement deterministic validation, tag normalization, text bounds, and rejection reasons in `apps/webapp/lib/ai/runtime/user-memory/validation.ts`
- [x] T016 Implement deterministic namespace hashing and stable key normalization in `apps/webapp/lib/ai/runtime/user-memory/validation.ts`
- [x] T017 [P] Add service tests for `putCandidate`, duplicate update, missing session, missing source conversation, and non-throwing store errors in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] T018 Implement `UserMemoryService` read/write skeleton with safe degradation wrappers in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T019 Implement background extraction pipeline skeleton and exports in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`

**Checkpoint**: Foundation ready. Store provider, schema, validation, stable key, and service boundary are testable without chat integration.

---

## Phase 3: User Story 1 - Extract Memory From Eligible Completed Turns (Priority: P1) MVP

**Goal**: eligible completed ordinary text chat / tool-assisted ordinary chat turn 完成后，后台异步运行结构化 UserMemory extraction pipeline；explicit memory intent 是强信号但不是唯一触发，写入失败不影响回答或 ThreadState。

**Independent Test**: 在 persisted conversation 中发送普通 completed turn 和明确记忆请求，等待 final turn 完成，验证 extraction job 只在 final turn 后 enqueue，模型结构化输出 `0..N` candidates，安全 candidate 通过 validation 后写入并记录 sourceConversationId；Store 写入失败时回答仍完成。

### Tests for User Story 1

- [x] T020 [P] [US1] Add structured extraction tests for `0..N` candidates, explicit intent signal, ordinary stable preference, and no-memory turn in `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] T021 [P] [US1] Add ChatOrchestrator final-turn background job enqueue timing tests for eligible ordinary and tool-assisted turns in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T022 [P] [US1] Add regression test that UserMemory extraction/write does not mutate ThreadState messages, summary, or pinnedDecisions in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T023 [P] [US1] Add bounded extraction job input tests proving no full messages, raw transcript, raw tool result, raw resource content, GraphState, RuntimeArtifact, workflow progress, raw prompt, raw provider response, API key, cookie, or provider config are sent to the extractor in `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`

### Implementation for User Story 1

- [x] T024 [US1] Implement structured UserMemory candidate extraction schema and model adapter in `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts`
- [x] T025 [US1] Implement `processCompletedTurnForMemory` orchestration over extraction, validation, and write results in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`
- [x] T026 [US1] Implement bounded extraction job input builder and allowlist filtering in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`
- [x] T027 [US1] Add post-final-turn background UserMemory extraction enqueue after existing final-turn ThreadState append in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T028 [US1] Ensure UserMemory extraction/write result is not exposed as assistant tool call, stream chunk, hydration data, or reducer state in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`

**Checkpoint**: US1 can be validated independently with a persisted conversation, structured extraction outputs, and simulated store failure.

---

## Phase 4: User Story 4 - Validate And Reject Unsafe Candidates (Priority: P1)

**Goal**: 所有 UserMemory candidate 必须经过 deterministic validation；敏感、raw runtime、完整 transcript、过长、重复或无关内容必须拒绝。临时情绪或推测性表达主要由结构化提取阶段过滤，或由结构化 `stability` 字段驱动 validation 拒绝，不依赖窄关键词 validation 硬拒绝。

**Independent Test**: 分别提交敏感信息、临时情绪、完整 transcript、raw tool result、重复偏好和正常偏好，只允许安全稳定候选入库；临时情绪/推测性内容要么在提取阶段返回 0 candidate，要么以 `stability=temporary/speculative` 被 validation 拒绝。

### Tests for User Story 4

- [x] T029 [P] [US4] Add rejection tests for sensitive personal information, API key, cookie, provider config, and raw prompt text in `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] T030 [P] [US4] Add rejection tests for full transcript, raw tool result, raw resource content, MCP envelope, GraphState, RuntimeArtifact, workflow progress, stack trace, and provider response in `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] T031 [P] [US4] Add validation/service tests for unsupported type, low confidence, oversized text, duplicate memory, irrelevant content, untrusted model fields, and structured `stability`-driven rejection for temporary/speculative content in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`

### Implementation for User Story 4

- [x] T032 [US4] Extend validation denylist and structural checks for sensitive and raw runtime content in `apps/webapp/lib/ai/runtime/user-memory/validation.ts`
- [x] T033 [US4] Extend `putCandidate` duplicate detection and rejected result mapping in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T034 [US4] Ensure validation diagnostics and raw model extraction output remain request-local and are not persisted in UserMemory documents in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`

**Checkpoint**: US4 protects the Store boundary before retrieval and wider integration.

---

## Phase 5: User Story 2 - Reuse Memory Across Conversations (Priority: P1)

**Goal**: conversation A 保存的相关 UserMemory 可以在同一 browser session 的 conversation B 中被召回并注入为 supplemental context，不泄漏 conversation A messages。

**Independent Test**: conversation A 保存“用户喜欢吃桃子”，conversation B 问“给我推荐几种水果”，验证只召回当前 session scope 的相关 UserMemory，且 ThreadState 不包含 A 的 messages。

### Tests for User Story 2

- [x] T035 [P] [US2] Add retrieval tests for same-session relevant memory, cross-session exclusion, active status, confidence threshold, and max count bounds in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T036 [P] [US2] Add context builder tests for supplemental SystemMessage wording, per-memory 300 char bound, total 900 char bound, and latest-user-message priority wording in `apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts`
- [x] T037 [P] [US2] Add ChatOrchestrator cross-conversation context injection test for ordinary text chat in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T038 [P] [US2] Add ChatOrchestrator tool-assisted ordinary chat injection test for planning and final-answer messages in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 2

- [x] T039 [US2] Implement rule-based relevant memory retrieval with namespace scope, structured tags / normalized text overlap, type, status, confidence, recency, and bounds in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T040 [US2] Implement supplemental UserMemory context message builder in `apps/webapp/lib/ai/runtime/user-memory/context-builder.ts`
- [x] T041 [US2] Add eligible ordinary text chat UserMemory retrieval before short-term ThreadState context assembly in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T042 [US2] Add tool-assisted ordinary chat UserMemory context to planning and final-answer message assembly without changing tool authority in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T043 [US2] Ensure retrieved UserMemory never enters hydration payload or Conversation Registry response in `apps/webapp/app/api/chat/thread/route.ts`
- [x] T044 [US2] Ensure retrieved UserMemory never enters conversation list or registry payload in `apps/webapp/app/api/chat/conversations/route.ts`

**Checkpoint**: US2 demonstrates the core long-term memory value across conversations without short-term message leakage.

---

## Phase 6: User Story 3 - Do Not Inject Irrelevant Memory (Priority: P1)

**Goal**: 不相关 UserMemory 不进入模型上下文；系统允许 0 条长期记忆注入。

**Independent Test**: 保存“用户喜欢吃桃子”后询问“解释 React useEffect”，验证 selected UserMemories 为空且上下文不包含这条用户偏好。

### Tests for User Story 3

- [x] T045 [P] [US3] Add retrieval tests for irrelevant memory returning empty selection in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T046 [P] [US3] Add ChatOrchestrator test that unrelated UserMemory is absent from ordinary technical-question model context in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 3

- [x] T047 [US3] Tighten relevance scoring thresholds and irrelevant-type filtering in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T048 [US3] Ensure context builder returns no UserMemory SystemMessage when selected memory list is empty in `apps/webapp/lib/ai/runtime/user-memory/context-builder.ts`

**Checkpoint**: US3 proves retrieval is selective and does not turn UserMemory into a global profile injection.

---

## Phase 7: User Story 8 - Store Failure Degrades Safely (Priority: P1)

**Goal**: Store read/write/setup/provider failure 降级为 no-long-term-memory mode，不影响普通聊天、streaming、final-turn memory、ThreadState 或用户界面。

**Independent Test**: 模拟 Store unavailable，验证 ordinary chat 继续完成、retrieval 注入 0 条、write failure 不影响 final-turn memory，且不暴露 raw database/store/provider internals。

### Tests for User Story 8

- [x] T049 [P] [US8] Add retrieval failure degradation tests returning empty UserMemory selection in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T050 [P] [US8] Add extraction/write failure degradation tests preserving completed answer and ThreadState behavior in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T051 [P] [US8] Add setup script failure and safe logging tests in `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`

### Implementation for User Story 8

- [x] T052 [US8] Harden Store read failure handling to return empty retrieval results without throwing in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T053 [US8] Harden extraction and Store write failure handling to return skipped/failed result without throwing into ChatOrchestrator in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`
- [x] T054 [US8] Implement setup script with safe env loading, `PostgresStore.fromConnString`, `store.setup()`, `store.stop()`, and sanitized output in `apps/webapp/scripts/setup-user-memory-store.mjs`
- [x] T055 [US8] Ensure ChatOrchestrator catches UserMemory service failures without exposing raw errors to stream or response payloads in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`

**Checkpoint**: US8 confirms UserMemory is not a single point of failure.

---

## Phase 8: User Story 5 - Handle Conflict Or Update Signals (Priority: P2)

**Goal**: 用户明确否定或更新旧记忆时，系统持久 suppress 旧 UserMemory，使其不再参与 retrieval；本版不做物理删除或管理 UI。

**Independent Test**: 先保存“用户喜欢吃桃子”，再发送“我现在不太喜欢吃桃子了，以后别按这个推荐”，后续水果推荐不再召回旧记忆。

### Tests for User Story 5

- [x] T056 [P] [US5] Add conflict and natural-language forget extraction tests in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] T057 [P] [US5] Add suppression retrieval exclusion tests for inactive and suppressed documents in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T058 [P] [US5] Add ChatOrchestrator regression test that contradicted memory is not reinforced after suppression in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 5

- [x] T059 [US5] Extend structured candidate extraction to emit conflict, update, forget, negation, and suppress action signals in `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts`
- [x] T060 [US5] Implement persistent suppression fields and status transitions in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T061 [US5] Ensure retrieval excludes `inactive` and `suppressed` UserMemory documents in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`

**Checkpoint**: US5 prevents stale contradicted memories from continuing to influence future answers.

---

## Phase 9: User Story 6 - Promote Stable Pinned Decisions After Compaction (Priority: P2)

**Goal**: successful compaction 后只评估新增或变化的 pinnedDecisions，经过 validation 后才可 promotion；不扫描完整 transcript，不把 summary 或全部 pinnedDecisions 直接写入长期记忆。

**Independent Test**: 触发 compaction 产生新增 pinnedDecision，验证只对 diff 生成 promotion candidate 并通过同一 validation/write path。

### Tests for User Story 6

- [x] T062 [P] [US6] Add pinnedDecision diff detection tests for added, changed, unchanged, and removed decisions in `apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`
- [x] T063 [P] [US6] Add promotion validation tests proving summary and full pinnedDecision list are not written directly in `apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`
- [x] T064 [P] [US6] Add compaction failure regression test proving promotion is skipped when compaction does not complete in `apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`

### Implementation for User Story 6

- [x] T065 [US6] Implement `promotePinnedDecisionDiff` candidate generation and validation reuse in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T066 [US6] Surface previous and next pinnedDecisions around successful compaction without changing ThreadState shape in `apps/webapp/lib/ai/runtime/chat-memory/compaction.ts`
- [x] T067 [US6] Call pinnedDecision promotion only after successful compaction and ignore promotion failures safely in `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts`

**Checkpoint**: US6 enables conservative promotion from stable short-term decisions without broad auto-extraction.

---

## Phase 10: User Story 7 - Draft First Message Memory Extraction Is Enqueued Only After Promotion (Priority: P2)

**Goal**: draft 首条消息中的 explicit memory intent 或其他 memory signal 必须先完成 conversation promotion，assistant final turn 完成后才 enqueue 带 sourceConversationId 的 UserMemory extraction；失败、取消或拒绝时不写入。

**Independent Test**: 从 blank draft 发送“记住我不吃香菜”，验证 route 先创建 persisted conversation，final turn 后才 enqueue extraction/write；失败路径不创建 ghost memory。

### Tests for User Story 7

- [x] T068 [P] [US7] Add route integration test for draft first message promotion before UserMemory extraction enqueue in `apps/webapp/tests/app/api/chat/route-user-memory-draft.test.ts`
- [x] T069 [P] [US7] Add failure, cancellation, and rejected first-message tests proving no UserMemory extraction/write occurs without persisted source conversation in `apps/webapp/tests/app/api/chat/route-user-memory-draft.test.ts`
- [x] T070 [P] [US7] Add service test rejecting candidates without sourceConversationId in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`

### Implementation for User Story 7

- [x] T071 [US7] Ensure `/api/chat` passes only persisted `validatedConversationId` into ChatOrchestrator UserMemory extraction flow in `apps/webapp/app/api/chat/route.ts`
- [x] T072 [US7] Ensure UserMemory service skips writes with missing or draft source conversation identity in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T073 [US7] Ensure draft promotion failure paths never enqueue UserMemory extraction jobs in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`

**Checkpoint**: US7 preserves v0.4.4 blank draft semantics and avoids ghost conversations.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: 完成非回归验证、文档同步和 release-ready 检查。

- [x] T074 [P] Add Tasklist and Delivery non-retrieval and non-extraction regression tests in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T075 [P] Add final-turn memory compatibility regression tests for v0.4.3 behavior in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T076 [P] Add Conversation Registry and hydration non-regression tests proving UserMemory is absent from public payloads in `apps/webapp/tests/app/api/chat/route-user-memory-draft.test.ts`
- [x] T077 [P] Run existing stream-core protocol tests and record no-change evidence without modifying `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- [x] T078 [P] Update UserMemory setup and runtime guidance in `specs/045-long-term-user-memory-store/quickstart.md`
- [x] T079 [P] Update implementation notes if code-level setup or provider details drift from plan in `specs/045-long-term-user-memory-store/plan.md`
- [x] T080 [P] Update public version notes for v0.4.5 in `docs/versions/v0.4.5-long-term-user-memory-store-baseline.md`
- [x] T081 [P] Update release gate status and execution evidence in `specs/045-long-term-user-memory-store/acceptance.md`
- [x] T082 [P] Update implemented or changed decisions discovered during implementation in `specs/045-long-term-user-memory-store/decisions.md`
- [x] T083 Run focused UserMemory test suite and record command/result in `specs/045-long-term-user-memory-store/quickstart.md`
- [x] T084 Run `pnpm typecheck` and record command/result in `specs/045-long-term-user-memory-store/quickstart.md`
- [x] T085 Run `pnpm lint:webapp` and record command/result in `specs/045-long-term-user-memory-store/quickstart.md`
- [x] T086 Run `pnpm --dir apps/webapp test` and record command/result in `specs/045-long-term-user-memory-store/quickstart.md`

---

## Phase 12: Stable Key Structured Identity Alignment

**Purpose**: 对齐 structured identity stable key 方案与 Spec Kit 资产、测试和公开文档。

- [x] T087 [P] Align stable key structured-identity requirements, data model, decisions, contracts, and acceptance notes in `specs/045-long-term-user-memory-store/`
- [x] T088 Replace regex-based stable key helpers with structured identity schema and normalization in `apps/webapp/lib/ai/runtime/user-memory/`
- [x] T089 [P] Update focused tests and public version/release docs for structured-identity stable key behavior in `apps/webapp/tests/`, `docs/versions/`, and `docs/releases/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1 and blocks all user stories.
- **US1 (Phase 3)**: depends on Foundational; MVP background extraction pipeline.
- **US4 (Phase 4)**: depends on Foundational and should complete before broad retrieval usage.
- **US2 (Phase 5)**: depends on Foundational, US1 extraction/write path, and US4 validation guardrails.
- **US3 (Phase 6)**: depends on US2 retrieval/context builder.
- **US8 (Phase 7)**: depends on provider/service/orchestrator integration from US1 and US2.
- **US5 (Phase 8)**: depends on US1 extraction/write/update path and US2 retrieval path.
- **US6 (Phase 9)**: depends on validation/service from Foundational and compaction integration context.
- **US7 (Phase 10)**: depends on US1 extraction enqueue hook and existing route draft promotion behavior.
- **Polish (Phase 11)**: depends on all desired stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: first independently valuable MVP after Foundational.
- **User Story 4 (P1)**: can run after Foundational and should finish before relying on persisted data.
- **User Story 2 (P1)**: needs store/write/retrieval basics; validates cross-conversation value.
- **User Story 3 (P1)**: builds on retrieval to prove selective injection.
- **User Story 8 (P1)**: validates failure degradation across provider, service, and orchestrator.
- **User Story 5 (P2)**: depends on stable keys and retrieval exclusion.
- **User Story 6 (P2)**: depends on validation/write path and chat-memory compaction hooks.
- **User Story 7 (P2)**: depends on extraction enqueue hook and route-level persisted conversation identity.

### Within Each User Story

- Write tests before implementation tasks in the same story.
- Keep `user-memory` service/schema tests passing before ChatOrchestrator integration.
- Keep Tasklist / Delivery and stream-core changes out of feature implementation unless a non-regression test fails.
- Stop at each checkpoint and validate the story independently before moving to the next phase.

---

## Parallel Execution Examples

### Parallel Example: Foundational

```text
Task: "Define UserMemory document, candidate, selected memory, type, status, source, and result types in apps/webapp/lib/ai/runtime/user-memory/state-schema.ts"
Task: "Define runtime config constants for mode, schema name, confidence threshold, and context bounds in apps/webapp/lib/ai/runtime/user-memory/runtime-config.ts"
Task: "Add validation tests for allowed memory types, required sourceConversationId, confidence threshold, text length, and safe tags in apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts"
Task: "Add service tests for putCandidate, duplicate update, missing session, missing source conversation, and non-throwing store errors in apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts"
```

### Parallel Example: User Story 1

```text
Task: "Add structured extraction tests for 0..N candidates, explicit intent signal, ordinary stable preference, and no-memory turn in apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts"
Task: "Add ChatOrchestrator final-turn background job enqueue timing tests for eligible ordinary and tool-assisted turns in apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts"
Task: "Implement structured UserMemory candidate extraction schema and model adapter in apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts"
```

### Parallel Example: User Story 2

```text
Task: "Add retrieval tests for same-session relevant memory, cross-session exclusion, active status, confidence threshold, and max count bounds in apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts"
Task: "Add context builder tests for supplemental SystemMessage wording, per-memory 300 char bound, total 900 char bound, and latest-user-message priority wording in apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts"
Task: "Implement rule-based relevant memory retrieval with namespace scope, structured tags / normalized text overlap, type, status, confidence, recency, and bounds in apps/webapp/lib/ai/runtime/user-memory/retrieval.ts"
```

### Parallel Example: User Story 6

```text
Task: "Add pinnedDecision diff detection tests for added, changed, unchanged, and removed decisions in apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts"
Task: "Implement promotePinnedDecisionDiff candidate generation and validation reuse in apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts"
Task: "Surface previous and next pinnedDecisions around successful compaction without changing ThreadState shape in apps/webapp/lib/ai/runtime/chat-memory/compaction.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1 background extraction pipeline).
3. Validate focused provider/validation/service/orchestrator tests for US1.
4. Stop and confirm no UserMemory data enters ThreadState, hydration, stream-core, or reducer state.

### Recommended Incremental Delivery

1. Store/schema/provider/validation baseline.
2. Background structured extraction pipeline for eligible completed ordinary turns.
3. Unsafe candidate rejection and dedupe hardening.
4. Relevant retrieval and bounded context injection for ordinary text/tool-assisted ordinary chat.
5. Irrelevant memory exclusion.
6. Store failure degradation.
7. Conflict/update suppression.
8. PinnedDecision promotion after compaction.
9. Draft first-message promotion-before-write rule.
10. Non-regression and documentation closeout.

### Parallel Team Strategy

1. One developer owns `apps/webapp/lib/ai/runtime/user-memory/` provider/schema/validation/service.
2. One developer owns `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` retrieval/extraction enqueue integration tests and implementation.
3. One developer owns `apps/webapp/lib/ai/runtime/chat-memory/` compaction promotion tests and hook.
4. One developer owns setup script, package scripts, route draft tests, and docs closeout.

## Notes

- Do not modify `@ai-mind/stream-core` chunk union for this feature.
- Do not add frontend reducer state or a dedicated remembered-status UI.
- Do not add Prisma migrations for LangGraph Store tables.
- Do not expose a memory-write tool to the main assistant in v0.4.5.
- Do not connect UserMemory retrieval or extraction enqueue to Tasklist or Delivery in v0.4.5.
- Keep `UserMemory` separate from ThreadState, Conversation Registry, hydration payload, ChatMessage history, GraphState, RuntimeArtifact, and raw tool/provider data.
