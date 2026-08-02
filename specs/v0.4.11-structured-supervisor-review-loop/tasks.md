# Tasks: Structured Supervisor Review Loop

**Input**: Design documents from `/specs/v0.4.11-structured-supervisor-review-loop/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The feature specification requires deterministic Contract, policy, status and loop coverage before broad integration, plus a test-side evaluation harness.

**Organization**: Tasks are grouped by user story. Foundational work is deliberately completed before story work because all stories depend on closed Contracts and Runtime-owned identity.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated dependencies are complete and does not modify the same file as another concurrent task.
- **[Story]**: User story trace label; absent only for Setup, Foundational and Polish tasks.

## Phase 1: Setup and Decision Closure

**Purpose**: Resolve requirement conflicts before code makes either interpretation sticky.

- [x] T001 Resolve the hard-blocker-versus-post-Supervisor-failure precedence and Plan-only-revision/Tasks-v1 rule; record the decisions in `specs/v0.4.11-structured-supervisor-review-loop/spec.md`, `specs/v0.4.11-structured-supervisor-review-loop/plan.md`, and `specs/v0.4.11-structured-supervisor-review-loop/data-model.md`.
- [x] T002 Update the corresponding resolved findings and remaining review notes in `specs/v0.4.11-structured-supervisor-review-loop/checklists/runtime-contract.md`.

**Checkpoint**: The state matrix and revision path have one unambiguous source of truth.

---

## Phase 2: Foundational Contract and Runtime Boundaries

**Purpose**: Establish the shared closed schemas, safe structured invocation boundary, capability gate and run-local identity model. No user-story integration begins before this phase is complete.

- [x] T003 Add table-driven closed-schema and one-repair test cases for all Agent roles in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`.
- [x] T004 Create role-specific strict Zod schemas, schema-derived types, Runtime-owned canonical schemas and safe issue DTOs in `apps/webapp/lib/ai/runtime/delivery-chain/manager/agent-contracts.ts`.
- [x] T005 Implement the reusable structured-output invocation boundary with exactly one safe Contract repair retry in `apps/webapp/lib/ai/runtime/delivery-chain/manager/contract-invocation.ts`.
- [x] T006 Rework the delivery-chain model-set boundary so every role keeps the user-selected business model while structured Contract/repair calls use fixed `deepseek/deepseek-v4-pro`; reference only the server-side model resolution and `withStructuredOutput` transport in `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts`, fail closed only on the fixed Contract model capability, and cover routing/catalog/selection consistency in `apps/webapp/lib/ai/runtime/delivery-chain/manager/delivery-chain-model-set.ts`, `apps/webapp/tests/lib/ai/model-provider/model-catalog.test.ts`, and `apps/webapp/tests/lib/ai/model-provider/resolve-model-selection.test.ts`.
- [x] T007 Replace generic business result and open metadata ownership with strict invocation/input primitives in `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tool-schemas.ts`.
- [x] T008 Add Runtime-owned artifact identity, revision, ReviewBundle coverage and canonical status types in `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts` and `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`.

**Checkpoint**: All Agent business results have a closed Contract boundary; unknown fields cannot be stripped into a valid result, and transport retry remains distinct from Contract repair.

---

## Phase 3: User Story 1 - 受控 Supervisor 生成可信交付计划 (Priority: P1) 🎯 MVP

**Goal**: Make the Manager a bounded Supervisor that can make a validated pre-execution decision while Runtime owns identity, topology and stage budgets.

**Independent Test**: Complete, incomplete and out-of-scope inputs respectively yield `execute`, `clarification_required` and `blocked`; invalid Supervisor decisions start no Worker; a valid decision receives one Runtime-owned immutable dispatch ID.

### Tests for User Story 1

