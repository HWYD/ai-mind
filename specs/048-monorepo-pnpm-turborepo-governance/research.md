# Research: Monorepo pnpm and Turborepo Governance

## Decision Summary

| Topic                  | Decision                                                                                                            | Reason                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm version           | Pin `pnpm@10.34.0` exactly in root metadata, CI and Docker                                                          | Keep the selected pnpm 10 line, avoid an unnecessary pnpm 11 migration, and use a version newer than the `allowBuilds` introduction point       |
| Workspace installation | Keep one root lockfile and use frozen installs                                                                      | The repository is one deployable product with four workspaces; a shared lockfile gives one dependency graph for local, CI and Docker validation |
| Build-script policy    | Replace placeholders with an explicit boolean policy based on the current lockfile's actual scripts                 | pnpm's build-script approval is a supply-chain boundary; “set this to true or false” is not an executable policy                                |
| Dependency versions    | Use pnpm Catalog for common tooling and safe cross-workspace runtime dependencies; keep app-only dependencies local | Centralization reduces drift without forcing Webapp-only UI/framework choices onto other workspaces                                             |
| Task orchestration     | Use Turborepo for root and CI ordinary checks; retain pnpm filters for package diagnosis                            | pnpm manages packages and links; Turbo models task dependencies, parallelism and cache policy                                                   |
| CI side effects        | Keep Prisma generation, migrations and checkpoint setup explicit and ordered                                        | These steps mutate or depend on database/runtime state and should not be treated as reusable pure task outputs                                  |
| Optimization timing    | Defer `--affected` and remote cache                                                                                 | First establish a correct shared task graph; optimization can be added after baseline behavior is stable                                        |

## Existing Repository Findings

- The root already depends on `turbo` but has no `turbo.json`; root scripts still invoke Webapp or package filters directly.
- The workspace currently contains `apps/webapp`, `apps/project-assistant-service`, `packages/database`, and `packages/stream-core`.
- Internal dependencies already use `workspace:*` in Webapp, which matches the desired local-package boundary.
- CI and Docker currently pin pnpm `10.18.3` and manually sequence package commands; these are alignment points for the new canonical graph.
- `pnpm-workspace.yaml` contains placeholder values under `allowBuilds`, so installation policy is currently incomplete.
- Repeated versions exist for TypeScript, Vitest, Zod and the MCP SDK. `@types/node` initially had a Webapp-only version mismatch; a focused Node 22 typecheck confirmed that the shared `22.20.1` Catalog entry is compatible.

## Research Findings

### pnpm

The official pnpm settings documentation describes `allowBuilds` as a map from package matchers to booleans and notes that it was added in pnpm 10.26.0. It also describes strict handling for dependency build scripts. Therefore, the selected pnpm 10.34.0 pin is compatible with the required configuration shape, while the implementation must still validate the lockfile and actual install output.

The official workspace documentation supports the `workspace:` protocol for internal dependencies. It prevents an expected local package from silently resolving to a registry package and is therefore the correct boundary for this repository's `@ai-mind/*` packages.

The official Catalog documentation supports centralizing dependency versions in workspace configuration while allowing package manifests to reference catalog entries. Catalog use should remain selective: common tooling and repeated runtime libraries belong in the catalog; Webapp-only Next/UI/editor dependencies do not.

### Turborepo

Turborepo's task model separates the package graph (from workspace dependencies) from the task graph (from `turbo.json`). `dependsOn: ["^build"]` is the standard way to ensure a package's dependencies build first. Task outputs must be declared for artifact restoration; long-running tasks such as `dev` and watch tasks should be marked persistent and not cached.

Turborepo's CI guidance recommends using the same task definitions locally and in CI. This matches the confirmed Q3=A decision. Environment-sensitive inputs must be declared, while database setup remains an explicit precondition outside the ordinary cacheable graph.

## Alternatives Considered

### pnpm 11

Rejected for this feature. It would combine a package-manager major migration with the Monorepo governance work and increase lockfile/install compatibility risk without helping the requested interview-oriented design.

### Keep pnpm filters as the root standard

Rejected as the primary model. Filters remain useful for diagnosis, but they do not express dependency-aware task ordering, outputs, persistent tasks or cache policy as clearly as a task runner configuration.

### Centralize every dependency

Rejected. A Catalog should reduce version drift where versions are genuinely shared, not erase legitimate application-specific choices or create forced upgrades.

### Move all CI steps into Turbo

Rejected. Database migrations, Prisma generation and checkpoint setup have side effects or stateful preconditions. They remain explicit and ordered; ordinary lint/typecheck/test/build use the shared Turbo graph.

## Sources

- [pnpm settings](https://pnpm.io/settings) - `allowBuilds`, build-script policy and related install controls.
- [pnpm workspaces](https://pnpm.io/10.x/workspaces) - workspace dependency protocol and workspace behavior.
- [pnpm catalogs](https://pnpm.io/10.x/catalogs) - centralized dependency version declarations.
- [pnpm releases](https://github.com/pnpm/pnpm/releases) - pnpm 10 late-series release line checked during planning.
- [Turborepo configuring tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks) - task dependencies, outputs and persistent tasks.
- [Turborepo constructing CI](https://turborepo.dev/docs/crafting-your-repository/constructing-ci) - same task graph in local development and CI, plus environment-aware caching.
- [Turborepo running tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks) - root `turbo run` command conventions.
- [Turborepo package and task graph](https://turborepo.dev/docs/core-concepts/package-and-task-graph) - distinction between package graph and task graph.

## Open Items Resolved During Implementation Planning

The exact allowlist values and final Catalog entry set are implementation-time evidence decisions, not unresolved product questions: they must be derived from the current lockfile/manifests and validated with the pinned pnpm version. The plan has no unresolved clarification.
