# Tasks: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Input**: Design documents from `specs/042-langgraph-thread-memory/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: 本版本涉及 API contract、runtime state、checkpoint、frontend hydrate 和 non-regression。按 constitution 要求采用 tests-first 顺序：先补 contract/runtime tests，再实现，再补集成与回归。

**Organization**: Tasks 按 user story 分组，保证每个 story 可以独立验证。Phase 1 + Phase 2 + US1 是最小 MVP；US2 是完整 v0.4.2 的上下文压缩增量；US3 + US4 是安全和非回归收口。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行，前提是不同文件且不依赖尚未完成任务。
- **[Story]**: 只在 user story phase 中使用，例如 `[US1]`。
- 每个任务都包含明确文件路径。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 准备 chat memory 模块边界、环境变量入口和部署 setup 入口。此阶段不实现业务逻辑。

- [x] T001 Create chat memory runtime module entry in `apps/webapp/lib/ai/runtime/chat-memory/index.ts`
- [x] T002 [P] Create chat memory test placeholder directory coverage by adding `apps/webapp/tests/lib/ai/runtime/chat-memory-runtime-config.test.ts`
- [x] T003 [P] Document `AI_MIND_CHAT_MEMORY_CHECKPOINT` in `apps/webapp/.env.example`
- [x] T004 [P] Document `AI_MIND_CHAT_MEMORY_CHECKPOINT` in `deploy/env/webapp.local.env.example`
- [x] T005 [P] Document `AI_MIND_CHAT_MEMORY_CHECKPOINT` in `deploy/env/webapp.production.env.example`
- [x] T006 [P] Document `AI_MIND_CHAT_MEMORY_CHECKPOINT` in `deploy/env/webapp.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立所有 user story 共用的 state schema、thread id、runtime config、checkpointer provider、adapter 和 setup 能力。

**Critical**: User story implementation must not begin until this phase is complete.

### Tests First

- [x] T007 [P] Add chat memory runtime config tests for default `memory` in development, default `postgres` in production, explicit `off`, and invalid values in `apps/webapp/tests/lib/ai/runtime/chat-memory-runtime-config.test.ts`
- [x] T008 [P] Add chat thread id tests for `chat:${sessionHash}` format, stable session hashing, and no raw session id exposure in `apps/webapp/tests/lib/ai/runtime/chat-memory-thread-id.test.ts`
- [x] T009 [P] Add ThreadState schema tests for text-only messages, summary bound, pinned decision bound, and forbidden raw runtime fields in `apps/webapp/tests/lib/ai/runtime/chat-memory-state.test.ts`
- [x] T010 [P] Add checkpointer provider tests for `off`, `memory`, `postgres`, missing `DATABASE_URL`, schema name `langgraph_chat_memory`, and process-level postgres reuse in `apps/webapp/tests/lib/ai/runtime/chat-memory-checkpointer-provider.test.ts`
- [x] T011 [P] Add setup script contract test that chat memory setup initializes `langgraph_chat_memory` without Prisma schema changes in `apps/webapp/tests/lib/ai/runtime/chat-memory-checkpointer.integration.test.ts`

### Implementation

- [x] T012 Implement chat memory runtime config parser in `apps/webapp/lib/ai/runtime/chat-memory/runtime-config.ts`
- [x] T013 Implement chat thread id derivation using the existing session ownership secret boundary in `apps/webapp/lib/ai/runtime/chat-memory/thread-id.ts`
- [x] T014 Implement ThreadState, ChatThreadMessage, CompactionResult, and hydration DTO schemas in `apps/webapp/lib/ai/runtime/chat-memory/state-schema.ts`
- [x] T015 Implement MindMessage/text-only adapter helpers in `apps/webapp/lib/ai/runtime/chat-memory/message-adapter.ts`
- [x] T016 Implement chat memory checkpointer provider with MemorySaver/PostgresSaver and schema `langgraph_chat_memory` in `apps/webapp/lib/ai/runtime/chat-memory/checkpointer-provider.ts`
- [x] T017 Add chat memory Postgres setup script in `apps/webapp/scripts/setup-chat-memory-checkpointer.mjs`
- [x] T018 Update existing LangGraph checkpoint setup script to keep Tasklist schema initialization explicit in `apps/webapp/scripts/setup-langgraph-checkpointer.mjs`
- [x] T019 Update webapp package scripts for chat memory setup and combined setup in `apps/webapp/package.json`
- [x] T020 Update root database setup script wiring for chat memory checkpoint setup in `package.json`
- [x] T021 Export foundational chat memory APIs from `apps/webapp/lib/ai/runtime/chat-memory/index.ts`

**Checkpoint**: Chat memory foundation is available and independently testable. No chat route or frontend behavior has changed yet.

---

## Phase 3: User Story 1 - Refresh Restores Current Chat (Priority: P1) MVP

**Goal**: 用户完成普通聊天后刷新页面，恢复同一浏览器 session 的 recent text messages，并能继续聊天。

**Independent Test**: 完成一轮普通 text chat，刷新页面或请求 hydrate route，能看到 recent user/assistant messages；无历史时返回空恢复结果。

### Tests for User Story 1

- [x] T022 [P] [US1] Add hydration API route tests for empty state, existing recent messages, Set-Cookie on new session, and same-session restore in `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] T023 [P] [US1] Add chat memory repository/service tests for empty read, append completed turn, same-thread read, and disabled mode in `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] T024 [P] [US1] Add frontend hydrate hook tests for initial restore, empty restore, and reducer snapshot sync in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T025 [US1] Add chat orchestrator memory write test for ordinary completed direct chat in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation for User Story 1

- [x] T026 [US1] Implement chat memory service read/write/append APIs in `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts`
- [x] T027 [US1] Implement safe hydration DTO builder in `apps/webapp/lib/ai/runtime/chat-memory/hydration-dto.ts`
- [x] T028 [US1] Add `GET /api/chat/thread` route in `apps/webapp/app/api/chat/thread/route.ts`
- [x] T029 [US1] Wire session resolution and sanitized fallback behavior into `apps/webapp/app/api/chat/thread/route.ts`
- [x] T030 [US1] Capture completed assistant text for eligible ordinary chat turns in `apps/webapp/lib/ai/runtime/assistant-stream.ts`
- [x] T031 [US1] Wire post-finish chat memory append for eligible ordinary text turns in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T032 [US1] Integrate hydration fetch on mount in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T033 [US1] Ensure hydrated messages rebuild stream reducer snapshots in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T034 [US1] Keep regenerated/deleted local turns compatible with hydrated messages in `apps/webapp/components/instamind/chat-stream/message-operations.ts`

**Checkpoint**: US1 works independently. Current browser session can refresh and restore recent text messages. Disabled mode still allows ordinary chat.

---

## Phase 4: User Story 2 - Continue With Compacted Context (Priority: P1)

**Goal**: 长对话后只把 summary、pinned decisions 和 recent messages 注入模型上下文，不发送无限完整历史。

**Independent Test**: 构造超过阈值的多轮普通 text chat，确认 compaction 只接受结构化 `summary/pinnedDecisions` 输出，recent messages 在 compaction 后降到 4 条以内，下一轮模型上下文不包含完整历史。

### Tests for User Story 2

- [x] T035 [P] [US2] Update compaction policy tests for 8-message trigger, 4-message post-compaction retention, summary bound, pinned decision bound, and latest-message preservation in `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`
- [x] T036 [P] [US2] Add structured-output compaction failure tests for invalid schema output, provider/model error, and no corruption of previous ThreadState in `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`
- [x] T037 [P] [US2] Add context builder tests proving summary/pins/recent messages are injected and full history is not injected in `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`
- [x] T038 [US2] Add chat orchestrator context integration tests for memory context in direct answer, reader/utility, and docs summary style text paths in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation for User Story 2

- [x] T039 [US2] Replace deterministic compaction with LangChain structured-output compaction using fixed internal model id `deepseek/deepseek-v4-pro` in `apps/webapp/lib/ai/runtime/chat-memory/compaction.ts`
- [x] T040 [US2] Implement compaction policy with 8-message trigger, local 4-message retention after compaction, 2500-char summary target, and 20 pinned decisions in `apps/webapp/lib/ai/runtime/chat-memory/compaction.ts`
- [x] T041 [US2] Keep compaction failure as no-op without fallback in `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts`
- [x] T042 [US2] Implement memory context builder in `apps/webapp/lib/ai/runtime/chat-memory/context-builder.ts`
- [x] T043 [US2] Inject chat memory context into direct answer messages without replacing existing skill/output policy prompts in `apps/webapp/lib/ai/runtime/chat-session.ts`
- [x] T044 [US2] Inject chat memory context into final answer paths for eligible reader/utility/docs-summary text flows in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T045 [US2] Exclude `/tasklist` and `/delivery-chain` turns from memory context write and compaction in `apps/webapp/lib/ai/runtime/chat-memory/eligibility.ts`
- [x] T046 [US2] Export updated compaction APIs and keep eligibility/context builder APIs aligned in `apps/webapp/lib/ai/runtime/chat-memory/index.ts`

**Checkpoint**: US2 works independently after foundational + US1 service. Long ordinary chat stays bounded and compaction failures do not break completed answers.

---

## Phase 5: User Story 3 - Safe Hydration Payload (Priority: P2)

**Goal**: Hydration 只返回 safe DTO，不暴露 raw checkpoint、prompt、provider response、Tasklist GraphState、Delivery RuntimeArtifact 或 raw session id。

**Independent Test**: 请求 `GET /api/chat/thread` 并校验响应字段白名单；构造包含 forbidden-like 字段的 internal state 后，DTO 仍不泄漏。

### Tests for User Story 3

- [x] T047 [P] [US3] Add strict hydration schema tests that reject forbidden fields and unknown raw runtime fields in `apps/webapp/tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts`
- [x] T048 [P] [US3] Add route contract tests for forbidden field absence in `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] T049 [P] [US3] Add frontend type consumption test for hydrated `MindMessage[]` without reducer public shape changes in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T050 [US3] Add stream-core non-change assertion for no chat-memory chunk addition in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

