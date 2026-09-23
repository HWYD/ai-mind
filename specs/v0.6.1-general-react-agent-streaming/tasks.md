# Tasks: v0.6.1 General ReAct Agent Streaming

**Input**: Design documents from `specs/v0.6.1-general-react-agent-streaming/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `decisions.md`, `acceptance.md`

**Tests**: Required. This feature changes public stream, Runtime termination, final-content projection, Memory and UI behavior; contract/TDD order is mandatory.

**Implementation status**: T001–T069 是此前完成的实现、自动化、人工验收或文档工作。2026-09-23 发现“模型已请求但 provider 前拒绝的 ToolCall 不可见”与 loop evidence prompt 漂移，故本 canonical workspace 新增 Phase 10；T070–T077 与新的 acceptance gates 已通过，T063 本地 release closing 于 2026-09-24 关闭。尚未创建 Git tag、GitHub Release、推送、提交或合并。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可在不修改同一文件且不依赖未完成任务时并行
- **[Story]**: 对应 `spec.md` 的 User Story
- 所有路径均相对仓库根目录

## Phase 1: Setup and Contract Spike

**Purpose**: 先用测试侧证据证明 LangChain/provider stream 能稳定关联 model turn text、Tool Calls、完整 AIMessage、正常 stream 闭合与 provider 已提供的 finish metadata；禁止为测试添加 production-only mode。

- [x] T001 Create scripted model-turn fixtures for text-only, tool-only, text+Tool, partial finish, reasoning fields, normal closure without provider metadata, explicit non-natural provider metadata, and normal/constrained `agent-run-end` provenance in `apps/webapp/tests/lib/ai/runtime/general-react-agent/model-turn-stream-fixtures.ts`
- [x] T002 [P] Add failing additive `agent-text-*` plus `agent-run-end.finalizationMode` protocol/schema cases and legacy `text-*`/AgentRun compatibility cases in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`
- [x] T003 [P] Add failing NDJSON/chunk writer ordering cases for Agent text start/delta/end in `packages/stream-core/tests/adapters/web/chunk-writer.test.ts`
- [x] T004 Add a test-only compatibility spike proving one logical LangChain model turn can expose public text deltas, completed Tool Calls, ordinal metadata, complete-message/normal-closure evidence, and explicit provider terminal metadata in `apps/webapp/tests/lib/ai/runtime/general-react-agent/dependency-compatibility.test.ts`
- [x] T005 Record spike evidence, provider finish-metadata limitations, and the `createAgent`-versus-Chain control-plane assessment without changing approved semantics in `specs/v0.6.1-general-react-agent-streaming/research.md`

**Checkpoint**: 若 T004 不能可靠得到 turn boundary、Tool、完整消息或正常闭合证据，停止实现并回到 Plan；缺失 provider finish metadata 本身不是失败，不得以 UI 猜测或 prompt 偶然行为绕过。

---

## Phase 2: Foundational Protocol and State

**Purpose**: 建立所有用户故事共享的 strict public contract、Part type、reducer identity、预算状态与 final selector。

**⚠️ CRITICAL**: 本阶段完成前不得开始 UI 或 Runtime 行为切换。

