# Tasks: v0.6.0 General ReAct Agent MVP

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `decisions.md` and `acceptance.md` in this canonical workspace.

**Status**: Implementation closing; Phases 1–8 complete, Phase 9 convergence in progress.

**Tests**: Required. The project constitution and feature acceptance criteria require tests-first for every behavior-changing task. Write the named test first, confirm it fails for the intended reason, then implement the minimum production change.

**Organization**: Tasks are dependency ordered and grouped by user story. Each phase ends with an evidence checkpoint in `acceptance.md`; do not enter the next phase until the current checkpoint is reviewed.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May run in parallel after its declared prerequisites because it changes different files and has no unresolved shared-state dependency.
- **[US1]`…`[US5]**: Maps the task to the user story in `spec.md`.
- Every task names its intended file or evidence location. New filenames are planned targets and remain owned by the module that produces the contract.

## Phase 1: Setup And Dependency Migration Gate

**Purpose**: Freeze the baseline and prove that a single compatible LangChain family can host `createAgent` without regressing existing dedicated agents.

- [x] T001 Record the branch, baseline commit, dirty-worktree inventory and current targeted-suite results under the Phase 1 evidence section in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T002 [P] Add a failing compatibility test for server-side `createAgent(version='v2')`, middleware ordering, `maxConcurrency=3`, abort propagation and stream import safety in `apps/webapp/tests/lib/ai/runtime/general-react-agent/dependency-compatibility.test.ts`
- [x] T003 Update the LangChain family as one compatibility unit in `apps/webapp/package.json` and `pnpm-lock.yaml`, adding stable `langchain >= 1.5.9` and aligning `@langchain/core >= 1.2.8` with the selected `@langchain/langgraph` line
- [x] T004 Verify that `pnpm list/why` resolves one compatible core/graph runtime and record the dependency tree plus T002 result in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T005 Run the existing Tasklist, Delivery, Image, Chat Memory checkpointer and provider targeted suites after the dependency change and record the commands/results in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: LangChain migration is proven in isolation. A failure returns the work to `plan.md`; compatibility shims must not spread into business modules.

---

## Phase 2: Foundational Runtime And Durable Stream Primitives

**Purpose**: Establish shared contracts that block every user story: typed run state/context, admission and retry primitives, Tool execution policy, safe stream projection, PostgreSQL batching and bounded backpressure.

**⚠️ CRITICAL**: No user-story implementation starts before this phase passes.

- [x] T006 [P] Add failing schema/default/reducer tests for the run-local state, immutable context and fixed 180s/145s/9-call/6-model/4-retry/3-concurrency budgets in `apps/webapp/tests/lib/ai/runtime/general-react-agent/agent-state.test.ts`
- [x] T007 Implement `generalReActAgentStateSchema`, `generalReActRunContextSchema` and fixed server defaults in `apps/webapp/lib/ai/runtime/general-react-agent/agent-state.ts`, `apps/webapp/lib/ai/runtime/general-react-agent/agent-context.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/runtime-config.ts`
- [x] T008 [P] Add failing admission/reducer tests for immutable per-batch call ordinals, logical-call/observation reservations and merge-safe delta/sum/union state updates in `apps/webapp/tests/lib/ai/runtime/general-react-agent/action-batch-admission.test.ts`
- [x] T009 Implement the deterministic batch admission value object and reducer helpers in `apps/webapp/lib/ai/runtime/general-react-agent/action-batch-admission.ts`
- [x] T010 [P] Add failing tests for synchronous capacity admission, eight permits, ninth-run fail-fast, idempotent release and payload-free state in `apps/webapp/tests/lib/ai/runtime/general-react-agent/execution-gate.test.ts`
- [x] T011 Implement the process-singleton `GeneralReActExecutionGate` in `apps/webapp/lib/ai/runtime/general-react-agent/execution-gate.ts`
- [x] T012 [P] Add failing tests for atomic actual-use retry admission, per-call limit 2, Run limit 4 and no permit return in `apps/webapp/tests/lib/ai/runtime/general-react-agent/retry-permit-pool.test.ts`
- [x] T013 Implement the run-local synchronous `RetryPermitPool` in `apps/webapp/lib/ai/runtime/general-react-agent/retry-permit-pool.ts`
- [x] T014 [P] Add failing discriminated-policy tests for `standard-tool` versus `agent-tool`, server-only timeout fields and profile validation in `apps/webapp/tests/lib/ai/runtime/tool-runtime-policy.test.ts`
- [x] T015 Extend Tool Definition/Registry contracts with `ToolExecutionPolicy`, public/internal result boundaries and `general-react-agent` scope, then classify current standard tools in `apps/webapp/lib/ai/tools/registry.ts`, `apps/webapp/lib/ai/tools/index.ts`, `apps/webapp/lib/ai/tools/calculator-tool.ts`, `apps/webapp/lib/ai/tools/datetime-tool.ts`, `apps/webapp/lib/ai/tools/city-weather-tool.ts`, `apps/webapp/lib/ai/tools/unit-convert-tool.ts`, `apps/webapp/lib/ai/tools/text-transform-tool.ts` and `apps/webapp/lib/ai/tools/validate-tasklist-structure-tool.ts`
- [x] T016 [P] Extend failing Tool Runtime tests for minimum-effective timeout, strict schema order, AbortSignal propagation, retryable classification, jitter/Retry-After and one logical transcript in `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`
- [x] T017 Refactor the single ordinary Tool executor to own attempt timeout, cancellation, typed errors, transcript and bounded remote retry in `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts`, `apps/webapp/lib/ai/runtime/tool-runtime/validation.ts`, `apps/webapp/lib/ai/runtime/tool-runtime/display.ts` and `apps/webapp/lib/ai/runtime/tool-runtime/index.ts`
- [x] T018 [P] Add a failing provider-continuity test proving `reasoning_content` survives internal tool turns but never enters public chunks in `apps/webapp/tests/lib/ai/runtime/assistant-stream.test.ts`
- [x] T019 Separate provider reasoning-metadata preservation from public reasoning emission in `apps/webapp/lib/ai/runtime/assistant-stream.ts`
- [x] T020 [P] Add backward-compatibility tests for optional `tool-end.sources` and safe `PublicSourceRecord` parsing in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` and `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
- [x] T021 Add the optional public source projection to existing protocol exports without a new chunk type in `packages/stream-core/src/protocol/chat-stream-chunk.ts`, `packages/stream-core/src/protocol/stream-event.ts` and `packages/stream-core/src/protocol/index.ts`
- [x] T022 [P] Add a failing integration assertion that development and production reuse one Prisma/PrismaPg client with pool max 10, connection timeout 5s and idle timeout 30s in `packages/database/tests/prisma.integration.test.ts`
- [x] T023 Implement the process-singleton database client/pool lifecycle without per-request disconnect in `packages/database/src/client.ts` and `packages/database/src/index.ts`
- [x] T024 [P] Add failing batch-store tests for one transaction, contiguous sequence, one StreamRun update, at most one trim, terminal-last and rollback-before-publish in `apps/webapp/tests/lib/ai/stream-recovery/stream-event-store.test.ts`
- [x] T025 Implement `StreamEventStore.appendEvents()` in `apps/webapp/lib/ai/stream-recovery/stream-event-store.ts` without changing `packages/database/prisma/schema.prisma`
- [x] T026 [P] Add fake-clock tests for first-delta immediate flush, 40ms/256-char threshold, structural flush, 64-item/256KiB high water and 32-item/128KiB low water in `apps/webapp/tests/lib/ai/stream-recovery/durable-stream-projection-buffer.test.ts`
- [x] T027 Implement the cancellable, ordered `DurableStreamProjectionBuffer` in `apps/webapp/lib/ai/stream-recovery/durable-stream-projection-buffer.ts`
- [x] T028 Run the foundational targeted suites and complete the Phase 2 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: Shared contracts pass independently; no ordinary-chat routing has changed yet.

