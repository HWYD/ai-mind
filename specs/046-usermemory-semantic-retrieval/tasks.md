# Tasks: AI Mind v0.4.6 UserMemory Semantic Retrieval Baseline

**Input**: Design documents from `/specs/046-usermemory-semantic-retrieval/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), [contracts/](./contracts/)

**Tests**: 本版本是 Level C retrieval/runtime extension；按 constitution 的 Tests Before Broad Integration，包含 focused provider/service/retrieval/orchestrator/non-regression tests。

**Organization**: Tasks 按 user story 分组，执行顺序采用推荐拆分：semantic config/types -> provider/index write path -> semantic retrieval core -> ordinary chat integration -> indirect recall / irrelevant filtering / failure degradation / suppression / tool-assisted boundary -> final cleanup 与 non-regression。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel when it touches different files and does not depend on an incomplete task.
- **[Story]**: Maps implementation work to a spec user story.
- 每个任务都包含明确文件路径，便于后续直接实现。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 semantic retrieval 共用常量、类型和测试脚手架。

- [x] T001 Add semantic retrieval defaults for score threshold, topK, timeout, and query clipping in `apps/webapp/lib/ai/runtime/user-memory/runtime-config.ts`
- [x] T002 [P] Extend semantic retrieval request/result and semantic metadata types in `apps/webapp/lib/ai/runtime/user-memory/state-schema.ts`
- [x] T003 [P] Add semantic retrieval shared fixtures and helper scaffolding in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共享的 provider、index write path、candidate safety 和 metadata 基线。完成前不要接入 ChatOrchestrator。

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Add provider tests for `PostgresStore` vector mode, Volcengine embedding config, and no test-only runtime mode in `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] T005 Implement Volcengine `doubao-embedding-vision` provider bootstrap and `PostgresStore` vector configuration in `apps/webapp/lib/ai/runtime/user-memory/provider.ts`
- [x] T006 [P] Add service tests for allowlisted semantic index writes, internal metadata persistence, and no raw payload leakage in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] T007 Implement semantic index metadata persistence and `text`/`tags`-only store writes in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T008 [P] Add semantic-safe extraction candidate tests in `apps/webapp/tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts`
- [x] T009 [P] Add validation tests for semantic metadata safety, confidence floor, and status eligibility in `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] T010 Keep extraction outputs limited to validated semantic-safe UserMemory fields in `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts`
- [x] T011 Implement semantic index input guardrails and metadata sanitization in `apps/webapp/lib/ai/runtime/user-memory/validation.ts`
- [x] T012 Update extraction pipeline handoff to reuse validated semantic-safe UserMemory inputs without persisting raw runtime artifacts in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`

**Checkpoint**: Foundation ready. Provider/index write path, candidate safety, and semantic metadata are testable without chat integration.

---

## Phase 3: User Story 1 - 回答风格偏好的语义召回 (Priority: P1) 🎯 MVP

**Goal**: ordinary text chat 可以在用户换一种说法时，跨 conversations 语义召回答题风格偏好，并作为受控 supplemental context 注入。

**Independent Test**: 在 conversation A 保存“以后解释技术问题时，先用大白话，再补充专业说明”，在同一 browser session 的 conversation B 提问“LangGraph Store 是什么？别讲太抽象”，验证 semantic retrieval 选中该 UserMemory，且 `ThreadState` 仍是短期上下文事实源。

### Tests for User Story 1

- [x] T013 [P] [US1] Add semantic retrieval tests for communication preference recall across conversations in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T014 [P] [US1] Add ordinary chat orchestrator tests for communication preference semantic injection in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 1

- [x] T015 [US1] Implement query normalization, vector search invocation, topK=`8`, and score-threshold selection in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T016 [US1] Integrate ordinary chat semantic retrieval into context assembly in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T017 [US1] Update bounded supplemental prompt building for selected semantic memories in `apps/webapp/lib/ai/runtime/user-memory/context-builder.ts`

**Checkpoint**: US1 delivers the MVP semantic retrieval value for ordinary text chat.

---

## Phase 4: User Story 2 - 饮食偏好的语义召回 (Priority: P1)

**Goal**: 系统可以在没有精确关键词重合时，语义召回间接相关的长期饮食偏好，并避免推荐冲突内容。

**Independent Test**: 保存“记住我不吃香菜”，再问“今天适合吃什么清淡点？”，验证 semantic retrieval 能选中该 UserMemory，且回答上下文避开香菜依赖型推荐。

### Tests for User Story 2

