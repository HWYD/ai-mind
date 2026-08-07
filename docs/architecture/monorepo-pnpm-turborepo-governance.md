# Monorepo pnpm and Turborepo Governance

## Summary

AI Mind uses pnpm for workspace discovery, dependency resolution, one lockfile, Catalog versions, and local `workspace:` linking. Turborepo owns task ordering, parallelism, outputs, and cache policy. Root commands are the normal local and CI entry points; package commands remain focused diagnostic tools.

The repository runs on Node.js 22 and `pnpm@10.34.0`. v0.4.9 adds two enforceable contracts: workspace boundaries and test-lane governance. It does not change product runtime behavior or the production deployment flow.

## Workspace Graph and Boundaries

```text
@ai-mind/workspace
├── @ai-mind/webapp
│   ├── @ai-mind/database
│   └── @ai-mind/stream-core
├── @ai-mind/project-assistant-service
├── @ai-mind/database
└── @ai-mind/stream-core
```

Allowed dependency direction is `apps -> packages`. Application-to-application and package-to-application dependencies are forbidden. Every workspace must be private, scoped as `@ai-mind/*`, and discovered by the explicit `apps/*` or `packages/*` membership in `pnpm-workspace.yaml`.

Internal dependencies must use `workspace:`. Source code may cross a workspace boundary only through a declared `workspace:` dependency and an exported public entry point. The boundary validator rejects unmanaged manifests, duplicate or invalid identities, missing providers, non-`workspace:` internal ranges, illegal directions, cycles, cross-workspace relative imports, undeclared imports, deep private imports, and non-literal dynamic imports.

`preinstall`, `pnpm validate:workspace-boundaries`, every root test lane, and `pnpm build` invoke the boundary validator before Turborepo can restore cached work. `failIfNoMatch: true` makes an incorrect pnpm filter fail instead of silently succeeding.

## Tool Ownership and Dependency Policy

| Concern                                     | Owner                 | Contract                                                                |
| ------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Workspace discovery and local linking       | pnpm                  | `apps/*`, `packages/*`, and explicit `workspace:` ranges                |
| Reproducible dependency resolution          | pnpm                  | One `pnpm-lock.yaml` and frozen installation                            |
| Shared dependency versions                  | pnpm Catalog          | Centralize only dependencies with multiple compatible consumers         |
| Dependency install scripts                  | pnpm `allowBuilds`    | Every discovered build script is explicitly allowed or denied           |
| Task ordering, parallelism, and local cache | Turborepo             | Derive the task graph from workspace dependencies and `turbo.json`      |
| Stream-core transpile/type watch            | Turborepo             | Run two explicit persistent leaf tasks; no package-local process runner |
| Migrations and checkpoint setup             | Explicit pnpm scripts | Ordered state changes never restored from Turbo cache                   |

The Catalog currently owns `@types/node`, TypeScript, Vitest, Zod, MCP SDK, and dotenv. Webapp-only UI/framework dependencies stay in the Webapp manifest. `allowBuilds` remains fail closed: Prisma engines, esbuild, sharp, and `unrs-resolver` are allowed for required runtime/build artifacts; Electron and `electron-winstaller` are allowed for the desktop runtime and Windows maker; `fs-xattr` and `macos-alias` are narrowly allowed for the reviewed `@electron-forge/maker-dmg -> electron-installer-dmg -> appdmg` call chain. Nest donation output, MSW worker copying, and Prisma's redundant Node-version preinstall check remain denied. A new dependency install script requires source and call-chain review before the allowlist changes. Platform verification must also load required native modules before packaging so a skipped build cannot surface only during maker execution.

## Canonical and Diagnostic Commands