---

## Phase 3: User Story 1 — 普通问题统一进入通用决策闭环 (Priority: P1)

**Goal**: Every ordinary `routeType=chat` request uses the same `createAgent` loop and may answer directly or use the fixed GeneralToolPolicy tools. The original four-base-tool wording is superseded by D033's seven-item policy.

**Independent Test**: A zero-tool question, calculator question, time question and two-round search→read question all enter one runtime; tool calls are paired, consumed by the next model turn and end in a non-empty final answer.

### Tests For User Story 1

- [x] T029 [P] [US1] Add failing Outbound Secret Guard and URL-capability tests for credentials, signed URLs, local/private targets, canonicalization and current-Run authorization in `apps/webapp/tests/lib/ai/tools/web/web-access-policy.test.ts`
- [x] T030 [P] [US1] Add failing Tavily Search/Extract adapter tests for missing-key availability, minimal payloads, at most five search results, one read URL, 12,000-char observation bounds, typed provider failures and returned-URL revalidation in `apps/webapp/tests/lib/ai/tools/web/tavily-web-provider.test.ts`
- [x] T031 [P] [US1] Add failing Agent policy tests for zero-tool completion, 1–4 action rounds, batch admission, ordinal pairing, union reducers, duplicate/no-progress detection and stop priority in `apps/webapp/tests/lib/ai/runtime/general-react-agent/run-policy-middleware.test.ts`
- [x] T032 [P] [US1] Add failing Tool middleware tests for allowlist→schema→secret guard→fingerprint→authorization→execution order and exactly one ToolMessage per logical call in `apps/webapp/tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts`
- [x] T033 [P] [US1] Add failing runner tests for natural final, constrained unbound final, deterministic fallback, action cutoff, hard deadline and actual execution-based source classification in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`
- [x] T034 [P] [US1] Add failing stream-adapter tests that whitelist safe Agent/Tool/source events and exclude raw state, errors, observations and reasoning metadata in `apps/webapp/tests/lib/ai/runtime/general-react-agent/stream-adapter.test.ts`
- [x] T035 [P] [US1] Add failing ordinary-chat integration tests for direct answer, calculator/datetime, four-wide Tool batch with peak concurrency 3, search→read sequencing and unsupported-model fail-closed in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation For User Story 1

- [x] T036 [US1] Implement the shared Outbound Secret Guard, initial/provider-returned URL policy and Run-local authorized URL set in `apps/webapp/lib/ai/tools/web/outbound-secret-guard.ts` and `apps/webapp/lib/ai/tools/web/web-access-policy.ts`
- [x] T037 [US1] Implement server-only Web configuration, the provider-neutral interface and Tavily HTTP adapter with hidden retries disabled in `apps/webapp/lib/ai/tools/web/web-provider-config.ts`, `apps/webapp/lib/ai/tools/web/web-provider.ts` and `apps/webapp/lib/ai/tools/web/tavily-web-provider.ts`
- [x] T038 [US1] Implement and register `web-search` and `read-url` alongside `calculator` and `datetime` as the closed base set in `apps/webapp/lib/ai/tools/web/web-search-tool.ts`, `apps/webapp/lib/ai/tools/web/read-url-tool.ts`, `apps/webapp/lib/ai/tools/registry.ts` and `apps/webapp/lib/ai/tools/index.ts`
- [x] T039 [US1] Implement immutable batch admission, model/action counters, no-progress/stop settlement and constrained-final mode in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware.ts`
- [x] T040 [US1] Implement the Agent-to-Tool Runtime adapter, paired failure observations and public/internal observation boundary in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts`
- [x] T041 [US1] Implement the sole `createAgent` composition root plus run-scoped invocation, action/hard-deadline controllers, constrained finalization and safe stream mapping in `apps/webapp/lib/ai/runtime/general-react-agent/create-general-react-agent.ts`, `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`, `apps/webapp/lib/ai/runtime/general-react-agent/stream-adapter.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/index.ts`
- [x] T042 [US1] Resolve an unbound tool-capable chat model, disable provider hidden retry and bind base tools through `apps/webapp/lib/ai/model-provider/catalog/resolve-model-selection.ts`, `apps/webapp/lib/ai/model-provider/providers/model-provider-interface.ts`, `apps/webapp/lib/ai/model-provider/providers/openai-compatible-provider.ts`, `apps/webapp/lib/ai/model-provider/providers/deepseek-provider.ts`, `apps/webapp/lib/ai/model-provider/providers/doubao-provider.ts`, `apps/webapp/lib/ai/model-provider/providers/qwen-provider.ts`, `apps/webapp/lib/ai/model-provider/providers/ollama-provider.ts`, `apps/webapp/lib/ai/runtime/chat-session.ts` and `apps/webapp/lib/ai/capabilities/tool-binding.ts`
- [x] T043 [US1] Replace ordinary-chat planning/single-tool/final bypasses with preparation→execution-gate→General ReAct runner→final Memory and classify Memory source by actual execution in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`, `apps/webapp/lib/ai/runtime/chat-memory/final-turn-adapter.ts` and `apps/webapp/lib/ai/runtime/user-memory/extraction-pipeline.ts`, preserving `apps/webapp/app/api/chat/route.ts` DTO and StreamRun kind
- [x] T044 [US1] Run the US1 targeted tests and complete the Phase 3 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: The kernel is demonstrable, but not release-ready until US2–US5 and final gates pass.

---

## Phase 4: User Story 2 — 特殊聊天入口汇入同一 Agent (Priority: P1)

**Goal**: `/summary`, `/check`, `@resource`, Skill and allowed MCP context retain deterministic preparation/authorization while ending in the same General ReAct loop.

**Independent Test**: Each special entry prepares its context, invokes the same Agent once, preserves base tools, adds only selected capabilities and fails closed when unauthorized.

### Tests For User Story 2

- [x] T045 [P] [US2] Add failing tests that `/summary`, `/check` and `@resource` prepare context without generating a final answer in `apps/webapp/tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts`
- [x] T046 [P] [US2] Historical additive-overlay tests for utility/context-reader Skills and MCP selectors in `apps/webapp/tests/lib/ai/capabilities/tool-binding.test.ts` (superseded by D033/T135: Skill is prompt-only and no longer grants Tool/Resource/Prompt access)
- [x] T047 [P] [US2] Add failing orchestration cases for unavailable/unauthorized special context, base-tool preservation and no capability escalation in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

### Implementation For User Story 2

