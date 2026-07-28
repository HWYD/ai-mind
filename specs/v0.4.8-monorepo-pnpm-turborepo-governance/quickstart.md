# Quickstart: Monorepo pnpm and Turborepo Governance

This guide is the implementation and review checklist for the 048 change. It describes expected commands after implementation; it is not a replacement for the existing database deployment documentation.

## Prerequisites

- Node.js 22.x
- PostgreSQL for database-backed validation
- Corepack enabled
- The repository's exact pnpm version: `10.34.0`

```powershell
corepack enable
corepack prepare pnpm@10.34.0 --activate
node --version
pnpm --version
```

Expected `pnpm --version`: `10.34.0`.

## Reproducible Installation

Run from the repository root:

```powershell
pnpm install --frozen-lockfile
```

The command must not rewrite `pnpm-lock.yaml`. If pnpm reports an unapproved dependency build script, stop and resolve the explicit `allowBuilds` policy; do not bypass it with a broad approval.

In a disposable worktree, temporarily remove or rename an expected local package such as `packages/stream-core` while keeping the Webapp `workspace:*` dependency, then rerun the frozen install. The install must fail with an auditable workspace-resolution error rather than silently using a registry package. Restore the worktree after the check.

Also replace one valid local `workspace:*` range with an ordinary semver range in a disposable manifest and run `pnpm validate:workspace-boundaries`. Validation must fail even though the local provider still exists; restore the manifest immediately afterward.

Run the permanent boundary regression suite as well:

```powershell
pnpm test:workspace-boundaries
```

It covers the valid local dependency, each independent failure, and the combined failure where an internal dependency uses ordinary semver while its local provider is also missing. The combined case must report both violations and return exit code 1.

## Canonical Root Commands

The following commands are the normal local and CI entrypoints after implementation:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

They must execute applicable workspace scripts through the same Turborepo task graph and identify failures by workspace and task.

Database `typecheck` and `test` must wait for the same workspace's uncached Prisma-generation `build`. Validate this from a disposable copy without `packages/database/generated/prisma`; the root graph must regenerate the client before either consumer runs.

The generic test task remains cacheable only for hermetic workspaces such as stream-core and PAS. Database tests and the current mixed Webapp test suite are uncached because PostgreSQL state and optional cloud/live responses cannot be represented by a stable source hash.

## Task Graph and Failure Verification

Inspect the Turbo task graph for `build` and `typecheck`, then make a temporary, disposable change under `packages/stream-core` and run the root validation command. The output must show the shared package task before the dependent Webapp task. Restore the temporary change after verification.

Also execute one isolated controlled failing workspace task. The failure output must identify both the workspace and task name so the package-level `pnpm --filter` diagnostic command can be selected without guessing.

Development commands remain available:

```powershell
pnpm dev
pnpm dev:webapp
pnpm dev:pas
pnpm build:watch
```

`pnpm dev` is the canonical combined command and runs the Webapp `dev` task plus dependency package `build:watch` tasks through `turbo run dev build:watch --filter=ai-mind...`. `pnpm dev:webapp`, `pnpm dev:pas`, and `pnpm build:watch` remain isolated diagnostic commands. Long-running commands must not use a reusable build cache and must stop cleanly with Ctrl+C.

## Explicit Database and Runtime Setup

Database and checkpoint setup remains outside the ordinary cacheable task graph:

```powershell
pnpm db:generate
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:runtime-checkpoints:setup
```

Run only the setup required by the environment. Do not run migrations or checkpoint setup concurrently with a task that assumes the resulting state.

## Package-Level Diagnosis

When narrowing a failure to one workspace, use the existing package entrypoints:

```powershell
pnpm --filter @ai-mind/stream-core typecheck
pnpm --filter @ai-mind/stream-core test
pnpm --filter @ai-mind/database db:generate
pnpm --filter project-assistant-service build
pnpm --dir apps/webapp test
```

These commands remain supported and are diagnostic alternatives, not a second competing task graph.

## Validation Order

1. Assert Node and pnpm versions, then run frozen install.
2. Inspect the task graph and run package-level diagnostic checks needed to validate task mapping.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the root, plus the controlled failure and dependency-order checks.
4. Run the CI-equivalent explicit database/runtime setup followed by the ordinary Turbo graph.
5. Smoke-check ordinary chat, tool-assisted chat, Tasklist, Delivery, stream-core build, database generation and PAS build/typecheck/test.
6. Run `git diff --check` and verify no generated or unrelated files are included.

## Troubleshooting Rules

- If an internal package is missing, fix the workspace dependency declaration or workspace installation; do not silently switch to a registry version.
- If a task fails in parallel execution, use the workspace/task label and rerun the package-level diagnostic command.
- If a cache result appears stale, inspect declared task inputs, outputs and environment variables before disabling caching globally.
- If Catalog versions conflict with a consumer's supported range, keep that consumer's explicit local version and document the exception.
- If a database or generated-file task behaves unexpectedly, rerun it explicitly after checking its side effects; do not treat it as a pure cached task.

