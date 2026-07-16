# Tasks: AI Mind v0.4.7 Browser-local Chat Session Persistence

**Input**: Design documents from `/specs/047-browser-local-chat-persistence/`

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `acceptance.md`

**Tests**: 本版本明确要求 focused tests、typecheck、lint 和手工 smoke，因此包含测试任务。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `US1`, `US2`, `US3`)
- 每个任务描述都包含明确文件路径，便于按任务直接执行

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立浏览器本地持久化的最小代码骨架和测试入口

- [x] T001 Create browser-local persistence module skeleton in `apps/webapp/components/instamind/local-chat-persistence/schema.ts`, `apps/webapp/components/instamind/local-chat-persistence/store.ts`, and `apps/webapp/components/instamind/local-chat-persistence/stable-snapshot.ts`
- [x] T002 [P] Create focused persistence test harness in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T003 [P] Prepare hydration/session regression test coverage entry points in `apps/webapp/tests/components/instamind/conversation-session.test.tsx` and `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 完成所有用户故事共享的本地 schema、snapshot projection 和 IndexedDB 基础能力

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement versioned local snapshot schemas and validation rules in `apps/webapp/components/instamind/local-chat-persistence/schema.ts`
- [x] T005 Implement stable `MindMessage` to recoverable snapshot projection rules in `apps/webapp/components/instamind/local-chat-persistence/stable-snapshot.ts`
- [x] T006 Implement IndexedDB read/write/index/prune/revision APIs in `apps/webapp/components/instamind/local-chat-persistence/store.ts`
- [x] T007 [P] Add schema/projection/store coverage for invalid data, capacity trimming, and same-conversation revision protection in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T008 [P] Document foundation-ready acceptance checkpoints in `specs/047-browser-local-chat-persistence/acceptance.md`

**Checkpoint**: 本地快照基础层准备完成，后续用户故事可以在共享边界上展开

---

## Phase 3: User Story 1 - Restore Recent Conversations After Refresh (Priority: P1) 🎯 MVP

**Goal**: 刷新后恢复最近会话列表、当前选择和安全的 draft / fallback 行为

**Independent Test**: 创建多个会话并刷新页面，确认最近会话列表、当前选中项、标题和 draft fallback 能正确恢复

### Tests for User Story 1

- [x] T009 [P] [US1] Add local-first recent conversation restore cases in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] T010 [P] [US1] Add blank draft restore and invalid selected conversation fallback cases in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`

### Implementation for User Story 1

- [x] T011 [US1] Restore local recent-conversation index on bootstrap in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`
- [x] T012 [US1] Reconcile server registry metadata, selected conversation, and prune cleanup in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`
- [x] T013 [US1] Preserve draft-first restore semantics and localStorage compatibility hints in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`

**Checkpoint**: 到这里，刷新后的最近会话列表和当前会话选择应已可独立恢复

---

## Phase 4: User Story 2 - Preserve Rich User-visible Conversation Content (Priority: P1)

**Goal**: 本地恢复的不只是文本，还包括稳定的富 UI 聊天展示

**Independent Test**: 让同一会话产生 text、tool/resource/skill、workflow、Agent trace、artifact 等稳定展示，刷新后确认仍在原会话中可见

### Tests for User Story 2

- [x] T014 [P] [US2] Add local snapshot hydration priority and rich UI restore cases, including stable skill parts, in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T015 [P] [US2] Add delete/regenerate and incomplete-turn non-persistence cases in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T016 [P] [US2] Add visible command and resource-reference preservation cases for user messages in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`

### Implementation for User Story 2

- [x] T017 [US2] Restore local conversation snapshot before server hydration in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T018 [US2] Persist stable completed message snapshots after successful UI-state transitions in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T019 [US2] Preserve user-message presentation data needed for visible commands and resource references in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T020 [US2] Preserve stable skill display parts when projecting recoverable local snapshots in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T021 [US2] Skip streaming, failed, aborted, pending review, and transient control state from persistence in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T022 [US2] Rewrite local snapshots after delete and regenerate completion in `apps/webapp/components/instamind/use-chat-stream.ts`