- [x] T048 [US2] Convert Composer command handling into deterministic `PreparedGeneralChatContext` production in `apps/webapp/lib/ai/runtime/composer-context.ts`
- [x] T049 [US2] Historical Capability/MCP Resource/Prompt context observation work (superseded by D033/T138: generic chat now retains only Composer explicit context and removes `capability-context.ts`)
- [x] T050 [US2] Implement base-tool plus selected Skill/MCP overlay resolution with conflict and `agent-tool` fail-closed behavior in `apps/webapp/lib/ai/capabilities/tool-binding.ts`, `apps/webapp/lib/ai/skills/router.ts` and `apps/webapp/lib/ai/skills/registry.ts`
- [x] T051 [US2] Aggregate prepared context, Chat Memory and UserMemory into the Agent input while preserving existing write eligibility in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`, `apps/webapp/lib/ai/runtime/chat-memory/context-builder.ts` and `apps/webapp/lib/ai/runtime/user-memory/context-builder.ts`
- [x] T052 [US2] Run every special-entry representative case and complete the Phase 4 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: All generic chat entry variants share one decision loop without widening permission.

---

## Phase 5: User Story 3 — Public-Safe General ReAct Trace (Priority: P2)

**Goal**: Provide the Pencil-defined light, flat inline Trace as the sole generic-chat process presentation, with deterministic source data and completed local refresh recovery.

**Independent Test**: A multi-tool run shows one collapsible Trace with stable parallel rows and safe sources; first final `text-start` auto-collapses it; refresh restores the completed Trace and answer from the existing IndexedDB snapshot.

### Tests For User Story 3

- [x] T053 [US3] Open `design/pencil/agent-ui.pen` through Pencil MCP before UI code, verify the canonical frames/components/states against `spec.md`, and record node IDs plus any non-behavioral implementation mapping in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T054 [P] [US3] Add failing reducer/view-model tests for one Trace, ordinal-stable Tool slots, retry-in-place, canonical source union and deterministic search/read counts in `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] T055 [P] [US3] Add failing component tests for adjacent chevron, whole-row disclosure, title-only Shimmer, active manual collapse, final-start auto-collapse-once, terminal titles, icons/text status and safe source links in `apps/webapp/tests/components/chat/message-list/parts/general-react-trace-panel.test.tsx`
- [x] T056 [P] [US3] Add failing assistant-renderer tests proving generic Tool/Skill/Resource/Prompt panels are suppressed outside one Trace while dedicated Agent renderers remain in `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`
- [x] T057 [P] [US3] Add failing stable-snapshot tests for completed Trace+answer recovery, public-field allowlist, delete/regenerate synchronization and no cancelled/failed/partial commit in `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] T058 [P] [US3] Add failing fake-clock/rAF tests for 20ms ref-backed browser buffering, code-fence early frame and terminal/abort/unmount flush in `apps/webapp/tests/components/instamind/use-stream-text-buffer.test.tsx`

### Implementation For User Story 3

- [x] T059 [US3] Project existing safe stream parts into a single `GeneralAgentTraceView` with stable call IDs, source counts and terminal state in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-view.ts`
- [x] T060 [P] [US3] Add the official shadcn `shimmer` CSS utility through the global `shadcn/tailwind.css` import; use it only on active title text, with its built-in reduced-motion fallback
- [x] T061 [US3] Implement the canonical flat Trace, row/icon mapping, conditional read-source list and disclosure state machine in `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-panel.tsx` and `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-row.tsx`
- [x] T062 [US3] Route generic Agent Step/Tool/Skill/Resource/Prompt parts exclusively through the new Trace and retain the existing user bubble/final text presentation in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`
- [x] T063 [US3] Extend the existing public-safe local snapshot projection and schema without a new IndexedDB store/version in `apps/webapp/components/instamind/local-chat-persistence/schema.ts`, `apps/webapp/components/instamind/local-chat-persistence/stable-snapshot.ts` and `apps/webapp/components/instamind/local-chat-persistence/store.ts`
- [x] T064 [US3] Restore completed Trace parts through the existing local-first hydration and synchronize delete/regenerate semantics in `apps/webapp/components/instamind/use-chat-stream.ts` and `apps/webapp/components/instamind/chat-stream/message-operations.ts`
- [x] T065 [US3] Implement the 20ms plus nearest-rAF final-text cadence without slicing provider deltas in `apps/webapp/components/instamind/chat-stream/use-stream-text-buffer.ts`
- [x] T066 [US3] Execute the UI/snapshot smoke matrix, sensitive sentinel scan and IndexedDB unavailable/quota/invalid fallback checks, recording results in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T067 [US3] Update Pencil-exported review PNGs only if the canonical `.pen` changed, then complete the Phase 5 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md` and `design/exports/v0.6.0-general-react-agent-ui/`

**Checkpoint**: Generic Trace and answer recovery are independently demonstrable; PNG is review evidence only and `.pen` remains the visual source.

---

## Phase 6: User Story 4 — Failure, Deadline And Performance Closure (Priority: P2)

**Goal**: Bound loops, retries, capacity, PostgreSQL writes and memory while preserving a useful terminal result and a responsive Node.js event loop.

**Independent Test**: Scripted failures exhaust every budget deterministically; eight concurrent runs complete, the ninth fails before context/provider/tool work, and slow database injection triggers bounded backpressure without event loss or leaked resources.

### Tests For User Story 4

- [x] T068 [P] [US4] Add the complete budget/failure matrix for invalid schema, unknown/duplicate calls, 9-call admission, 4 rounds, 6 model calls, retry limits, 145s cutoff, 180s hard deadline and constrained finalization in `apps/webapp/tests/lib/ai/runtime/general-react-agent/runtime-policy-matrix.test.ts`
- [x] T069 [P] [US4] Add lifecycle tests for eight permits, ninth-run busy, permit retention across transport disconnect and exactly-once cleanup after terminal projection/drain in `apps/webapp/tests/lib/ai/runtime/general-react-agent/execution-lifecycle.test.ts`
- [x] T070 [P] [US4] Extend store/projector tests for persist-before-publish, 2s pool wait, 5s transaction wait, batch rollback, terminal-last and replay after writer close in `apps/webapp/tests/lib/ai/stream-recovery/stream-event-projector.test.ts` and `apps/webapp/tests/lib/ai/stream-recovery/stream-event-store.test.ts`
- [x] T071 [P] [US4] Add coordinator tests for backpressure cancellation, projection failure, transport/run-signal separation, reconnect replay and zero leaked timers/listeners/waiters in `apps/webapp/tests/lib/ai/stream-recovery/stream-execution-coordinator.test.ts`
- [x] T072 [P] [US4] Add calculator length/syntax/complexity boundary and maximum-valid-input CPU timing tests in `apps/webapp/tests/lib/ai/tools/calculator-tool.test.ts`

### Implementation For User Story 4