- [x] T006 Implement additive `AgentTextStartChunk`, `AgentTextDeltaChunk`, `AgentTextEndChunk`, and completed `AgentRunEndChunk.finalizationMode` unions/exports in `packages/stream-core/src/protocol/chat-stream-chunk.ts`
- [x] T007 Implement strict Zod schemas for `agent-text-*` and completed `agent-run-end.finalizationMode` while preserving legacy chunk parsing in `apps/webapp/lib/ai/stream-chunk-schema.ts`
- [x] T008 [P] Add `AgentTextPart` phase/status and `AgentRunPart.finalizationMode` types to the message contract in `apps/webapp/lib/ai/types/message.ts`
- [x] T009 Add AgentTextPart factory/legal transition operations keyed by partId/modelTurnId and AgentRunPart finalizationMode upsert in `apps/webapp/components/instamind/chat-stream/message-factory.ts` and `apps/webapp/components/instamind/chat-stream/message-operations.ts`
- [x] T010 Add failing reducer tests for start/delta/end, normal/constrained run-end provenance, replay idempotence, duplicate/unknown events, missing-provenance fail-closed behavior, and illegal transitions in `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] T011 Implement `agent-text-*` and completed agent-run-end provenance reducer cases without changing ordinary `text-*` or legacy AgentRun behavior in `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`
- [x] T012 Add failing durable buffer tests for first-delta immediate flush, 40ms/256-char batching, end flush, part isolation, and end-before-Tool ordering in `apps/webapp/tests/lib/ai/stream-recovery/durable-stream-projection-buffer.test.ts`
- [x] T013 Extend durable projection batching/keying for Agent text deltas in `apps/webapp/lib/ai/stream-recovery/durable-stream-projection-buffer.ts`
- [x] T014 Add failing exact budget/config invariant tests for 9/14/10+1/11/235s/30s/5s/270s/48k/24 in `apps/webapp/tests/lib/ai/runtime/general-react-agent/runtime-policy-matrix.test.ts`
- [x] T015 Replace Action/Answer config names and values with loop/finalizer semantics in `apps/webapp/lib/ai/runtime/general-react-agent/runtime-config.ts`
- [x] T016 Update General ReAct state counters/phases/limits without storing stream writers or raw provider data in `apps/webapp/lib/ai/runtime/general-react-agent/agent-state.ts`
- [x] T017 Add a single final-answer selector that distinguishes General Agent `AgentTextPart` from ordinary `TextPart` in `apps/webapp/components/instamind/chat-stream/message-operations.ts`

**Checkpoint**: protocol, schema, reducer identity, durable batching, budget invariants and selector tests pass independently；旧 chunk/Part fixtures remain valid。

---

## Phase 3: User Story 1 — Single-call direct answer (Priority: P1) 🎯 MVP

**Goal**: 无 Tool 请求的正文首 delta 立即展示，同一模型轮次自然完成为 final answer，不再追加 Answer call。

**Independent Test**: scripted model 输出多段 public text、无 Tool、natural finish；断言一次模型调用、pending→final、一个 completed final Part、无 `runAnswerPhase`。

### Tests for User Story 1

- [x] T018 [P] [US1] Add failing stream-adapter tests for public-text extraction, raw reasoning exclusion, phase-less start/client pending derivation, delta ordering, and final resolution in `apps/webapp/tests/lib/ai/runtime/general-react-agent/stream-adapter.test.ts`
- [x] T019 [P] [US1] Add failing runner tests for one-call no-Tool completion, empty natural text, and assistantText provenance in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`
- [x] T020 [P] [US1] Add failing assistant UI tests for running pending, completed no-detail header, no chevron/button, stable Markdown placement, and constrained-finalizer `处理未完成` expanded Trace in `apps/webapp/tests/components/chat/message-list/messages/assistant-message-general-react.test.tsx`

### Implementation for User Story 1

- [x] T021 [US1] Implement run-scoped model-turn public text projection and raw reasoning filtering in `apps/webapp/lib/ai/runtime/general-react-agent/stream-adapter.ts`
- [x] T022 [US1] Refactor the normal runner path so natural no-Tool text commits directly with `agent-run-end.finalizationMode=normal` and fixed `runAnswerPhase` is not invoked in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`
- [x] T023 [US1] Ensure the model boundary supplies stable modelTurnId and normalized complete/natural evidence in `apps/webapp/lib/ai/runtime/general-react-agent/create-general-react-agent.ts`
- [x] T024 [US1] Render pending/final AgentTextPart in place and keep the lifecycle header without empty disclosure controls in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`
- [x] T025 [US1] Reuse the existing Markdown renderer for completed final AgentTextPart without converting it to ordinary TextPart in `apps/webapp/components/chat/message-list/parts/shared/text-part.tsx`

**Checkpoint**: User Story 1 alone delivers the primary value: ordinary no-Tool answer is truly streaming and exactly one model call。

---

