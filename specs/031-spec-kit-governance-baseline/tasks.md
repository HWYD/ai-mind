# 任务 031：Spec Kit Governance Baseline

状态：已完成
版本：v0.3.1
日期：2026-06-27

## P0 治理范围确认

- [x] 检查根目录结构、workspace、README 和已有规范入口。
- [x] 检查 `AGENTS.md`、`.agents/rules/`，以及本地维护的 `project-agent-config.yaml`（如存在）。
- [x] 检查 `docs/`、`private-folder/` 和已有 v0.3.0 版本资产。
- [x] 搜索 `v0.3.0`、`Tasklist Agent HITL`、`Checkpoint Resume`、`AgentRun`、`AgentInterrupt`、`PostgresSaver`、`GraphState`、`Spec Kit`。
- [x] 确认本版本不修改 runtime / Graph / DB schema / stream protocol / API / frontend reducer。

## P1 Constitution

- [x] 创建 `.specify/memory/constitution.md`。
- [x] 写入 Controlled Agent First。
- [x] 写入 GraphState Is Runtime Source of Truth。
- [x] 写入 Review Node Must Be Side-effect Free。
- [x] 写入 Business State and Checkpoint Must Stay Separate。
- [x] 写入 Stream Compatibility Is a Hard Constraint。
- [x] 写入 Public DTO Must Be Strict and Safe。
- [x] 写入 Minimal Abstraction。
- [x] 写入 Tests Before Broad Integration。
- [x] 写入 Spec Drift Must Be Blocked。

## P2 v0.3.0 Baseline Specs

- [x] 创建 `specs/030-tasklist-agent-hitl-checkpoint-resume/spec.md`。
- [x] 创建 `specs/030-tasklist-agent-hitl-checkpoint-resume/plan.md`。
- [x] 创建 `specs/030-tasklist-agent-hitl-checkpoint-resume/tasks.md`。
- [x] 创建 `specs/030-tasklist-agent-hitl-checkpoint-resume/acceptance.md`。
- [x] 创建 `specs/030-tasklist-agent-hitl-checkpoint-resume/decisions.md`。
- [x] 将 v0.3.0 写成 released baseline，而不是待实现计划。
- [x] 明确浏览器级 HITL smoke 需要人工复验，不伪造成本次自动完成。

## P3 v0.3.1 Governance Specs

- [x] 创建 `specs/031-spec-kit-governance-baseline/spec.md`。
- [x] 创建 `specs/031-spec-kit-governance-baseline/plan.md`。
- [x] 创建 `specs/031-spec-kit-governance-baseline/tasks.md`。
- [x] 创建 `specs/031-spec-kit-governance-baseline/acceptance.md`。
- [x] 创建 `specs/031-spec-kit-governance-baseline/decisions.md`。
- [x] 明确本版本是治理版本，不新增业务功能。
- [x] 明确 Non-goals 与不变更 runtime 的边界。

## P4 ADR 与 Architecture Docs

- [x] 创建 `docs/adr/README.md`。
- [x] 创建 `docs/adr/template.md`。
- [x] 创建 ADR-0001 GraphState Source of Truth。
- [x] 创建 ADR-0002 AgentRun Business State vs LangGraph Checkpoint。
- [x] 创建 ADR-0003 Stream-core Backward Compatibility。
- [x] 创建 ADR-0004 Database Package Boundary。
- [x] 创建 ADR-0005 Review Node Side-effect Boundary。
- [x] 创建 `docs/architecture/ai-coding-workflow.md`。
- [x] 创建 `docs/architecture/spec-driven-development.md`。
- [x] 创建 `docs/architecture/tasklist-agent-runtime-boundaries.md`。

## P5 PR Checklist 与 Release Assets

- [x] 创建 `.github/pull_request_template.md`。
- [x] 更新 `README.md` 治理入口。
- [x] 更新 `docs/README.md` 文档导航。
- [x] 更新 package version 至 `0.3.1`。
- [x] 如果本地维护 `project-agent-config.yaml`，同步当前版本与治理路径。
- [x] 创建 `docs/versions/v0.3.1-spec-kit-governance-baseline.md`。
- [x] 创建 `docs/releases/v0.3.1.md`。
- [x] 创建 `docs/tasklists/v0.3.1-tasklist.md`。
- [x] 如需要保留本地草稿或历史记录，创建 private-folder plan / tasklist / release 资产；这些文件不作为正式 AI coding 工作区。
- [x] 如需要保留本地架构推演，创建 private-folder architecture note。

## P6 验证与最终 Review

- [x] 执行 `pnpm --dir apps/webapp typecheck`。
- [x] 执行 `pnpm --filter @ai-mind/stream-core typecheck`。
- [x] 执行 `pnpm --filter @ai-mind/database db:validate`。
- [x] 执行 `git diff --check`。
- [x] 检查 diff 未修改 runtime / Graph / DB schema / stream protocol / API / frontend reducer。
- [x] 最终报告列出 created / updated / verification / deferred。