- [x] T009 [P] [US1] Add pre-decision branch, runtime-owned `dispatchPlanId`, immutable update and non-execute short-circuit cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.
- [x] T010 [P] [US1] Add `/delivery-chain` entry regression cases for `clarification_required`, pre-execution `blocked` and model capability failure in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`.

### Implementation for User Story 1

- [x] T011 [US1] Rework Supervisor pre-decision so the user-selected model forms the business decision and fixed `deepseek/deepseek-v4-pro` produces the strict Contract before append-only `SupervisorDispatchPlan` creation in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`.
- [x] T012 [US1] Replace the fixed global tool-call allowance with explicit pre/plan/task/review/revision cycle budgets, separate user-model business invocation and fixed Contract/repair invocation accounting, in `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`.
- [x] T013 [US1] Adapt pre-execution terminal statuses and capability failures to the existing delivery-chain entry/report boundary in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`.

**Checkpoint**: A validated Supervisor is a real, limited decision maker; it cannot skip mandatory stages or create a competing dispatch plan.

---

## Phase 4: User Story 2 - 程序可靠理解各 Agent 的业务结论 (Priority: P1)

**Goal**: Make typed Contract fields the only machine fact source for Plan, Tasks and Reviewer conclusions while preserving Markdown as display content.

**Independent Test**: Missing, illegal or unknown structured fields fail the whole Agent result; equivalent structured results with different Markdown wording produce the same state; no business conclusion is inferred from Markdown or open metadata.

### Tests for User Story 2

- [x] T014 [P] [US2] Add Plan/Tasks structured-summary, requirement reference, dependency-cycle, artifact revision and General `planTaskAlignment` Contract test cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`.
- [x] T015 [P] [US2] Add Markdown-conflict and business-regex-removal regression cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.

### Implementation for User Story 2

- [x] T016 [US2] Keep Plan, Task, General (including `planTaskAlignment`), Risk and Boundary business generation on the user-selected model, then produce their role-specific strict Contracts through fixed `deepseek/deepseek-v4-pro` in `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts`.
- [x] T017 [US2] Enforce stable artifact IDs, revision increments, task dependency validity and Plan revision references in `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`.
- [x] T018 [US2] Replace metadata casts, disposition/severity/boundary Markdown regexes and text-prefix finding merging with typed synthesis inputs in `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`.
- [x] T019 [US2] Integrate user-model Worker results, fixed Contract model outputs and distinct Contract stage failures into the delivery manager orchestration in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`.

**Checkpoint**: Markdown can change presentation but cannot change a decision, severity, boundary status, dependency or final RunStatus.

---

## Phase 5: User Story 3 - 完整且不可绕过的并行 Review Group (Priority: P1)

**Goal**: Make the fixed General/Risk/Boundary group a Runtime-enforced gate with typed coverage and deterministic partial-failure status handling.

**Independent Test**: Every permutation of the exact reviewer set is accepted; missing, duplicate, extra or unknown roles produce zero Reviewer starts; 1/2/3 Reviewer failures and every hard blocker resolve to their specified statuses.

### Tests for User Story 3

- [x] T020 [P] [US3] Create exact-set, zero-start, same-artifact-snapshot, coverage, hard-rule and `planTaskAlignment=misaligned` status-matrix cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-review-loop.test.ts`.
- [x] T021 [P] [US3] Add report-facing partial-review, all-review-failure and hard-blocker regression cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.

### Implementation for User Story 3

- [x] T022 [US3] Implement exact General/Risk/Boundary multiset validation before Reviewer invocation/progress creation in `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`.
- [x] T023 [US3] Construct the validated Review Group from Runtime policy, execute the three user-model reviews and their fixed Contract conversions with `Promise.allSettled`, and assign cycle/finding identities in `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`.
- [x] T024 [US3] Implement typed review coverage, hard-blocker precedence and `pass`/`needs_changes`/`needs_review`/`blocked`/`failed` resolution in `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`.

**Checkpoint**: Review completeness no longer depends on LLM-generated fixed tool calls, and a partial group can never be reported as a pass.

---

## Phase 6: User Story 4 - Review 反馈驱动一次受控返修 (Priority: P2)

**Goal**: Let validated Reviewer findings drive exactly one Supervisor-selected revision and direct report closure without allowing Runtime semantic finding merging or an unbounded loop.

**Independent Test**: Plan-only, Tasks-only and both-target revisions preserve finding lineage and artifact identity; Plan precedes Tasks when both change; no second Review Group or revision starts.

### Tests for User Story 4