## Phase 4: User Story 2 — Chronological commentary and Tools (Priority: P1)

**Goal**: mixed turns display run-level commentary and Tools in real order across all required sequences and parallel Tool completion.

**Independent Test**: scripted sequences produce Tool→final、text→Tool→final、Tool→text→Tool→final and parallel Tools; view order matches logical ordinal, commentary never becomes final or Tool detail。

### Tests for User Story 2

- [x] T026 [P] [US2] Add failing runner/adapter tests for the three mixed sequences, Tool-only turns, end-before-Tool, and final-after-N-tools call counts in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`
- [x] T027 [P] [US2] Add failing middleware tests for text+Tool batch admission, ordinal-stable parallel Tools, and final-after-Tool loop termination in `apps/webapp/tests/lib/ai/runtime/general-react-agent/run-policy-middleware.test.ts`
- [x] T028 [P] [US2] Add failing Trace view tests for commentary rows interleaved with Tool/Skill/Resource/Prompt and no Tool ownership in `apps/webapp/tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx`

### Implementation for User Story 2

- [x] T029 [US2] Resolve a completed model turn with Tool Calls to commentary before Tool dispatch and continue the same `createAgent` loop across the runner's model-turn resolution and `run-policy-middleware.ts` terminal policy boundary.
- [x] T030 [US2] Preserve model Tool ordinal and public event order across concurrent Tool execution in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts`
- [x] T031 [US2] Extend GeneralAgentTraceView row union/ordinal projection with run-level commentary in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-view.ts`
- [x] T032 [US2] Render commentary as a flat Trace row while keeping Tool rows one-line and detail-free in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-row.tsx`
- [x] T033 [US2] Compose pending, chronological Trace rows, sources, and final answer without duplicate rendering in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`

**Checkpoint**: All four user-specified sequences and parallel Tool ordering pass; `Nested Trace Row Disclosure` remains absent。

---

## Phase 5: User Story 3 — Disclosure, final projection, and recovery (Priority: P2)

**Goal**: process is inspectable and restorable, while actions/Memory/history consume only the completed final answer。

**Independent Test**: complete a mixed Run, exercise manual/auto disclosure and refresh, then verify Trace recovery and final-only copy/Memory/history。

### Tests for User Story 3

- [x] T034 [P] [US3] Add failing disclosure tests for no-detail header, right/down chevrons, manual sticky, auto-collapse once, reopen, cancel/fail defaults, keyboard and ARIA in `apps/webapp/tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx`
- [x] T035 [P] [US3] Add final-only copy/action rendering coverage in `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx`
- [x] T036 [P] [US3] Add failing snapshot schema/projection/recovery tests for commentary, final, pending exclusion, constrained provenance with completed-only Trace rows, old snapshots, and default collapsed restore in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T037 [P] [US3] Add failing Chat Memory/UserMemory/history tests that exclude pending/commentary/interrupted, reject constrained provenance from both Memory stores, and retain constrained completed final answer with its limitation text in next-request assistant history in `apps/webapp/tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts`
- [x] T038 [P] [US3] Add failing height fingerprint tests for AgentTextPart phase/status and snapshot schema version in `apps/webapp/tests/components/chat/message-list/message-height-hints.test.ts`

### Implementation for User Story 3

- [x] T039 [US3] Implement foldable-detail detection and disclosure state machine derived from AgentRunPart finalizationMode, including constrained live-expand/restored-collapse behavior, in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-panel.tsx`
- [x] T040 [US3] Route copy/feedback/follow-up/action visibility through the final-answer selector in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`
- [x] T041 [US3] Update the completed-turn projection boundary so Chat Memory and UserMemory accept only a normal completed Agent final answer by `AgentRunPart.finalizationMode`; keep constrained output out of both stores in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`, `apps/webapp/lib/ai/runtime/chat-memory/message-adapter.ts`, and `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`
- [x] T042 [US3] Update follow-up/history/request call sites to use the final-answer selector plus constrained provenance rule, retaining its limitation text only in same-session history, in `apps/webapp/components/instamind/use-chat-stream.ts` and `apps/webapp/components/instamind/chat-stream/request-message-builder.ts`
- [x] T043 [US3] Add strict recoverable AgentTextPart/AgentRunPart finalizationMode schema and increment local snapshot schema version in `apps/webapp/components/instamind/local-chat-persistence/schema.ts`
- [x] T044 [US3] Project normal/constrained completed final plus completed Trace rows, preserve constrained provenance, and exclude pending/interrupted/failed/cancelled content in `apps/webapp/components/instamind/local-chat-persistence/stable-snapshot.ts`
- [x] T045 [US3] Include AgentTextPart phase/status/text and AgentRunPart finalizationMode in message geometry identity and invalidate old incompatible hints in `apps/webapp/components/chat/message-list/message-height-hints.ts`