- [x] T018 [P] [US2] Add semantic retrieval tests for indirect dietary preference recall without exact keyword overlap in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T019 [P] [US2] Add ordinary chat integration tests for dietary preference answer-context behavior in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Refine semantic index payload assembly to keep reusable text/tag signals for indirect preference recall in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`
- [x] T021 [US2] Preserve reusable semantic tags through extraction-to-store handoff for preference memories in `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`

**Checkpoint**: US2 proves semantic retrieval handles indirect, user-facing preference scenarios instead of only near-keyword matches.

---

## Phase 5: User Story 3 - 不相关问题不召回 (Priority: P1)

**Goal**: 不相关的长期记忆不进入当前 ordinary chat 上下文，低相关或不可信候选宁可返回 0 条。

**Independent Test**: 保存“用户不吃香菜”后询问“解释一下 React Server Components 的边界”，验证 selected UserMemory 为空，且模型上下文不包含该饮食偏好。

### Tests for User Story 3

- [x] T022 [P] [US3] Add low-relevance zero-injection retrieval tests for unrelated technical questions in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T023 [P] [US3] Add ordinary chat no-injection integration tests for unrelated memories in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 3

- [x] T024 [US3] Enforce conservative empty-selection behavior for low-relevance or score-anomalous semantic hits in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T025 [US3] Ensure context builder skips UserMemory prompt emission when semantic selection is empty in `apps/webapp/lib/ai/runtime/user-memory/context-builder.ts`

**Checkpoint**: US3 proves the retrieval path is selective and does not turn UserMemory into a global profile injection.

---

## Phase 6: User Story 4 - Semantic retrieval 失败时安全降级 (Priority: P1)

**Goal**: semantic retrieval、embedding provider 或 Store 出错时，ordinary chat 继续，selected UserMemory 允许为空，不暴露 raw internal errors。

**Independent Test**: 模拟 embedding provider unavailable、Store timeout、semantic search throw、score 缺失或异常，验证 ordinary chat 仍完成、streaming 不受影响，selected UserMemory 变为 `[]`。

### Tests for User Story 4

- [x] T026 [P] [US4] Add provider/store timeout and failure-path retrieval tests that degrade to `[]` in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T027 [P] [US4] Add chat runtime degradation tests that preserve streaming and final-turn behavior in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`

### Implementation for User Story 4

- [x] T028 [US4] Implement 1500ms timeout, fail-open handling, and sanitized failure logging in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T029 [US4] Guard ordinary chat runtime from semantic retrieval failures and keep final-turn behavior unchanged in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`

**Checkpoint**: US4 confirms semantic retrieval is never a single point of failure.

---

## Phase 7: User Story 5 - Suppressed memory 不参与语义召回 (Priority: P1)

**Goal**: 被 suppressed 或 inactive 的旧记忆即使被 semantic search 命中，也不得参与最终注入；当前用户输入冲突时优先当前输入。

**Independent Test**: 先保存“用户喜欢吃桃子”，再明确否定该偏好，后续相关问题中验证旧偏好不再参与 semantic retrieval 注入。

### Tests for User Story 5

- [x] T030 [P] [US5] Add suppressed/inactive exclusion tests and current-input-conflict tests in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T031 [P] [US5] Add service tests for semantic eligibility transitions after suppression or inactivation in `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`

### Implementation for User Story 5

- [x] T032 [US5] Enforce active/suppressed/inactive filtering, `stableKey` dedupe, and conflict resolution in `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T033 [US5] Update semantic index metadata and eligibility handling for suppressed or inactive UserMemory in `apps/webapp/lib/ai/runtime/user-memory/user-memory-service.ts`

**Checkpoint**: US5 prevents stale contradicted memories from continuing to influence future answers.

---

## Phase 8: User Story 6 - Tool-assisted ordinary chat 的受控接入 (Priority: P2)

**Goal**: tool-assisted ordinary chat 在 ordinary chat boundary 内接入同一套 semantic retrieval；`reader-skill` capability-context final answer stage 在仍处于 ordinary chat boundary 内时可复用同一套上下文装配规则，但不能改变 tool authority、raw tool input、MCP raw fetch/input path 或 Tasklist / Delivery routing。

**Independent Test**: 在 tool-assisted ordinary chat 或仍处于 ordinary chat boundary 内的 `reader-skill` capability-context 最终回答阶段提出与长期偏好相关的问题，验证 UserMemory 可影响最终普通回答上下文；当路径边界判定不清时，默认不触发 retrieval；Tasklist / Delivery / HITL 路径仍不触发；raw MCP fetch/input path 仍不接收 UserMemory context。

### Tests for User Story 6

- [x] T034 [P] [US6] Add tool-assisted ordinary chat semantic retrieval tests in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] T035 [P] [US6] Add excluded Tasklist/Delivery/HITL no-retrieval tests in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation for User Story 6