### Implementation for User Story 3

- [x] T051 [US3] Harden hydration DTO schema with strict object parsing in `apps/webapp/lib/ai/runtime/chat-memory/hydration-dto.ts`
- [x] T052 [US3] Add forbidden field sanitizer/allowlist mapping in `apps/webapp/lib/ai/runtime/chat-memory/hydration-dto.ts`
- [x] T053 [US3] Ensure `/api/chat/thread` returns sanitized storage errors and never raw checkpoint/database errors in `apps/webapp/app/api/chat/thread/route.ts`
- [x] T054 [US3] Ensure frontend hydration ignores unknown response fields and only accepts validated text messages in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T055 [US3] Confirm no new chat memory stream chunks or reducer cases are added in `packages/stream-core/src/protocol/chat-stream-chunk.ts`

**Checkpoint**: US3 safety contract passes. Hydration is safe even when internal state contains fields that must never be public.

---

## Phase 6: User Story 4 - Existing Agent And Delivery Paths Do Not Regress (Priority: P2)

**Goal**: Tasklist Agent HITL/checkpoint/resume、Delivery Chain ControlledDeliveryManager、RuntimeArtifact run-local boundary、ToolRuntimeScope suppression、stream/reducer compatibility 全部保持不退化。

**Independent Test**: 打开 chat memory 后，现有 Tasklist 和 Delivery Chain focused suites 仍通过；structured command turns 不写入 chat ThreadState。

