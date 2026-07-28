# Feature Specification: Monorepo pnpm and Turborepo Governance

**Feature Branch**: `[v0.4.8-monorepo-pnpm-turborepo-governance]`

**Created**: 2026-07-16

**Status**: Implemented

**Input**: User description: "基于主流 Monorepo 实践，采用方案 A，先完成 pnpm 治理和 Turborepo 任务图两个阶段，提升 AI Mind 的 Monorepo、pnpm 和面试展示能力。"

## Clarifications

### Session 2026-07-16

- Q: 根目录任务命令由谁负责？ → A: 根目录使用 Turborepo 作为标准任务入口；现有 `pnpm --filter` 命令保留为 package-level 调试和故障定位入口。
- Q: pnpm Catalog 覆盖哪些依赖？ → B: 集中公共工具链，并选择性集中跨多个 workspace 共享且需要一致版本的运行时依赖；不强行集中只被单个应用使用的依赖。
- Q: CI 是否迁移到 Turborepo？ → A: CI 的普通 lint、typecheck、test、build 任务与本地使用同一套 Turborepo 任务图；数据库迁移、Prisma generate、checkpoint setup 等有副作用步骤继续显式执行；`--affected` 与远程缓存延期处理。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reproducible Workspace Installation (Priority: P1)

维护者希望所有开发者、CI 和容器构建使用一致的 Node.js 与 pnpm 版本，并以同一份 lockfile 安装完全一致的 workspace 依赖。

**Why this priority**: 依赖可复现是 Monorepo 其他工程化能力的基础；如果本地、CI 和 Docker 使用不同的包管理器行为，任务图和构建结果都不可靠。

**Independent Test**: 在干净环境中执行冻结 lockfile 安装，验证本地、CI 和 Docker 使用同一 pnpm 10 后期版本，并且 workspace 依赖只解析到声明的本地包或 lockfile 版本。

**Acceptance Scenarios**:

1. **Given** 根目录、CI 和 Docker 都声明了项目要求的 Node.js 与 pnpm 版本，**When** 维护者执行依赖安装，**Then** 三种环境使用兼容且一致的 pnpm 10 后期版本。
2. **Given** workspace 中存在本地包依赖，**When** 依赖被安装或打包，**Then** 本地包必须遵循显式 workspace protocol，不得静默解析到 registry 中的同名包。
3. **Given** 依赖包含 install/build scripts，**When** 执行冻结安装，**Then** 只有经过明确审核的依赖脚本可以执行，未审核脚本必须被阻止或明确报告。

---

### User Story 2 - Dependency-aware Workspace Tasks (Priority: P1)

开发者希望从根目录使用统一命令执行 build、typecheck、test、lint 和开发任务，并让任务按照 workspace 依赖关系执行。

**Why this priority**: 当前项目已有多个 app/package 和手工 filter 命令；任务图是从“多包目录”升级为可解释 Monorepo 的核心能力。

**Independent Test**: 修改共享流协议包后，从根目录执行构建与类型检查，验证共享包先完成必要任务，依赖它的 Webapp 随后得到验证；无依赖的任务可以并行执行。

**Acceptance Scenarios**:

1. **Given** workspace 包之间存在依赖关系，**When** 从根目录执行构建，**Then**任务执行顺序必须遵循依赖关系，不能依赖开发者手工记忆命令顺序。
2. **Given** 多个 workspace 都提供同名检查脚本，**When** 开发者执行根目录检查命令，**Then** 系统按统一任务定义执行对应 workspace 的任务，并返回可定位的失败结果。
3. **Given** 开发任务是长驻进程，**When** 开发者启动根目录开发命令，**Then** 该任务不得被当作可恢复的构建缓存，并且退出行为保持可控。

---

### User Story 3 - Preserve Existing Project Workflows (Priority: P1)

开发者希望 Monorepo 治理改造不改变现有聊天、Agent、数据库、MCP Service 和发布流程的产品行为。

**Why this priority**: 本次是工程基础设施改造，不应借机扩大 Runtime、数据库、协议或部署范围。

**Independent Test**: 完成治理改造后执行现有 package-level 测试、类型检查、Webapp 构建和 Project Assistant Service 构建，确认行为与改造前一致。

**Acceptance Scenarios**:

1. **Given** 现有 workspace package scripts 仍可单独执行，**When** 开发者通过 package 目录或 pnpm filter 执行它们，**Then** 原有调试入口继续可用。
2. **Given** Webapp、数据库、stream-core 和 Project Assistant Service 的业务代码未发生变更，**When** 完成 Monorepo 任务治理，**Then** 不应产生用户可见业务行为变化。
3. **Given** 某个 workspace 没有某类任务脚本，**When** 执行全 workspace 任务，**Then** 系统应按明确规则跳过或报告该 workspace，而不是产生静默误判。

### Edge Cases

