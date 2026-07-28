# Monorepo Governance Checklist: pnpm and Turborepo

**Purpose**: 检查 048 的 pnpm、workspace、Catalog、Turborepo、CI/Docker 和兼容性需求是否完整、清晰、一致且可客观验收。
**Created**: 2026-07-17
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md)

**Audience**: 作者与 PR Reviewer
**Depth**: Standard
**Focus**: Reproducible installation, task orchestration, CI/Docker governance, regression boundaries

**Note**: 本清单是需求文档的“英文单元测试”，检查需求质量，不替代实现测试或运行验证。

## Requirement Completeness

- [x] CHK001 - 是否明确规定 root metadata、CI 和 Docker 必须使用同一个精确 pnpm 版本，以及 Node.js 主版本约束？ [Completeness, Spec §FR-048-001]
- [x] CHK002 - 是否明确规定哪些安装路径必须使用现有共享 lockfile 和 frozen-lockfile，且不得隐式改写 lockfile？ [Completeness, Spec §FR-048-002, SC-048-001]
- [x] CHK003 - 是否同时定义了内部依赖的 `workspace:` 规则和本地 workspace 包缺失时的失败行为？ [Completeness, Spec §FR-048-003]
- [x] CHK004 - 是否要求 `allowBuilds` 对每个依赖脚本给出显式允许/拒绝值，并记录批准理由和证据？ [Completeness, Spec §FR-048-004, SC-048-005]
- [x] CHK005 - 是否完整区分了 Catalog 中必须集中管理的公共工具、可选择集中的运行时依赖，以及明确不集中的应用专属依赖？ [Completeness, Spec §FR-048-005]
- [x] CHK006 - 是否覆盖了 `build`、`typecheck`、`test`、`lint`、`dev` 和 package watch 全部任务类别？ [Completeness, Spec §FR-048-006]
- [x] CHK007 - 是否同时定义了 root canonical commands、package-level commands 和 `pnpm --filter` 诊断入口的职责边界？ [Completeness, Spec §FR-048-009, FR-048-013]
- [x] CHK008 - 是否明确区分了 CI 中可进入 Turbo task graph 的普通检查与必须显式、有序执行的数据库/runtime side effects？ [Completeness, Spec §FR-048-014]

## Requirement Clarity

- [x] CHK009 - “pnpm 10 后期版本”是否与计划中的 `pnpm@10.34.0` 唯一版本决策保持一致，避免实现者重新选择版本？ [Clarity, Spec §FR-048-001, Assumptions]
- [x] CHK010 - `pnpm dev` 是否明确规定启动哪些 workspace、是否包含 PAS、如何使用 `ai-mind...` filter，以及 `dev:webapp`/`dev:pas` 的独立职责？ [Clarity, Spec §FR-048-006, FR-048-009]
- [x] CHK011 - 是否明确规定不同任务的 `outputs`、`inputs`、环境变量、cache 开关和 `persistent` 语义，而不是只要求“配置缓存”？ [Clarity, Spec §FR-048-008]
- [x] CHK012 - “按 workspace 和 task 识别失败”是否明确到 CI 与本地输出需要包含的最小标识字段？ [Clarity, Spec §FR-048-010]
- [x] CHK013 - “应用可依赖 shared package、shared package 不得依赖应用”是否明确适用于当前四个 workspace 及未来新增 workspace？ [Clarity, Spec §FR-048-011]
- [x] CHK014 - “applicable workspace tasks”是否定义了 workspace 没有某个 script 时的跳过、报告或失败规则？ [Clarity, Spec §FR-048-006, User Story 3 Acceptance Scenario 3]

## Requirement Consistency