**Checkpoint**: 到这里，当前会话的稳定富 UI 展示应可在刷新后独立恢复

---

## Phase 5: User Story 3 - Keep Server-authoritative Chat Semantics (Priority: P1)

**Goal**: 在恢复本地展示的同时，继续坚持服务端会话身份和 ThreadState 的权威边界

**Independent Test**: 为两个会话写入不同本地历史，刷新后切换它们，验证展示、发送归属和服务端短期记忆仍按 `conversationId` 隔离

### Tests for User Story 3

- [x] T023 [P] [US3] Add invalid ownership, bounded hydration fallback, and ThreadState unavailable cases in `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] T024 [P] [US3] Add local-history-kept and no-silent-merge coverage in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`

### Implementation for User Story 3

- [x] T025 [US3] Return explicit `CHAT_THREAD_HYDRATION_UNAVAILABLE` public errors in `apps/webapp/app/api/chat/thread/route.ts`
- [x] T026 [US3] Treat bounded server hydration as runtime confirmation only, not complete UI history, in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T027 [US3] Enforce per-conversation restore and send isolation in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T028 [US3] Keep selected conversation identity aligned with server-authoritative registry decisions in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`

**Checkpoint**: 到这里，本地展示恢复与服务端权威语义应已同时成立

---

## Phase 6: User Story 4 - Degrade Safely When Local or Server Persistence Is Unavailable (Priority: P1)

**Goal**: 本地持久化失效或服务端恢复失败时，页面进入明确、安全、可恢复的只读降级态

**Independent Test**: 分别模拟本地存储失败、registry 失败、thread hydration 失败和恢复成功，确认只读提示、禁用交互和恢复路径符合预期

### Tests for User Story 4

- [x] T029 [P] [US4] Add registry-failure read-only fallback cases in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] T030 [P] [US4] Add thread-unavailable and local-store-degraded fallback cases in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] T031 [P] [US4] Add read-only cache indicator, retry CTA, and disabled-action UI cases in `apps/webapp/tests/app/instant-mind/page.test.ts`

### Implementation for User Story 4

- [x] T032 [US4] Expose read-only cache state, retry state, and local-persistence degradation signals in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`
- [x] T033 [US4] Expose selected-thread recovery failure and local-cache fallback state in `apps/webapp/components/instamind/use-chat-stream.ts`
- [x] T034 [US4] Render read-only cache notice, explicit retry CTA, and disable send/new/switch actions in `apps/webapp/components/instamind/instantmind-page.tsx`

**Checkpoint**: 到这里，服务端或本地异常时不会破坏主聊天流程，且用户能看懂当前状态

---

## Phase 7: User Story 5 - Keep Browser-local Scope Explicit (Priority: P2)

**Goal**: 明确该能力仅限当前浏览器环境，并保证多标签页并发和本地容量边界可控

**Independent Test**: 在不同标签页分别更新不同会话、为同一会话产生并发稳定写入、清理站点数据后重新进入，确认并发规则和浏览器本地范围声明成立

### Tests for User Story 5

- [x] T035 [P] [US5] Add different-conversation isolation, same-conversation revision, and capacity-trimming cases in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T036 [P] [US5] Add cleared-site-data and browser-restart scope cases in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`

### Implementation for User Story 5

- [x] T037 [US5] Finalize per-conversation revision overwrite and shared-index merge rules in `apps/webapp/components/instamind/local-chat-persistence/store.ts`
- [x] T038 [US5] Remove server-pruned local snapshots and preserve draft-outside-capacity behavior in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`

**Checkpoint**: 到这里，浏览器本地范围、并发写入规则和容量边界都应可独立验证

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 回填验收证据、完成集中验证并收口交付口径