| Purpose                  | Canonical root command                      | Diagnostic alternative                            |
| ------------------------ | ------------------------------------------- | ------------------------------------------------- |
| Boundary validation      | `pnpm validate:workspace-boundaries`        | `pnpm test:governance:boundaries`                 |
| Governance regressions   | `pnpm test:governance`                      | the focused `test:governance:*` validator scripts |
| Stable validation        | `pnpm test:stable`                          | `pnpm --filter <workspace> test:stable`           |
| Stateful integration     | `pnpm test:integration`                     | `pnpm --filter <workspace> test:integration`      |
| External validation      | `pnpm test:external`                        | Webapp `test:external` with dedicated credentials |
| Full daily test contract | `pnpm test`                                 | run stable/integration separately for diagnosis   |
| Lint, typecheck, build   | `pnpm lint`, `pnpm typecheck`, `pnpm build` | matching package-level command                    |

## Local Development Commands

Local development uses a host-run Webapp/PAS process with only PostgreSQL running in Docker through `deploy/compose.dev-postgres.yml`. Daily startup owns container readiness only; database initialization remains an explicit, one-off operation.

| Scenario                                                                   | Command              | Behavior                                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webapp + PostgreSQL + Project Assistant Service, no package watch          | `pnpm dev`           | Starts local Docker PostgreSQL, then uses Turbo to run Webapp and PAS `dev` tasks with local DB/MCP environment defaults.                                        |
| Webapp + PostgreSQL + Project Assistant Service, with shared-package watch | `pnpm dev:watch`     | Starts the same PostgreSQL readiness preflight, then uses separate Turbo task graphs for Webapp/PAS `dev` and the stream-core transpile/declaration watch tasks. |
| Webapp + PostgreSQL only                                                   | `pnpm dev:webapp:db` | Starts local Docker PostgreSQL, then uses Turbo to run only the Webapp `dev` task with local DB/MCP environment defaults.                                        |

`pnpm dev:db` is the shared preflight for these scenarios. It starts only the `postgres` service from `deploy/compose.dev-postgres.yml` and waits for readiness at `postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind`; it does not generate Prisma Client, run migrations, or create runtime schemas.

Use `pnpm dev:db:setup` explicitly after a fresh clone, a cleared database volume, or a committed migration change. It generates Prisma Client, applies the checked-in migrations, and runs the existing runtime checkpoint/UserMemory schema setup. `db:setup:deploy` remains the unchanged production deployment contract.

Use `pnpm dev:db:logs` to follow the local development PostgreSQL logs and `pnpm dev:db:down` to stop the DB-only Compose stack. These commands are separate from `pnpm docker:local:*`, which remains the production-image local acceptance path.

`pnpm dev:webapp` and `pnpm dev:pas` remain package-level diagnostic shortcuts. They do not start PostgreSQL or inject the local database/MCP defaults. Use them only when the needed environment is already provided by the shell or an app-local env file.

Turbo `dev` declares the local runtime environment keys it may receive (`DATABASE_URL`, `PROJECT_ASSISTANT_SERVICE_*`, `AI_MIND_*`, and `NEXT_PUBLIC_*`). This is required because Turborepo's strict environment mode should not accidentally drop the local DB/MCP defaults injected by the root scenario scripts.

## Test Lanes and Commands

Every automated test belongs to exactly one lane, based on its file name:

| Lane        | Naming and scope                                                        | Root command            | Cache policy                                                |
| ----------- | ----------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| stable      | ordinary `*.test.*` / `*.spec.*` tests, including root governance tests | `pnpm test:stable`      | workspace tasks cacheable; governance preflight always runs |
| integration | `*.integration.test.*`, including database tests                        | `pnpm test:integration` | disabled                                                    |
| external    | `*-smoke.test.*` cloud/live tests                                       | `pnpm test:external`    | disabled                                                    |