### Tests for User Story 4

- [x] T056 [P] [US4] Add Tasklist non-regression test that chat thread ids cannot be used for Tasklist resume in `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] T057 [P] [US4] Add Tasklist checkpointer provider non-regression test for unchanged `langgraph_checkpoint` schema in `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-checkpointer-provider.test.ts`
- [x] T058 [P] [US4] Add Delivery Chain non-regression test proving RuntimeArtifact and workflow progress are not written to chat memory in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] T059 [P] [US4] Add ToolRuntimeScope suppression non-regression test for `delivery-chain-manager` transcript silence in `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`
- [x] T060 [P] [US4] Add structured command eligibility tests for `/tasklist` and `/delivery-chain` exclusion in `apps/webapp/tests/lib/ai/runtime/chat-memory-eligibility.test.ts`
- [x] T061 [P] [US4] Add frontend reducer non-regression test with hydrated messages plus existing agent/workflow parts in `apps/webapp/tests/components/instamind/stream-message-reducer.test.ts`

### Implementation for User Story 4

- [x] T062 [US4] Enforce structured command exclusion rules in `apps/webapp/lib/ai/runtime/chat-memory/eligibility.ts`
- [x] T063 [US4] Keep Tasklist checkpointer provider isolated from chat memory provider in `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider.ts`
- [x] T064 [US4] Keep Delivery Chain manager run-local artifact flow unchanged in `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`
- [x] T065 [US4] Ensure `executeToolCall` transcript suppression for `delivery-chain-manager` remains unchanged in `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts`
- [x] T066 [US4] Verify no reducer public shape changes are needed in `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`

**Checkpoint**: US4 non-regression passes. Chat memory does not pollute Agent/Delivery runtime boundaries.

---

## Phase 7: Deployment, Documentation & Cross-Cutting Polish

**Purpose**: 收口部署、文档、验证命令和版本级质量门。

- [x] T067 [P] Update quickstart validation notes after implementation in `specs/042-langgraph-thread-memory/quickstart.md`
- [x] T068 [P] Update deployment setup docs for `AI_MIND_CHAT_MEMORY_CHECKPOINT` and `langgraph_chat_memory` in `deploy/env/webapp.production.env.example`
- [x] T069 [P] Update local compose/env docs for chat memory checkpoint setup in `deploy/env/webapp.local.env.example`
- [x] T070 [P] Add or update package-level database setup validation notes in `README.md`
- [x] T071 [P] Update architecture documentation for chat memory boundary in `docs/architecture/runtime-boundary.md`
- [x] T072 [P] Add ADR for chat memory checkpoint boundary and non-goals in `docs/adr/0012-chat-thread-memory-baseline.md`
- [x] T073 Run targeted chat memory tests with `pnpm --dir apps/webapp test -- chat-memory`
- [x] T074 Run targeted chat route tests with `pnpm --dir apps/webapp test -- app/api/chat`
- [x] T075 Run Tasklist Agent focused tests with `pnpm --dir apps/webapp test -- version-plan-tasklist-agent`
- [x] T076 Run Delivery Chain focused tests with `pnpm --dir apps/webapp test -- delivery-chain`
- [x] T077 Run stream-core protocol tests with `pnpm --filter @ai-mind/stream-core test`
- [x] T078 Run webapp typecheck with `pnpm --dir apps/webapp typecheck`
- [x] T079 Run webapp lint with `pnpm --dir apps/webapp lint`
- [x] T080 Run webapp build with `pnpm --dir apps/webapp build`
- [x] T081 Perform manual smoke for refresh recovery, compaction, disabled mode, Tasklist resume, and Delivery Chain non-regression using `specs/042-langgraph-thread-memory/quickstart.md`

---

## Phase 8: Server-Authoritative Memory Convergence

**Purpose**: 收口 v0.4.2 的模型上下文事实源。普通 chat memory 路径以后端 ThreadState 为历史来源，只从前端 payload 取本轮最新 user input，避免前端历史和后端 recent messages 重复注入。

### Tests First

- [x] T082 [P] Add API route test proving oversized frontend history does not block eligible chat memory requests when the latest user message is within input limits in `apps/webapp/tests/app/api/chat/route.test.ts`
- [x] T083 [P] Add chat session test proving eligible memory paths build `langChainMessages` and `directAnswerMessages` from only the latest frontend user message in `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts`
- [x] T084 [P] Update chat memory context builder tests to assert ThreadState recent messages remain injected as backend authoritative history in `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`
- [x] T085 Add chat orchestrator integration test proving model context is `summary/pins + ThreadState recent messages + latest frontend user message`, without earlier frontend request history, in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] T086 Add runtime error mapping test proving `InputLengthExceededError` emits `MODEL_PROVIDER_INVALID_REQUEST`, not `MODEL_STREAM_FAILED`, in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation

- [x] T087 Implement latest-user-message extraction for server-authoritative eligible memory paths in `apps/webapp/lib/ai/runtime/chat-session.ts`
- [x] T088 Update `/api/chat` route input-length validation so eligible chat memory paths validate effective latest-user input instead of full frontend history in `apps/webapp/app/api/chat/route.ts`
- [x] T089 Keep chat memory context builder injecting summary, pinned decisions, and ThreadState recent messages as backend authoritative history in `apps/webapp/lib/ai/runtime/chat-memory/context-builder.ts`
- [x] T090 Update chat orchestrator context assembly so eligible memory paths combine ThreadState memory context with latest user input only in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T091 Normalize `InputLengthExceededError` as `MODEL_PROVIDER_INVALID_REQUEST` in runtime stream errors in `apps/webapp/lib/ai/runtime/stream-errors.ts`
- [x] T092 Run targeted validation for server-authoritative memory with `pnpm --dir apps/webapp test -- app/api/chat chat-session chat-memory-context-builder chat-orchestrator`
- [x] T093 Run webapp typecheck and lint with `pnpm --dir apps/webapp typecheck` and `pnpm --dir apps/webapp lint`
- [x] T094 Add regression coverage that completed assistant text is persisted even if the stream closes after `finish` in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] T095 Allow completed assistant turns to append chat memory after `finish` when the request was not aborted in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T096 Run post-fix validation with `pnpm --dir apps/webapp test -- chat-orchestrator chat-memory app/api/chat`, `pnpm --dir apps/webapp typecheck`, and `pnpm --dir apps/webapp lint`

---

## Phase 9: Compaction Status Hint

**Purpose**: 为 ordinary chat memory 压缩补充向后兼容的流式状态事件，并在前端以独立弱提示展示，不进入聊天正文。

### Tests First

- [x] T097 [P] [US2] Add stream-core protocol tests for optional `thread-memory-status` chunk in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- [x] T098 [P] [US2] Add webapp stream chunk schema tests for `thread-memory-status` in `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
- [x] T099 [P] [US2] Add chat memory service tests for compaction started/succeeded/failed status notifications in `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] T100 [P] [US2] Add `useChatStream` tests for persistent compaction hint state in `apps/webapp/tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx`
- [x] T101 [P] [US2] Add UI tests for the subtle thread-memory status hint component in `apps/webapp/tests/components/instamind/thread-memory-status-hint.test.tsx`

### Implementation

- [x] T102 [US2] Add backward-compatible `thread-memory-status` stream chunk to `packages/stream-core/src/protocol/chat-stream-chunk.ts` and `apps/webapp/lib/ai/stream-chunk-schema.ts`
- [x] T103 [US2] Emit compaction started/succeeded/failed status events from `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` and `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- [x] T104 [US2] Track compaction status hint outside `MindMessage[]` in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T105 [US2] Render a subtle persistent compaction hint near the composer in `apps/webapp/components/instamind/thread-memory-status-hint.tsx` and `apps/webapp/components/instamind/instantmind-page.tsx`
- [x] T106 [US2] Run focused validation with `pnpm --filter @ai-mind/stream-core test -- chat-stream-chunk`, `pnpm --dir apps/webapp test -- stream-chunk-schema use-chat-stream chat-memory`, `pnpm --dir apps/webapp typecheck`, and `pnpm --dir apps/webapp lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Setup; blocks all user stories.
- **Phase 3 US1**: Depends on Foundational; MVP refresh recovery.
- **Phase 4 US2**: Depends on Foundational and the US1 memory service write/read path.
- **Phase 5 US3**: Depends on Foundational and US1 hydration route; can overlap with US2 after US1 DTO exists.
- **Phase 6 US4**: Depends on Foundational; can run in parallel with US1/US2 implementation after eligibility APIs exist, but final verification depends on integrated behavior.
- **Phase 7 Polish**: Depends on desired user stories being complete.

### User Story Dependencies

- **US1 Refresh Restores Current Chat (P1)**: First MVP story after Foundational.
- **US2 Continue With Compacted Context (P1)**: Depends on US1 service/read/write basics but remains independently testable for compaction/context behavior.
- **US3 Safe Hydration Payload (P2)**: Depends on US1 route/DTO; strengthens safety contract.
- **US4 Existing Agent And Delivery Paths Do Not Regress (P2)**: Depends on foundational eligibility/provider boundaries and validates old paths remain isolated.

### Within Each User Story

- Tests before implementation.
- Schemas/adapters before services.
- Services before routes and orchestrator integration.
- Runtime integration before frontend integration.
- Focused tests before broad typecheck/lint/build.

---

## Parallel Opportunities

- T003-T006 can run in parallel after T001.
- T007-T011 can run in parallel because each targets a separate test file.
- T012-T016 can be implemented in parallel after their tests are written, with T021 after exports are known.
- T022-T024 can run in parallel for US1 tests.
- T035-T037 can run in parallel for US2 tests.
- T047-T050 can run in parallel for US3 tests.
- T056-T061 can run in parallel for US4 non-regression tests.
- T067-T072 can run in parallel after implementation behavior is known.

---

## Parallel Example: User Story 1

```text
Task: "Add hydration API route tests for empty state, existing recent messages, Set-Cookie on new session, and same-session restore in apps/webapp/tests/app/api/chat/thread/route.test.ts"
Task: "Add chat memory repository/service tests for empty read, append completed turn, same-thread read, and disabled mode in apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts"
Task: "Add frontend hydrate hook tests for initial restore, empty restore, and reducer snapshot sync in apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx"
```

## Parallel Example: User Story 2

```text
Task: "Add compaction policy tests for 8-message threshold, summary bound, pinned decision bound, and latest-message preservation in apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts"
Task: "Add context builder tests proving summary/pins/recent messages are injected and full history is not injected in apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts"
```

## Parallel Example: User Story 4

```text
Task: "Add Tasklist non-regression test that chat thread ids cannot be used for Tasklist resume in apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts"
Task: "Add Delivery Chain non-regression test proving RuntimeArtifact and workflow progress are not written to chat memory in apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts"
Task: "Add ToolRuntimeScope suppression non-regression test for delivery-chain-manager transcript silence in apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundational.
3. Complete Phase 3 US1.
4. Stop and validate refresh recovery independently.

### Full v0.4.2 Delivery

1. Complete MVP.
2. Add US2 compaction/context builder.
3. Add US3 hydration safety hardening.
4. Add US4 non-regression hardening.
5. Complete Phase 7 validation and documentation.

### Quality Gate

Before implementation is considered complete:

- Chat memory contract/runtime tests pass.
- Hydration route tests pass.
- Tasklist Agent focused non-regression passes.
- Delivery Chain focused non-regression passes.
- stream-core protocol tests pass.
- `pnpm --dir apps/webapp typecheck` passes.
- `pnpm --dir apps/webapp lint` passes.
- `pnpm --dir apps/webapp build` passes.
- Manual smoke follows `quickstart.md`.

## Notes

- Do not add Prisma `ChatSession` or `ChatMessage` tables.
- Do not add breaking stream-core chat memory protocol changes; the optional `thread-memory-status` chunk is the only v0.4.2 addition.
- Do not persist structured command turns in v0.4.2.
- Do not expose raw checkpoint, raw prompt, provider response, stack, session cookie, Tasklist GraphState, or Delivery Chain RuntimeArtifact.
- Keep helper extraction limited to clear boundary value: schema validation, DTO mapping, checkpointer provider, context building, compaction, and eligibility.