- pnpm 10 后期版本与现有 lockfile 不兼容时，安装必须在修改 lockfile 前明确失败；恢复边界是还原现有 lockfile 和依赖状态，不自动执行依赖解析或版本升级。
- `allowBuilds` 中出现未决的依赖脚本时，安装必须 fail closed 或输出可审计的失败信息。
- 共享包源码发生变化但没有生成构建产物时，依赖它的应用不得错误命中旧任务结果。
- 任务读取的环境变量、生成文件或数据库初始化状态发生变化时，不得复用不适用的缓存结果。
- 多个 workspace 同时运行任务时，一个任务失败不得隐藏其他 workspace 的失败原因。
- 根目录任务与 package-level 任务名称不一致时，必须在文档和脚本中定义唯一的调用方式。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-048-001**: System MUST pin one exact pnpm 10 late-series version in the root project metadata, CI setup and Docker build environment; pnpm 11 migration is not part of this feature.
- **FR-048-002**: System MUST use the existing shared workspace lockfile and frozen-lockfile installation in CI and reproducible build paths.
- **FR-048-003**: System MUST use explicit workspace protocol for internal package dependencies and MUST fail when an expected local workspace package is unavailable.
- **FR-048-004**: System MUST replace placeholder build-script permissions with an explicit allowlist of approved or rejected dependency scripts compatible with the selected pnpm version.
- **FR-048-005**: System MUST define a centralized dependency-version policy for common workspace tooling and selected cross-workspace runtime dependencies, and MUST document which dependencies are intentionally not centralized.
- **FR-048-006**: System MUST define a workspace task graph for build, typecheck, test, lint, dev and package watch tasks.
- **FR-048-007**: System MUST declare dependency-aware ordering for tasks whose correctness depends on upstream workspace packages.
- **FR-048-008**: System MUST declare outputs and cache behavior for finite tasks, and MUST disable caching for long-running development or side-effect tasks.
- **FR-048-009**: System MUST expose Turborepo-based root-level canonical commands while preserving existing package-level and pnpm filter commands as supported diagnostic entry points.
- **FR-048-010**: System MUST make failures identifiable by workspace and task, including failures from parallel execution; local and CI output MUST expose at least the workspace name and task name for each failed task.
- **FR-048-011**: System MUST preserve current and future package boundaries: applications may depend on shared packages, while shared packages must not depend on applications.
- **FR-048-012**: System MUST verify ordinary chat, tool-assisted chat, Tasklist, Delivery, database package generation, stream-core build and Project Assistant Service build after the governance changes.
- **FR-048-013**: System MUST document the workspace dependency graph, canonical commands, package-level commands and the distinction between pnpm dependency management and task orchestration.
- **FR-048-014**: CI MUST use the same Turborepo task graph as local canonical commands for ordinary lint, typecheck, test and build validation, while side-effectful database and runtime setup steps remain explicit and ordered outside the task graph.

### Non-goals

- CI affected-only execution and remote task cache are deferred to a later phase.
- Changesets, npm publishing and package release automation are deferred to a later phase.
- Docker production image slimming and pnpm deploy are deferred to a later phase.
- Nx migration, large-scale package extraction and business Runtime refactoring are out of scope.
- No changes to stream protocol, database schema, API contracts, Agent behavior or user-visible product functionality are included.
- Recovery/rollback orchestration for production database migrations or checkpoint setup failures is owned by deployment runbooks; this feature only governs explicit ordering, uncached execution and auditable failure handling.

### Key Entities _(include if feature involves data)_

- **Workspace Package**: An application or shared package discovered from the root workspace configuration, with a package manifest, scripts and dependency relationships.
- **Task Graph**: The dependency-aware set of workspace tasks and their execution order, including task inputs, outputs and cache policy.
- **Dependency Version Policy**: The centralized rules for shared dependency versions, exceptions and upgrade ownership.
- **Canonical Command**: A root-level command intended for normal development and CI use, distinct from package-level diagnostic commands.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-048-001**: A clean CI-style installation completes successfully with the exact pinned `pnpm@10.34.0` version and frozen lockfile, without modifying the lockfile.
- **SC-048-002**: Root-level build, typecheck, test and lint commands execute all applicable workspace tasks through one documented task graph.
- **SC-048-003**: A controlled change to `@ai-mind/stream-core` causes the dependent Webapp validation path to run after the shared package task, without manual command ordering.
- **SC-048-004**: All existing package-level validation commands listed in the repository documentation remain executable after the migration.
- **SC-048-005**: The selected dependency-script policy contains no placeholder values and every approved build script has an explicit repository rationale.
- **SC-048-006**: The repository documents at least one complete example explaining workspace dependency resolution, task dependency ordering and the boundary between pnpm and the task runner.
- **SC-048-007**: Targeted regression validation passes for Webapp, stream-core, database generation/validation and Project Assistant Service build/typecheck/test paths.

## Assumptions

- The feature targets the current four-workspace repository shape and does not optimize for hundreds of packages.
- The selected pnpm version is the exact `pnpm@10.34.0` pin agreed during planning and is the sole version authority for root metadata, CI and Docker; this is not a pnpm 11 migration.
- The existing single lockfile remains the source of dependency reproducibility.
- The current CI and Docker workflows remain in scope for version alignment, but their affected execution and production artifact strategy remain deferred.
- The root task runner configuration should be introduced incrementally without removing package-level scripts.
- Dependency centralization applies only where one version is safe across consumers; `@types/node@22.20.1` is centralized after focused Webapp compatibility validation, while unrelated application-only dependencies remain local.

## Clarifications Needed

- No unresolved clarification remains.
