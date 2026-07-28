# Tasks: Monorepo pnpm and Turborepo Governance

**Input**: Design documents from `/specs/v0.4.8-monorepo-pnpm-turborepo-governance/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: The feature does not require test-first implementation. Validation tasks are included because the specification requires frozen-install, task-graph and regression evidence.

**Organization**: Tasks are grouped by the three P1 user stories. The actual implementation is intentionally layered: pnpm installation governance first, Turborepo orchestration second, and compatibility/regression closure third.

## Phase 1: Setup (Shared Baseline)

**Purpose**: Establish an evidence-based baseline before changing repository tooling.

- [x] T001 Inventory the four workspace packages, package names, local dependencies and available scripts in `package.json`, `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, `packages/stream-core/package.json`, and `pnpm-workspace.yaml`.
- [x] T002 [P] Record the current Node.js/pnpm version declarations and command differences in `package.json`, `.github/workflows/ci.yml`, and `Dockerfile` for the 10.34.0 alignment.
- [x] T003 [P] Compare repeated dependency versions and intentional exceptions across `package.json`, `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, and `packages/stream-core/package.json` to prepare the Catalog decision matrix.
- [x] T004 [P] Capture the current CI validation order and existing database/runtime side effects from `.github/workflows/ci.yml`, `apps/webapp/package.json`, and `packages/database/package.json`.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared governance rules and documentation boundary required by all user stories.

- [x] T005 Create the long-lived Monorepo governance document in `docs/architecture/monorepo-pnpm-turborepo-governance.md`, covering the package graph, apps-to-packages dependency direction, pnpm-versus-Turbo ownership, canonical commands, diagnostic commands, and deferred optimizations.
- [x] T006 [P] Update `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md` with the baseline command matrix and evidence fields that implementation tasks must satisfy.
- [x] T007 [P] Add a requirement-to-task traceability note to `specs/v0.4.8-monorepo-pnpm-turborepo-governance/checklists/requirements.md` mapping FR-048-001 through FR-048-014 to the story tasks below.

**Checkpoint**: Baseline and governance boundaries are explicit; implementation can proceed by user story.

## Phase 3: User Story 1 - Reproducible Workspace Installation (Priority: P1) - MVP

**Goal**: Make local development, CI and Docker use one exact pnpm 10 version, one frozen lockfile and an explicit dependency build-script policy.

**Independent Test**: In a clean dependency state, activate pnpm 10.34.0, run frozen installation without changing `pnpm-lock.yaml`, confirm internal packages resolve through `workspace:*`, and verify CI/Docker declare the same Node/pnpm versions.

### Implementation for User Story 1

- [x] T008 [US1] Set the exact `packageManager` value to `pnpm@10.34.0` and add or align the Node.js engine constraint in `package.json` without changing unrelated root scripts.
- [x] T009 [US1] Align the pnpm/action-setup version, Corepack preparation and frozen install command in `.github/workflows/ci.yml` with pnpm 10.34.0 and the existing shared lockfile.
- [x] T010 [US1] Align the Corepack pnpm preparation and install/build prerequisites in `Dockerfile` with pnpm 10.34.0 while preserving the current Docker build strategy.
- [x] T011 [P] [US1] Replace every placeholder under `allowBuilds` in `pnpm-workspace.yaml` with explicit boolean values based on current lockfile/install evidence; record each approval or rejection rationale in `docs/architecture/monorepo-pnpm-turborepo-governance.md`.
- [x] T012 [US1] Add a selective pnpm Catalog in `pnpm-workspace.yaml` for compatible common tooling and cross-workspace runtime dependencies, then document Webapp-only dependencies and any remaining version exceptions in `docs/architecture/monorepo-pnpm-turborepo-governance.md`.
- [x] T013 [US1] Replace eligible repeated dependency ranges in `package.json`, `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, and `packages/stream-core/package.json` with Catalog references, preserving local versions where compatibility is not proven.
- [x] T014 [US1] Enforce and validate that all internal `@ai-mind/*` dependencies in `apps/webapp/package.json` and any other workspace manifests use an explicit `workspace:` protocol and that no shared package depends on an app.
- [x] T015 [US1] Regenerate or minimally update `pnpm-lock.yaml` only if pnpm 10.34.0 or Catalog changes require it, then confirm the resulting lockfile is accepted by `pnpm install --frozen-lockfile`.

