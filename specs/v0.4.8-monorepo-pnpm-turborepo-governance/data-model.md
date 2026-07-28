# Data Model: Monorepo pnpm and Turborepo Governance

This feature has no database or runtime domain model. The following internal configuration entities describe the repository governance model that implementation and review must keep consistent.

## Entities

### Workspace Package

Represents one package discovered by `pnpm-workspace.yaml`.

| Field          | Meaning                                               |
| -------------- | ----------------------------------------------------- |
| `name`         | Package manifest name, such as `@ai-mind/stream-core` |
| `path`         | Workspace-relative directory                          |
| `kind`         | `app` or `package`                                    |
| `private`      | Whether the package is internal-only                  |
| `dependencies` | Local and external dependency declarations            |
| `scripts`      | Task names exposed to pnpm and Turborepo              |

Current instances: `ai-mind` at `apps/webapp`, `project-assistant-service` at `apps/project-assistant-service`, `@ai-mind/database`, and `@ai-mind/stream-core`.

### Catalog Entry

Represents a dependency version centrally owned by the workspace.

| Field        | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `package`    | npm package name                                                        |
| `range`      | The approved version/range                                              |
| `scope`      | `tooling` or `shared-runtime`                                           |
| `consumers`  | Workspaces using the entry                                              |
| `exceptions` | Workspaces intentionally using a local version                          |
| `rationale`  | Why centralization is safe and useful                                   |
| `owner`      | Person or team responsible for compatibility review and future upgrades |

Catalog entries must not be added solely because a package name appears twice; compatibility and ownership must be reviewed first. Every entry has at least one consumer, compatibility evidence, rationale and an upgrade owner.

### Build Script Approval

Represents pnpm's install-script decision for a dependency.

| Field         | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `package`     | Dependency package matcher                                                     |
| `allowed`     | Explicit boolean; `true` permits the required script, `false` rejects it       |
| `reason`      | Repository-specific security or build rationale                                |
| `evidence`    | Lockfile, install output, or package build requirement supporting the decision |
| `pnpmVersion` | Version against which the decision was validated                               |

No placeholder text is allowed in the serialized policy.

### Task Definition

Represents one task name in `turbo.json`.

| Field        | Meaning                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `task`       | Script name, such as `build`, `typecheck`, `test`, `lint`, `dev`, or `build:watch` |
| `dependsOn`  | Same-package or upstream-package prerequisites                                     |
| `outputs`    | Files/directories that can be restored as task artifacts                           |
| `inputs`     | Files/globs that affect the task hash                                              |
| `cache`      | Whether a completed result may be reused                                           |
| `persistent` | Whether the task is long-running                                                   |
| `env`        | Environment variables that affect task behavior                                    |

Rules: finite build artifacts declare outputs; `dev` and watch tasks are `persistent: true, cache: false`; database state mutation and setup tasks are explicit or uncached.

### Canonical Command

Represents a supported root-level command.

| Field                   | Meaning                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `command`               | Root script name                                                                      |
| `runner`                | Turborepo for ordinary graph tasks, or explicit pnpm/package command for side effects |
| `tasks`                 | Workspace tasks selected by the command                                               |
| `preconditions`         | Required setup, such as PostgreSQL or Prisma generation                               |
| `diagnosticAlternative` | Package-level `pnpm --filter` or `pnpm --dir` command                                 |

## Relationships

```text
Workspace Package --depends on--> Workspace Package
Workspace Package --uses--> Catalog Entry
Dependency --has--> Build Script Approval
Canonical Command --selects--> Task Definition
Task Definition --orders--> Task Definition
Task Definition --produces--> Output Artifact
Canonical Command --requires--> Explicit Side-effect Setup
```

## Invariants

1. Local `@ai-mind/*` dependencies use `workspace:*` or another explicit `workspace:` range.
2. An application may depend on a shared package; a shared package must not depend on an application.
3. Every Catalog entry has at least one real consumer and a documented rationale.
4. Every dependency build script in `allowBuilds` has an explicit boolean and evidence.
5. A task that depends on an upstream package cannot run before the upstream task required for correctness.
6. Persistent or side-effectful tasks are never restored from a reusable cache.
7. Root canonical commands and package diagnostic commands resolve to the same underlying package scripts where both are offered.
