# 决策 031：Spec Kit Governance Baseline

状态：已完成
版本：v0.3.1
日期：2026-06-27

## D031-01：AI Mind 采用 Spec-anchored，而不是 Spec-as-source

Spec 是 AI coding 的执行锚点，不是替代真实代码、测试和 release 资产的唯一事实源。

判断当前事实时仍按仓库规则读取：用户明确指定内容、当前代码和测试、constitution、`specs/`、ADR、architecture docs、README 和公开版本文档。

`private-folder/` 仅在用户明确要求回看草稿、历史过程、个人内部材料或博客 / 面试素材时读取，不再作为默认开发事实源。

## D031-02：Specs 面向 AI Coding Agent

`specs/` 的主要读者是 Codex / AI coding agent 和 reviewer。

它应该写清楚目标、边界、验收、决策和执行顺序，避免 AI 在复杂版本中提前实现后续范围或跨越 Non-goals。

## D031-03：docs/versions 面向用户、Release、博客和面试

`docs/versions/` 保留公开叙事：为什么做、做了什么、不做什么、有什么价值。

它不替代 `specs/` 的执行任务拆分。

## D031-04：ADR 面向长期架构决策

ADR 只记录长期有效、后续版本不应轻易推翻的架构决策。

临时实现细节、一次性任务顺序和普通 bug 修复不需要 ADR。

## D031-05：Architecture Docs 面向当前架构事实

`docs/architecture/` 记录当前项目稳定架构事实和跨版本边界。

如果实现已经改变，architecture docs 必须跟着更新，不能停留在历史计划状态。

## D031-06：Small Change 不强制完整 Spec Kit

文案、样式、README 小修、非核心组件小 bug 不强制创建完整 `spec / plan / tasks`。

这类改动需要说明范围和验证方式，保持 diff 小而清晰。

## D031-07：Cross-boundary Change 必须完整 Spec / Plan / Tasks

涉及 GraphState、stream protocol、Prisma schema、AgentRun status、CheckpointerProvider、API contract、跨 package 改造或 HITL 行为变化时，必须创建或更新完整 spec / plan / tasks。

这类改动还必须检查 constitution，并同步相关 docs / contracts / tests。

## D031-08：Architecture Change 必须新增或更新 ADR

涉及 Agent 边界、数据库职责、runtime 主链路、checkpoint / resume 语义、部署拓扑或新 service 接入时，必须新增或更新 ADR。

架构改动必须最终人工 review。

## D031-09：PR Checklist 是 Spec Drift Gate

`.github/pull_request_template.md` 是治理规则落到日常 review 的入口。

它不替代测试，但必须迫使提交者明确 Change Level、Related Spec、Non-goals、Constitution Check、Spec Drift Check 和 Verification。

## D031-10：Clarify / Checklist / Analyze 只作为 Level C / D 正式闸门

AI Mind 采用 Spec Kit 风格的 clarify、checklist、analyze 质量闸门，但不把它们变成所有任务必跑的固定仪式。

- Level A 不需要执行。
- Level B 仅在 mini spec 存在明显歧义、或影响面可能升级时选择性使用。
- Level C 必须纳入正式流程；Codex skills 可使用 `$speckit-clarify` / `$speckit-checklist` / `$speckit-analyze`，其他 agent 可使用对应 slash command；如果本地没有 Spec Kit tooling，则执行人工等价澄清、质量清单和一致性分析。
- Level D 必须执行或人工等价执行，并进入 PR、ADR review 或最终交付说明。

推荐顺序是：`spec.md` 初稿后 clarify，`acceptance.md` 初稿后 checklist，`tasks.md` 定稿后 analyze，然后再进入实现。