- [x] T073 [US4] Integrate execution permit, hard-deadline controller, projection buffer and idempotent cleanup as one run-owned scope in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` and `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts`
- [x] T074 [US4] Wire PostgreSQL-first batching and awaited projection into `apps/webapp/lib/ai/chat-service.ts`, `apps/webapp/lib/ai/stream-recovery/stream-event-projector.ts` and `apps/webapp/lib/ai/stream-recovery/stream-run-service.ts`
- [x] T075 [US4] Enforce pool/transaction wait bounds, terminal ordering and projection-failure shutdown in `apps/webapp/lib/ai/stream-recovery/stream-event-store.ts` and `apps/webapp/lib/ai/stream-recovery/durable-stream-projection-buffer.ts`
- [x] T076 [US4] Enforce calculator input and complexity limits so synchronous CPU remains bounded in `apps/webapp/lib/ai/tools/calculator-tool.ts`
- [x] T077 [US4] Add content-free metrics for active runs, rejections, batch sizes/chars/wait, queue high water, database transaction time, event-loop delay, stop reason and cleanup in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-observer.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`
- [x] T078 [US4] Build and run a scripted eight-Run PostgreSQL reference load with deterministic fake tools and no Tavily dependency in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-reference-load.integration.test.ts`
- [x] T079 [US4] Record batch transaction p50/p95/max, event-loop delay p50/p95/max, queue peaks, browser commit cadence and all cleanup counters, then complete the Phase 6 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: All correctness limits are hard gates. Performance p95 values are reference targets; a miss requires diagnosis and explicit review, not a silent parameter change.

---

## Phase 7: User Story 5 — Dedicated Agent Isolation (Priority: P3)

**Goal**: Keep Tasklist, Delivery and Image on their existing runtimes, scopes and presentations; explicitly distinguish Delivery subagents from ordinary tools.

**Independent Test**: Representative requests for all three dedicated agents never enter General ReAct, never receive Web base tools and retain their existing Graph/runtime/UI behavior.

### Tests For User Story 5

- [x] T080 [P] [US5] Add failing policy tests proving Delivery `*-subagent` definitions are `agent-tool/delegated-agent`, receive no ordinary 1/5/20s timeout or whole-Agent retry, and cannot enter generic effective tools in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T081 [P] [US5] Extend route regression tests proving Tasklist, Delivery and Image bypass the General ReAct execution gate and runner in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` and `apps/webapp/tests/app/api/chat/route.test.ts`
- [x] T082 [P] [US5] Extend dedicated presentation tests proving their existing Agent Trace, workflow and image parts do not use `GeneralAgentTracePanel` in `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`

### Implementation For User Story 5

- [x] T083 [US5] Mark Delivery subagent Tool definitions with the explicit Agent execution policy while preserving the dedicated manager budget in `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
- [x] T084 [US5] Keep the three dedicated route branches before generic admission and prevent base-tool leakage in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` and `apps/webapp/lib/ai/capabilities/tool-binding.ts`
- [x] T085 [US5] Run all dedicated Agent/runtime/UI regression suites and complete the Phase 7 evidence/checkpoint in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

**Checkpoint**: Dedicated-agent behavior and permissions remain unchanged apart from the explicit internal Tool classification.

---

## Phase 8: Cross-Cutting Documentation, External Smoke And Release Gates

**Purpose**: Synchronize long-lived architecture truth, deployment configuration and final evidence only after all story checkpoints pass.

- [x] T086 [P] Add the accepted architecture record for `createAgent`, middleware/Tool ownership, run-local state, constrained finalization and performance boundary in `docs/adr/0019-general-react-agent-runtime.md` and update `docs/adr/README.md`
- [x] T087 [P] Synchronize the actual runtime, capability, stream-recovery and Agent layering after implementation in `docs/architecture/agent-runtime.md`, `docs/architecture/runtime-boundary.md`, `docs/architecture/capability-skill-surface.md` and `docs/architecture/stream-recovery.md`
- [x] T088 [P] Document `TAVILY_API_KEY` and the per-instance database connection budget in `apps/webapp/.env.example`, `deploy/env/webapp.production.env.example` and `docs/architecture/production-deployment.md`
- [x] T089 Execute the minimal real Tavily Search/Extract smoke when an external-test credential is configured, otherwise record the unexecuted residual risk in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T090 Run targeted tests followed by `pnpm typecheck`, `pnpm lint:webapp`, `pnpm test:stable`, required integration tests and `pnpm build`, recording exact commands and results in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T091 Run `git diff --check`, sensitive sentinel scans, workspace-boundary validation and the complete `quickstart.md` matrix, recording unresolved risks in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T092 Run non-destructive Spec Kit consistency analysis and convergence against `spec.md`, `plan.md` and `tasks.md`; resolve approved findings in the same canonical workspace and record the clean result in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`
- [x] T093 After implementation and acceptance are stable, update `README.md`, create `docs/versions/v0.6.0-general-react-agent-mvp.md` and `docs/releases/v0.6.0.md`, then perform the lockstep `0.6.0` update in `package.json`, `apps/webapp/package.json`, `apps/desktop/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, `packages/stream-core/package.json` and `pnpm-lock.yaml`
- [x] T094 Complete every final acceptance row, attach Step audit conclusions and mark release readiness in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** starts from the current documented baseline.
- **Phase 2** depends on Phase 1 and blocks every user story.
- **US1 / Phase 3** depends on Phase 2 and establishes the public runtime kernel.
- **US2 / Phase 4** depends on the US1 runner contract because special contexts must enter that same loop.
- **US3 / Phase 5** depends on the safe stream projection emitted by US1, but its Pencil inspection and isolated component tests may start after Phase 2.
- **US4 / Phase 6** depends on the runner and durable primitives; its fake-clock/store tests may be prepared after Phase 2.
- **US5 / Phase 7** depends on the final route/tool-resolution shape from US1/US2.
- **Phase 8** starts only after all desired story checkpoints pass.
- **Phase 11** follows the Phase 10 cutover and is limited to frontend audit remediation; it does not reopen Runtime budgets, protocol, dedicated-Agent boundaries or virtual-list ownership.

### Critical Path

`T001 → T002 → T003 → T004/T005 → T006–T028 → T029–T044 → T045–T052 → T053–T067 → T068–T079 → T080–T085 → T086–T094 → T095–T118`

### Parallel Opportunities

- In Phase 2, test-first tasks marked `[P]` touch independent modules and may be authored concurrently; their paired implementation tasks still wait for the intended failure.
- In US1, Web policy/provider tests and Agent middleware/runner tests can proceed in parallel after the foundation.
- After US1 public stream shapes stabilize, US2 context work and US3 presentation work can proceed in parallel.
- US4 database/backpressure tests and calculator CPU-bound tests are independent.
- Documentation tasks T086–T088 can run in parallel after actual behavior is stable.

## Requirement Traceability

| Requirement group                            | Primary tasks                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| FR-001–FR-007, FR-021–FR-023                 | T029–T044                                                                     |
| FR-004–FR-005, FR-020, FR-028                | T045–T052                                                                     |
| FR-008–FR-014, FR-019, FR-027, FR-031–FR-034 | T006–T019, T031–T043, T068–T075                                               |
| FR-015–FR-018, FR-026, FR-036                | T018–T021, T029–T040, T054–T062, T077                                         |
| FR-024–FR-025, FR-035, FR-037–FR-038         | T053–T067                                                                     |
| FR-029–FR-030                                | T012–T017, T080–T084                                                          |
| FR-039–FR-042                                | T010–T011, T022–T027, T069–T079                                               |
| FR-024, FR-037, FR-041                       | T115–T118                                                                     |
| FR-047                                       | T119–T120                                                                     |
| SC-001–SC-018                                | Phase checkpoints T044, T052, T066–T067, T079, T085 and final gates T089–T094 |
| SC-019                                       | T119                                                                          |
| FR-052, SC-021                               | T135–T139                                                                     |
| FR-053–FR-054, SC-022                        | T141–T143                                                                     |

## Implementation Strategy

### Reviewable Increments

1. **Dependency gate**: prove compatibility before migrating behavior.
2. **Foundation**: land policy, protocol and durable primitives with no route switch.
3. **Agent kernel**: deliver US1 and stop for an end-to-end review.
4. **Context convergence**: deliver US2 and verify every generic entry.
5. **Trace and local recovery**: deliver US3 from canonical Pencil source.
6. **Reliability/performance**: deliver US4 and reference-load evidence.
7. **Isolation and closing**: deliver US5, long-lived docs and release gates.