**Checkpoint**: Trace state behaves as specified before/after refresh；copy、Memory、history contain exactly final answer。

---

## Phase 6: User Story 4 — Honest abnormal termination and hard budgets (Priority: P2)

**Goal**: partial/abnormal output never impersonates a normal final answer, and all expanded budgets remain hard upper bounds。

**Independent Test**: fake-clock/scripted-provider matrix exercises every finish class, cancellation/deadline, finalizer gate, retry interaction and exact/over budget boundary。

### Tests for User Story 4

- [x] T046 [P] [US4] Add failing finish normalizer tests for OpenAI-compatible, DeepSeek, 豆包, Qwen, normal closure without metadata, explicit non-natural metadata, and true unknown values in `apps/webapp/tests/lib/ai/runtime/general-react-agent/model-turn-finish-normalizer.test.ts`
- [x] T047 [P] [US4] Add failing lifecycle tests for loop cutoff, hard deadline, cancellation, unknown execution state, terminal reserve, late events, and retryable model error after first public delta in `apps/webapp/tests/lib/ai/runtime/general-react-agent/execution-lifecycle.test.ts`
- [x] T048 [P] [US4] Add failing runner tests for finalizer pending-to-final resolution, constrained `agent-run-end` provenance, empty natural no-Tool eligibility, single-use reservation, partial failure, safe terminal fallback, Memory ineligibility, and no model retry/duplicate Part after first public delta in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`
- [x] T049 [P] [US4] Add exact/over-boundary tests for 9 Tool rounds, 14 Tool Calls, 10 loop calls, 11 total calls, 48k observations and recursion 24 in `apps/webapp/tests/lib/ai/runtime/general-react-agent/runtime-policy-matrix.test.ts`
- [x] T050 [P] [US4] Add observer tests for loop/finalizer/budget counters without user text or raw Tool/provider data in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-observer.test.ts`

### Implementation for User Story 4

