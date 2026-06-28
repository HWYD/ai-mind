# Plan 031：Spec Kit Governance Baseline

状态：已完成
版本：v0.3.1
日期：2026-06-27

## 实施策略

v0.3.1 只增加文档、模板、规范和工作流，不改变应用运行时代码。

实施顺序：

1. 读取真实仓库结构和 v0.3.0 资料。
2. 创建 constitution。
3. 归档 v0.3.0 released baseline。
4. 创建 v0.3.1 governance spec。
5. 创建 ADR 与 architecture docs。
6. 将 Level C / D 的 clarify、checklist、analyze 质量闸门写入 workflow 和 PR checklist。
7. 创建 PR checklist。
8. 更新 README、版本文档和内部版本资产。
9. 执行最小验证。

## 目标文件

Spec Kit 风格入口：

- `.specify/memory/constitution.md`
- `specs/030-tasklist-agent-hitl-checkpoint-resume/spec.md`
- `specs/030-tasklist-agent-hitl-checkpoint-resume/plan.md`
- `specs/030-tasklist-agent-hitl-checkpoint-resume/tasks.md`
- `specs/030-tasklist-agent-hitl-checkpoint-resume/acceptance.md`
- `specs/030-tasklist-agent-hitl-checkpoint-resume/decisions.md`
- `specs/031-spec-kit-governance-baseline/spec.md`
- `specs/031-spec-kit-governance-baseline/plan.md`
- `specs/031-spec-kit-governance-baseline/tasks.md`
- `specs/031-spec-kit-governance-baseline/acceptance.md`
- `specs/031-spec-kit-governance-baseline/decisions.md`

ADR：

- `docs/adr/README.md`
- `docs/adr/template.md`
- `docs/adr/0001-graphstate-source-of-truth.md`
- `docs/adr/0002-agent-run-business-state-vs-langgraph-checkpoint.md`
- `docs/adr/0003-stream-core-backward-compatibility.md`
- `docs/adr/0004-database-package-boundary.md`
- `docs/adr/0005-review-node-side-effect-boundary.md`

Architecture docs：

- `docs/architecture/ai-coding-workflow.md`
- `docs/architecture/spec-driven-development.md`
- `docs/architecture/tasklist-agent-runtime-boundaries.md`

Version assets：

- `docs/versions/v0.3.1-spec-kit-governance-baseline.md`
- `docs/releases/v0.3.1.md`
- `docs/tasklists/v0.3.1-tasklist.md`

Optional local draft / history assets（仅在需要保留本地草稿或历史记录时使用，不属于正式 AI coding 工作区）：

- `private-folder/plans/plan-2026-06-27-v0.3.1-spec-kit-governance-baseline.md`
- `private-folder/tasklists/plan-2026-06-27-v0.3.1-spec-kit-governance-baseline-tasklist.md`
- `private-folder/releases/release-2026-06-27-v0.3.1.md`

Workflow entry：

- `.github/pull_request_template.md`
- `README.md`
- `docs/README.md`

Optional local workflow config（如本地维护则同步）：

- `private-folder/agent-config/project-agent-config.yaml`

## 职责边界

- `constitution.md`：长期工程原则，约束后续 AI coding。
- `specs/`：面向 Codex / AI coding agent 的版本级执行规格。
- `docs/versions/`：面向用户、release、博客和面试讲解。
- `docs/adr/`：记录不应被后续版本轻易推翻的架构决策。
- `docs/architecture/`：记录当前架构事实和跨版本稳定边界。
- `.github/pull_request_template.md`：把治理规则转化为 review checklist。

## 兼容性

本版本不改变以下内容：

- HTTP API。
- stream chunk schema。
- Prisma schema。
- LangGraph graph。
- GraphState shape。
- AgentRun state transition。
- AgentInterrupt payload。
- frontend reducer。
- deployment topology。

因此不会触发 runtime behavior migration。

## 验证方式

最小验证：

```bash
pnpm --dir apps/webapp typecheck
pnpm --filter @ai-mind/stream-core typecheck
pnpm --filter @ai-mind/database db:validate
git diff --check
```

如果修改 package scripts、workspace 配置、README 命令或依赖相关内容，再执行：

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/webapp build
```

本版本计划只修改版本号与文档入口，不修改依赖、scripts 或 workspace 配置，因此不强制执行 install / build。
