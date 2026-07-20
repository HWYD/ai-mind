# Implementation Plan: Monorepo Boundary and CI Validation Governance

**Branch**: `[049-monorepo-boundary-ci]` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/049-monorepo-boundary-ci/spec.md`

## Summary

v0.4.9 follows v0.4.8's pnpm + Turborepo baseline with two governance upgrades:

1. Make each root/workspace identity explicit in the `@ai-mind/*` namespace, and extend the existing preflight validator to reject invalid dependency directions, cycles, unmanaged workspaces, and production/test source imports that bypass a declared public workspace boundary.
2. Split tests into cacheable stable tests, non-cacheable stateful integration tests, and manually invoked external-service tests. Split GitHub Actions accordingly, so a static or stable-test failure cannot start PostgreSQL or its initialization steps.

The implementation keeps the current four workspaces and single-product runtime. It does not add Nx, a Turbo upgrade, remote cache, release automation, or a deployment path.

## Technical Context

**Language/Version**: TypeScript 5.9.3; Node.js 22; ESM Node scripts for repository validation

**Primary Dependencies**: pnpm 10.34.0 workspaces/catalogs; Turborepo 2.2.3; Next.js 16; Vitest 4; Node built-in test runner for PAS

**Storage**: No new storage. Existing PostgreSQL/pgvector remains available only to the stateful integration lane.

**Testing**: Vitest (webapp, database, stream-core), `node --test` + `tsx` (PAS), fixture tests for the workspace validator, GitHub Actions workflow validation by command/dry-run review

**Target Platform**: Local Windows developer workflow and GitHub Actions Ubuntu CI; existing Linux Docker release is unchanged

**Project Type**: pnpm/Turborepo monorepo containing two applications and two internal packages

**Performance Goals**: Stable validation must reuse Turbo cache when inputs are unchanged; a failure in static/stable validation must trigger zero PostgreSQL service starts, migrations, or checkpoint setup executions

**Constraints**: Preserve current runtime/API/stream/deploy behavior; use `workspace:` for all internal dependencies; validation must work during `preinstall` with Node built-ins only; external cloud tests require explicit manual opt-in and never enter normal or scheduled CI

**Scale/Scope**: Four current workspaces (`apps/webapp`, `apps/project-assistant-service`, `packages/database`, `packages/stream-core`) plus the root governance manifest; one CI workflow and its existing Docker job

## Constitution Check

### Pre-design gate — PASS

- **Version scope**: The work directly implements the two approved v0.4.9 priorities: boundary governance and layered test/CI feedback. It does not add runtime capabilities.
- **Layering**: Changes are repository tooling, manifests, test scripts, and CI orchestration. They do not change Tool/Skill/MCP/Agent/data-layer boundaries.
- **Small, explainable increment**: Keep pnpm and Turbo. Improve the existing validator rather than introducing Nx, a new policy engine, or a package extraction.
- **Compatibility**: Preserve `build`, `lint`, `typecheck`, `test`, and workspace diagnostic entry points; `test` becomes an explicit stable-then-integration aggregate.
- **Spec Kit / documentation**: This plan, research, data model, quickstart, architecture and release documentation changes are tracked in the feature scope.

### Post-design re-check — PASS

The selected design uses no new application abstraction, database schema, external API contract, deployment path, or secret. The only strictness changes are intentional repository governance failures described in the specification. No complexity exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/049-monorepo-boundary-ci/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md                 # Created later by /speckit-tasks
```

`contracts/` is intentionally omitted: this feature changes internal repository commands and CI behavior, not a public HTTP, stream, database, or deployment contract.

### Source Code (repository root)

```text
package.json                                      # canonical root commands and workspace identity
pnpm-workspace.yaml                               # workspace discovery and pnpm safety settings
turbo.json                                        # cache and dependency contracts for test lanes
scripts/validate/
├── validate-workspace-boundaries.mjs             # manifest, graph, and source-import policy
├── ...workspace-boundaries*.test.mjs             # isolated validator fixtures/regression coverage
├── validate-test-lanes.mjs                       # complete test-file-to-lane inventory
└── validate-test-lanes.test.mjs                  # lane inventory regression coverage

apps/
├── webapp/
│   ├── package.json                              # scoped identity and lane commands
│   ├── vitest*.config.ts                         # stable/integration/external test selection
│   └── tests/                                    # files classified into exactly one lane
└── project-assistant-service/package.json        # scoped identity and stable-test command

packages/
├── database/
│   ├── package.json                              # integration-test command
│   └── tests/prisma.integration.test.ts
└── stream-core/package.json                      # stable-test command

.github/workflows/ci.yml                          # stable-validation -> stateful-integration; Docker unchanged
docs/architecture/                                # durable testing / workspace governance facts
docs/releases/                                    # v0.4.9 closure material when implementation is complete
```

**Structure Decision**: Preserve the v0.4.8 `apps/*` and `packages/*` layout. The root manifest remains the command authority; each workspace owns its package identity and local diagnostic/lane scripts; the root validator owns cross-workspace policy.

## Implementation Strategy

### Phase 1 — Establish one authoritative workspace graph

1. Rename the root, webapp, and PAS manifests to unique `@ai-mind/*` identities; make the root and every workspace explicitly `private: true`; synchronize version metadata to v0.4.9 during version closure.
2. Replace root filters and Turbo task selectors that still use `ai-mind` with the new webapp name.
3. In `pnpm-workspace.yaml`, explicitly set `saveWorkspaceProtocol: rolling`, `disallowWorkspaceCycles: true`, and `failIfNoMatch: true`. Keep `workspace:*` as the internal dependency convention; do not add `preferWorkspacePackages` because `workspace:` already refuses registry fallback.
4. Refactor the existing Node validator to derive actual members from the declared `packages:` patterns, fail closed for unsupported patterns, and reject package manifests located outside that membership. It must validate root identity separately.
5. Build a dependency graph from all dependency fields and report source workspace, manifest field, target, and reason for each violation. Enforce scoped/private identity, missing provider, non-`workspace:` internal ranges, app-to-app, package-to-app, duplicate names, and cycles. pnpm's cycle setting remains the install-time backstop; the validator provides deterministic diagnostics before build/test.

### Phase 2 — Enforce public source boundaries without new tooling

1. Add a Node built-in recursive scanner to the same governance command. Scan production and test source under each workspace while excluding generated/build/cache directories.
2. Resolve literal static `import`, re-export, `require`, and dynamic-import specifiers. A relative path resolving into another workspace is forbidden for both production and tests.
3. For `@ai-mind/*` imports, require a declared `workspace:` dependency and allow only the target package's declared `exports` entries. This allows current public entries such as `@ai-mind/stream-core/protocol` but rejects deep implementation imports such as `/src/...`.
4. Treat non-literal dynamic module specifiers and unsupported `exports` patterns as fail-closed policy errors until the validator is deliberately extended. Add fixture-based regression tests for every forbidden path and for allowed public imports.

### Phase 3 — Give tests one lane and one execution contract

1. Inventory every test and classify it exactly once by filename/configuration: stable tests (no database or real service), `*.integration.test.*` stateful PostgreSQL tests, and external cloud/live smoke tests.
2. Add a Node-built-in test-lane inventory validator that reports each workspace/file/lane and rejects a missing or duplicate classification. Run it before stable tests so the all-workspace classification claim has executable evidence.
3. Add `test:stable`, `test:integration`, and `test:external` workspace commands. Preserve `test` as a local diagnostic aggregate of stable then integration; preserve useful watch/smoke aliases where they already exist.
4. Use dedicated Vitest selection configuration or equivalent cross-platform CLI configuration rather than shell glob expansion. Stable selection excludes integration and external files; integration selection explicitly includes only `*.integration.test.*`; external selection explicitly includes smoke files.
5. Give external tests one explicit manual opt-in gate and fail before execution if it is absent. Existing cloud-specific flags may remain compatible aliases, but ordinary `pnpm test`, PR CI, and scheduled CI must never invoke this lane.
6. Keep `test:check-location` in the stable lane so test-placement regressions fail before any stateful setup. Confirm the stable lane runs without `DATABASE_URL` and does not silently skip integration tests.

### Phase 4 — Encode cache and CI order in the task graph

1. Replace the mixed Turbo `test` behavior with lane-specific tasks. `test:stable` has no database/external environment input and remains cacheable; `test:integration` and `test:external` set `cache: false`, declare only their required environment input, and produce no cacheable output.
2. Retain needed upstream build ordering only where a workspace test truly consumes a build artifact. The database generation task is not a database-state initialization and must remain explicit in the task graph.
3. Make root `build` and every root test entry run workspace-boundary validation before invoking Turbo, so a forbidden graph/import cannot be hidden by a cache hit. Make root `test` run `test:stable` before `test:integration`; `test:stable` additionally runs the test-lane inventory before stable work. Keep root lane commands and workspace `test` commands as diagnostics, not competing canonical flows.
4. Split `.github/workflows/ci.yml` into a **Stable validation** job (install, boundary check, lint, typecheck, stable test, build; no PostgreSQL service and no `DATABASE_URL`) and a **Stateful integration** job that `needs` the first job (PostgreSQL service, Prisma generation/migration, checkpoint setup, integration lane). Keep the Docker build-check job independent.
5. Enable pnpm-store dependency caching in both Node jobs while retaining frozen-lockfile installation. Do not configure Turbo Remote Cache, affected-only execution, or a scheduled external-test workflow.

### Phase 5 — Verification and durable explanation

1. Verify validator fixtures, package identity, workspace filter failure, source-boundary failures, and allowed public imports.
2. Verify each lane independently, then root `test`; inspect Turbo dry-run/task output to prove stable is cacheable and the other lanes are not.
3. Review the workflow to prove the stateful job has `needs: stable-validation`, and use a controlled static/stable failure to show no database service/setup is scheduled.
4. Update architecture/readme/release materials with the authoritative commands, lane semantics, cache policy, external-test rule, and v0.4.9 version facts. Do not alter deployment or Docker-release behavior.

## Complexity Tracking

No constitution violations or additional complexity justifications are required.
