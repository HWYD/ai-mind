# Research: Monorepo Boundary and CI Validation Governance

## Baseline findings

- v0.4.8 already uses pnpm 10.34.0, Turbo 2.2.3, `workspace:*`, a single lockfile, and a root `preinstall` workspace-boundary check.
- The root and webapp both use the unscoped name `ai-mind`; PAS is also unscoped. Root and webapp are not explicitly private. Root filters and `turbo.json` therefore contain legacy `ai-mind` selectors.
- The current validator only scans fixed `apps/*`/`packages/*` folders and validates missing providers, `workspace:` ranges, and package-to-app dependencies. It does not detect duplicate identities, app-to-app edges, cycles, unmanaged package manifests, or source/test imports crossing implementation boundaries.
- Existing public cross-workspace imports are webapp to `@ai-mind/database` and `@ai-mind/stream-core` public entries. No existing relative cross-workspace implementation import was found.
- Current `test` mixes stable and PostgreSQL tests. `packages/database/tests/prisma.integration.test.ts` and four webapp `*.integration.test.ts` files depend on `DATABASE_URL`; cloud/live smoke tests are guarded and currently outside CI.
- The existing CI job declares a PostgreSQL service and runs Prisma migration/checkpoint setup before lint/typecheck/test. Reordering steps within that job cannot satisfy the zero-state-initialization success criterion because a GitHub Actions service starts before job steps.

## Decision 1: Use scoped, private package identities everywhere

**Decision**: Root is `@ai-mind/workspace`; apps are `@ai-mind/webapp` and `@ai-mind/project-assistant-service`; packages retain their existing scoped names. Root and all workspaces declare `private: true`.

**Rationale**: A namespace makes task selectors, dependency diagnostics, and future publishing decisions unambiguous. Explicit privacy prevents an internal single-product workspace from being accidentally publishable.

**Alternatives considered**:

- Keep unscoped app/root names: rejected because root and webapp currently collide and boundaries cannot identify a unique graph node.
- Introduce publishing/Changesets: rejected; publishing is explicitly out of scope.

## Decision 2: Let pnpm enforce install-time graph safety, but keep repository diagnostics

**Decision**: Set `saveWorkspaceProtocol: rolling`, `disallowWorkspaceCycles: true`, and `failIfNoMatch: true` in `pnpm-workspace.yaml`; retain explicit `workspace:*` dependencies and extend the current preinstall validator.

**Rationale**: `workspace:` refuses registry fallback, `disallowWorkspaceCycles` protects installation, and `failIfNoMatch` turns a bad filtered command into a non-zero exit. The validator adds a repository-specific, readable failure before build/test and covers rules pnpm does not model (direction and source-import policy).

**Alternatives considered**:

- `preferWorkspacePackages`: rejected because the repository already requires `workspace:`, which is stricter.
- Only rely on pnpm: rejected because it cannot express app-to-app, source import/export, and private-identity policy.

**Sources**: [pnpm workspaces](https://pnpm.io/workspaces), [pnpm settings](https://pnpm.io/settings).

## Decision 3: Extend the Node-native validator instead of adopting Turbo Boundaries

**Decision**: Derive workspaces from `pnpm-workspace.yaml`, construct the dependency graph, scan static source specifiers, and validate public exports in `scripts/validate/validate-workspace-boundaries.mjs`, with fixture regression tests.

**Rationale**: The current validator already runs in `preinstall`; a Node-built-in implementation is available before dependency installation and keeps rules close to the pnpm manifest authority. Turbo 2.2.3 in this repository does not provide `turbo boundaries`; the documented feature was introduced later and remains experimental.

**Alternatives considered**:

- Upgrade Turbo and adopt experimental boundaries now: rejected by the v0.4.9 non-goal of no mandatory task-runner upgrade, and it would not replace custom identity policy.
- ESLint `no-restricted-imports`: rejected because it cannot reliably resolve cross-workspace relative paths while linking dependency declaration and package `exports`.
- Add a parsing dependency: rejected because the preinstall validator must work on a clean install. A deliberately limited parser/scanner will fail closed when it sees unsupported workspace patterns, package export patterns, or non-literal imports.

**Sources**: [Turbo package/task graph](https://turborepo.dev/docs/core-concepts/package-and-task-graph), [Turbo boundaries reference](https://turborepo.dev/docs/reference/boundaries).

## Decision 4: Treat declared exports as the only cross-workspace source boundary

**Decision**: For production and test code alike, forbid a relative specifier that resolves into another workspace. For `@ai-mind/*` specifiers, require a declared `workspace:` dependency and permit only package-exported entry points.

**Rationale**: This prevents a test from quietly depending on another package's private implementation and gives each workspace one public contract. It permits existing `@ai-mind/stream-core`, `/protocol`, `/web`, and database root use without package extraction.

**Alternatives considered**:

- Exempt tests: rejected by clarification A; tests are consumers too and can lock in private internals.
- Permit all subpath imports: rejected because it makes `src` internals a de facto public API.

## Decision 5: Define three explicit test lanes

**Decision**: Add `test:stable`, `test:integration`, and `test:external` at workspace/root level, with `test` preserved as stable-then-integration aggregate.

| Lane                 | Contents                                                                       | Cache    | Invocation                          |
| -------------------- | ------------------------------------------------------------------------------ | -------- | ----------------------------------- |
| Stable               | unit/component/protocol/node tests with no DB or real service                  | enabled  | local root command and normal CI    |
| Stateful integration | explicit `*.integration.test.*` PostgreSQL/Prisma/checkpointer/agent-run tests | disabled | root aggregate and dependent CI job |
| External             | real cloud/live smoke tests                                                    | disabled | explicit manual opt-in only         |

**Rationale**: Naming aligns test cost, state ownership, cache correctness, and CI scheduling. It also prevents the current accidental pass where database tests are skipped because `DATABASE_URL` is absent.

**Alternatives considered**:

- Keep a single mixed `test`: rejected because it cannot be safely cached and masks whether stateful tests ran.
- Run cloud smoke on a schedule: rejected by the approved clarification; credential/cost/vendor behavior remains manual.

## Decision 6: Split CI jobs, not just steps

**Decision**: A no-service `stable-validation` job runs boundary validation, lint, typecheck, stable tests, and build. `stateful-integration` uses `needs: stable-validation`, then owns PostgreSQL, Prisma generation/migration, runtime checkpoint setup, and integration tests. Docker build checks remain independent.

**Rationale**: GitHub Actions starts service containers at job start, so only a separate dependent job ensures a stable validation failure has zero database initialization. The job boundary also makes failure ownership visible in PR checks.

**Alternatives considered**:

- Move migration/setup steps below stable test in one job: rejected because PostgreSQL still starts before every step.
- Remove stateful CI: rejected because the project needs an explicit reliable integration lane.

**Sources**: [GitHub Actions PostgreSQL service containers](https://docs.github.com/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Turbo caching](https://turborepo.dev/docs/crafting-your-repository/caching), [Turbo CI construction](https://turborepo.dev/docs/crafting-your-repository/constructing-ci).

## Decision 7: Keep deployment and release paths untouched

**Decision**: Change only `.github/workflows/ci.yml`; do not change `docker-release.yml`, Dockerfiles, Compose, production environment contracts, TCR release, or deployment scripts.

**Rationale**: v0.4.9 improves validation feedback. Production deployment remains governed by the existing two official release paths and is a stated non-goal.

**Source**: [production deployment architecture](../../docs/architecture/production-deployment.md).
