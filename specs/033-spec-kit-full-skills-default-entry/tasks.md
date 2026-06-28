# 任务 033：Spec Kit Full Skills Default Entry

状态：已完成
版本：v0.3.3
日期：2026-06-28

## P0 真实仓库审计

- [x] 读取 `AGENTS.md`、constitution、v0.3.2 specs、ADR-0006 和 architecture docs。
- [x] 确认 `.agents/skills/` 当前只包含 `ai-mind-step-audit` 和三枚 lightweight `speckit-*` pilot skills。
- [x] 确认 official full `speckit-*` skills 尚未入仓。
- [x] 确认 `.specify/` 当前只有 hand-written constitution。
- [x] 确认 package version 当前为 `0.3.2`。
- [x] 确认本版本不修改 runtime / Graph / DB schema / stream protocol / API / frontend reducer。

## P1 v0.3.3 Spec Assets

- [x] 创建 `specs/033-spec-kit-full-skills-default-entry/spec.md`。
- [x] 创建 `specs/033-spec-kit-full-skills-default-entry/plan.md`。
- [x] 创建 `specs/033-spec-kit-full-skills-default-entry/acceptance.md`。
- [x] 创建 `specs/033-spec-kit-full-skills-default-entry/decisions.md`。
- [x] 创建 `specs/033-spec-kit-full-skills-default-entry/tasks.md`。

## P2 Spec Kit Gates

- [x] 执行 clarify gate，确认目标、非目标、命名空间和人工决策已清楚。
- [x] 执行 checklist gate，确认 acceptance 可验收且没有隐性 runtime 改动。
- [x] 执行 analyze gate，确认 spec / plan / tasks / acceptance / decisions 一致。

## P3 Pilot Skills 审计与规则迁移

- [x] 审计 `.agents/skills/speckit-clarify/SKILL.md`。
- [x] 审计 `.agents/skills/speckit-checklist/SKILL.md`。
- [x] 审计 `.agents/skills/speckit-analyze/SKILL.md`。
- [x] 将有价值的 AI Mind 规则迁移到 constitution / architecture docs / AGENTS / ADR。
- [x] 确认没有需要保留为 `ai-mind-*` 的专属 skill；如果需要，先记录理由再改名。

## P4 Official Full Skills 接入

- [x] 确认 official Spec Kit source、version 或 release tag。
- [x] 在隔离位置生成或获取 official full skills。
- [x] review official generated files。
- [x] 将 official `speckit-*` skills 合并到 `.agents/skills/`。
- [x] 同步 official skills 依赖的 `.specify/scripts`、`.specify/templates`、`.specify/integrations`、agent-context extension 和 `.specify/init-options.json`。
- [x] 确认 official skills 未被直接魔改。
- [x] 从 `.agents/skills/` 移除旧 lightweight pilot `speckit-*` skills。
- [x] 将 `.specify/feature.json` 明确为本地当前 feature 指针并加入 `.gitignore`。

## P5 ADR 与 Architecture Docs

- [x] 新增 `docs/adr/0007-official-spec-kit-full-skills-default-entry.md`。
- [x] 更新 `docs/adr/README.md`。
- [x] 更新 `.specify/memory/constitution.md`。
- [x] 更新 `docs/architecture/spec-kit-tooling.md`。
- [x] 更新 `docs/architecture/ai-coding-workflow.md`。
- [x] 更新 `docs/architecture/spec-driven-development.md`。
- [x] 更新 `AGENTS.md`。
- [x] 更新 `specs/README.md`。

## P6 Release Assets

- [x] 创建 `docs/versions/v0.3.3-spec-kit-full-skills-default-entry.md`。
- [x] 创建 `docs/releases/v0.3.3.md`。
- [x] 创建 `docs/tasklists/v0.3.3-tasklist.md`。
- [x] 评估是否需要 private-folder 草稿资产；本版本不创建，继续以 `specs/033...` 为正式工作区。
- [x] 更新 `README.md` 当前版本与治理入口。
- [x] 按项目惯例更新 package version 至 `0.3.3`。

## P7 Verification and Converge

- [x] 验证新 Codex 会话可发现 official `speckit-*` skills，或记录为人工补验项；当前会话已可发现 official full skills，新会话完整触发建议人工补验。
- [x] 验证 `$speckit-specify`、`$speckit-plan`、`$speckit-tasks`、`$speckit-analyze`、`$speckit-converge` 可触发，或记录为人工补验项；本次已使用 `$speckit-converge` 做收口，其他触发保留人工补验记录。
- [x] 执行 converge 或人工等价收口检查；official prerequisites 在显式 `SPECIFY_FEATURE_DIRECTORY` 下可运行，人工等价检查未发现需追加的新任务。
- [x] 执行 `git diff --check`。
- [x] 检查 diff 未修改 runtime / Graph / DB schema / stream protocol / API / frontend reducer。
- [x] 如果修改 package version，评估并执行必要的 workspace 验证；`pnpm install --frozen-lockfile` 通过。
- [x] 最终报告列出 created / updated / verification / deferred。