### Validation for User Story 1

- [x] T016 [US1] Run the clean-install validation from `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md`, including Node/pnpm version assertions, `pnpm install --frozen-lockfile`, a no-lockfile-diff check, and an isolated negative check proving a missing local `workspace:` package fails instead of falling back to a registry package.
- [x] T017 [US1] Verify the final `allowBuilds` boolean matrix and Catalog exceptions against the current lockfile and record acceptance evidence in `docs/architecture/monorepo-pnpm-turborepo-governance.md`.

**Checkpoint**: User Story 1 is independently complete when local, CI and Docker agree on pnpm 10.34.0, frozen installation succeeds, internal packages resolve locally, and no build-script placeholder remains.

## Phase 4: User Story 2 - Dependency-aware Workspace Tasks (Priority: P1)

**Goal**: Make Turborepo the canonical root task runner with dependency-aware ordering, explicit outputs/cache behavior, and clear workspace/task failures.

**Independent Test**: Change `packages/stream-core`, run the root build/typecheck commands, and verify the shared package task runs before dependent Webapp validation while unrelated tasks can run in parallel; verify dev/watch tasks are persistent and uncached.

### Implementation for User Story 2

- [x] T018 [US2] Create `turbo.json` with task definitions for `build`, `typecheck`, `test`, `lint`, `dev`, and `build:watch`, using workspace dependency ordering such as upstream `^build`/`^typecheck` where correctness requires it.
- [x] T019 [US2] Configure finite task outputs, relevant inputs, lockfile/config dependencies and environment-sensitive inputs in `turbo.json`; mark `dev` and `build:watch` as persistent and uncached.
- [x] T020 [US2] Configure database generation/build and other side-effect-sensitive tasks in `turbo.json` so they are not incorrectly restored from reusable cache, while keeping migrations and checkpoint setup explicit outside the ordinary graph.
- [x] T021 [P] [US2] Replace root `build`, `typecheck`, `test`, and `lint` implementations in `package.json` with canonical `turbo run` commands and preserve package-level diagnostic scripts.
- [x] T022 [US2] Set root `pnpm dev` in `package.json` to run `turbo run dev build:watch --filter=ai-mind...`, keep `dev:webapp` and `dev:pas` as explicit diagnostic commands, and preserve long-running process behavior and clean shutdown.
- [x] T023 [US2] Update `.github/workflows/ci.yml` so ordinary lint, typecheck, test and build validation invokes the same Turbo task graph as local canonical commands, while retaining explicit ordered database/runtime setup steps.
- [x] T024 [P] [US2] Add workspace/task-qualified failure and troubleshooting guidance to `docs/architecture/monorepo-pnpm-turborepo-governance.md`, including the package-level `pnpm --filter` fallback and the expected output shape for a controlled task failure.

### Validation for User Story 2

- [x] T025 [US2] Inspect the generated Turborepo package/task graph from `turbo.json`; run `pnpm --filter @ai-mind/stream-core typecheck`, `pnpm --filter @ai-mind/stream-core test`, `pnpm --filter @ai-mind/stream-core build`, `pnpm --filter @ai-mind/database db:generate`, `pnpm --filter @ai-mind/database db:validate`, `pnpm --dir apps/project-assistant-service typecheck`, and `pnpm --dir apps/webapp typecheck` as package-level diagnostics; apply a controlled temporary change under `packages/stream-core`, and confirm the dependent Webapp validation path is scheduled after the shared package task.
- [x] T026 [US2] Run root `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm lint`, execute one isolated controlled failing workspace task, and record workspace/task-specific success and failure output in `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md`.
- [x] T027 [US2] Run the exact `pnpm dev` command and the separate `dev:webapp`, `dev:pas`, and `build:watch` diagnostic commands from `package.json`, confirming long-running tasks are persistent, uncached and cleanly stoppable.

**Checkpoint**: User Story 2 is independently complete when root commands use one documented Turbo graph, dependent tasks are ordered, independent tasks can parallelize, persistent tasks are uncached, and CI uses the same ordinary graph.

## Phase 5: User Story 3 - Preserve Existing Project Workflows (Priority: P1)

**Goal**: Prove the governance migration does not change existing chat, tool, Tasklist, Delivery, database, stream-core or Project Assistant Service behavior and keeps package-level diagnosis available.