- [x] T036 [US6] Tighten `isUserMemoryContextEligibleRequest` handling for tool-assisted ordinary chat and default-to-ineligible ambiguity cases in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T037 [US6] Ensure semantic context never flows into raw tool input or MCP raw fetch/input paths, while keeping eligible `reader-skill` capability-context final answer stage inside ordinary chat context assembly in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`

**Checkpoint**: US6 extends semantic retrieval to the allowed ordinary chat boundary, including eligible tool-assisted and capability-context final answer stages, without polluting Tasklist, Delivery, or MCP raw fetch/input authority.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 完成最终 cleanup、非回归验证和执行证据收口。

- [x] T038 [P] Remove formal rule-based / lexical runtime wiring from `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts`
- [x] T039 [P] Remove stale rule-based exports and config dependencies from `apps/webapp/lib/ai/runtime/user-memory/index.ts` and `apps/webapp/lib/ai/runtime/user-memory/runtime-config.ts`
- [x] T040 [P] Add hydration/public-state non-regression tests proving UserMemory semantic internals stay server-side in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T041 [P] Add stream protocol non-regression assertion coverage without changing payload shapes in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- [x] T042 [P] Add semantic score anomaly retrieval tests for missing/`NaN`/unstable scores that must degrade to zero injection in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T043 [P] Add write-boundary non-regression tests covering explicit memory intent strong-signal retention, non-exclusive extraction eligibility, no new auto-write sources, and pinnedDecision promotion compatibility in `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] T044 [P] Add Conversation Registry and frontend reducer public-shape non-regression tests proving semantic internals stay out of registry payloads and reducer state in `apps/webapp/tests/app/api/chat/conversations/route.test.ts` and `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] T045 [P] Add Tasklist/Delivery non-regression tests covering checkpoint/resume, run-local, workflow progress, and GraphState boundary stability in `apps/webapp/tests/app/api/agent-runs/route.test.ts`, `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-runner.integration.test.ts`, and `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] T046 [P] Add deterministic query-handling tests proving retrieval uses latest user input directly, applies only trim/whitespace-fold/800-char clipping, and never performs LLM query rewrite in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] T047 [P] Add sanitized semantic retrieval logging tests proving raw query text, raw UserMemory text, embedding vectors, and raw provider/store error payloads never reach persisted logs in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts` and `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] T048 [P] Add bounded UserMemory injection compatibility tests covering max-3 selection, per-memory/per-total length caps, and confidence floor preservation in `apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts`
- [x] T049 [P] Draft and maintain `specs/046-usermemory-semantic-retrieval/acceptance.md` for release gate, functional acceptance, non-regression acceptance, focused test list, and validation evidence
- [x] T050 [P] Update semantic retrieval validation steps and execution notes in `specs/046-usermemory-semantic-retrieval/quickstart.md`
- [x] T051 Run focused semantic retrieval test suite and record commands/results in `specs/046-usermemory-semantic-retrieval/quickstart.md`
- [x] T052 Run `pnpm typecheck`, `pnpm lint:webapp`, and `pnpm --dir apps/webapp test` and record commands/results in `specs/046-usermemory-semantic-retrieval/quickstart.md`

---

## Phase 10: Runtime Boundary Cleanup

**Purpose**: 收口 runtime environment boundary，移除正式实现里的测试专用 runtime 分支；测试替身只保留在测试侧。

