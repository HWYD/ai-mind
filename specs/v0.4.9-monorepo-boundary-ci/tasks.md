# Tasks: Monorepo Boundary and CI Validation Governance

**Input**: Design documents from `/specs/v0.4.9-monorepo-boundary-ci/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: Required. The specification defines independent tests for each user story; validator fixtures and test-lane commands are therefore first-class tasks.

**Organization**: Tasks are grouped by user story so each increment has a clear acceptance boundary.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its prerequisites, because it changes different files.
- **[Story]**: Maps a task to its user story. Setup, foundational, and final tasks intentionally have no story label.

## Phase 1: Setup

**Purpose**: Prepare the controlled test fixture that will drive the preinstall-safe boundary validator.

- [x] T001 [P] Generalize workspace fixture creation in `scripts/validate/validate-workspace-boundaries.test.mjs` so a fixture can declare root metadata, `pnpm-workspace.yaml`, multiple app/package manifests, package exports, and literal source/test files.
- [x] T002 [P] Add `saveWorkspaceProtocol: rolling`, `disallowWorkspaceCycles: true`, and `failIfNoMatch: true` to `pnpm-workspace.yaml` without changing its current `apps/*` and `packages/*` membership intent.

---

## Phase 2: Foundational Workspace Identity

**Purpose**: Establish the unique scoped identities and root selectors that all boundary and Turbo work depends on.

**⚠️ CRITICAL**: Complete this phase before changing the validator or lane-specific Turbo selectors.

- [x] T003 Migrate only the root/workspace `name` and `private` identity fields in `package.json`, `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, and `packages/stream-core/package.json` to the internal `@ai-mind/*` convention; defer lockstep version values to T023.
- [x] T004 Replace legacy `ai-mind` root filters and task selectors with `@ai-mind/webapp` in `package.json` and `turbo.json`, while preserving the existing root and package-level diagnostic command intent.

**Checkpoint**: The repository has one unambiguous root/workspace identity graph and no remaining legacy task selector.

---

## Phase 3: User Story 1 — Prevent Invalid Workspace Dependencies (Priority: P1) 🎯 MVP

**Goal**: Reject invalid identities, dependency graph edges, unmanaged workspace manifests, and production/test imports that bypass declared public package boundaries before build/test.

**Independent Test**: `pnpm test:governance:boundaries` exercises isolated fixtures for every permitted and prohibited graph/import case; `pnpm validate:workspace-boundaries` succeeds for the real repository.

### Tests for User Story 1

- [x] T005 [US1] Add fixture cases for duplicate or unscoped identities, missing `private`, app-to-app edges, package-to-app edges, cycles, missing providers, non-`workspace:` internal ranges, and unmanaged package manifests in `scripts/validate/validate-workspace-boundaries.test.mjs`.
- [x] T006 [US1] Add fixture cases for production and test relative cross-workspace imports, undeclared scoped imports, non-exported deep imports, allowed declared public exports, and unsupported non-literal imports in `scripts/validate/validate-workspace-boundaries.test.mjs`.

### Implementation for User Story 1

- [x] T007 [US1] Refactor `scripts/validate/validate-workspace-boundaries.mjs` to discover workspace membership from `pnpm-workspace.yaml`, reject unmanaged/unsupported workspace patterns, validate root/workspace scoped-private identities, and build a diagnostic dependency graph across all dependency fields.
- [x] T008 [US1] Extend `scripts/validate/validate-workspace-boundaries.mjs` with direction validation and depth-first cycle reporting so application-to-application, package-to-application, missing-provider, non-`workspace:`, and cyclic edges fail before downstream commands.
- [x] T009 [US1] Add Node-built-in static import/export/`require`/literal-dynamic-import scanning to `scripts/validate/validate-workspace-boundaries.mjs`, rejecting cross-workspace relative access and allowing scoped imports only when their `workspace:` dependency and package `exports` entry are both valid.
- [x] T010 [US1] Keep the preinstall and diagnostic entry points aligned in `package.json`, and make the root `build` entry run `validate:workspace-boundaries` before Turbo can restore a cache hit; then run the real-repository and fixture boundary checks plus the real `pnpm --filter @ai-mind/not-a-workspace test:stable` failure recorded in `specs/v0.4.9-monorepo-boundary-ci/quickstart.md`.

**Checkpoint**: User Story 1 is independently complete when the validator reports a workspace/file/reason for every controlled violation and permits only declared public internal imports.

---

## Phase 4: User Story 2 — Receive Fast, Trustworthy PR Feedback (Priority: P1)

**Goal**: Split every automated test into one deterministic lane, apply matching Turbo cache semantics, and ensure CI only creates database state after stable validation succeeds.

**Independent Test**: Each lane runs independently; Turbo dry-runs show stable tasks cacheable and integration/external tasks non-cacheable; CI topology has a no-service stable job followed by a dependent stateful job.

### Tests and lane selection for User Story 2

- [x] T011 [P] [US2] Normalize the explicit external-test opt-in in `apps/webapp/tests/lib/ai/model-provider/model-usage-cloud-smoke.test.ts` and `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction-live-smoke.test.ts`, retaining compatible legacy flags only when they do not permit ordinary execution.
- [x] T012 [US2] Create all-workspace lane classification coverage in `scripts/validate/validate-test-lanes.test.mjs` and `scripts/validate/validate-test-lanes.mjs`; emit workspace/file/lane records and reject every missing or duplicate classification.
- [x] T013 [US2] Define cross-platform stable, integration, and external Vitest selection in `apps/webapp/vitest.config.ts`, `apps/webapp/vitest.stable.config.ts`, `apps/webapp/vitest.integration.config.ts`, and `apps/webapp/vitest.external.config.ts`, with every webapp test included in exactly one lane.

### Implementation for User Story 2

- [x] T014 [P] [US2] Add stable/integration diagnostic scripts and preserve a compatible aggregate `test` command in `packages/database/package.json`, `packages/stream-core/package.json`, and `apps/project-assistant-service/package.json` according to each package's actual test state requirements.
- [x] T015 [US2] Add `test:stable`, `test:integration`, and fail-fast `test:external` commands in `apps/webapp/package.json` and `apps/webapp/scripts/validate-external-test-env.mjs`; keep test-location validation in the stable lane and distinguish absent opt-in/credential configuration errors from an opted-in external service failure.
- [x] T016 [US2] Add `validate:test-lanes`; make every root test entry run `validate:workspace-boundaries` before Turbo, make root `test:stable` then run lane inventory before stable work, and make the canonical root `test` run stable then integration; encode the resulting lane-specific Turbo dependency/cache/environment contracts in `package.json` and `turbo.json`.
- [x] T017 [US2] Split `.github/workflows/ci.yml` into `stable-validation` (boundary/lint/typecheck/lane inventory/stable/build with no PostgreSQL service or `DATABASE_URL`) and `stateful-integration` (`needs: stable-validation`, PostgreSQL/setup/integration), while preserving the independent Docker build-check job and adding pnpm-store caching to both Node jobs.
- [ ] T018 [US2] Run the lane commands, lane inventory, and Turbo dry-runs from `specs/v0.4.9-monorepo-boundary-ci/quickstart.md`; for the negative CI path, capture evidence that `stateful-integration` is skipped due to `needs: stable-validation` and has no PostgreSQL, migration, or checkpoint setup log.

**Checkpoint**: User Story 2 is independently complete when stable validation is cacheable/no-state, integration is explicit/non-cacheable, and external validation is manual-only.

---

## Phase 5: User Story 3 — Preserve One Understandable Validation Contract (Priority: P2)

**Goal**: Make the root and diagnostic validation contract discoverable without oral command knowledge.

**Independent Test**: From a clean workspace, a maintainer can follow the documented boundary, stable-lane, integration-lane, and diagnostic commands and identify the workspace/lane/step responsible for a failure.

- [x] T019 [US3] Update the graph, identity, allowed/forbidden import direction, lane inventory, cache, CI ordering, and failure-diagnosis facts in `docs/architecture/monorepo-pnpm-turborepo-governance.md` without changing production deployment claims.
- [x] T020 [P] [US3] Update the canonical and diagnostic command references for v0.4.9 in `README.md` and `docs/README.md`.
- [x] T021 [P] [US3] Create the public version explanation and release skeleton in `docs/versions/v0.4.9-monorepo-boundary-ci.md` and `docs/releases/v0.4.9.md`, explicitly retaining external validation and deployment as documented non-goals.
- [ ] T022 [US3] Follow `specs/v0.4.9-monorepo-boundary-ci/quickstart.md` from a clean local workspace and reconcile any command, prerequisite, cache, lane-inventory, or failure-attribution drift in that file and the documentation files from T019–T021.

**Checkpoint**: User Story 3 is independently complete when the documented root contract and targeted diagnostics agree with the implemented commands and CI lanes.

---

## Phase 6: Polish and Cross-Cutting Closure

**Purpose**: Synchronize version artifacts, validate the complete feature, and protect the stated non-goals.

- [x] T023 Synchronize v0.4.9 lockstep versions and regenerated workspace metadata in `package.json`, `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, `packages/stream-core/package.json`, and `pnpm-lock.yaml`.
- [x] T024 Re-run the complete validation matrix in `specs/v0.4.9-monorepo-boundary-ci/quickstart.md`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, the boundary fixture suite, and the lane-classification suite; record any environment-limited integration evidence in `docs/releases/v0.4.9.md` without exposing secrets.
- [x] T025 Review the implementation diff against `specs/v0.4.9-monorepo-boundary-ci/spec.md`, `specs/v0.4.9-monorepo-boundary-ci/plan.md`, and `specs/v0.4.9-monorepo-boundary-ci/checklists/governance.md`; update only the planned version/docs artifacts and run `git diff --check`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 and T002 can start immediately.
- **Foundational (Phase 2)**: T003 follows the current manifest baseline; T004 follows T003. All story work waits for T001–T004.
- **US1 (Phase 3)**: T005 → T006 → T007 → T008 → T009 → T010. This is the MVP boundary increment.
- **US2 (Phase 4)**: T011 and T012 can start after Phase 2; T013 follows T012; T014 can run with T011/T012; T015 follows T011/T013; T016 follows T014/T015; T017 follows T016; T018 follows T017.
- **US3 (Phase 5)**: Starts after US1 and US2 checkpoints; T020 and T021 can proceed in parallel after T019 has established the durable architecture facts; T022 reconciles all documentation.
- **Polish (Phase 6)**: T023 follows implementation changes; T024 follows T022/T023; T025 is final.

### User Story Dependencies

- **US1 (P1)**: Depends only on the foundational scoped identity work. It is the recommended MVP.
- **US2 (P1)**: Depends on the same foundation and the new scoped selectors; it is independent of US1's import scanner implementation but must use the finalized root command names.
- **US3 (P2)**: Depends on the completed US1/US2 command and CI contracts, so documentation describes facts rather than a proposed interface.

### Parallel Opportunities

- T001 and T002 are independent setup tasks.
- In US2, T011 (external test sources), T012 (lane inventory), and T014 (database/stream/PAS manifests) can proceed in parallel after Phase 2; T013 then aligns the Webapp configuration with the inventory.
- In US3, T020 and T021 change separate public documentation surfaces after the architecture document is settled.

## Parallel Example: User Story 2

```text
Task: "Normalize the explicit external-test opt-in in apps/webapp/tests/lib/ai/model-provider/model-usage-cloud-smoke.test.ts and apps/webapp/tests/lib/ai/runtime/chat-memory-compaction-live-smoke.test.ts"
Task: "Add stable/integration diagnostic scripts in packages/database/package.json, packages/stream-core/package.json, and apps/project-assistant-service/package.json"
```

## Implementation Strategy

### MVP First — User Story 1

1. Complete T001–T004 to establish correct identity and pnpm guardrails.
2. Complete T005–T010 to make the boundary validator reject the complete dependency/import violation set and prove filtered commands fail only when a filter actually matches no workspace.
3. Stop and run the US1 independent fixture and repository checks before changing test lanes or CI.

### Incremental Delivery

1. Add US1: reliable repository graph and public-source boundary.
2. Add US2: deterministic test lane/cache/CI sequence without touching product runtime or deployment.
3. Add US3: explain the final root contract and targeted diagnostics.
4. Complete version/docs closure only after the command matrix has evidence.

## Notes

- `[P]` marks only file-disjoint work; it does not waive the listed phase dependencies.
- No task introduces Nx, a mandatory Turbo/pnpm major upgrade, remote cache, publishing, scheduled external tests, Docker/production changes, or product runtime behavior.
- Do not add test-only production branches. The test fixtures and lane selection remain in repository validation/test configuration boundaries.

---

## Phase 7: Convergence

- [x] T026 Extend `apps/webapp/scripts/validate-external-test-env.mjs` and its focused regression coverage so `test:external` reports a distinct external-validation configuration failure when the explicit opt-in is present but the credentials required by the selected cloud/live smoke models are absent, before Vitest can call an external provider, per FR-049-010 / US2 (partial).

## Phase 8: Audit Follow-up

- [x] T027 Fix workspace source-boundary scanning for multiline static imports and Node-compatible conditional/wildcard package exports; add isolated regression fixtures.
- [x] T028 Make integration validation fail closed when `DATABASE_URL` is absent at both root and package diagnostic entry points; add focused environment-guard tests.
- [x] T029 Classify root governance regressions in the stable lane, execute them from `test:stable`, and align the lane validator's cross-platform entry-point detection and public documentation.

## Phase 9: Audit Remediation

- [x] T030 Make the lane validator reject test-like files outside a workspace managed test root, with an isolated regression fixture.
- [x] T031 Remove the duplicate `.git` Docker ignore entry so this version does not carry an unrelated Docker-context change.
- [x] T032 Synchronize the feature status and release validation evidence with the completed implementation and remaining release-closing checks.
- [x] T033 Add a stable governance regression for `.github/workflows/ci.yml` so the no-state stable job, dependent stateful job, and setup order cannot drift silently.
- [x] T034 Move stream-core transpile/declaration watch orchestration from `npm-run-all2` to explicit persistent Turbo tasks, remove the database pseudo-watch, and keep local Prisma generation explicit without changing the production `db:setup:deploy` contract.
- [x] T035 Separate daily local PostgreSQL readiness from explicit Prisma/migration/runtime schema setup through `dev:db` and `dev:db:setup`, and ensure setup scripts load all app-local environment variables even when `DATABASE_URL` is injected.

## Phase 10: Convergence

- [x] T036 Synchronize `docs/versions/v0.4.9-monorepo-boundary-ci.md` and `docs/releases/v0.4.9.md` with the explicit local `dev:db:setup` contract and this release-validation evidence, including the current stable-test count (FR-049-012) (partial).