The smallest demonstrable increment is Phases 1–3. The releasable v0.6.0 MVP requires all five user stories because safe Trace, bounded execution and dedicated-agent isolation are part of the approved feature contract.

## Task Completion Rules

- A task is not complete until its targeted test passes and unrelated regressions remain green.
- Do not alter the fixed 180s/145s/9-call/4-retry/concurrency-3 or 40ms/256-char/default-20ms+rAF/8-run/pool-10 values silently; a model-specific browser timer override requires the D020 allowlist and recorded performance evidence.
- Do not add a second general loop, Agent checkpoint, Redis, Worker Thread, new StreamRun kind, new IndexedDB store or Prisma migration.
- Preserve user-owned dirty-worktree changes and stop if an implementation task overlaps unexplained edits.
- At every checkpoint, update evidence only; criteria changes require a specification decision, not an implementation shortcut.

## Phase 9: Convergence — Protocol, General ReAct UI And Audit Closure

**Purpose**: Close the implementation gaps found after the initial v0.6.0 pass without changing the approved numeric budgets, dedicated-agent boundaries, or canonical spec directory.

### Tests First

- [x] T095 [P] Add protocol and reducer regression tests proving General ReAct emits no `agent-graph-*`, Tasklist keeps graph chunks, and cancelled terminal envelopes remain cancelled through `stream-reader`/`stream-message-reducer` (F1/F9; Constitution 5/6)
- [x] T096 [P] Add assistant routing and Pencil-shape component tests proving `agent-run` renders only `GeneralAgentTracePanel`, `agent-graph` remains on dedicated Agent Trace, and General rows have flat inline chevron-after-title, no ordinal or status icons, title-only shimmer and atomic text-start collapse (F2/F3/F10)
- [x] T097 [P] Add public-safety tests for MCP/display/execution projection rejecting raw input/output/error/provider data and strict dynamic schema rejection of undeclared fields (F4/F8; Constitution 6)
- [x] T098 [P] Add async projection/backpressure, full run lifecycle deadline/permit/drain, and MCP cancellation-signal propagation tests (F5/F6/F7; D014/D020)
- [x] T099 [P] Add snapshot/reconnect tests proving cancelled, failed and partial runs never commit stable snapshots or contaminate the next request, while completed General Trace remains recoverable (F9/F10)

### Implementation

- [x] T100 Migrate General ReAct stream projection to the generic run lifecycle and introduce explicit `AgentRunPart`/`AgentGraphPart` boundaries while preserving Tasklist graph protocol compatibility (F1/F10; Constitution 5/6)
- [x] T101 Route assistant parts by typed projection and rebuild General ReAct Trace components to match `design/pencil/agent-ui.pen` states using existing shadcn primitives (F2/F3; D017)
- [x] T102 Enforce public-safe MCP Tool formatting and strict dynamic schemas at the adapter/runtime boundary (F4/F8; Constitution 6)
- [x] T103 Make durable projection publication awaitable with propagated backpressure; extend run-owned permit/deadline scope through preparation and terminal projection drain (F5/F6; D014/D020)
- [x] T104 Thread Tool Runtime cancellation/timeout signals through MCP client requests and preserve cancelled terminal state across reducer, snapshot and next-turn context (F7/F9; FR-014/FR-041)

### Phase 9 Convergence Addendum — General Agent UI Domain

- [x] T105 [P] Move message-list parts into isolated `general-agent/`, `tasklist-agent/`, `delivery-agent/`, `image-agent/`, `shared/` and `legacy/` folders and add a boundary regression test.
- [x] T106 [P] Rename General UI exports and test selectors from `GeneralReAct*` to `GeneralAgent*` while preserving `agent-run` wire protocol and server runtime naming.
- [x] T107 [P] Project Skill selection after `agent-run-start` and enforce the exact `加载了{skill.name} Skill` Trace row copy.
- [x] T108 Synchronize canonical spec, plan, data model, contracts, decisions and task evidence with the General Agent naming, folder ownership, route boundary and lifecycle order.
- [x] T109 Run a headed/browser visual smoke against the Pencil-derived Trace states; keep it open until a supported browser automation surface is available if the local CUA browser cannot initialize.

**Checkpoint**: General ReAct uses the generic run lifecycle and Pencil-defined Trace, dedicated Agent graph/UI behavior is unchanged, public DTOs are strict/safe, and lifecycle/backpressure/cancellation tests pass.

## Phase 10: Breaking General Agent Cutover

**Purpose**: Apply the approved v0.6.0 breaking-update decision: only Tasklist, Delivery Chain and Image keep dedicated runtimes/presentations; every other chat path and process presentation is owned by General ReAct.

### Tests First

- [x] T110 [P] Add regression tests proving every non-dedicated chat request reaches `GeneralReActAgentRunner` without direct-answer/planning/tool-calling fallback, while Tasklist, Delivery and Image remain dedicated.
- [x] T111 [P] Add contract tests proving `ChatSession` no longer exposes `toolBoundModel`, `directAnswerMessages` or other legacy ordinary-chat fields, and old `agent-step` snapshot input is rejected.
- [x] T112 [P] Add component boundary tests proving `parts/legacy/` and old Tool/Skill/Resource/Prompt panels are absent and non-dedicated assistant messages render only `GeneralAgentTracePanel` for process parts.

### Implementation

- [x] T113 Remove unreachable ordinary-chat direct-answer/planning/tool-calling fallback code and compatibility-only `ChatSession` fields; make General ReAct the unconditional non-dedicated runtime path.
- [x] T114 Update current message types/reducers/fixtures to the v0.6.0 discriminators and route generic panels exclusively through General Trace; final physical deletion of dormant legacy modules remains a release-closing cleanup after acceptance evidence is complete.

**Checkpoint**: v0.6.0 is a deliberate breaking cutover; no old ordinary-chat runtime/UI/snapshot compatibility path remains, and Tasklist, Delivery Chain and Image regressions remain green.

## Phase 11: Frontend Audit Remediation

**Purpose**: Close the frontend audit findings without changing the dedicated-Agent boundary, stream protocol, virtual-list scroll owner or numeric Runtime budgets.

### Tests First

- [x] T115 [P] Add component regressions for action-settled/final-pending Shimmer, Trace-only raw reasoning isolation, and safe source link hostname/external-link semantics.
- [x] T116 [P] Add a disclosure-provider regression proving equivalent `validKeys` members do not emit a new disclosure state during a stream update.

### Implementation And Documentation

- [x] T117 Make final `text-start` the only normal completed-title/auto-collapse transition, hide generic raw reasoning outside General Trace, complete source-link presentation, and stabilize disclosure-key membership across high-frequency text updates.
- [x] T118 Synchronize D020 and frontend performance documentation: 20ms+rAF remains the browser default; only an assessed `ChatModel` allowlist may override its timer while retaining rAF and terminal flush.

**Checkpoint**: Generic Trace does not expose raw reasoning, final-pending remains visibly active, ordinary stream updates do not cause disclosure Context churn, source links meet the safe presentation contract, and model-specific cadence remains an explicit performance configuration rather than a divergent default.

## Phase 12: Accepted-Turn Layout Stability