- [x] T053 [P] Update provider/runtime-config tests so local development, integration, preview, staging, and production all default to `PostgresStore` in `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] T054 [P] Adjust retrieval/service focused tests to keep stable semantic behavior through test-side fake / mocked store/search or explicit test doubles instead of runtime `memory` mode in `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts` and `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] T055 Remove development default `memory` mode from `apps/webapp/lib/ai/runtime/user-memory/runtime-config.ts` and require `PostgresStore` as the default runtime path
- [x] T056 Refactor `apps/webapp/lib/ai/runtime/user-memory/provider.ts` and `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts` so test-only semantic helpers are removed from production runtime and no longer participate in the formal runtime default branch
- [x] T057 Re-run focused provider/service/retrieval validation plus `pnpm --dir apps/webapp test`, then update `specs/046-usermemory-semantic-retrieval/acceptance.md` and `specs/046-usermemory-semantic-retrieval/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1 and blocks all user stories.
- **US1 (Phase 3)**: depends on Foundational and delivers the MVP semantic retrieval core for ordinary chat.
- **US2 (Phase 4)**: depends on Foundational and the semantic retrieval core from US1.
- **US3 (Phase 5)**: depends on Foundational and builds on the semantic retrieval core from US1.
- **US4 (Phase 6)**: depends on Foundational and the semantic retrieval core from US1.
- **US5 (Phase 7)**: depends on Foundational and the persisted semantic retrieval path from US1.
- **US6 (Phase 8)**: depends on Foundational and the orchestrator integration from US1.
- **Polish (Phase 9)**: depends on all desired stories being complete.
- **Runtime Boundary Cleanup (Phase 10)**: depends on prior implementation completion and finalizes runtime boundary cleanup / revalidation.

### User Story Dependencies

- **User Story 1 (P1)**: first independently valuable MVP after Foundational.
- **User Story 2 (P1)**: validates indirect semantic recall once the core retrieval path exists.
- **User Story 3 (P1)**: proves selective non-injection behavior on top of the retrieval path.
- **User Story 4 (P1)**: hardens the retrieval path with fail-open behavior and sanitized degradation.
- **User Story 5 (P1)**: depends on stable key, status, and retrieval exclusion behavior.
- **User Story 6 (P2)**: depends on orchestrator eligibility and context-routing control.

### Within Each User Story

- Write tests before implementation tasks in the same story.
- Keep `user-memory` provider/service/schema tests passing before broader orchestrator integration.
- Keep semantic retrieval runtime-controlled; do not introduce a main-assistant memory-search tool.
- Keep Tasklist / Delivery / hydration / stream-core changes out of implementation unless a non-regression test proves they are needed.
- Stop at each checkpoint and validate the story independently before moving to the next phase.

---

## Parallel Execution Examples

### Parallel Example: Foundational

```text
Task: "Add provider tests for PostgresStore vector mode, Volcengine embedding config, and no test-only runtime mode in apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts"
Task: "Add service tests for allowlisted semantic index writes, internal metadata persistence, and no raw payload leakage in apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts"
Task: "Add semantic-safe extraction candidate tests in apps/webapp/tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts"
Task: "Add validation tests for semantic metadata safety, confidence floor, and status eligibility in apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts"
```

### Parallel Example: User Story 1

```text
Task: "Add semantic retrieval tests for communication preference recall across conversations in apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts"
Task: "Add ordinary chat orchestrator tests for communication preference semantic injection in apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts"
Task: "Update bounded supplemental prompt building for selected semantic memories in apps/webapp/lib/ai/runtime/user-memory/context-builder.ts"
```

### Parallel Example: User Story 4

```text
Task: "Add provider/store timeout and failure-path retrieval tests that degrade to [] in apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts"
Task: "Add chat runtime degradation tests that preserve streaming and final-turn behavior in apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts"
Task: "Implement 1500ms timeout, fail-open handling, and sanitized failure logging in apps/webapp/lib/ai/runtime/user-memory/retrieval.ts"
```

### Parallel Example: User Story 6

```text
Task: "Add tool-assisted ordinary chat semantic retrieval tests in apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts"
Task: "Add excluded Tasklist/Delivery/HITL no-retrieval tests in apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts"
Task: "Ensure semantic context never flows into raw tool input or MCP raw fetch/input paths, while keeping eligible reader-skill capability-context final answer stage inside ordinary chat context assembly in apps/webapp/lib/ai/runtime/chat-orchestrator.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (User Story 1).
3. Validate the focused semantic retrieval tests for ordinary text chat.
4. Stop and confirm semantic retrieval remains separate from ThreadState, hydration, stream payload, and public reducer state.

### Incremental Delivery

1. Complete Setup + Foundational to lock provider/index write boundaries.
2. Add User Story 1 and validate cross-conversation communication preference recall.
3. Add User Story 2 and validate indirect preference recall.
4. Add User Story 3 and validate irrelevant-memory zero injection.
5. Add User Story 4 and validate fail-open degradation.
6. Add User Story 5 and validate suppression/conflict exclusion.
7. Add User Story 6 and validate tool-assisted ordinary chat boundary control.
8. Finish final cleanup and non-regression checks.

### Parallel Team Strategy

1. One developer owns `apps/webapp/lib/ai/runtime/user-memory/` provider/service/validation/index-write tasks.
2. One developer owns `apps/webapp/lib/ai/runtime/user-memory/retrieval.ts` and retrieval-focused tests.
3. One developer owns `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` integration and ordinary/tool-assisted boundary tests.
4. One developer owns non-regression validation in hydration/stream tests and quickstart execution evidence.

---

## Notes

- Do not add new UserMemory write sources in v0.4.6.
- Do not add LLM query rewrite, HyDE, query expansion, or semantic + lexical merge in this version.
- Do not use `PostgresStore` hybrid/text search as the semantic path.
- Do not index full UserMemory JSON, raw user message, transcript, ThreadState, raw tool result, MCP raw resource content, GraphState, RuntimeArtifact, or provider/runtime internals.
- Do not expose UserMemory semantic internals, embedding vectors, or raw provider/store errors to hydration payloads, stream chunks, reducer public state, or frontend UI.
- Do not connect semantic retrieval to Tasklist, Delivery, HITL, workflow progress, hydration, sidebar loading, or conversation switching.