- [x] T025 [P] [US4] Add post-review decision, finding scope, RevisionRequest grouping and post-Supervisor repair-failure cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-review-loop.test.ts`.
- [x] T026 [P] [US4] Add Plan-only (aligned/misaligned), Tasks-only, both-target, unresolved, blocked and second-revision rejection cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.

### Implementation for User Story 4

- [x] T027 [US4] Add user-model Supervisor post-review business decisions followed by fixed Contract conversion, RevisionRequest reference/target/hard-rule validation and append-only plan updates in `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts`.
- [x] T028 [US4] Add revision-aware user-model Plan/Task Worker inputs, fixed Contract conversion and stable artifact revision handling in `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts` and `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`.
- [x] T029 [US4] Add the one-revision lifecycle, ordered Plan→Tasks revision and direct report closure in `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts`.
- [x] T030 [US4] Render RevisionOutcome, revision basis and manual-confirmation next step from typed data in `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`.

**Checkpoint**: Findings cause a bounded, traceable artifact change and direct report closure; the Runtime never invents a revision request or starts a second loop.

---

## Phase 7: User Story 5 - 用户清楚看到决策、评审和返修进度 (Priority: P3)

**Goal**: Expose safe, ordered Supervisor/Review/Revision progress through the existing public workflow-progress family without changing its public protocol or leaking internals.

**Independent Test**: Direct pass, clarification, blocked, revision and partial-review paths show only the stages they actually enter; raw prompts, model outputs and provider errors never appear in progress or reports.

### Tests for User Story 5

- [x] T031 [P] [US5] Add progress ordering, skipped-revision, safe-detail and canonical status adaptation cases in `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`.
- [x] T032 [P] [US5] Add orchestrator regression coverage proving normal chat and `/tasklist` do not gain delivery Supervisor authority in `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`.

### Implementation for User Story 5

- [x] T033 [US5] Add Supervisor decision, post-review decision and revision internal progress steps while preserving the public message family in `apps/webapp/lib/ai/runtime/delivery-chain/manager/workflow-progress.ts`.
- [x] T034 [US5] Map internal six-state delivery outcomes and new safe progress details to the existing public writer boundary in `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`.

**Checkpoint**: Users see an understandable and safe workflow; no new stream chunk union, reducer public shape or unrelated Agent boundary is introduced.

---

## Phase 8: Polish, Evaluation and Documentation

**Purpose**: Freeze acceptance evidence, prevent architecture/documentation drift, and run the required validations.

- [x] T035 [P] Create the frozen eight-case evaluation manifest and test-side fault-injection fixtures in `apps/webapp/tests/fixtures/delivery-chain-evaluation/manifest.json` and `apps/webapp/tests/fixtures/delivery-chain-evaluation/cases/`.
- [x] T036 Create the deterministic manifest validation, three-baseline adapters and quality/cost result recording harness in `apps/webapp/tests/lib/ai/runtime/delivery-chain-evaluation.test.ts`.
- [x] T037 [P] Add ADR-0013 for single DispatchPlan, closed Contracts, exact Review Group and one revision in `docs/adr/0013-structured-supervisor-review-loop.md`.
- [x] T038 [P] Mark v0.4.11 as planned and align its guardrails in `docs/architecture/agent-runtime-roadmap.md`.
- [x] T039 Remove obsolete business Markdown parsing assertions and add final search-based regression coverage in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts` and `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.
- [x] T040 Run the targeted manager/route suites, `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, then `pnpm test:stable` following `specs/v0.4.11-structured-supervisor-review-loop/quickstart.md`; run all three baselines and record the safe quality/cost summary plus external-model limitations in `specs/v0.4.11-structured-supervisor-review-loop/evaluation-results.md`.
- [x] T041 After implementation and acceptance evidence are complete, synchronize v0.4.11 public version/release/tasklist/README assets in `docs/versions/`, `docs/releases/`, `docs/tasklists/`, `README.md`, `package.json`, and `apps/webapp/package.json`.

**Checkpoint**: Required deterministic tests and static checks pass; architecture docs reflect reality; release assets are updated only after implementation is truly complete.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1** blocks all code tasks. T001 and T002 close the two requirement conflicts identified in the review checklist.
- **Phase 2** blocks every user story. T003 should be added before the Contract implementation; T004–T008 establish the shared boundary.
- **US1** depends on Phase 2 and can deliver the pre-decision MVP.
- **US2** depends on Phase 2; its manager integration T019 should follow the Supervisor path from US1.
- **US3** depends on US1 and US2 because exact Review requires typed artifacts and the validated dispatch path.
- **US4** depends on US3 because RevisionRequest consumes ReviewBundle findings.
- **US5** depends on US1–US4 because it surfaces their actual stages and terminal statuses.
- **Phase 8** depends on the desired user stories being complete. T035 and T037–T038 can start once their data model/architecture decisions are stable; T040–T041 are final gates.

### User Story Completion Order