`pnpm validate:test-lanes` inventories every workspace/file/lane before stable work, including the root validator regression files. A test-like file outside its workspace's managed test root is a governance failure rather than an untracked stable test. `pnpm test:governance` then proves the validators themselves before Turbo runs workspace tests. Stable tests run without `DATABASE_URL` and without a PostgreSQL service. Integration tests require explicit PostgreSQL, Prisma migration, and runtime checkpoint setup; a missing `DATABASE_URL` is a configuration failure before Vitest, never a successful all-skipped run. External tests require `AI_MIND_RUN_EXTERNAL_TESTS=1`; ordinary root and CI flows report them as not run. A missing opt-in is a configuration failure; an opted-in provider, quota, or network failure is an external validation failure.

The canonical aggregate `pnpm test` runs stable validation first and then integration validation. Package-level lane commands narrow diagnosis without replacing the root flow.

Root `package.json` scripts are reserved for common local/CI entry points and durable governance contracts. Low-frequency one-off diagnostics use documented `pnpm --filter` or `pnpm --dir` commands instead of adding another root alias.

## Turbo Task Contracts

- `build` and `typecheck` respect upstream `^build` dependencies.
- `test:stable` applies only to webapp, stream-core, and Project Assistant Service, has no database environment input, and is cacheable.
- `test:integration` applies only to webapp and database, is `cache: false`, and declares `DATABASE_URL` plus required runtime configuration.
- `test:external` applies only to webapp, is `cache: false`, and declares the explicit external opt-in/runtime variables.
- Database `build` still runs Prisma generation and remains non-cacheable. Migrations and checkpoint setup stay outside reusable task cache.
- Stream-core watch is split into `build:watch:transpile` and `build:watch:types`; both are explicit persistent, uncached Turbo tasks. The database no longer exposes `build:watch`, because Prisma generation is finite setup work rather than a watcher.

One-off diagnostic commands:

```powershell
pnpm test:governance
pnpm test:governance:boundaries
pnpm test:governance:lanes
pnpm test:governance:integration-env
pnpm validate:workspace-boundaries
pnpm validate:test-lanes
pnpm --filter @ai-mind/webapp test:stable
pnpm --filter @ai-mind/database test:integration
pnpm --filter @ai-mind/project-assistant-service build
pnpm --filter @ai-mind/project-assistant-service typecheck
pnpm --filter @ai-mind/webapp lint
pnpm --filter @ai-mind/webapp lint:fix
pnpm --filter @ai-mind/database db:generate
pnpm --filter @ai-mind/database db:validate
pnpm --filter @ai-mind/database db:migrate:deploy
pnpm --dir apps/webapp db:chat-memory:setup
pnpm --dir apps/webapp db:user-memory:setup
pnpm exec turbo run build:watch:transpile build:watch:types --filter=@ai-mind/stream-core
pnpm exec turbo run test:stable --dry
pnpm exec turbo run test:integration --dry
```

## CI Ordering

`stable-validation` has no PostgreSQL service, `DATABASE_URL`, migration, or checkpoint setup. It runs frozen install, boundary validation, lint, typecheck, lane inventory, stable tests, and build.

`stateful-integration` has `needs: stable-validation`; it alone starts PostgreSQL, generates Prisma Client, applies migrations, initializes runtime checkpoint tables, and runs integration tests. Both Node jobs cache the pnpm store. The Docker build-check job remains independent.

This ordering makes the expensive stateful lane a consequence of successful deterministic validation. If stable validation fails, GitHub Actions skips the dependent integration job and no stateful setup starts.

`scripts/validate/validate-ci-workflow.test.mjs` keeps this job topology executable in the stable governance suite: it rejects a stable job that gains a service, database environment, migration, or checkpoint setup, and requires the integration job to remain dependent and ordered.

## Failure Diagnosis

Boundary failures include the workspace/file/reason. Fix the declared graph or public import surface rather than adding registry fallbacks. Lane inventory output identifies a workspace/file/lane mismatch; rename or relocate a test so it has one classification. Turbo reports `<workspace>#<task>` for task failures; use the matching package-level command to reduce scope.

Production Docker, TCR image, Compose, environment, secret, and deployment contracts are unchanged. See [Production Deployment](./production-deployment.md) for their source of truth.