- [x] T051 [US4] Implement centralized provider-agnostic finish normalization in `apps/webapp/lib/ai/runtime/general-react-agent/model-turn-finish-normalizer.ts`
- [x] T052 [US4] Implement abnormal-only/empty-natural finalizer gate, constrained `agent-run-end.finalizationMode`, and removal of the normal fixed Answer lifecycle in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`
- [x] T053 [US4] Enforce updated loop/tool/model/observation/deadline counters and late-Tool violation in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware.ts`
- [x] T054 [US4] Update public-safe observer metrics for loop/finalizer usage and budget stops in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-observer.ts`
- [x] T055 [US4] Update chat service terminal projection deadline from 180s to 270s without counting SSE delivery time in `apps/webapp/lib/ai/chat-service.ts`

**Checkpoint**: no abnormal path writes normal final/Memory；all hard limits and precedence rules are proven by tests。

---

## Phase 7: Cross-cutting Validation, Pencil, and Documentation

**Purpose**: 全链路收口、视觉事实同步和 release evidence。只有前六阶段通过后执行。

- [x] T056 [P] Update General Agent Pencil states for pending staging, four core sequences, no-detail completed header, sticky/auto disclosure, cancel/fail, and mark Nested Trace Row Disclosure Deferred in `design/pencil/agent-ui.pen`
- [x] T057 [P] Update long-term Runtime/stream/recovery facts and supersede fixed Answer wording in `docs/architecture/agent-runtime.md`, `docs/architecture/stream-core.md`, `docs/architecture/stream-recovery.md`, and `docs/adr/0019-general-react-agent-runtime.md`
- [x] T058 [P] Create v0.6.1 public version/release/tasklist documentation without copying unfinished acceptance claims in `docs/versions/v0.6.1-general-react-agent-streaming.md`, `docs/releases/v0.6.1.md`, and `docs/tasklists/v0.6.1-tasklist.md`
- [x] T059 Run all available automated commands and record real evidence/remaining risks in `specs/v0.6.1-general-react-agent-streaming/acceptance.md`; stable/integration evidence was recorded first, and later T060 manual evidence was synchronized into the same canonical acceptance record.
- [x] T060 Execute the manual provider/browser/Pencil matrix and record results in `specs/v0.6.1-general-react-agent-streaming/acceptance.md`（真实 no-Tool/含 Tool 页面、Pencil 状态稿、手动展开和刷新默认收起均已验收；keyboard/ARIA 由 T034 自动化合约覆盖）
- [x] T061 Run `$ai-mind-step-audit` and remediate approved findings against `specs/v0.6.1-general-react-agent-streaming/tasks.md`; audit is `PASS_WITH_NOTES`, T060/T062 are complete, and its sole remaining release gate is T063.
- [x] T062 Run `speckit-converge`, append any genuinely missing work to `specs/v0.6.1-general-react-agent-streaming/tasks.md`, and complete it before closing; no actionable implementation gap was found, so no convergence phase was appended.
- [x] T063 Re-ran local release closing after Phase 10. `$ai-mind-step-audit` is `PASS_WITH_NOTES`, `speckit-converge` found no actionable implementation gap, targeted/stable/typecheck/lint and local integration evidence are recorded in `acceptance.md`, and all six manifests were freshly verified as `0.6.1` on 2026-09-24. The user accepted the documented real-environment result and the desktop host limitation disposition. Do not create tag/Release, push, commit, or merge without separate authorization.

---

## Phase 8: Approved follow-up — Body-first chronological General Trace

**Purpose**: 修正已实现展示层把 pending 文本抽到 Trace 顶部、把 commentary 压成图标状态行、并把 read source 聚合到 Trace 末尾的问题；不改 Runtime、stream contract、Provider 探测、Tool 执行或预算。

- [x] T064 Add failing component/view tests proving `pending → Tool → pending → Tool → final_answer` preserves top-level part ordinal, uses the shared Markdown body renderer without a text icon, retains existing Tool rows, and leaves final answer outside Trace in `apps/webapp/tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx` and `apps/webapp/tests/components/chat/message-list/messages/assistant-message-general-react.test.tsx`.
- [x] T065 Change `general-agent-trace-view.ts`, `general-agent-trace-row.tsx`, `general-agent-trace-panel.tsx`, and `chat-message-list.tsx` so pending/commentary retain their AgentTextPart for body rendering, pending joins the open Trace timeline only when foldable detail already exists, no `pendingTextSlot` can precede earlier rows, and expanded body text receives Markdown-aware virtual-list height estimation.
- [x] T066 Run the targeted Trace/assistant/height presentation tests plus webapp typecheck/lint; update `acceptance.md` with the new automated evidence and retain browser/Pencil visual confirmation as an explicit manual gate.
- [x] T067 Add a failing owner-child source ordering test, then carry safe read sources on their owning Tool Trace row so the source list appears before subsequent top-level parts; update source-aware virtual-list height estimation and the canonical presentation docs.

**Checkpoint**: 新模型文本永远不得在既有顶层 Trace 事件之前插入；每个安全 read source 仅作为所属 Tool 的直属 child 紧随其后，不能聚合到 Trace footer。没有 Tool/detail 的 direct answer 仍是无箭头 header + Trace 外 final answer；不增加 `response.*` 或其他 provider 提前探测。

---

## Phase 9: Approved follow-up — Per-call web-search count and Tool-start idempotence

**Purpose**: 修复多个真实 `web-search` Tool Part 复用 Trace 聚合来源数而看似重复的问题，并让客户端在服务端异常重复发送同一 Tool start 时保持单行；不改 public stream、后端 Runtime、Tool 执行或已公开的 raw-input 边界。

- [x] T068 Add failing UI/reducer regression tests proving each `web-search` row uses only its own safe discovered source count, raw query/input remains hidden, matching repeated `tool-start` keeps one Tool Part, and conflicting repeated starts fail closed in `apps/webapp/tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx` and `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`.
- [x] T069 Implement per-Tool search-count projection and `tool-start` idempotence/conflict handling in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-view.ts` and `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`; synchronize the canonical v0.6.1 presentation contract and decision assets.