- [x] T039 [P] Update release gate and implementation evidence in `specs/047-browser-local-chat-persistence/acceptance.md`
- [x] T040 [P] Refresh validation steps and manual smoke notes in `specs/047-browser-local-chat-persistence/quickstart.md`
- [x] T041 [P] Add Tasklist and Delivery non-regression coverage review in `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts` and `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] T042 Run focused local-persistence, session, hydration, route, page, Tasklist, and Delivery tests from `apps/webapp/tests/components/instamind/`, `apps/webapp/tests/app/api/chat/thread/route.test.ts`, and `apps/webapp/tests/lib/ai/runtime/`
- [x] T043 Run repository checks with `pnpm --dir apps/webapp typecheck`, `pnpm lint:webapp`, and `git diff --check`
- [x] T044 Record final browser smoke evidence for refresh restore, rich UI restore, and multi-tab isolation, and pair deterministic read-only fallback / overwrite fault-injection evidence in `specs/047-browser-local-chat-persistence/acceptance.md`

---

## Phase 9: Server-authoritative registry reconciliation

**Purpose**: 按 v0.4.7 最终确认的权威策略区分普通本地索引合并与服务端成功后的权威替换，避免旧浏览器会话在刷新后长期残留，同时保持本地完整聊天快照独立。

### Tests

- [x] T045 [P] [US1] Add authoritative index replacement, baseline local-only cleanup, valid empty response cleanup, same-ID snapshot preservation, and concurrent post-baseline entry coverage in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T046 [P] [US1] Add server-success replacement, server-failure/invalid-response preservation, and local-first list flash coverage in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] T047 [P] [US2] Verify through the existing local-first hydration regression that registry reconciliation metadata never overwrites or reconstructs the selected conversation's local complete message snapshot in `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`

### Implementation

- [x] T048 [US1] Add a separate baseline-aware authoritative reconciliation operation while preserving ordinary merged index writes in `apps/webapp/components/instamind/local-chat-persistence/store.ts`
- [x] T049 [US1] Capture the local index baseline before the registry request and use server success only to replace index metadata and delete baseline local-only snapshots in `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts`
- [x] T050 [US2] Verify the existing `use-chat-stream.ts` local snapshot hydration and bounded server ThreadState hydration remain independent through `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`

### Closing evidence

- [x] T051 [P] Update strategy-specific acceptance, contract, data-model and manual smoke evidence in `specs/047-browser-local-chat-persistence/acceptance.md`, `specs/047-browser-local-chat-persistence/quickstart.md`, and related design artifacts
- [x] T052 Run the focused Phase 9 tests, typecheck, lint, `git diff --check`, and Spec Kit analysis; record the result in `specs/047-browser-local-chat-persistence/acceptance.md`

---

## Phase 10: User Story 6 - Delete A Conversation Across Server And Browser (Priority: P1)

**Goal**: 用户可以在桌面端或移动端通过二次确认删除单个会话；服务端清理 Registry 与对应 ThreadState 成功后，本地才删除该会话的完整 UI 快照。

**Independent Test**: 固定准备当前、非当前和最后一个会话，分别验证取消、成功删除、服务端失败和 fallback/draft 结果。

### Tests for User Story 6

- [x] T053 [P] [US6] Add Registry deletion, ThreadState deletion, current/non-current/last fallback, unknown conversation and partial-failure coverage in `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts`
- [x] T054 [P] [US6] Add strict DELETE request, 404 ownership, 500 deletion failure and successful Registry payload coverage in `apps/webapp/tests/app/api/chat/conversations/route.test.ts`
- [x] T055 [P] [US6] Add desktop/mobile action-menu, keyboard/touch accessibility, Delete-only menu, cancel and confirmation coverage in `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] T056 [P] [US6] Add current/non-current/last deletion, local cleanup and server-failure preservation coverage in `apps/webapp/tests/components/instamind/conversation-session.test.tsx` and `apps/webapp/tests/app/instant-mind/page.test.ts`

### Implementation for User Story 6

