# Tasks: Image Generation Agent

**Input**: Design documents from `/specs/v0.4.12-image-generation-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. The feature specification, contracts and constitution explicitly require contract-first, graph, persistence, route, reducer and UI verification.

**Organization**: Tasks are grouped by user story. A task is marked `[P]` only when it can be worked on in parallel with other incomplete tasks because it touches independent files.

## Format: `[ID] [P?] [Story] Description`

- `[P]`: Parallelizable task
- `[US#]`: User-story mapping; omitted for setup, foundational and polish work
- Every task includes its primary file path(s)

## Phase 1: Setup

**Purpose**: Prepare the fixed UI primitive/module locations and complete the real external-contract discovery gate before provider-dependent implementation.

- [x] T001 Add the official shadcn `AspectRatio` primitive to `apps/webapp/components/ui/aspect-ratio.tsx` from `apps/webapp/`, then verify its imports match the existing `@/components/ui` alias.
- [x] T002 [P] Create the Image Agent module skeleton and public entry exports under `apps/webapp/lib/ai/runtime/image-generation-agent/index.ts` and `apps/webapp/lib/ai/runtime/image-generation-agent/{contract,graph,stream}/`.
- [x] T003 [P] Run the credentialed pre-implementation Agent Plan contract-discovery smoke against the fixed model/endpoint and record only safe confirmed request fields, response schema, default size, URL host/redirect/MIME/byte/expiry facts and local abort behavior in `specs/v0.4.12-image-generation-agent/contracts/{seedream-provider-contract,temporary-image-content-contract}.md`; do not start T028 or T036 until this gate passes, and do not replace the fixed model/endpoint when account or contract validation fails.

---

## Phase 2: Foundational Contracts and Persistence

**Purpose**: Establish the shared protocol, storage, fixed provider boundary and safe frontend message plumbing that block all user stories.

**⚠️ CRITICAL**: Complete this phase before integrating `/image` into `ChatOrchestrator`.

- [x] T004 [P] Add contract tests for exact `/image` parsing/NFC/length boundaries, bounded `image-brief`, `image-result-ready` with required server-enforced `expiresAt`, terminal-path progress/error mapping, and image error codes including planning failure in `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` and `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`.
- [x] T005 Extend the additive `ChatStreamChunk` protocol and strict webapp chunk schema in `packages/stream-core/src/protocol/chat-stream-chunk.ts`, `apps/webapp/lib/ai/stream-chunk-schema.ts`, and `apps/webapp/lib/ai/types/stream-chunk.ts`; require bounded public ImageBrief fields and `expiresAt` on `image-result-ready`, and reject prompt, provider URL, Base64 and raw-error fields.
- [x] T006 [P] Add reducer/message-part tests for ImageBrief and image-result-ready replay behavior in `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`, `apps/webapp/tests/components/instamind/chat-stream/stream-terminal-state.test.ts`, and `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`.
- [x] T007 Extend `MindMessagePart` and reducer operations for safe image parts in `apps/webapp/lib/ai/types/message.ts`, `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`, `message-operations.ts`, `message-factory.ts`, and exclude Blob/object URLs from `local-chat-persistence/{schema,stable-snapshot}.ts`.
- [x] T008 [P] Add Prisma migration coverage for `StreamRunKind.image_generation`, `ImageGenerationRun`, bounded counters, temporary-result metadata and nullable active-owner lease in `packages/database/prisma/schema.prisma` and `packages/database/prisma/migrations/20260728130000_image_generation_agent/migration.sql`.
- [x] T009 Add persistence integration tests for `ImageGenerationRun` ownership, terminal lease release, original-run idempotency replay, same-session unique active lease, atomic `imageGenerationCount 0 -> 1` before provider invocation, `min(reliable provider expiry, readyAt + 10 minutes)` expiry and bounded atomic expired-URL scrubbing in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-repository.integration.test.ts`.
- [x] T010 Implement `ImageGenerationRun` repository transitions, atomic pre-provider irrevocable generation marker, conditional publish/discard behavior and an idempotent bounded expired-result cleanup operation in `apps/webapp/lib/ai/runtime/image-generation-agent/image-generation-run-repository.ts`; invoke cleanup before image-run acquisition/result lookup, null expired provider URLs atomically, and keep Prisma writes outside graph nodes.
- [x] T011 [P] Add fixed-provider config, reviewed exact-host allowlist and error-normalization unit tests in `apps/webapp/tests/lib/ai/image-provider/image-provider-config.test.ts` and `apps/webapp/tests/lib/ai/image-provider/normalize-image-provider-error.test.ts`.
- [x] T012 Implement `seedreamImageProviderConfig` with the fixed model/Agent Plan endpoint, T003-reviewed static exact-host allowlist and safe image-provider error types in `apps/webapp/lib/ai/image-provider/image-provider-config.ts`, `types.ts`, and `normalize-image-provider-error.ts`; reuse only the existing `AI_MIND_DOUBAO_API_KEY` server secret and forbid runtime host learning.
- [x] T013 Extend stream-run kind/route-type/idempotency plumbing for image runs in `apps/webapp/lib/ai/stream-recovery/{contracts,stream-run-service,stream-event-store}.ts`, `apps/webapp/lib/ai/model-provider/resolve-route-type.ts`, and `apps/webapp/tests/lib/ai/stream-recovery/three-stream-idempotency.test.ts`.

**Checkpoint**: Protocol, safe message parts, persistence lease and fixed Provider boundary are ready. Image Agent work can proceed without altering ordinary chat semantics.

---

## Phase 3: User Story 2 — Build and Refine a Prompt from an ImageBrief (Priority: P1)

**Goal**: Convert an immutable `/image` description into an ImageBrief, use bounded inspection/revision, and generate only when the final prompt is allowed.

**Independent Test**: With fake planning models and a fake image provider, verify direct pass (0 revisions), one repair (1 revision), post-revision non-blocking pass, post-revision blocking stop (0 image calls), and every path obeys `planningModelCalls <= 5`, `revisionCount <= 1`, `generationCount <= 1`.

### Tests for User Story 2

- [x] T014 [P] [US2] Add strict bounded ImageBrief/PublicImageBriefSummary, PromptInspection issue-classification and failure-code schema tests, including `IMAGE_PROMPT_PLANNING_FAILED`, in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-contracts.test.ts`.
- [x] T015 [P] [US2] Add graph-state and conditional-edge tests for pass/revise/block and all three hard counters, including pre-call failure when `planningModelCalls = 5` and another planning call is required, in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-graph-state.test.ts` and `image-generation-agent-graph-routes.test.ts`.
- [x] T016 [P] [US2] Add graph-node tests using test-side fake planning models for allowed/defaulted assumptions versus blocking ambiguity, fixable/non-blocking/blocking issue types, no public internal Prompt, and schema-invalid ImageBrief/inspection/revision outputs that consume the current planning call then fail with zero hidden repair/retry/provider calls in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-graph-nodes.test.ts`.

### Implementation for User Story 2

- [x] T017 [P] [US2] Define strict internal/public contracts, prompt inspection codes and public-safe projections in `apps/webapp/lib/ai/runtime/image-generation-agent/contract/image-generation-contracts.ts`.
- [x] T018 [US2] Implement JSON-serializable Image Agent GraphState, node IDs and counter guards in `apps/webapp/lib/ai/runtime/image-generation-agent/graph/graph-state.ts` and `graph-node-ids.ts`; exclude provider client, AbortSignal, writer, Prisma and API Key.
- [x] T019 [US2] Implement ImageBrief, prompt draft, inspection and single revision nodes in `apps/webapp/lib/ai/runtime/image-generation-agent/graph/nodes/{image-brief-node,prompt-nodes}.ts` using one strict structured parse per planning call; schema-invalid output consumes that call and returns `IMAGE_PROMPT_PLANNING_FAILED` without a repair-model invocation.
- [x] T020 [US2] Implement pass/revise/block routing and the no-generation blocked terminal in `apps/webapp/lib/ai/runtime/image-generation-agent/graph/edges/route-after-prompt-inspection.ts` and `graph/nodes/final-nodes.ts`.
- [x] T021 [US2] Implement graph construction and execution with a pre-call global guard for `maxPlanningModelCalls = 5`, `maxPromptRevisions = 1`, no hidden structured-output retries, and no checkpointer/HITL in `apps/webapp/lib/ai/runtime/image-generation-agent/graph/{create-image-generation-graph,run-image-generation-graph}.ts`.
- [x] T022 [US2] Add safe workflow-progress and `image-brief` output helpers in `apps/webapp/lib/ai/runtime/image-generation-agent/stream/image-generation-output.ts`; do not emit internal Prompt, inspection details or GraphState.
- [x] T023 [US2] Run and refine the US2 graph tests in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-{contracts,graph-state,graph-routes,graph-nodes}.test.ts` until every branch is independently deterministic and bounded.

**Checkpoint**: The ImageBrief/ReAct-style graph is independently testable and can decide whether a single generation is permitted, without a public route or UI dependency.

---

## Phase 4: User Story 1 — Generate an Image Through the Explicit Entry (Priority: P1) 🎯 MVP

**Goal**: Accept a valid `/image` command, short-circuit ordinary chat, run the bounded Image Agent once, and emit a successful temporary-result signal.

**Independent Test**: Submit valid `/image` through `/api/chat` with a fake Seedream provider; assert one image run, one external call, no ordinary answer. Submit ordinary “帮我画图” without `/image` and assert no image run. Submit empty `/image` and assert no run.

### Tests for User Story 1

- [x] T024 [P] [US1] Add exact `/image` first-token, NFC/Unicode whitespace, `1..2000` code-point, empty/oversize, unsupported and mixed text-to-image-plus-edit/reference/multi-image intent tests in `apps/webapp/tests/lib/ai/chat-schema.test.ts` and `apps/webapp/tests/components/chat/composer/menu/composer-command-options.test.ts`.
- [x] T025 [P] [US1] Add fixed Seedream HTTP adapter tests for T003-confirmed square/landscape/portrait size mapping, request ownership, one-result parsing, fixed model/endpoint, AbortSignal and no retry in `apps/webapp/tests/lib/ai/image-provider/seedream-image-provider.test.ts`.
- [x] T026 [P] [US1] Add early-routing and ordinary-chat regression tests in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` and `apps/webapp/tests/app/api/chat/route.test.ts`.

### Implementation for User Story 1

- [x] T027 [US1] Add `image` to composer/request types, strict chat schema and command menu in `apps/webapp/lib/ai/types/chat.ts`, `apps/webapp/lib/ai/chat-schema.ts`, and `apps/webapp/components/chat/composer/menu/composer-command-options.ts`.
- [x] T028 [US1] After T003 passes, implement the fixed synchronous Seedream adapter in `apps/webapp/lib/ai/image-provider/seedream-image-provider.ts`; send only the smoke-confirmed single-image request, parse one HTTPS temporary URL, and map unsafe/ambiguous responses to domain errors.
- [x] T029 [US1] Implement start/complete/fail/cancel orchestration and conditional temporary-result publication in `apps/webapp/lib/ai/runtime/image-generation-agent/image-generation-run-coordinator.ts`; preserve cancelled terminal state and discard late provider results.
- [x] T030 [US1] Integrate `/image` before `createChatSession()` in `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`, so Image Agent execution bypasses Composer Context, Skill, Tool Calling, direct answer and chat-memory final-turn writes.
- [x] T031 [US1] Map accepted image requests to `StreamRun.kind = image_generation`, enforce active-session/idempotency behavior, and return safe conflict/validation responses in `apps/webapp/app/api/chat/route.ts` and `apps/webapp/lib/ai/chat-service.ts`.
- [x] T032 [US1] Emit `image-result-ready` only after active-run publication and verify end-to-end route/orchestrator/provider behavior in `apps/webapp/tests/app/api/chat/{route,idempotency-route}.test.ts` and `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`.

**Checkpoint**: `/image` produces one controlled image-generation run and never falls through to ordinary chat. This, together with Phase 3, is the MVP scope.

---

## Phase 5: User Story 3 — Preview and Download the Temporary Result (Priority: P1)

**Goal**: Let the current page securely load, preview and download the one temporary image without exposing the Provider URL or persisting bytes.

**Independent Test**: For a completed owned run with a fake valid image response, the UI fetches the same-origin content route once, previews one Blob and downloads identical bytes. Cross-session, expired, redirect, invalid MIME/magic and oversized upstream responses fail safely.

### Tests for User Story 3

- [x] T033 [P] [US3] Add owned-result, logical expiry before physical cleanup, atomic URL scrubbing, reviewed-host enforcement, redirect, exact MIME/magic-byte, 20 MiB declared/actual size, 15-second timeout, filename extension and distinct unavailable-result error tests for the content route in `apps/webapp/tests/app/api/chat/runs-image-route.test.ts`.
- [x] T034 [P] [US3] Add message reducer/replay tests for `image-result-ready`, cancelled dominance and local-snapshot exclusion in `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts` and `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`.
- [x] T035 [P] [US3] Add ImageBrief and image-result UI tests for read-only summary, assistant-message placement/responsive width, Blob preview, one fetch, download enable/disable lifecycle, object-URL cleanup, safe image alt text, keyboard-accessible named download, temporary-label visibility, polite loading/completion status, and semantic expired/error alerts with discoverable `/image` recovery guidance in `apps/webapp/tests/components/chat/message-list/parts/{image-brief-part,image-result-part}.test.tsx`.

### Implementation for User Story 3

- [x] T036 [US3] After T003 passes, implement owned temporary-result lookup independent of event retention, logical expiry enforcement before URL use, bounded expired-result cleanup, reviewed exact-host SSRF validation, 15-second/20 MiB bounded upstream fetch, exact MIME/magic validation and safe response headers in `apps/webapp/lib/ai/runtime/image-generation-agent/temporary-image-content-service.ts`.
- [x] T037 [US3] Add `GET /api/chat/runs/[runId]/image` with existing session ownership handling and safe error mapping in `apps/webapp/app/api/chat/runs/[runId]/image/route.ts`.
- [x] T038 [US3] Implement `ImageBriefPart` with existing `Card` and `Badge` primitives in `apps/webapp/components/chat/message-list/parts/image-brief-part.tsx`; render only `PublicImageBriefSummary`.
- [x] T039 [US3] Implement `ImageResultPart` in `apps/webapp/components/chat/message-list/parts/image-result-part.tsx` using `Card`, `AspectRatio`, `Skeleton`, `Alert`, `Badge` and `Button`; fetch content once, share Blob URL for preview/download, abort/revoke on cleanup, show temporary/expired states, derive safe alt text only from `PublicImageBriefSummary`, and expose keyboard-accessible named download plus non-focus-stealing semantic status/error updates.
- [x] T040 [US3] Render image parts in assistant messages and preserve existing parts behavior in `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` and `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`.
- [x] T041 [US3] Complete the secure proxy, expired-result cleanup and accessible UI acceptance suite in `apps/webapp/tests/app/api/chat/runs-image-route.test.ts` and `apps/webapp/tests/components/chat/message-list/parts/{image-brief-part,image-result-part}.test.tsx`.

**Checkpoint**: An owned completed result is previewable and downloadable in the current page; it is not recoverable from browser snapshots and no Provider URL reaches the browser.

---

## Phase 6: User Story 4 — Understand Progress and Failure (Priority: P2)

**Goal**: Provide safe, actionable progress, conflict, cancellation and failure states for image-generation runs.

**Independent Test**: Simulate input rejection, provider safety rejection, busy/auth/unavailable/ambiguous result, active-session conflict, explicit stop, late response and expired content; each has one safe public outcome with no sensitive fields.

### Tests for User Story 4

- [x] T042 [P] [US4] Add safe error mapping, distinct stable user guidance and redaction tests for unsupported capability, prompt block/planning failure, provider content rejection, provider availability/ambiguity and temporary-result error codes in `apps/webapp/tests/lib/ai/image-provider/normalize-image-provider-error.test.ts` and `apps/webapp/tests/lib/ai/stream-recovery/stream-event-projector.test.ts`.
- [x] T043 [P] [US4] Add same-session three-request conflict, original-message idempotency replay, terminal release, stale-lease and interrupted-deploy/process-crash reconciliation tests in `apps/webapp/tests/lib/ai/runtime/image-generation-agent-repository.integration.test.ts`.
- [x] T044 [P] [US4] Add cancellation/late-result tests and verify the stop control is keyboard accessible with an explicit accessible name using the existing execution coordinator in `apps/webapp/tests/lib/ai/stream-recovery/stream-execution-coordinator.test.ts`, `apps/webapp/tests/app/api/chat/runs-cancel-route.test.ts`, and `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx`.

### Implementation for User Story 4

- [x] T045 [US4] Extend safe image error projection, `IMAGE_PROMPT_PLANNING_FAILED`, failure messages, workflow end states and safe per-stage/server-total duration metrics in `apps/webapp/lib/ai/runtime/image-generation-agent/stream/image-generation-output.ts`, `apps/webapp/lib/ai/runtime/stream-errors.ts`, `apps/webapp/lib/ai/runtime/image-generation-agent/image-generation-run-coordinator.ts`, and `apps/webapp/lib/ai/stream-recovery/stream-event-projector.ts`.
- [x] T046 [US4] Reuse `StreamExecutionCoordinator` cancel intent/AbortController and add the three post-cancel guards in `apps/webapp/lib/ai/runtime/image-generation-agent/image-generation-run-coordinator.ts` and `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts`.
- [x] T047 [US4] Implement active-lease conflict response that points only to the original task's stop control, terminal lease cleanup, and forward-compatible interrupted-deploy/process-crash stale-lease reconciliation without resuming or repeating generation in `apps/webapp/lib/ai/runtime/image-generation-agent/image-generation-run-repository.ts` and `apps/webapp/app/api/chat/route.ts`.
- [x] T048 [US4] Surface safe image workflow stage/failure/cancel state through the existing progress UI and message lifecycle, preserving a keyboard-accessible explicitly named stop control and non-focus-stealing status announcements, in `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx`, `apps/webapp/components/chat/message-list/messages/assistant-message.tsx`, and `apps/webapp/components/instamind/use-chat-stream.ts`.

**Checkpoint**: Users understand whether the task is progressing, blocked, cancelled or unavailable; duplicate submission and late images cannot create contradictory results.

---

## Phase 7: Polish, Governance and Release Closing

**Purpose**: Validate cross-cutting constraints, document the new runtime boundary and complete release assets.

- [x] T049 [P] Add protocol, provider, graph, persistence, route and UI test commands plus the deterministic-fake/credentialed-smoke acceptance evidence matrix for v0.4.12 to `specs/v0.4.12-image-generation-agent/quickstart.md` after actual test file names are finalized.
- [x] T050 [P] Document the controlled Image Agent decision, no-HITL/no-checkpoint boundary, private URL rule and active-session lease in `docs/adr/0016-controlled-image-generation-agent.md`.
- [x] T051 [P] Add the real Image Generation Agent architecture and update related runtime/stream recovery facts in `docs/architecture/image-generation-agent.md`, `docs/architecture/agent-runtime.md`, `docs/architecture/stream-core.md`, and `docs/architecture/stream-recovery.md`.
- [x] T052 [P] Update public version/release/tasklist positioning for v0.4.12 in `README.md`, `docs/versions/`, `docs/releases/`, and `docs/tasklists/` without rewriting historical version artifacts.
- [x] T053 Run targeted protocol, graph, persistence, route, reducer and UI tests from `packages/stream-core/tests/` and `apps/webapp/tests/`; verify deterministic timing boundaries and the post-120-second processing/failure UI transition, document that end-to-end latency starts at accepted `/image` and ends at successful image `load`, and record unresolved external-smoke limits in `specs/v0.4.12-image-generation-agent/quickstart.md`.
- [x] T054 Run `pnpm typecheck`, `pnpm lint`, and the relevant production build from `package.json`; fix only v0.4.12 regressions.
- [x] T055 Rerun the credentialed Agent Plan regression smoke against the fixed `doubao-seedream-5.0-lite` endpoint, compare with T003 contract facts, capture only safe drift and sample end-to-end duration in `specs/v0.4.12-image-generation-agent/contracts/{seedream-provider-contract,temporary-image-content-contract}.md`, and do not claim the 95% SLO from this single smoke.
- [x] T056 Perform release closing: run `speckit-analyze` and `speckit-converge`, update package version to `0.4.12` when the version is formally released, and sync `project-agent-config.yaml` if present.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 Setup
  → Phase 2 Foundational contracts/persistence
    → Phase 3 US2 bounded ImageBrief Agent
      → Phase 4 US1 /image entry and one generation (MVP)
        → Phase 5 US3 temporary preview/download
        → Phase 6 US4 progress/failure/cancellation
          → Phase 7 polish and release closing
```

### User Story Dependencies

- **US2 (P1)** has no product-route dependency but is required by US1 because the explicit entry must always execute the bounded ImageBrief Agent.
- **US1 (P1)** depends on US2 and delivers the minimal real `/image` generation path.
- **US3 (P1)** depends on US1 producing a private temporary result, but its content route and visual components are otherwise independent.
- **US4 (P2)** depends on the run/coordinator path from US1 and strengthens behavior across US1–US3.

### Parallel Opportunities

- Phase 1: T001, T002 and the external T003 contract gate are independent setup work, but T003 must pass before T028 and T036.
- Phase 2: protocol (T004–T005), persistence (T008–T010), provider boundary (T011–T012), and stream-run extension (T013) are separate workstreams after their direct tests are in place.
- US2: T014–T016 and T017 can be prepared in parallel before graph integration.
- US1: T024–T026 tests can be prepared in parallel; after T003 passes, adapter work T028 can proceed while command UI T027 is completed.
- US3: content-route, reducer and component tests T033–T035 can be prepared in parallel; T038 and T039 are separate presentation files after their DTO dependency is complete.
- US4: T042–T044 tests can be prepared in parallel before coordinator/repository integration.
- Phase 7: ADR, architecture and public docs tasks T049–T052 are independent of each other after implementation stabilizes.

## Parallel Example: US2

```text
Parallel preparation:
- T014 ImageBrief/inspection contract tests
- T015 Graph state and edge tests
- T016 Graph node tests
- T017 Contract schema implementation

Then sequential integration:
- T018 GraphState
- T019 Nodes
- T020 Edges
- T021 Graph runner
- T022 Safe stream output
```

## Parallel Example: US3

```text
Parallel preparation:
- T033 Temporary content route security tests
- T034 Reducer and snapshot tests
- T035 Image part UI tests

Then implementation:
- T036 Temporary content service → T037 route
- T038 ImageBriefPart
- T039 ImageResultPart
- T040 Assistant-message integration
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational work.
2. Complete US2 so the bounded ImageBrief/ReAct graph is the only available path.
3. Complete US1 and validate one fixed-provider image run end to end with a fake provider.
4. Stop and validate: `/image` runs once; ordinary chat is unchanged; no second prompt revision or image call is possible.

### Incremental Delivery

1. Foundation → strict contracts, persistence and fixed provider boundary.
2. US2 → independently testable bounded Agent decisions.
3. US1 → controlled generation MVP.
4. US3 → browser-visible preview/download.
5. US4 → robust progress, cancellation, conflict and failure UX.
6. Polish → repeat the T003 contract probe as a real credentialed regression smoke and complete release assets.

## Validation Summary

- **Total tasks**: 68 (including convergence tasks T057–T062 and quota tasks T063–T068)
- **US1**: 9 tasks (T024–T032)
- **US2**: 10 tasks (T014–T023)
- **US3**: 9 tasks (T033–T041)
- **US4**: 7 tasks (T042–T048)
- **Parallel opportunities**: setup modules, protocol/persistence/provider foundation, per-story test preparation, UI/content-route work, and documentation workstreams.
- **Format validation**: every implementation task uses `- [ ] T### [P?] [US?]` with a concrete path; only user-story tasks carry `[US#]` labels.

## Phase 8: Convergence

- [x] T057 Replace the hand-written sequential image planning runner with the planned controlled LangGraph `StateGraph`, preserving the existing bounded nodes, conditional routes, `maxPlanningModelCalls = 5`, `maxPromptRevisions = 1`, no checkpoint and no HITL guarantees per plan: controlled LangGraph Image Generation Agent (contradicts).
- [x] T058 Record safe per-stage and server-total image-run durations, expose only approved duration fields in workflow output, and add deterministic 120-second processing/failure-state validation from accepted `/image` through successful image load per SC-052-006, T045 and T053 (partial).
- [x] T059 Create the controlled Image Agent ADR and architecture documentation, then publish the v0.4.12 README, version, release and tasklist positioning without changing historical artifacts per T050, T051 and T052 (missing).
- [x] T060 Rerun the credentialed fixed Agent Plan smoke after implementation, record only safe contract drift and one end-to-end duration sample in the two provider/content contracts, without claiming the 95th-percentile SLO per T055 (missing).

## Phase 9: Convergence

- [x] T061 Fix the Prettier lint error in `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx` and rerun the repository lint gate so T054 is genuinely complete per the release closing requirement (partial).
- [x] T062 Reconcile the user-visible post-generation follow-up recommendation behavior implemented in `apps/webapp/components/chat/message-list/chat-message-list.tsx` and `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` with the v0.4.12 spec/plan/acceptance artifacts, and add its image-result display and click-through acceptance evidence or remove the behavior if it is outside this release scope (unrequested).

## Phase 10: Daily Image Quota

**Goal**: Add an image-only daily quota of 3 accepted tasks per Session and a configurable 10–20 per-IP abuse ceiling without changing ordinary chat limits.

- [x] T063 [P] Add rate-limit config and store tests for default `3/session` and `10/IP`, image/chat bucket isolation, natural-day reset and rollback semantics in `apps/webapp/tests/lib/ai/rate-limit/{rate-limit-config,memory-rate-limit-store}.test.ts`.
- [x] T064 [P] Add `/image` route tests for 429 quota messaging, idempotent replay/non-counting, invalid request/non-counting and active-conflict rollback in `apps/webapp/tests/app/api/chat/route.test.ts`.
- [x] T065 Extend `RateLimitConfig` and `MemoryRateLimitStore` with independent image Session/IP buckets and server-configurable limits in `apps/webapp/lib/ai/rate-limit/{rate-limit-config,memory-rate-limit-store}.ts`.
- [x] T066 Update `/api/chat` to pass the image route type through quota rollback, return localized image quota errors and avoid counting active-lease conflicts in `apps/webapp/app/api/chat/route.ts`.
- [x] T067 Sync image quota configuration and operational boundary in `apps/webapp/.env.example`, `README.md`, `specs/v0.4.12-image-generation-agent/{spec,plan,data-model,quickstart,acceptance,decisions}.md`, and `docs/architecture/image-generation-agent.md`.
- [x] T068 Run the quota test slice, webapp typecheck/lint and `git diff --check`; record the acceptance result and verify ordinary chat/tasklist/delivery regression behavior.

## Phase 11: Convergence

- [x] T069 Pass the bounded internal ImageBrief, current draft prompt and optional revision instruction to the fixed planning model so draft, inspection and single revision operate on the required facts per FR-052-007, FR-052-008 and FR-052-010 (contradicts).
- [x] T070 Tighten PromptInspection validation and routing so a block requires a supported blocking issue, a revision requires a supported fixable issue plus instruction, and non-blocking findings cannot prevent generation per FR-052-009 and FR-052-027 (partial).
- [x] T071 Add deterministic graph regression tests for Chinese ambiguity, planning-context propagation, genuine revision semantics and invalid inspection decisions per T016 and T023 (partial).