- [x] CHK015 - pnpm 版本、Catalog 范围、Turbo canonical ownership 和 deferred optimization 是否在 `spec.md`、`plan.md`、`tasks.md` 中使用同一术语和同一决策？ [Consistency, Spec §Clarifications, Plan §Summary]
- [x] CHK016 - CI 使用本地同一 Turbo graph 的要求，是否与数据库迁移、Prisma generate、checkpoint setup 显式执行的要求相互一致？ [Consistency, Spec §FR-048-014]
- [x] CHK017 - root command 保持向后兼容的要求，是否与将 root `build`/`typecheck`/`test`/`lint` 改为 `turbo run` 的范围边界一致？ [Consistency, Spec §FR-048-009, Plan §Implementation Strategy]
- [x] CHK018 - “不改变用户可见行为”和必须执行 chat、Tool、Tasklist、Delivery smoke checks 是否形成明确的回归边界，而不是互相替代？ [Consistency, Spec §FR-048-012, Non-goals]
- [x] CHK019 - `@types/node@22.20.1` 等共享依赖是否与“集中共享依赖版本”的要求保持一致，并对仍保留的应用级例外说明所有权？ [Consistency, Spec §FR-048-005, Assumptions]

## Acceptance Criteria Quality

- [x] CHK020 - clean install 的成功条件是否包含精确 pnpm 版本、冻结安装成功、lockfile 无变化和内部依赖本地解析四个可观察结果？ [Acceptance Criteria, Spec §SC-048-001]
- [x] CHK021 - root build/typecheck/test/lint 的验收是否明确要求所有适用 workspace 进入同一份文档化任务图？ [Acceptance Criteria, Spec §SC-048-002]
- [x] CHK022 - stream-core 受控变更的验收是否明确要求 shared package task 先于 Webapp validation，而不是只检查 Turbo 配置文件存在？ [Acceptance Criteria, Spec §SC-048-003]
- [x] CHK023 - package-level command 兼容性的验收范围是否列出了 Webapp、database、stream-core 和 PAS 的具体命令来源？ [Acceptance Criteria, Spec §SC-048-004, SC-048-007]
- [x] CHK024 - `allowBuilds` 验收是否能客观判断“无占位值”和“每个批准项有仓库理由”？ [Measurability, Spec §SC-048-005]
- [x] CHK025 - 文档验收是否明确要求一个完整示例同时解释 workspace resolution、task ordering 和 pnpm/Turbo ownership？ [Acceptance Criteria, Spec §SC-048-006]
- [x] CHK026 - 回归验收是否明确区分 database generate/validate、stream-core build、PAS build/typecheck/test 和 Webapp 检查，而非笼统要求“回归通过”？ [Measurability, Spec §SC-048-007]

## Scenario Coverage

- [x] CHK027 - 是否分别描述了正常安装、内部包解析、依赖脚本审批和本地包缺失四类 primary/alternate/exception 场景？ [Coverage, Spec §User Story 1, Edge Cases]
- [x] CHK028 - 是否明确规定共享包源码变更但构建产物未生成时，不得命中旧任务结果？ [Coverage, Spec §Edge Cases, FR-048-008]
- [x] CHK029 - 是否明确规定环境变量、生成文件、数据库初始化状态变化时的缓存失效或显式执行边界？ [Coverage, Spec §Edge Cases, FR-048-008, FR-048-014]
- [x] CHK030 - 是否定义了并行任务中一个 workspace 失败时，其余输出、最终失败状态和定位信息的要求？ [Coverage, Spec §Edge Cases, FR-048-010]
- [x] CHK031 - 是否明确规定 root task 名称与 package script 名称不一致时的唯一映射规则？ [Coverage, Spec §Edge Cases, FR-048-006, FR-048-013]

## Edge Case Coverage

