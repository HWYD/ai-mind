# Implementation Plan: Monorepo pnpm and Turborepo Governance

**Branch**: `[048-monorepo-pnpm-turborepo-governance]` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/048-monorepo-pnpm-turborepo-governance/spec.md`

## Summary

本阶段把 AI Mind 当前的四个 workspace 从“能用 pnpm 管理”提升到“有明确 Monorepo 治理规则”：选定并锁定一个 pnpm 10 后期版本，统一本地、CI 和 Docker 的安装行为；将 `allowBuilds` 占位配置改为有审计理由的显式策略；用 pnpm Catalog 集中公共工具链和安全的跨 workspace 运行时依赖；新增 `turbo.json`，让根目录的 build、typecheck、test、lint、dev/watch 通过同一份任务图执行。

根目录的 Turborepo 命令是日常和 CI 的标准入口；现有 `pnpm --filter`、`pnpm --dir` 及 package script 继续保留，作为包级调试、故障定位和兼容入口。数据库迁移、Prisma generate、checkpoint setup 等有副作用的步骤仍显式、有序执行，不纳入可复用缓存。`--affected`、远程缓存、Changesets、pnpm deploy 和业务 Runtime 重构不在本阶段。

## Technical Context

**Language/Version**: TypeScript 5.9.3; Node.js 22.x; pnpm 10.34.0 (exact pin)

**Primary Dependencies**: pnpm workspaces, Turborepo 2.2.3 (existing), Next.js 16, Prisma 7, Vitest 4, ESLint 9, tsup

**Storage**: No new storage. Existing PostgreSQL/Prisma remains an explicit validation and setup dependency.

**Testing**: Existing package tests (Vitest and Node test runner), package typecheck/lint/build scripts, root Turbo commands, CI-style frozen install, and `git diff --check`

**Target Platform**: Windows local development, GitHub Actions on Ubuntu, and the existing Node.js 22 Docker build

**Project Type**: TypeScript web application plus MCP service and internal workspace packages

**Performance Goals**: No user-facing runtime performance change. Independent finite workspace tasks should be parallelizable; this phase has no hard wall-clock target.

**Constraints**: Keep the existing four-workspace shape and package scripts; do not migrate to pnpm 11; do not cache long-running or side-effectful tasks; do not change stream protocol, database schema, API contracts, Agent behavior, or product behavior.

**Scale/Scope**: `apps/*` and `packages/*` currently resolve to four workspaces: Webapp, Project Assistant Service, database, and stream-core. This is incremental repository governance, not a large package extraction.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Constitution area                                             | Pre-research result                                                     | Design re-check                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Controlled Agent First / GraphState / side-effect-free review | PASS - no Agent, graph runtime, or review-node changes                  | PASS - repository tooling remains outside Runtime behavior                    |
| Business state, checkpoint and stream compatibility           | PASS - no Prisma schema, checkpoint, or stream protocol changes         | PASS - DB setup is explicit and stream-core is only validated, not redesigned |
| Public DTO safety                                             | PASS - no API or public DTO changes                                     | PASS - no new external contract                                               |
| Minimal Abstraction                                           | PASS - only root package-manager and task-runner configuration is added | PASS - no new source package or business abstraction                          |
| Tests Before Broad Integration                                | PASS - validate package contracts/builds before root/CI integration     | PASS - quickstart preserves targeted package validation and smoke checks      |
| Spec Drift / Spec Kit governance                              | PASS - affected config, CI, Docker and docs are listed in the plan      | PASS - plan artifacts and AGENTS managed context are synchronized             |
| Language policy                                               | PASS - English Spec Kit headings and identifiers, Chinese explanation   | PASS                                                                          |

No constitution violation requires a complexity exception.

## Project Structure

### Documentation (this feature)

```text
specs/048-monorepo-pnpm-turborepo-governance/
├── plan.md                    # This file
├── research.md                # Phase 0 research and decisions
├── data-model.md              # Phase 1 internal configuration model
├── quickstart.md              # Phase 1 validation and operating guide
├── checklists/requirements.md # Requirements checklist
└── tasks.md                   # Phase 2 output; not created in this plan step
```

No `contracts/` directory is planned: this feature changes internal repository tooling and does not add an API, stream, package-public, or persistence contract.

### Source Code (repository root)

```text
package.json                    # exact pnpm pin and canonical root commands
pnpm-workspace.yaml             # workspace globs, Catalog and explicit allowBuilds policy
pnpm-lock.yaml                  # single frozen workspace lockfile
turbo.json                      # task graph, dependencies, outputs, cache and env inputs
apps/
├── webapp/package.json
└── project-assistant-service/package.json
packages/
├── database/package.json
└── stream-core/package.json
.github/workflows/ci.yml        # same Turbo graph plus explicit DB/runtime setup
Dockerfile                      # Node/pnpm version alignment; build strategy unchanged
AGENTS.md                       # managed Spec Kit plan pointer
```

**Structure Decision**: Preserve the existing `apps/*` and `packages/*` workspace layout. Add repository-level governance files only. The package graph remains applications depending on shared packages; shared packages must not depend on applications. The task graph is derived from package scripts and workspace dependencies, while pnpm remains responsible for dependency installation and linking.

## Implementation Strategy

### Phase 0 - Research and decisions

1. Confirm the exact pnpm 10 late-series pin as `10.34.0`, verify it supports the repository's `allowBuilds` configuration, and document the no-pnpm-11 decision.
2. Inspect the current lockfile's install/build scripts and convert `pnpm-workspace.yaml` placeholders into explicit `true`/`false` entries with a short rationale for each approved script.
3. Inventory repeated dependency versions across the four manifests. Add a default pnpm Catalog only for common tooling and selected runtime dependencies used by multiple workspaces; leave Webapp-only dependencies local and document intentional exceptions.
4. Map current root/package/CI/Docker commands and identify which are finite tasks, long-running tasks, or side-effectful setup steps.

### Phase 1 - Design and implementation inputs

1. Add `turbo.json` using the existing package scripts as the task vocabulary. `build` and `typecheck` must respect upstream workspace dependencies; finite tasks declare outputs where artifacts exist; `dev` and `build:watch` are persistent and uncached.
2. Make root `build`, `typecheck`, `test`, and `lint` call Turborepo. Define `pnpm dev` as the Webapp development task plus dependency package watch tasks through the `ai-mind...` filter; keep PAS development and `dev:webapp` as explicit diagnostic commands without deleting package-level commands.
3. Align `package.json`, CI setup and Docker's Corepack setup to pnpm `10.34.0`, then use the same Turbo task graph for ordinary CI lint/typecheck/test/build checks.
4. Keep Prisma generate, migration and checkpoint/runtime setup explicit and ordered before the ordinary validation graph where required. Database `build`/`build:watch` tasks that run Prisma generate are side-effect-sensitive and must not reuse a cache. Do not introduce cache reuse for database state or generated side effects; production migration recovery and rollback remain deployment-runbook responsibilities.
5. Update repository documentation with the package graph, command ownership, Catalog rules, allowBuilds policy, and troubleshooting examples.

### Validation order

1. Frozen install and pnpm/Node version assertions.
2. Package/task graph inspection plus package-level diagnostic checks needed to validate the task mapping.
3. Root Turbo graph checks and canonical commands.
4. CI-like ordered database setup followed by Turbo lint/typecheck/test/build and the full package regression matrix.
5. Existing chat, tool-assisted chat, Tasklist and Delivery smoke checks, then `git diff --check`.

## Key Files and Responsibilities

| File                                                | Responsibility                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                      | Exact package-manager pin and canonical root command entrypoints                                                                |
| `pnpm-workspace.yaml`                               | Workspace discovery, Catalog definitions and explicit install-script policy                                                     |
| `turbo.json`                                        | Task dependencies, outputs, cache policy, persistent tasks and environment inputs                                               |
| `pnpm-lock.yaml`                                    | Reproducible dependency resolution; changed only when the selected pnpm/config requires it                                      |
| `.github/workflows/ci.yml`                          | Frozen install, explicit side-effectful setup, and ordinary checks through Turbo                                                |
| `Dockerfile`                                        | Node/pnpm version alignment while retaining the current image/build strategy                                                    |
| `docs/architecture/` or root workflow documentation | Long-lived explanation of package graph and command boundaries, if the existing documentation location confirms the best target |
| `AGENTS.md`                                         | Managed pointer to the active 048 plan                                                                                          |

## Risks and Mitigations

- pnpm 10.34.0 may expose install-script or lockfile differences from 10.18.3. Mitigation: run frozen install in a clean dependency state before accepting lockfile changes; do not silently regenerate unrelated resolutions.
- Over-approving dependency build scripts weakens supply-chain control. Mitigation: approve only scripts evidenced by the current install/build/test paths; record rejected candidates explicitly.
- Turbo cache may reuse results across environment or generated-file changes. Mitigation: declare relevant lock/config/env inputs, mark side-effectful tasks uncached, and keep DB setup outside the graph.
- Root command migration may hide package-specific failures. Mitigation: preserve package-level commands and require workspace/task-qualified failure output in CI and quickstart validation.
- Catalog centralization can force incompatible versions. Mitigation: centralize only repeated versions with compatible consumers; keep intentional per-app versions explicit.
- Database setup can leave partial state after a migration or checkpoint failure. Mitigation: fail visibly at the explicit setup boundary, do not retry or roll back automatically in this feature, and defer production recovery/rollback to deployment runbooks.

## Complexity Tracking

No constitution violations. No complexity exception is required.
