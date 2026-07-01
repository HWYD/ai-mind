# Tasks 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Completed
版本: v0.4.0
日期: 2026-07-01

**Input**: Design documents from `specs/040-controlled-agent-as-tool-delivery-manager-mvp/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by spec and acceptance.

## Phase 1: Spec Assets and Guardrails

**Purpose**: Freeze scope before code. This phase is document-only and completed before implementation.

- [x] T001 [P] Complete primary feature spec in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/spec.md`
- [x] T002 [P] Complete implementation plan in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/plan.md`
- [x] T003 [P] Complete research decisions in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/research.md`
- [x] T004 [P] Complete runtime data model in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/data-model.md`
- [x] T005 [P] Complete subagent tool contract in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/contracts/subagent-tool-contract.md`
- [x] T006 [P] Complete workflow progress contract in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/contracts/workflow-progress-contract.md`
- [x] T007 [P] Complete acceptance gates in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/acceptance.md`
- [x] T008 [P] Complete decision log in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/decisions.md`
- [x] T009 [P] Complete quickstart validation guide in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/quickstart.md`
- [x] T010 [P] Complete requirements quality checklist in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/checklists/requirements.md`
- [x] T011 [P] Complete Spec Kit analysis report in `specs/040-controlled-agent-as-tool-delivery-manager-mvp/analysis.md`

**Checkpoint**: v0.4.0 scope is formally Agent-as-tool, strong JSON Schema, fail-closed, no runner fallback, no old graph main path.

## Phase 2: Foundational Contract Tests

**Purpose**: Establish schema and policy tests before implementation.

- [x] T012 [P] Add RuntimeArtifact schema tests in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T013 [P] Add SubagentToolJsonResult strong schema tests in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T014 [P] Add SubagentToolDefinition boundary tests in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T015 [P] Add DelegationPolicy order and maxToolCalls tests in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T016 [P] Add no Tasklist Agent import / boundary guard test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`

**Checkpoint**: Contract tests cover schema, definition boundary and core policy.

## Phase 3: Foundation Implementation

**Purpose**: Add delivery-chain-local contracts and policy without integrating `/delivery-chain` yet.

- [x] T017 Create manager directory and contract types in `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts`
- [x] T018 Implement strong result schemas in `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tool-schemas.ts`
- [x] T019 Implement RuntimeArtifact factory / validation helpers in `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`
- [x] T020 Implement DelegationPolicy and fail-closed validation in `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`
- [x] T021 Export only delivery-chain-local manager APIs from `apps/webapp/lib/ai/runtime/delivery-chain/manager/index.ts`

**Checkpoint**: Delivery-chain-local contracts are isolated under `delivery-chain/manager/`.

## Phase 4: User Story 1 - Legal Agent-as-tool Delegation (Priority: P1) MVP

**Goal**: Manager accepts legal serial tool calls and synthesizes a compatible report.

**Independent Test**: Fake model calls plan, task, review in order; Manager records three safe delegations and outputs final report.

### Tests for US1

- [x] T022 [P] [US1] Add fake tool-call model happy path test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T023 [P] [US1] Add plan completed creates plan artifact assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T024 [P] [US1] Add task consumes plan artifact and creates tasks artifact assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T025 [P] [US1] Add review consumes plan and tasks artifact assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T026 [P] [US1] Add final report heading compatibility assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`

### Implementation for US1

- [x] T027 [US1] Implement delivery-chain-local subagent tool definitions in `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
- [x] T028 [US1] Reuse current plan/task/review stage prompting inside `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
- [x] T029 [US1] Implement controlled tool-call loop in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
- [x] T030 [US1] Implement safe trace updates in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
- [x] T031 [US1] Implement final report synthesis in `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`

**Checkpoint**: US1 runs entirely through Agent-as-tool Manager with fake model.

## Phase 5: User Story 2 - Fail Closed Policy (Priority: P1)

**Goal**: Invalid model tool calls or tool results cannot break controlled flow.

**Independent Test**: Fake model produces invalid calls/results; Manager fails safely and creates no formal artifact.

### Tests for US2

- [x] T032 [P] [US2] Add task-before-plan fail-closed test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T033 [P] [US2] Add review-before-plan/tasks fail-closed test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T034 [P] [US2] Add unregistered tool fail-closed test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T035 [P] [US2] Add repeated / over maxToolCalls fail-closed test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T036 [P] [US2] Add parallel tool calls rejected test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T037 [P] [US2] Add invalid JSON result rejected test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T038 [P] [US2] Add failed subagent result creates no formal artifact test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`

### Implementation for US2

- [x] T039 [US2] Add unregistered / out-of-order / repeated call rejection in `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`
- [x] T040 [US2] Add parallel call rejection in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
- [x] T041 [US2] Add no correction-loop fail path in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`
- [x] T042 [US2] Add invalid JSON result safe failure handling in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`