**Checkpoint**: 两个不同 `web-search` Tool Part 各显示自身安全来源数；普通相同 `partId` 重放只保留一行并可被后续 end 更新；同 ID 的工具名或已公开 input 冲突 fail closed；不展示 query。

---

## Phase 10: Approved correction — Auditable rejected ToolCalls and trusted URL reuse

**Purpose**: 修复真实页面中“模型收到 pre-execution Tool 拒绝、用户 Trace 却没有 Tool 行”造成的事实不对称；统一 direct-final loop/finalizer 的 Tool 事实提示词，并只从服务端可信的同会话 raw user turn 受限复用 URL。不得取消现有 URL/secret 安全策略、不得新增工具级 detail、不得新增历史 Run Tool proof 或自动补读。

- [x] T070 Add failing middleware/reducer regression tests proving each pre-execution rejection publishes exactly one sanitized `tool-start` plus same-part tool-scope error, creates a failed Tool row in chronological order, calls no provider, exposes no raw input/output/source, and leaves no Tool row when no ToolCall exists in `apps/webapp/tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts` and `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`.
- [x] T071 Add failing prompt/session tests covering direct no-Tool loop final, denied ToolMessage, and successful read source; assert loop/finalizer share the observation-only policy and no longer claim loop text is hidden in `apps/webapp/tests/lib/ai/prompts/tool-calling.test.ts` and `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts`.
- [x] T072 Add failing trusted-URL tests covering current user automatic grant, same verified conversation raw-user reuse with 8-entry bound/re-canonicalization, and denial for assistant/summary/pinned/UserMemory/client history/other conversation/compacted raw turns in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` and `apps/webapp/tests/lib/ai/runtime/general-react-agent/agent-state.test.ts`.
- [x] T073 Implement the pre-execution rejected Tool transcript through existing `tool-start` + tool-scope `error`, with only stable safe display data and no `tool-end`, in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts`; retain model-facing ToolMessage and zero provider execution.
- [x] T074 Implement a shared loop/finalizer evidence boundary and direct-final wording in `apps/webapp/lib/ai/prompts/tool-calling.ts`; inject only server-derived trusted URL catalog context in the General ReAct session path without lexical output filtering.
- [x] T075 Implement run-local trusted user URL catalog construction from current user input plus server-verified conversation Chat Memory raw user turns, pass grants to General ReAct state, enforce the eight-entry/re-canonicalization/fail-closed boundary, and keep prior-Run execution proof out of scope in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`, `apps/webapp/lib/ai/runtime/chat-session.ts`, `apps/webapp/lib/ai/runtime/general-react-agent/agent-context.ts`, and `apps/webapp/lib/ai/runtime/general-react-agent/agent-state.ts`.
- [x] T076 Run targeted middleware/prompt/session/orchestrator/state/reducer tests plus webapp typecheck/lint; verify a real safe current-user URL call and a denied pre-execution ToolCall with the browser when environment permits. Record exact evidence and remaining environment limits in `acceptance.md`（2026-09-24：7 files / 109 targeted tests、webapp stable 197 files / 1,471 tests、typecheck、direct full webapp ESLint 与真实环境验收均通过；root pnpm launcher/Turbo 环境限制与 integration/release gate 仍在 acceptance 中保留）。
- [x] T077 Synchronize canonical specs, contracts, decisions, research, long-term/public version/release documentation, Pencil state annotation if visual semantics change, and reopen/close the acceptance and release gates in the same canonical workspace. Existing Pencil failed-Tool styling is reused; no new component, nested detail, or layout state is introduced.

**Checkpoint**: A failed Tool row accurately means “model requested but provider did not execute”; a successful read remains the only basis for “已读取”. URL reuse is an explicit new read authorization, never retroactive Tool proof. The existing order `commentary → rejected Tool → commentary → Tool → final_answer` remains stable.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1** has no dependency and is a stop/go spike。
- **Phase 2** depends on Phase 1 and blocks all user stories。
- **US1 / Phase 3** depends on Phase 2 and is the minimum shippable behavior slice。
- **US2 / Phase 4** depends on US1 projector/loop and Phase 2 protocol。
- **US3 / Phase 5** depends on stable AgentTextPart semantics; tests may be prepared in parallel after Phase 2, but final integration depends on US1/US2。
- **US4 / Phase 6** depends on US1 loop refactor; normalizer tests can run in parallel with US2/US3 once Phase 2 is stable。
- **Phase 7** depends on all desired stories and passing automated gates。
- **Phase 8** is a frontend-only correction after Phase 7；不依赖也不得改变 Runtime/stream-core 语义。
- **Phase 9** is a frontend-only correction after Phase 8；不依赖也不得改变 Runtime/stream-core 语义。
- **Phase 10** depends on the existing phase-aware runtime and owns a tightly coupled Runtime/prompt/trusted-memory boundary; it reopens Phase 7 release validation but does not change public chunk schema or budget.

### User story dependencies

- **US1**: independent after foundation; delivers no-Tool one-call streaming。
- **US2**: builds on US1 model-turn projector, but its mixed Tool behavior is independently testable。
- **US3**: consumes resolved Parts from US1/US2; final projection and snapshot are independently testable with fixtures。
- **US4**: shares runner/config with US1 and must be integrated by the same owner to avoid conflicting edits。

### Strong-coupling ownership

`general-react-agent-runner.ts`、`run-policy-middleware.ts` 与 `runtime-config.ts` 由一个 Runtime owner 集成。Phase 10 的 middleware、prompt、trusted-memory provenance 和 orchestration 也共享同一安全事实边界，由同一 owner 集成；只读 root-cause/security review 可委派，避免并发改写共享 Runtime。可并行委派的工作仅限不重叠的 stream-core contract、frontend presentation、Memory/snapshot、provider normalizer tests 与 review；整合 owner 负责最终序列和预算一致性。

## Parallel Examples

### After Phase 1

- stream-core contract: T006–T007；
- frontend Part/reducer red tests: T008–T011；
- durable projection red tests: T012–T013；
- Runtime budget red tests: T014–T016。

### After Phase 2

- US1 Runtime tests/implementation: T018–T023；
- US1 UI red tests: T020；
- US3 snapshot/Memory red tests using fixtures: T036–T038；
- US4 provider finish normalizer red tests: T046。

## Implementation Strategy

### MVP first

1. Complete Phase 1 spike and Phase 2 contract foundation。
2. Complete US1 and prove no-Tool one-call streaming without changing Tool behavior。
3. Stop for focused review of final-content projection and regression evidence。
4. Add US2 mixed Tool/commentary ordering。
5. Add US3 recovery/Memory/UI and US4 abnormal budgets。

### Contract-first rule

每个 phase 必须先提交失败测试，再提交最小 production change。不得为了 scripted provider 在 production 加隐藏模式、test-only branch 或 deterministic helper。实现偏离本 tasks/spec 时先更新 canonical workspace 并取得必要确认。

## Task Summary

- Total tasks: 77
- Setup/spike: 5
- Foundational: 12
- US1: 8
- US2: 8
- US3: 12
- US4: 10
- Cross-cutting/release: 8
- Approved correction/re-release: 8
- Suggested MVP: Phase 1 + Phase 2 + US1（T001–T025）