**Purpose**: Eliminate the terminal visual re-anchor caused by the inherited viewport reply runway without changing Composer-safe spacing, virtual-list ownership or the user-reading scroll policy.

### Tests First

- [x] T119 Add a `ChatMessageList` regression proving only the accepted follow-up keeps a fixed `288px` response reserve in submitted, streaming, ready and error without a viewport reply runway, while its live turn key remains stable and history is unchanged (FR-047).

### Implementation And Documentation

- [x] T120 Replace the accepted-turn viewport reply runway with a fixed `288px` reserve that persists through terminal assistant presentation, preserving the existing Composer-safe footer inset and scroll policy (FR-047; D029).

**Checkpoint**: A short completed answer retains its fixed 288px response reserve across terminal presentation, so status completion cannot create a visible downward re-anchor while the intended Composer separation remains.

## Phase 13: Server Correctness And Performance Remediation

**Purpose**: Repair the release-blocking server findings without creating a second Agent loop, widening Tool permissions, changing fixed runtime budgets, or creating another spec workspace.

### Tests First

- [x] T121 [P] Add red regressions proving a text-before-Tool-Call turn emits no final text and that a confirmed natural turn preserves safe source fragments in `apps/webapp/tests/lib/ai/runtime/general-react-agent/stream-adapter.test.ts` and `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`.
- [x] T122 [P] Add red regressions rejecting private IPv4-mapped/compatible IPv6 targets and proving observer percentile rollover after 1,024 samples in `apps/webapp/tests/lib/ai/tools/web/web-access-policy.test.ts` and `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-observer.test.ts`.
- [x] T123 [P] Add red lifecycle regressions proving an admitted Tool durable-starts before its deferred first attempt, then emits its matching terminal/source only after completion in `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts` and `apps/webapp/tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts`.
- [x] T124 [P] Strengthen the real PostgreSQL reference load with a non-counted warm-up, auditable non-secret target metadata (topology, database instance, concurrency, pool and samples), a ninth request through the same scripted admission path, and a target-only p95 hard assertion in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-reference-load.integration.test.ts`.

### Implementation

- [x] T125 Implement turn-scoped candidate text buffering and full-state confirmation in `apps/webapp/lib/ai/runtime/general-react-agent/stream-adapter.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`.
- [x] T126 Implement IPv4-mapped/compatible IPv6 private-target rejection and a 1,024-slot observer ring window in `apps/webapp/lib/ai/tools/web/web-access-policy.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-observer.ts`.
- [x] T127 Make Tool Runtime await lifecycle writes and make the General ReAct middleware publish safe starts immediately while deferring only source-decorated terminals in `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts`, `packages/stream-core/src/core/stream-error.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts`.
- [x] T128 Update the pre-warmed production-like p95 evidence procedure, run the targeted suite/typecheck/lint/stable gates, and record outcomes or the unavailable target environment in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`.

**Checkpoint (historical, superseded by D032)**: Phase 13 prevented mixed Tool/text candidate publication by delaying turn release. Phase 14 replaces that release strategy: Action text is never public, and only the unbound Answer Phase can produce final text.

## Phase 14: Explicit Action/Answer Streaming

**Purpose**: Replace the superseded turn-candidate release policy with one General ReAct Action loop followed by one same-model, unbound-Tool Answer Phase, so public final text is genuinely streamed without exposing Action drafts or introducing a second Agent/Graph.

### Tests First

- [x] T129 [P] Update state/config/policy regressions for 6 Tool-bearing Action rounds, 7 Action model calls plus 1 reserved Answer call, natural terminal Action transition to `answering`, and cancellation/hard-deadline exclusion in `apps/webapp/tests/lib/ai/runtime/general-react-agent/agent-state.test.ts`, `run-policy-middleware.test.ts` and `runtime-policy-matrix.test.ts`.
- [x] T130 [P] Add runner/adapter regressions proving zero-Tool and multi-Tool Action drafts are never public, only ordered Answer model deltas create `text-*`, the Answer model is unbound, abnormal Answer Tool Calls fail closed, and Action/Answer totals obey 8 calls in `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts` and `stream-adapter.test.ts`.

### Implementation

- [x] T131 Implement explicit Action/Answer phases, bounded Action policy and the 8-call configuration in `apps/webapp/lib/ai/runtime/general-react-agent/agent-context.ts`, `agent-state.ts`, `runtime-config.ts` and `middleware/run-policy-middleware.ts`.
- [x] T132 Make `GeneralReActAgentRunner` always invoke the same-selection unbound Answer model after a non-cancelled/non-deadline Action outcome, stream its safe chunks through the durable adapter, remove Action candidate replay, and exclude the Action terminal candidate from the Answer input in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts` and `stream-adapter.ts`.
- [x] T133 Update phase-model/runner consumer tests and verify model provenance and Memory source remain based on the Action execution count in `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts` and `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`.

### Documentation And Verification

- [x] T134 Synchronize the canonical contracts, data model, ADR, architecture and acceptance evidence for D032; run targeted tests, typecheck, lint, diff checks and the available stable suite, recording any environmental gate separately.

**Checkpoint**: No Action text becomes public or durable; every completed Run has one unbound same-model Answer attempt whose safe output starts streaming immediately, while Tool lifecycle, source provenance, retry, backpressure and cancellation boundaries remain unchanged.

## Phase 15: Prompt-Only Skill And Fixed General Tool Policy

**Purpose**: Remove the remaining Skill-to-Tool/MCP authority coupling while retaining Skill selection, Trace projection and explicit Composer context. Keep the approved Action/Answer budgets and dedicated-Agent boundaries unchanged.

### Tests First

- [x] T135 [P] Add regressions proving the seven-item General Tool set is identical with no Skill, `utility-skill` and `reader-skill`; no path performs remote MCP Tool discovery in `apps/webapp/tests/lib/ai/capabilities/tool-binding.test.ts` and `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts`.
- [x] T136 [P] Add orchestration regressions proving Skill selection only contributes prompt/Trace metadata, never auto-prepares remote capability context, while explicit Composer context remains available in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`, `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts` and `apps/webapp/tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts`.

### Implementation