**Checkpoint**: All policy violations fail closed with safe summaries.

## Phase 6: User Story 3 - Run-local RuntimeArtifact Boundary (Priority: P2)

**Goal**: RuntimeArtifact is internal only and never becomes public artifact or persistence.

**Independent Test**: Delivery chain run completes; emitted chunks and message parts contain no RuntimeArtifact or artifact chunks from subagent handoff.

### Tests for US3

- [x] T043 [P] [US3] Verify no `artifact-start` / `artifact-end` from RuntimeArtifact in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] T044 [P] [US3] Verify RuntimeArtifact is not present in workflow progress chunks in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] T045 [P] [US3] Verify `/delivery-chain` keeps `@demo://`-only read boundary and introduces no persistence touch regression in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`

### Implementation for US3

- [x] T046 [US3] Keep RuntimeArtifact exports scoped to `apps/webapp/lib/ai/runtime/delivery-chain/manager/index.ts`
- [x] T047 [US3] Ensure report text is emitted via existing text path in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T048 [US3] Ensure no artifact chunks are written by Manager in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`

**Checkpoint**: RuntimeArtifact remains run-local and invisible to public stream.

## Phase 7: User Story 4 - Workflow Progress Safety (Priority: P2)

**Goal**: Users see progress, not raw delegation transcript.

**Independent Test**: Progress chunks contain only safe step ids, titles, summaries and details.

### Tests for US4

- [x] T049 [P] [US4] Add Manager progress step order test in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] T050 [P] [US4] Add progress forbids raw invocation/result/artifact assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] T051 [P] [US4] Run stream schema non-regression test in `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
- [x] T052 [P] [US4] Run reducer non-regression test in `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] T053 [P] [US4] Run assistant message workflow progress rendering regression in `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`

### Implementation for US4