- [x] CHK032 - pnpm 版本或 lockfile 不兼容时，需求是否定义 fail-fast、lockfile 修改审批和恢复边界？ [Edge Case, Spec §Edge Cases, SC-048-001]
- [x] CHK033 - 未决或未批准 dependency build script 出现时，需求是否明确 fail closed、审计输出和禁止绕过的行为？ [Edge Case, Spec §Edge Cases, FR-048-004]
- [x] CHK034 - 数据库迁移、Prisma generate 或 checkpoint setup 失败后的重试、清理、回滚或明确 out-of-scope 边界是否被写清楚？ [Gap, Edge Case, Spec §FR-048-014, Non-goals]
- [x] CHK035 - Docker 构建阶段发生 pnpm 安装或 workspace build 失败时，需求是否定义与 CI 一致的版本和错误可见性要求？ [Edge Case, Spec §FR-048-001, FR-048-002]
- [x] CHK036 - 临时受控变更和负向 workspace 验证是否明确要求在 disposable worktree/临时环境中进行，避免污染提交结果？ [Recovery, Spec §SC-048-003, Quickstart]

## Non-Functional Requirements

- [x] CHK037 - 任务并行化是否有明确目标或明确声明本阶段不设置 wall-clock 性能指标，避免“更快”成为不可验收承诺？ [Clarity, Plan §Performance Goals]
- [x] CHK038 - `allowBuilds` 的安全边界是否明确禁止为方便安装而进行全量批准，并要求每个批准项有最小权限理由？ [Security, Spec §FR-048-004, SC-048-005]
- [x] CHK039 - 本地 Windows、GitHub Actions Ubuntu 和 Node.js 22 Docker 三种环境的兼容性要求是否被统一描述？ [Coverage, Plan §Technical Context]
- [x] CHK040 - 任务缓存是否明确区分纯构建产物、长驻进程、生成文件和数据库状态，避免把副作用当作可复用结果？ [Security/Consistency, Spec §FR-048-008, FR-048-014]

## Dependencies & Assumptions

- [x] CHK041 - 当前四个 workspace、单 lockfile 和 `apps/*`/`packages/*` glob 是否被明确列为本阶段范围及规模假设？ [Assumption, Spec §Assumptions, Plan §Scale/Scope]
- [x] CHK042 - Catalog 中每个集中版本是否要求至少一个真实消费者、兼容性依据和升级责任人/所有权？ [Dependency, Spec §FR-048-005, Data Model §Catalog Entry]
- [x] CHK043 - Turbo task graph 对 package scripts 的依赖是否明确要求先盘点现有 script，再定义 task，而不是引入新的业务抽象？ [Dependency, Plan §Implementation Strategy, Constitution §7]
- [x] CHK044 - CI/Docker 版本对齐是否明确依赖 Corepack、pnpm 10.34.0、现有 lockfile 和 Node.js 22，而不隐含 pnpm 11 或 pnpm deploy 迁移？ [Assumption, Spec §Non-goals, Plan §Constraints]

## Ambiguities & Conflicts

- [x] CHK045 - 是否仍存在“最新 pnpm 10 后期版本”与“固定 `10.34.0`”两种版本权威来源？ [Ambiguity, Spec §FR-048-001, Plan §Technical Context]
- [x] CHK046 - 是否明确 `database` 的 `build`/`build:watch` 与 Prisma generate 的缓存语义，避免 package build task 和显式数据库步骤产生冲突？ [Conflict, Spec §FR-048-008, Plan §Phase 1]
- [x] CHK047 - 是否明确 `--affected`、远程缓存、Changesets、pnpm deploy、Nx 和大规模 package extraction 均不属于本次验收？ [Boundary, Spec §Non-goals]

## Notes

## Resolution Summary

- CHK001-CHK047 已逐项处理；本 checklist 的目标是需求质量检查，不代表实现任务已完成。
- 已补充精确 `pnpm@10.34.0` 版本权威、lockfile fail-fast 与恢复边界、workspace/task 失败标识、当前及未来 workspace 分层边界。
- 已明确数据库 Prisma generate、migration、checkpoint setup 的副作用与缓存边界，以及生产恢复/回滚由 deployment runbook 负责。
- 已为 Catalog Entry 增加兼容性审查和升级负责人字段。

- Check items off as requirements are clarified: `[x]`
- Add findings or decisions inline rather than silently changing the scope.
- This checklist validates requirement quality; implementation verification belongs in `quickstart.md` and `tasks.md`.