## Acceptance Evidence

Record the following during implementation and review:

- exact pnpm version output and frozen install result;
- final `allowBuilds` boolean matrix and rationale;
- Catalog entries and intentional exceptions;
- Turbo graph output showing upstream ordering;
- root command results and package-level regression results;
- CI workflow and Docker version alignment review;
- smoke-check result and clean `git diff --check`.

| Evidence                              | Command or source                                                               | Result                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/pnpm versions                    | `node --version`; `pnpm --version`                                              | Passed: Node 22.22.2, pnpm 10.34.0                                                                                                                                                                                                                            |
| Frozen install and lockfile stability | `pnpm install --frozen-lockfile`; lockfile hash comparison                      | Passed: frozen install accepted the lockfile; lockfile diff contains intended Catalog/importer and `@types/node` override changes only                                                                                                                        |
| Workspace protocol negative check     | `pnpm test:workspace-boundaries` plus disposable validation                     | Passed: 4/4 boundary regression cases; the combined ordinary-semver and missing-provider case reported both violations and returned exit 1                                                                                                                    |
| `allowBuilds` and Catalog             | `pnpm-workspace.yaml`; frozen install and package/Docker builds                 | Passed: 7 explicit boolean decisions, no blocked-script failure, 6 Catalog entries, and `@types/node` transitive resolutions pinned to the Node 22 catalog version                                                                                            |
| Turbo graph and upstream ordering     | graph inspection plus controlled stream-core change                             | Passed: stream-core build/typecheck ran before dependent `ai-mind#typecheck`                                                                                                                                                                                  |
| Database generated dependency         | disposable state without generated Prisma Client                                | Passed: generated client absent initially; database build completed before typecheck/test, 3/3 tasks successful                                                                                                                                               |
| Non-hermetic test cache               | `turbo.json` package-scoped test policy                                         | Passed: root test showed database/Webapp cache bypass; stream-core/PAS rerun was 2/2 cache hits                                                                                                                                                               |
| Canonical root commands               | `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`                        | Passed with PostgreSQL: lint 4/4, typecheck 6/6, test 6/6, build 4/4; only the existing 5 Fast Refresh warnings remain                                                                                                                                        |
| PostgreSQL integration                | Prisma migration; runtime checkpoint setup; root `pnpm test`                    | Passed: migration applied; Tasklist/Chat/UserMemory schemas ready; database 2/2 integration tests and Webapp database-backed integration paths executed successfully                                                                                          |
| Package-level regressions             | database、stream-core、PAS、Webapp commands                                     | Passed: database generate/validate; stream-core 22 tests/typecheck/build; PAS 8 tests/typecheck/build; Webapp typecheck plus root lint/test/build                                                                                                             |
| Product smoke paths                   | ordinary chat、tool-assisted chat、Tasklist、Delivery                           | Passed: 4 targeted files, 65 tests                                                                                                                                                                                                                            |
| CI/Docker sequencing                  | `.github/workflows/ci.yml`; `Dockerfile`; `deploy/postgres-pgvector.Dockerfile` | Passed dynamically: Webapp and PAS runner images plus PostgreSQL+pgvector image built successfully; Docker workspace build ran all 4 Turbo build tasks; a temporary pgvector container completed migration and runtime checkpoint setup before the root graph |
| Repository hygiene                    | `git diff --check`; `git status --short`                                        | Passed: no whitespace errors; only feature governance files and previously generated Spec Kit context changes remain                                                                                                                                          |

Controlled failure evidence: a disposable TypeScript error under stream-core returned exit 2 and Turbo reported `Failed: @ai-mind/stream-core#typecheck`; the file was removed immediately afterward.

Long-running command evidence: `pnpm dev` selected Webapp, database and stream-core with cache bypass; the new Webapp process stopped because a pre-existing user Next dev held `.next/dev/lock`. The existing process was preserved. `pnpm dev:pas` reached `Nest application successfully started`, and `pnpm build:watch` reached Prisma generation and stream-core watch mode. All validation-owned process trees were stopped; only the pre-existing Webapp process remained.

Environment validation note: Docker Desktop 4.62.0 was started for closure validation. The Webapp runner, Project Assistant Service runner, and PostgreSQL+pgvector images all built successfully. A temporary PostgreSQL 16+pgvector container on port 5432 completed Prisma migration, Tasklist/Chat/UserMemory runtime setup, database integration tests 2/2, and the full root Turbo graph; the temporary container was stopped and automatically removed afterward. The remaining 6 Webapp skips are cloud/live smoke tests guarded by their existing explicit opt-in flags, not database-environment skips.