- [x] T054 [US4] Implement Manager workflow progress mapping in `apps/webapp/lib/ai/runtime/delivery-chain/manager/workflow-progress.ts`
- [x] T055 [US4] Update delivery-chain progress step labels in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T056 [US4] Ensure workflow progress end emits before final report in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`

**Checkpoint**: UI remains compact progress summary and auto-collapses after completion.

## Phase 8: User Story 5 - Tasklist Agent Non-regression (Priority: P1)

**Goal**: v0.4.0 does not affect existing `/tasklist` Agent.

**Independent Test**: `/tasklist` focused tests pass and no delivery-chain manager import appears under Tasklist Agent.

### Tests for US5

- [x] T057 [P] [US5] Add `/tasklist` does not use ControlledDeliveryManager assertion in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] T058 [P] [US5] Run Tasklist Agent graph runner focused tests in `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner.test.ts`
- [x] T059 [P] [US5] Run Tasklist Agent HITL / runtime contract focused tests in `apps/webapp/tests/lib/ai/runtime/agent-run-contracts.test.ts` and `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-hitl-contracts.test.ts`

### Implementation for US5

- [x] T060 [US5] Keep `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/**` unchanged
- [x] T061 [US5] Ensure `/delivery-chain` subagent tools stay isolated from `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/**`

**Checkpoint**: Tasklist Agent Graph / HITL / checkpoint behavior is unchanged.

## Phase 9: `/delivery-chain` Integration and Old Graph Replacement

**Purpose**: Switch the public `/delivery-chain` entry to Manager without keeping dual orchestration.

- [x] T062 Route `/delivery-chain` through a tool-capable `modelHandle` and fail-closed Manager path in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` and `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T063 Update `StartDeliveryChainRunOptions` to pass a tool-capable model handle in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T064 Replace old fixed-stage main path with `ControlledDeliveryManager` in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T065 Remove old graph main execution exports from `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T066 Preserve `resolveDeliveryChainInvocation()` boundary behavior in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T067 Preserve `@demo://` context loading boundary in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`
- [x] T068 Update delivery-chain runtime tests in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`

**Checkpoint**: `/delivery-chain` uses one Manager main path, not graph + manager dual control.

## Phase 10: Final Validation and Docs Close

**Purpose**: Verify tests, docs and architecture references before release close.

- [x] T069 Run delivery-chain manager contract test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`)
- [x] T070 Run delivery-chain manager run test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`)
- [x] T071 Run delivery-chain runtime test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain.test.ts`)
- [x] T072 Run chat orchestrator focused test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/lib/ai/runtime/chat-orchestrator.test.ts`)
- [x] T073 Run stream chunk schema non-regression test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/lib/ai/stream-chunk-schema.test.ts`)
- [x] T074 Run reducer non-regression test via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/components/instamind/chat-stream/stream-message-reducer.test.ts`)
- [x] T075 Run assistant message workflow progress regression via local Vitest entry (command-equivalent to `pnpm --dir apps/webapp test tests/components/chat/message-list/messages/assistant-message.test.tsx`)
- [x] T076 Run `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` via local Vitest entry (command-equivalent to `pnpm --filter @ai-mind/stream-core test`)
- [x] T077 Run `apps/webapp` typecheck via local `tsc` entry (command-equivalent to `pnpm --dir apps/webapp typecheck`)
- [x] T078 Run focused lint for touched runtime/test files via local `eslint` entry (command-equivalent to `pnpm --dir apps/webapp lint`)
- [x] T079 Run `git diff --check`
- [x] T080 Update `docs/architecture/agent-runtime-roadmap.md` to align roadmap wording with implementation
- [x] T081 Update `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md` to align ADR wording with implementation
- [x] T082 Run `speckit-converge` manual equivalent and update `specs/040-controlled-agent-as-tool-delivery-manager-mvp/tasks.md`

**Checkpoint**: All required focused tests and scope guardrails pass.

## Dependencies and Execution Order

- Phase 1 completed before implementation.
- Phase 2 blocked implementation of contracts and policy.
- Phase 3 established delivery-chain-local contracts before manager integration.
- US1 and US2 completed before `/delivery-chain` main-path replacement.
- US3 and US4 closed after Manager core existed.
- US5 non-regression was revalidated after integration.
- Phase 9 replaced the old main path instead of keeping dual control.
- Phase 10 closed tests, docs and public version assets.

## Parallel Opportunities

- T012-T016 were authored together as contract tests.
- T022-T038 were implemented as focused manager-run regressions around the same fake tool-call harness.
- T051-T059 were validated with existing focused suites rather than expanding public schema.
- T069-T076 ran as independent focused validations once runtime changes settled.

## MVP Scope

Minimum publishable MVP delivered:

- Contract/schema/policy foundation.
- Three delivery-chain-local subagent tools.
- ControlledDeliveryManager legal serial delegation.
- Fail-closed invalid tool calls and invalid tool results.
- `/delivery-chain` main path uses Manager.
- RuntimeArtifact remains run-local.
- Workflow progress safe summary.
- `/tasklist`, stream, reducer and `@demo://` non-regression.

Not required for MVP and still not implemented:

- parallel subagents
- nested delegation
- HITL-aware delegation
- DB persistence
- `@artifact://`
- Agent Catalog
- user-selectable subagent picker

## Phase 11: Tool Runtime Scope Filtering Refinement

**Purpose**: Reuse the existing tool registry path with minimal scope filtering, without adding a second visibility abstraction.

- [x] T083 Update `specs/040-controlled-agent-as-tool-delivery-manager-mvp/spec.md`, `plan.md`, `research.md` and `decisions.md` to record the `ToolRuntimeScope`-only filtering decision
- [x] T084 Add `ToolRuntimeScope` and scope-aware registry filtering in `apps/webapp/lib/ai/tools/registry.ts` and `apps/webapp/lib/ai/tools/index.ts`
- [x] T085 Restrict capability binding to `skill-binding` scope in `apps/webapp/lib/ai/capabilities/catalog.ts`
- [x] T086 Mark delivery-chain subagent chat tool definitions with `delivery-chain-manager` scope in `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`
- [x] T087 Add focused tests for scope filtering and delivery-chain subagent tool scope in `apps/webapp/tests/lib/ai/tools/tasklist-structure.test.ts` and `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] T088 Run focused validation for tool scope filtering and delivery-chain manager contracts

## Phase 12: Pure Tool Execution Path Consolidation

**Purpose**: Remove the delivery-chain-local `run(...)` side path, route subagent execution through the unified tool runtime, and keep transcript exposure scope-aware.

- [x] T089 Update `specs/040-controlled-agent-as-tool-delivery-manager-mvp/spec.md`, `plan.md`, `research.md`, `decisions.md`, `contracts/subagent-tool-contract.md`, `docs/architecture/agent-runtime-roadmap.md` and `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md` to record pure tool execution plus `executeToolCall()` scope splitting
- [x] T090 Add focused tests for scope-aware silent transcript execution in `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`
- [x] T091 Refactor `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts` and `types.ts` so delivery-chain subagents are real executable tools, not `chatToolDefinition + run(...)` dual track
- [x] T092 Add `runtimeScope`-aware silent transcript branching in `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts`
- [x] T093 Route `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts` through unified `executeToolCall()` and remove direct `run(...)` execution
- [x] T094 Update focused delivery-chain manager contract/run tests to cover pure tool execution and remove `run(...)` overrides
- [x] T095 Run focused validation for delivery-chain manager, tool runtime, stream, reducer and `/tasklist` non-regression