```text
Foundation
  -> US1: Supervisor pre-decision
  -> US2: Typed Agent facts
  -> US3: Exact Review Group
  -> US4: One revision + direct closure
  -> US5: Safe progress and compatibility
  -> Evaluation / Docs / Release close
```

### Parallel Opportunities

- **US1**: T009 and T010 can run in parallel; T011–T013 remain sequential integration work.
- **US2**: T014 and T015 can run in parallel; T016–T019 are ordered by data flow.
- **US3**: T020 and T021 can run in parallel; T022–T024 are ordered by gate → orchestration → status synthesis.
- **US4**: T025 and T026 can run in parallel; T027–T030 are ordered by decision → worker revision → loop → report.
- **US5**: T031 and T032 can run in parallel; T033 then T034 integrate the public boundary.
- **Polish**: T035, T037 and T038 can run in parallel; T036 depends on T035 and T040 depends on implementation completion.

## Implementation Strategy

### MVP First: User Story 1

1. Complete Phase 1 and Phase 2.
2. Complete T009–T013.
3. Run the US1 manager and delivery-chain tests.
4. Demonstrate a validated `execute` decision and safe early exits for clarification/blocked input.

This MVP establishes a real but bounded Supervisor without yet claiming typed Review facts or feedback-loop delivery.

### Incremental Delivery

1. Foundation + US1: structured Supervisor authority and fail-closed entry.
2. US2: typed artifacts and removal of Markdown business parsing.
3. US3: fixed, Runtime-enforced quality/safety gate.
4. US4: minimal true multi-Agent feedback collaboration.
5. US5 + Phase 8: safe user progress, empirical quality/cost evidence and architecture closure.

## Notes

- `[P]` tasks have no shared-file dependency with another task in the same parallel example.
- Do not add production baseline switches, deterministic provider modes or hidden test fallbacks; evaluation adapters belong in tests only.
- Do not modify public stream union/reducer, Tasklist Agent, GraphState, persistence, checkpoint/resume or resource allowlist unless the spec is deliberately amended first.
- T041 is release-closing work and must not be checked off merely because the code tasks are complete.

---

## Phase 9: Convergence

**Purpose**: Close the two high-severity v0.4.11 audit gaps before external evaluation and release closing.

- [x] T042 Pass only Runtime-validated `RevisionRequest` data and referenced typed findings into the Plan/Task revision Worker context, then add message-boundary regression coverage per `workflow-contract.md` Revision (partial).
- [x] T043 Preserve safe typed Review coverage, findings, and current artifact revisions in post-review or revision-stage failure reports, then add report regression coverage per `workflow-contract.md` Canonical Status Rules (partial).

---

## Phase 10: User-facing Artifact Projection and Review Semantics

**Purpose**: Make the v0.4.11 controlled runtime's validated Plan, Tasks, and Review facts comprehensible in the user-facing report without adding a final LLM-polish stage.

- [x] T044 Add regression coverage proving role-specific rubrics reach Plan, Task, and Review Workers, and that a title-only worker Markdown still renders the validated Plan phases, scope, acceptance criteria, Tasks, dependencies, and task acceptance criteria.
- [x] T045 Add a typed actionable/observation distinction for Review findings, reject Supervisor revision requests for observations, and ensure an observation cannot force `needs_changes` or render as unresolved work.
- [x] T046 Deterministically synthesize user-facing Plan, Tasks, Review, and next-step report sections from typed artifacts; hide Runtime-only identities and update the Delivery Chain report parser for the current report section set.
- [x] T047 Run targeted contract/manager/route/report-view suites plus typecheck and lint; retain T040 external baseline and T041 release closing as separate gates.

---

## Phase 11: Quick-start Scenario Replacement

**Purpose**: Replace the public v0.4.11 quick-start Delivery Chain example with a user-familiar registration and login planning case without changing Runtime behavior.

- [x] T048 Add the `register-login` demo requirement/context, make it the public Delivery Chain manifest entry, and preserve the existing scenario files as historical regression fixtures.
- [x] T049 Update the Delivery Chain quick-start card, scenario reference, catalog presentation, focused UI/catalog tests, and current README example to describe registration and login.
- [x] T050 Validate the replacement with focused quick-start/catalog/runtime tests, typecheck, lint, and browser smoke; do not claim real authentication implementation or external provider evaluation.

---

## Phase 12: Requirement Summary in Final Report

**Purpose**: Add a concise, deterministic explanation of the user request before the final Delivery Chain conclusion so readers can orient themselves before reviewing the implementation plan and review evidence.