- [x] T137 Replace Skill-dependent binding with a fixed `GeneralToolPolicy` resolution in `apps/webapp/lib/ai/capabilities/tool-binding.ts` and `apps/webapp/lib/ai/runtime/chat-session.ts`; remove Skill capability selector ownership and remote MCP discovery from `apps/webapp/lib/ai/skills/registry.ts`, `utility-skill.ts` and `reader-skill.ts`.
- [x] T138 Remove Skill-triggered remote capability preparation from `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` and `apps/webapp/lib/ai/runtime/capability-context.ts`; retain only explicit Composer context preparation and revise Skill prompts so they do not name unavailable capability.
- [x] T139 Synchronize canonical contracts, data model, ADR and architecture documentation for D033; run the targeted Tool/Skill/orchestrator suites, typecheck, lint and `git diff --check`, recording evidence in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`.
- [x] T140 Remove the Composer's manual Skill mode selector and its client request mapping; retain server-side automatic Skill matching and cover the absent control plus ordinary request path.

**Checkpoint**: Skill remains visible in General Trace and changes only its trusted prompt/output style; all General ReAct Action runs share the same fixed Tool allowlist, no Skill route discovers remote Tool or silently reads remote context, and explicit Composer context still enters the same Agent.

## Phase 16: Real-User Answer Prompt Policy

**Purpose**: Make the final Answer consistently useful in real chat while keeping D032 Action/Answer authority, D033 prompt-only Skill boundaries, fixed Tool policy and all runtime budgets unchanged.

### Tests First

- [x] T141 [P] Add red prompt-composition and runner regressions proving Answer excludes Action-only Tool directives, ordinary answers receive the conclusion-first/moderate baseline, explicit concise/detailed formatting requests are preserved, and untrusted Web/Tool/context instructions cannot alter Tool authority or Answer policy in `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts`, `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts` and a focused prompt policy test.

### Implementation

- [x] T142 Implement phase-specific server-owned prompt composition in `apps/webapp/lib/ai/prompts/tool-calling.ts`, `apps/webapp/lib/ai/runtime/chat-session.ts`, `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` and `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`; revise Reader/Utility prompt overlays for user-facing language, moderate default answers, intent-based deterministic Tool use, safe Web/source handling and no Skill authority expansion.

### Documentation And Verification

- [x] T143 Synchronize D034 across the canonical spec/plan/contracts/data model/ADR/architecture and record targeted prompt-policy tests, typecheck, lint and `git diff --check` evidence in `specs/v0.6.0-general-react-agent-mvp/acceptance.md`.

**Checkpoint**: Answer begins from a non-conflicting, user-facing prompt projection; Action text and Action-only Tool instructions remain private, all Skills retain the same fixed seven-Tool set, and untrusted observations cannot redirect the response policy or runtime authority.

## Phase 17: Convergence — Post-Implementation Audit Findings (v0.6.0)

**Purpose**: Record the post-implementation convergence gaps retained by the 前端 / 后端 / AI 编排逻辑层 deep audit. This section is append-only follow-up; no numeric runtime budget, stream protocol, dedicated-agent boundary, or canonical spec directory is changed. Gap type and severity are annotated per task.

### Security (Gap Type: partial)

- [x] T144 [HIGH] Add a failing `web-search` policy test proving a search query containing a signed URL, URI userinfo, or signature-parameter target is rejected/sanitized before reaching the provider; then extend `enforceWebPoliciesBeforeFingerprint` in `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts` to apply the same signature/userinfo policy already used by `read-url` to `web-search` queries (FR-015/SC-006; currently only `assertOutboundDataAllowed` guards `web-search`).
- [x] T145 [HIGH] Add a failing `web-access-policy` test rejecting IPv6 multicast `ff00::/8` and confirm every IPv6 special range beyond `::`, `::1`, ULA `fc00::/7`, and link-local `fe80::/10` is covered; implement in `isLocalOrPrivateHostname` in `apps/webapp/lib/ai/tools/web/web-access-policy.ts` (FR-016/SC-006; IPv4 already rejects `>=224` multicast, the IPv6 branch omits `ff00::/8`).

### Coordination And Lifecycle (Gap Type: partial / contradicts)

- [x] T146 [MEDIUM] Add a failing route/cancel regression proving the cancel route aborts the in-flight run under default wiring; then unify the `StreamExecutionCoordinator` instance shared by `createNdjsonStreamResult` (`getCoordinator()` currently instantiates a fresh per-call coordinator) and `apps/webapp/app/api/chat/runs/[runId]/cancel/route.ts` (module-level singleton) so the `activeExecutions` map and `requestCancel` fast path operate on the same state (FR-034; the fast-path abort can never find the run today).
- [x] T147 [MEDIUM] Add a failing lifecycle test for `clearExecutionOwner` throwing during cancellation; implement retried/best-effort owner cleanup with explicit logging in `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts` so a transient persistence failure cannot permanently leak the execution owner and leave the run non-restartable (FR-034/FR-039).

### Observability And Edge Cases (Gap Type: partial)

- [x] T148 [LOW] Label the `TimingMetricSnapshot` percentiles in `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-observer.ts` as a rolling 1,024-sample window so downstream consumers do not misread p50/p95 as full-run aggregates (FR-041).
- [x] T149 [LOW] Add a failing durable-buffer test for the in-flight flush that completes after `fail()` and clamp/prevent negative pending counters in `apps/webapp/lib/ai/stream-recovery/durable-stream-projection-buffer.ts` (FR-039).
- [x] T150 [LOW] Key the frontend final-answer auto-collapse on the structural `text-start` event rather than first non-empty text in `hasStartedFinalAnswer` in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`, so the T117 contract "first final `text-start`" is the exact trigger (FR-024/FR-037).

### Cleanup And Dead Code (Gap Type: unrequested)

- [x] T151 [LOW] Remove or explicitly document the remaining shared legacy status-icon helpers in `apps/webapp/components/chat/message-list/parts/shared/message-list-utils.tsx`, now consumed only by the delivery-agent path (AGENTS cleanup rule / Constitution 6).
- [x] T152 [LOW] Guard the `resumeAgentRun` snapshot commit so a non-completed run is never committed unconditionally, matching the normal-path `completed`-only commit in `apps/webapp/components/instamind/use-chat-stream.ts` (FR-037).
- [x] T153 [LOW] Remove the unused `RunAuthorizedUrlSet` from `apps/webapp/lib/ai/tools/web/web-access-policy.ts` (production authorization flows through `_authorizedUrls` + middleware) or add an explicit owner note to avoid dead code diverging from the real authorization path (FR-016).
- [x] T154 [LOW] Replace the `knownSecrets.includes(...)` substring match in `apps/webapp/lib/ai/tools/web/outbound-secret-guard.ts` with a boundary/word-aware matcher to avoid over-matching short secrets (FR-015/SC-006).

**Checkpoint**: The v0.6.0 General ReAct Agent MVP converges with two HIGH security and two MEDIUM coordination/lifecycle gaps retained as explicit follow-ups; the remaining findings are LOW cleanup and edge-case items. No numeric runtime budget, stream protocol, dedicated-agent boundary, or canonical spec directory was changed by this audit.

## Phase 18: Convergence — Full Implementation Deep Audit

**Purpose**: Close the remaining implementation, lifecycle, public-safety, virtual-list and verification gaps found by the full frontend (including Virtuoso), backend stream/memory and AI orchestration audit. Preserve the approved budgets, dedicated-Agent boundaries, stream protocol and canonical workspace.

### Runtime Correctness And Lifecycle

- [x] T155 [HIGH] Enforce terminal-before-memory ordering: await successful durable terminal projection before appending Chat Memory/UserMemory, reject writes after cancellation/projection failure, and replace the stale memory-before-finish regression per `stream-and-memory.md:86-92`, FR-020/027 (contradicts).
- [x] T156 [HIGH] Propagate run cancellation/deadline through post-answer Memory append (or force a cancelled/failed terminal when append is interrupted), ensuring no `StreamRun` remains `running`; add a hanging-append cancellation regression per FR-027/034 (partial).
- [x] T157 [HIGH] Add atomic run-local ActionBatch fingerprint admission so identical concurrent Tool Calls in one v2 batch cannot both invoke a provider; emit one paired duplicate observation per rejected call and cover the 4-wide concurrency case per FR-008/013/SC-013 (partial/contradicts).
- [x] T158 [MEDIUM] Bound StreamEvent transaction time as one combined remaining-deadline budget instead of independently stacking `maxWait` and `timeout`; add near-hard-deadline and slow-pool regressions per FR-011/040 (partial).
- [x] T159 [MEDIUM] Thread `AbortSignal` or an equivalent bounded cancellation mechanism through Chat Memory read/append and context preparation, with regression coverage for cancellation during read/write per FR-027/040 (partial).
- [x] T160 [MEDIUM] Make StreamLifecycle/static-part/memory-status projection writes awaitable or safely captured so first/terminal projection failures are observable without ordering or rejection gaps; add rejected-write regressions per FR-040 (partial).
- [x] T161 [LOW] Make deferred cleanup best-effort and failure-isolated so one throwing cleanup cannot skip remaining permit, timer, listener and writer cleanup per FR-034/039 (partial).