- [x] T057 [US6] Add the project-compatible shadcn/radix Alert Dialog primitive in `apps/webapp/components/ui/alert-dialog.tsx`
- [x] T058 [US6] Add `deleteThreadState` to the ChatMemoryService boundary in `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts`
- [x] T059 [US6] Implement ownership-checked Registry deletion, ThreadState cleanup and selected fallback in `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts`
- [x] T060 [US6] Add strict `DELETE /api/chat/conversations` handling and public error DTO mapping in `apps/webapp/app/api/chat/conversations/route.ts`
- [x] T061 [US6] Add shared desktop/mobile Delete menu and destructive confirmation interaction in `apps/webapp/components/instamind/conversation-session/conversation-row-actions.tsx`, `apps/webapp/components/instamind/conversation-session/conversation-sidebar.tsx`, and `apps/webapp/components/instamind/conversation-session/conversation-mobile-selector.tsx`
- [x] T062 [US6] Wire `deleteConversation` through `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` and `apps/webapp/components/instamind/instantmind-page.tsx`, using server-authoritative response before local index/snapshot cleanup
- [x] T063 [US6] Update deletion contracts, quickstart, acceptance evidence and checklist in `specs/047-browser-local-chat-persistence/`

### Closing evidence for User Story 6

- [x] T064 Run focused deletion tests, full relevant regression suites, typecheck, lint, `git diff --check`, `speckit-analyze` and `speckit-converge`; record evidence in `specs/047-browser-local-chat-persistence/acceptance.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成；阻塞所有用户故事
- **User Story 1 (Phase 3)**: 依赖 Foundational 完成
- **User Story 2 (Phase 4)**: 依赖 Foundational 完成；与 US1 共享会话恢复边界，建议在 US1 基本跑通后接入
- **User Story 3 (Phase 5)**: 依赖 Foundational 完成；需要与 US1 / US2 的恢复语义保持一致
- **User Story 4 (Phase 6)**: 依赖 US1 与 US3 的恢复/服务端状态语义基本就位
- **User Story 5 (Phase 7)**: 依赖 Foundational 完成；建议在 US1 / US2 主链稳定后补齐并发和范围边界
- **Polish (Phase 8)**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1**: 本版最小可演示入口，可在 Foundational 后优先落地
- **US2**: 建立在本地快照能力之上，是“恢复完整聊天展示”的核心增量
- **US3**: 确保本地恢复不会破坏服务端权威边界
- **US4**: 依赖前面故事暴露出来的恢复状态，补齐失败降级与只读交互
- **US5**: 在不改产品边界的前提下补齐浏览器本地范围、并发和容量约束

### Parallel Opportunities

- Phase 1 中的测试入口准备任务可并行
- Phase 2 中 schema / projection / store 实现与测试补充可部分并行
- 各用户故事里的测试任务可并行
- `route.ts` 契约测试与 `use-chat-stream.ts` / `use-conversation-sessions.ts` UI 侧实现可以分工并行
- `acceptance.md` / `quickstart.md` 的回填可与最终验证并行推进

---

## Parallel Example: User Story 2

```text
Task: "Add local snapshot hydration priority and rich UI restore cases in apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx"
Task: "Add delete/regenerate and incomplete-turn non-persistence cases in apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx"

Task: "Restore local conversation snapshot before server hydration in apps/webapp/components/instamind/use-chat-stream.ts"
Task: "Rewrite local snapshots after delete and regenerate completion in apps/webapp/components/instamind/use-chat-stream.ts"
```

---

## Implementation Strategy

### MVP First

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational
3. 完成 Phase 3：US1
4. 停下来验证刷新后最近会话列表和当前会话恢复

### Product-complete Increment

1. 在 US1 基础上继续完成 US2，补齐“完整聊天展示恢复”
2. 完成 US3，锁定服务端权威边界
3. 完成 US4，补齐失败降级与只读状态
4. 完成 US5，收口多标签页并发、容量和浏览器本地范围

### Verification Strategy

1. 先验证 schema / store / projection
2. 再验证 session restore / snapshot hydration
3. 再验证 `/api/chat/thread` 契约和只读降级
4. 最后做 typecheck、lint、`git diff --check` 和浏览器手工 smoke

---

## Notes

- [P] 任务表示不同文件或不同验证入口，可以并行
- 所有用户故事都围绕“本地完整 UI 历史 + 服务端权威语义”这一边界展开
- 不要在实现中提前引入 PG 完整聊天历史、账号体系、跨设备同步或新的 stream protocol 字段
- 任务落地后应同步回填 `acceptance.md`，避免 spec / plan / tasks / acceptance 漂移