**Independent Test**: Run the existing package-level validation and targeted product smoke paths after the migration; confirm the commands remain executable and no user-visible/runtime contract changes are introduced.

### Implementation for User Story 3

- [x] T028 [P] [US3] Audit and preserve package-level scripts in `apps/webapp/package.json`, `apps/project-assistant-service/package.json`, `packages/database/package.json`, and `packages/stream-core/package.json`; only rename scripts when the root task mapping requires it and document the mapping.
- [x] T029 [US3] Verify the explicit database command sequence in `package.json`, `apps/webapp/package.json`, and `packages/database/package.json` remains usable for generate, validate, migration and checkpoint/runtime setup.
- [x] T030 [US3] Verify the CI workflow in `.github/workflows/ci.yml` still prepares database state before checks that require it and does not place migrations or runtime setup behind Turbo cache reuse.
- [x] T031 [US3] Verify the Docker build in `Dockerfile` still builds stream-core, Project Assistant Service, database generation and Webapp in the intended order after version/task-runner alignment.
- [x] T032 [US3] Add the final workspace dependency graph, canonical/diagnostic command table, and one complete worked example showing `@ai-mind/stream-core` resolution, upstream Turbo ordering, and the pnpm-versus-Turbo boundary to `docs/architecture/monorepo-pnpm-turborepo-governance.md`.

### Validation for User Story 3

- [x] T033 [P] [US3] Run `pnpm --filter @ai-mind/database db:generate`, `pnpm --filter @ai-mind/database db:validate`, and the database package tests from `packages/database/package.json`.
- [x] T034 [P] [US3] Run stream-core typecheck, test and build commands from `packages/stream-core/package.json` and verify generated build outputs are consumed by dependent validation.
- [x] T035 [P] [US3] Run Project Assistant Service typecheck, test and build commands from `apps/project-assistant-service/package.json`.
- [x] T036 [P] [US3] Run the Webapp targeted test/typecheck/lint/build paths from `apps/webapp/package.json` and the existing test locations.
- [x] T037 [US3] Execute the ordinary chat, tool-assisted chat, Tasklist and Delivery smoke checks required by FR-048-012, recording results and any environment prerequisites in `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md`.

**Checkpoint**: User Story 3 is independently complete when package-level commands remain available, explicit database/runtime setup is safe, Docker/CI sequencing is preserved, and required product/regression smoke paths pass.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close documentation, traceability and repository hygiene after all stories pass.

- [x] T038 [P] Update `README.md` with the canonical root commands and a link to `docs/architecture/monorepo-pnpm-turborepo-governance.md`.
- [x] T039 Reconcile `specs/v0.4.8-monorepo-pnpm-turborepo-governance/spec.md`, `plan.md`, `quickstart.md`, and `docs/architecture/monorepo-pnpm-turborepo-governance.md` so pnpm version, Catalog scope, Turbo ownership, CI behavior and deferred items are consistent.
- [x] T040 Run the full quickstart validation in `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md`, including CI-like ordered setup, root Turbo commands, package-level diagnosis and smoke checks.
- [x] T041 Run `git diff --check`, inspect `git status --short`, and verify only intended governance files, lockfile updates and documentation changes remain in the final diff.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No implementation dependency; establishes the current repository evidence.
- **Phase 2 (Foundational)**: Depends on Phase 1; creates the shared governance and validation boundary.
- **Phase 3 (US1)**: Depends on Phase 2; establishes the pnpm installation baseline and is the recommended MVP.
- **Phase 4 (US2)**: Depends on US1 because Turbo must run against the final workspace manifests, Catalog and pnpm installation policy.
- **Phase 5 (US3)**: Depends on US1 and US2 for final CI/Docker/workflow regression validation.
- **Phase 6 (Polish)**: Depends on all desired user stories.

### User Story Dependencies

```text
Setup
  ↓
Foundational governance
  ↓
US1: Reproducible pnpm installation
  ↓
US2: Dependency-aware Turbo tasks
  ↓
US3: Existing workflow preservation
  ↓
Polish and final evidence
```

### Parallel Opportunities