- [x] T051 Extract a bounded requirement summary from standard Requirement sections with an inline-requirement fallback, and project it into both success and safe failure reports before `交付结论`.
- [x] T052 Add manager/report-view regression coverage, then validate the change with targeted tests, typecheck, lint, and diff checks; do not add a model call or change the structured output contract.

---

## Phase 13: Delivery Chain Provider Failure Recovery

**Purpose**: Ensure the fixed Delivery Chain model does not spend the entire stage budget on implicit reasoning when a stage explicitly requests a direct answer, and preserve a safe provider-level failure reason for the user.

- [x] T053 Map `enableReasoning: false` to the OpenAI-compatible `thinking.type=disabled` request option for DeepSeek/Doubao routes, and add provider regression coverage.
- [x] T054 Preserve the normalized provider failure message in stage failure summaries and keep the validated revision context marker stable for revision-worker boundary tests.

---

## Phase 14: Post-review Semantic Repair

**Purpose**: Let an otherwise schema-valid Supervisor post-review decision correct a safe RevisionRequest target/reference policy error once, without changing the fixed Delivery Chain topology or re-invoking the business model.

- [x] T055 Route post-review RevisionRequest policy validation through the existing fixed Contract repair boundary with a safe `{ path, code }` issue, add the exact target-union instruction, and prove the repair does not repeat the Supervisor business invocation.

---

## Phase 15: Deterministic Post-review Revision Derivation

**Purpose**: Remove post-review cross-entity structured-output control risk without changing the fixed Agent topology.

- [x] T056 [P] Update post-review Contract and manager tests to prove that Runtime derives action, targets and source finding IDs from validated findings; prove Supervisor guidance cannot change them and a failed guidance Contract safely degrades in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`, `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-review-loop.test.ts`, and `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`.
- [x] T057 Replace Supervisor post-review action/RevisionRequest output with a bounded guidance Contract, derive canonical post-review action and per-target RevisionRequests in Runtime, and keep one-revision/direct-closure behavior in `apps/webapp/lib/ai/runtime/delivery-chain/manager/agent-contracts.ts` and `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts`.
- [x] T058 Synchronize the v0.4.11 specification, plan, Contract/workflow documents and quickstart with the Runtime-derived decision boundary, then run targeted manager suites, `pnpm --dir apps/webapp typecheck`, and `pnpm --dir apps/webapp lint`.

---

## Phase 16: Single-Review Revision Closure

**Purpose**: Remove the non-actionable Re-review stage. A run now has one initial Review Group, at most one Runtime-derived Revision, and then a report that requests manual confirmation rather than claiming independent verification.

- [x] T059 [P] Replace Re-review-only contract/types, execution budget and progress assertions with one-review/one-revision assertions in `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-review-loop.test.ts`, `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`, and `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`.
- [x] T060 Remove the second Review Group orchestration, finding-resolution schema/model, and `delegate-re-review-group` progress mapping; after successful Revision return internal `needs_review` in `apps/webapp/lib/ai/runtime/delivery-chain/manager/structured-delivery-manager.ts`, `agent-contracts.ts`, `types.ts`, `delegation-policy.ts`, `workflow-progress.ts`, and `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`.
- [x] T061 Render revision basis/result and manual-confirmation next step without user-visible canonical terminal status, resolution claims, or residual Re-review findings in `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`.
- [x] T062 Consolidate the Worker-as-Tool architecture and the final single-review decision into `specs/v0.4.11-structured-supervisor-review-loop/`, then update ADR, roadmap, version/release and quickstart documents.
- [x] T063 Run the targeted manager/entry/report suites, `pnpm --dir apps/webapp typecheck`, and `pnpm --dir apps/webapp lint`; record any unrelated existing failures.

## Phase 17: Convergence

**Purpose**: Remove the remaining specification contradictions exposed by the final single-review/report-visibility decision.

- [x] T064 Align `FR-047` and `SC-010` with the final report contract: canonical `RunStatus` remains Runtime-owned and machine-visible, while normal user reports may hide the status and must retain an actionable next step; update `spec.md`, `data-model.md`, `contracts/workflow-contract.md`, and the related report assertions (contradicts).
- [x] T065 Remove the obsolete finding-resolution-rate metric from `FR-062` and align the evaluation rubric with `SC-005`/`contracts/evaluation-contract.md`, which evaluate finding lineage and artifact revision instead of automatic post-revision resolution (contradicts).
