# Data Model: Monorepo Boundary and CI Validation Governance

This feature adds no application database schema. Its model is the repository governance graph evaluated by local commands and CI.

## WorkspaceIdentity

| Field     | Meaning                                | Validation                                                   |
| --------- | -------------------------------------- | ------------------------------------------------------------ |
| `name`    | Root or workspace package name         | unique; root/workspaces use `@ai-mind/*`                     |
| `path`    | repository-relative manifest directory | must be discovered from `pnpm-workspace.yaml` or be the root |
| `kind`    | `root`, `app`, or `package`            | derived from root/apps/packages location                     |
| `private` | publishability marker                  | must be `true` for this internal repository                  |
| `exports` | publicly allowed package entry points  | used only for package source import validation               |

**Relationships**: a workspace owns zero or more `DependencyEdge`, `ImportEdge`, and `TestLane` assignments.

## DependencyEdge

| Field       | Meaning                                      | Validation                                  |
| ----------- | -------------------------------------------- | ------------------------------------------- |
| `source`    | declaring workspace                          | must resolve to a `WorkspaceIdentity`       |
| `target`    | referenced internal workspace                | must exist locally                          |
| `field`     | manifest dependency field                    | dependencies/dev/optional/peer are examined |
| `range`     | declared dependency range                    | internal targets require `workspace:`       |
| `direction` | `app-to-package`, `package-to-package`, etc. | only the first two are allowed              |

**Relationships**: edges form the workspace dependency graph. A depth-first traversal must find no cycle.

## ImportEdge

| Field             | Meaning                                             | Validation                                     |
| ----------------- | --------------------------------------------------- | ---------------------------------------------- |
| `sourceFile`      | file containing the static module specifier         | production and test files are both in scope    |
| `sourceWorkspace` | workspace owning the source file                    | must be a discovered workspace                 |
| `specifier`       | literal import/export/require/dynamic-import string | non-literal forms fail closed                  |
| `targetWorkspace` | resolved target when internal                       | must be accessed through a declared dependency |
| `targetEntry`     | root or subpath package export                      | must occur in target `exports`                 |
| `context`         | `production` or `test`                              | does not relax policy                          |

**Validation states**:

- `allowed`: package name/subpath is declared through `workspace:` and publicly exported.
- `forbidden-relative-cross-workspace`: a relative import resolves under another workspace root.
- `forbidden-undeclared-or-private`: no dependency exists or the subpath is not exported.
- `unsupported`: source syntax or package export form cannot be statically validated; fail closed.

## TestLane

| Field              | Stable                       | Stateful integration                      | External                        |
| ------------------ | ---------------------------- | ----------------------------------------- | ------------------------------- |
| task               | `test:stable`                | `test:integration`                        | `test:external`                 |
| selection          | no integration/external file | `*.integration.test.*`                    | explicit cloud/live smoke files |
| state              | none                         | disposable PostgreSQL plus explicit setup | real service/credentials        |
| Turbo cache        | enabled                      | disabled                                  | disabled                        |
| normal root `test` | included                     | included after stable                     | excluded                        |
| PR CI              | included                     | included after stable job                 | excluded                        |
| opt-in             | none                         | database setup                            | explicit manual external gate   |

Each test file belongs to exactly one lane. An ambiguous or unclassified file is a governance failure during implementation review/configuration validation.

## CIJob

| Field                   | `stable-validation`                             | `stateful-integration`            | `docker`                    |
| ----------------------- | ----------------------------------------------- | --------------------------------- | --------------------------- |
| dependency              | none                                            | `needs: stable-validation`        | none                        |
| PostgreSQL service      | absent                                          | present                           | absent                      |
| database initialization | absent                                          | Prisma/migration/checkpoint setup | absent                      |
| validation              | boundaries, lint, typecheck, stable test, build | integration test                  | existing image build checks |
| dependency cache        | pnpm store                                      | pnpm store                        | existing Docker cache       |

**Key invariant**: `stateful-integration` is not scheduled when `stable-validation` fails; therefore static/stable failure has zero stateful initialization executions.