- After T001, T002, T003 and T004 can run in parallel because they inspect different baseline concerns.
- After T010, complete T011, then T012 and T013 sequentially because they share `pnpm-workspace.yaml` and dependency manifests; T015 follows the final policy.
- Within US2, complete T018-T020 in order because they share `turbo.json`; T021 and T022 then update the shared root `package.json` in order. T024 can run in parallel with T021 because it only edits the governance document; T023 follows the final graph/scripts, then T025-T027 run sequentially to avoid concurrent builds, temporary changes and long-running processes.
- Within US3, T033, T034, T035 and T036 are independent package-level validation tracks and can run in parallel after US2 completes.
- T038 and T039 can be prepared in parallel because T038 touches only `README.md`; T040 still waits for both documentation tasks.

## Parallel Example: User Story 1

```text
Task T009: Align pnpm setup in .github/workflows/ci.yml
Task T010: Align pnpm setup in Dockerfile
```

## Parallel Example: User Story 2

```text
Task T021: Map canonical root validation scripts in package.json
Task T024: Document workspace/task-qualified failures in docs/architecture/monorepo-pnpm-turborepo-governance.md
```

T022 follows T021 because both update `package.json`; T023 integrates CI after the graph and root commands are settled.

## Parallel Example: User Story 3

```text
Task T033: Validate database package
Task T034: Validate stream-core package
Task T035: Validate Project Assistant Service
Task T036: Validate Webapp paths
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Complete US1 pnpm version, frozen install, workspace protocol, Catalog and build-script policy tasks.
3. Stop and validate the clean install across local assumptions, CI metadata and Docker metadata.
4. Proceed to Turbo only after the pnpm baseline is stable.

### Incremental Delivery

1. US1 delivers reproducible dependency governance.
2. US2 adds one canonical dependency-aware task graph without deleting package scripts.
3. US3 proves ordinary product and package workflows remain stable.
4. Polish closes documentation and evidence; affected-only execution and remote cache remain future work.

## Traceability Summary

| Requirement group                       | Primary tasks |
| --------------------------------------- | ------------- |
| FR-048-001..005                         | T008-T017     |
| FR-048-006..010                         | T018-T027     |
| FR-048-011..014                         | T028-T037     |
| Cross-cutting documentation and closure | T038-T041     |

## Notes

- Every task uses the required checklist format: checkbox, sequential ID, optional `[P]`, optional story label and explicit file path(s).
- Database migrations, Prisma generation and checkpoint/runtime setup are explicit/ordered operations even when related package build tasks appear in the Turbo graph.
- `--affected`, remote cache, Changesets, pnpm deploy, large package extraction and business Runtime changes are deliberately absent from this task list.

## Phase 7: Convergence

- [x] T042 Strengthen `scripts/validate/validate-workspace-boundaries.mjs` so every dependency that resolves to a local workspace must use an explicit `workspace:` range, and add a negative validation case to `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md` per FR-048-003 and T014 (partial).
- [x] T043 Update `turbo.json` so `@ai-mind/database#typecheck` and `@ai-mind/database#test` wait for the same workspace's uncached Prisma-generation build, then validate the root commands from a disposable state without `packages/database/generated/prisma` per FR-048-007, FR-048-008, US2/AC1, and plan Phase 1.4 (partial).
- [x] T044 Define and implement a non-hermetic test cache boundary for database-backed and external-service Webapp tests in `turbo.json` and the relevant package scripts, ensuring database/provider state changes cannot reuse an inapplicable result while preserving cache only for demonstrably hermetic tests; document the policy and evidence in `docs/architecture/monorepo-pnpm-turborepo-governance.md` and `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md` per FR-048-008 and the database-state edge case (partial).

## Phase 8: Audit Remediation

- [x] T045 Close the combined internal-dependency validation gap in `scripts/validate/validate-workspace-boundaries.mjs`, add permanent regression coverage in `scripts/validate/validate-workspace-boundaries.test.mjs`, and update the evidence in `specs/v0.4.8-monorepo-pnpm-turborepo-governance/quickstart.md` per FR-048-003.
- [x] T046 Restore unrelated Vite/Vitest transitive snapshot drift in `pnpm-lock.yaml`, then verify the intended Catalog-only lockfile diff remains frozen-install compatible per T015 and SC-048-001.
- [x] T047 Replace the static-only T031/T040 evidence with an actual Docker image build and PostgreSQL migration/checkpoint validation, or leave those tasks explicitly incomplete until equivalent CI evidence exists.