### Frontend And Virtualized Layout

- [x] T162 [MEDIUM] Make empty assistant loading presentation route-aware so Tasklist, Delivery Chain and Image runs never render `InitialGeneralAgentTrace`; add dedicated-agent first-frame regressions per FR-043 and the dedicated-Agent acceptance scenarios (partial).
- [x] T163 [MEDIUM] Include the fixed 288px accepted-turn assistant reserve in Virtuoso `heightEstimates` for submitted/streaming live turns, preserving stable keys and scroll ownership; add first-measurement/re-anchor coverage per FR-047/SC-019 (partial).
- [x] T164 [MEDIUM] Synchronize height-hint test fixtures with `MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION`/layout-key v2 (or import the constant) and restore the stable message-list suite per FR-047/SC-019 (partial verification gap).
- [x] T165 [LOW] Exclude `unavailable` Web sources from General Trace search counts while retaining only safe discovered/read records, and add status-matrix coverage per SC-015 (partial).

### Public-Safe Snapshot And Web Boundaries

- [x] T166 [MEDIUM] Replace stable snapshot `{...message}`/passthrough persistence with an explicit strict top-level message/artifact allowlist and add unknown-field sentinel tests per FR-038/SC-017 (partial).
- [x] T167 [MEDIUM] Sanitize Resource `uri` and frontend source links with a safe allowlist that rejects userinfo, signed/credential-bearing and private targets before rendering or IndexedDB persistence; add malicious URI/source regressions per FR-038/SC-006 (partial).
- [x] T168 [MEDIUM] Implement the promised boundary/word-aware outbound secret matcher (not substring `includes`) and add embedded-word, boundary-hit and short-secret tests per FR-015/SC-006/T154 (partial).

### Memory Concurrency And Verification Hygiene

- [x] T169 [MEDIUM] Define and enforce per-conversation Chat Memory write serialization or optimistic CAS/version checks so concurrent completed Runs cannot lose turns; add a same-thread concurrent append regression per FR-020 (partial).
- [x] T170 [MEDIUM] Recalibrate Chat Memory compaction and pinned-decision promotion fixtures to the current tokenizer and strict target contract, preserving full-turn retention and post-persistence promotion semantics per SC-006 (partial verification gap).
- [x] T171 [LOW] Remove or explicitly quarantine the unused `authoritative-answer`/`tool-answer` direct-answer bypass exports left after the breaking cutover, and document the decision per FR-028/D023 (unrequested).

**Checkpoint**: Memory is written only after a durable completed terminal, cancellation and deadlines cannot strand a run, concurrent Tool/Memory operations are atomic or serialized, dedicated and virtualized UI states are stable, snapshots and Web links are strictly public-safe, and the focused suites are green before release closing.

---

## Phase 19: Governance Amendment — AI Coding Collaboration And Decision Revalidation

**Purpose**: Apply the approved project-governance amendment in this canonical workspace without changing v0.6.0 product Runtime scope, numeric policy, protocol, Agent Tool boundary or release acceptance behavior.

- [x] T172 [LOW] Add Constitution principles, root `AGENTS.md` execution rules and `docs/architecture/ai-coding-workflow.md` gates for safe complex-work delegation and candidate-based decision revalidation; record the process-only boundary as D036 in `specs/v0.6.0-general-react-agent-mvp/decisions.md`.

**Checkpoint**: Future AI coding work assesses safe delegation before complex implementation and treats existing technical choices as evidence-backed candidates when research is triggered; this amendment does not add product multi-Agent capability.

---

## Phase 20: Configurable Zhipu Web Search Provider

**Purpose**: Keep the existing `web-search` and `read-url` Tool contract while adding a server-only, deployment-selected Zhipu Search-Std/Reader adapter. This is a provider integration only: no Tool Runtime retry/budget change, no UI selector and no automatic Tavily↔Zhipu failover.

### Tests First

- [x] T173 [P] Add failing Web provider config/factory tests for default Tavily compatibility, selected Zhipu, invalid selector/engine, missing selected key, both provider keys entering the outbound known-secret set, and binding-time provider freeze in `apps/webapp/tests/lib/ai/tools/web/` and `apps/webapp/tests/lib/ai/capabilities/tool-binding.test.ts`.
- [x] T174 [P] Add failing Zhipu adapter tests for fixed Search-Std and Reader requests, result normalization, URL revalidation, truncation and safe typed error fields in `apps/webapp/tests/lib/ai/tools/web/zhipu-web-provider.test.ts`.
- [x] T175 [P] Add failing Tool Runtime regression proving provider-neutral connection errors retain the existing D035 classification without adding an adapter retry policy in `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`.

### Implementation And Verification

- [x] T176 Implement the server-only provider config/factory, Zhipu Search-Std/Reader adapter and provider-neutral typed error in `apps/webapp/lib/ai/tools/web/`; retain Tavily and update both Web Tool definitions to use the factory.
- [x] T177 Synchronize v0.6.0 spec, plan, research, contracts, deployment examples and architecture notes for D037; execute fake-provider regressions, typecheck, lint, diff/sensitive scans, and one redacted real Zhipu Search+Reader smoke using an explicitly supplied development key. Record evidence in `acceptance.md`.

**Checkpoint**: A Run binds only the configured provider; both adapters have the same public Tool contract and D035 retry/timeout/security behavior, while missing/invalid configuration fails closed without secret leakage or provider switching.

---

## Phase 21: Prompt-Only Explicit Web Intent Policy

**Purpose**: Resolve the observed no-Tool Web-answer failure by clarifying Action/Answer Prompt policy only. Do not add deterministic intent matching, forced tool choice, Tool Runtime/Provider/URL-authorization changes, new DTOs, or budget changes.

### Tests First

- [x] T178 [P] Extend `apps/webapp/tests/lib/ai/prompts/tool-calling.test.ts` with RED contract assertions for explicit public-network search, direct-URL reading, no-URL article selection/read requiring search first, site/language/topic preference with no non-matching substitution, stable explanation/writing with no unnecessary search, and Answer prohibition on fabricated Tool observations.

### Implementation And Verification

- [x] T179 Revise only `apps/webapp/lib/ai/prompts/tool-calling.ts`: provide a concise Action decision ladder, Web Tool descriptions covering search→read dependency and preference filtering, and an Answer observation-only Web fact boundary. Preserve exports, Tool schema, runtime policy, URL grants, retry/budget and public contracts.
- [x] T180 Synchronize D038/FR-058/SC-024 in the current canonical workspace; run the prompt suite, related Chat Session/General ReAct runner suites, typecheck, scoped ESLint and `git diff --check`, recording the exact evidence in `acceptance.md`.

**Checkpoint**: Prompt policy covers explicit external research without degrading ordinary zero-Tool chat. It instructs, but does not pretend to enforce, a deterministic Runtime Tool choice; Answer cannot manufacture Tool/Web execution claims without current Run observations.
