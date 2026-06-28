# Spec-driven Development

## 摘要

AI Mind 采用 Spec Kit 风格的规格驱动开发，但执行方式是 spec-anchored，而不是 spec-as-source。

意思是：spec 是 Codex / AI coding 的执行锚点，帮助控制目标、范围、验收和决策；真实事实仍然需要结合当前代码、测试、版本资产、release note 和 ADR 判断。

## 信息架构

```text
.specify/memory/constitution.md
  -> 长期工程原则

specs/<version-topic>/
  -> 面向 AI coding agent 的执行规格

docs/adr/
  -> 长期架构决策

docs/architecture/
  -> 当前架构事实和跨版本边界

docs/versions/
  -> 面向用户、release、博客和面试的版本说明

private-folder/
  -> 草稿、历史过程、个人内部材料和长文推演；默认不是正式开发事实源
```

## 一个复杂版本应该包含什么

复杂版本应至少创建或更新：

- `spec.md`：目标、用户行为、系统行为、Non-goals、contract、成功标准。
- `plan.md`：实施策略、真实路径、职责边界、兼容性、验证方式。
- `tasks.md`：阶段拆分、checkbox、执行顺序和暂停点。
- `acceptance.md`：验收标准、验证项、需要人工补验的边界。
- `decisions.md`：关键取舍和后续版本不应误改的决定。

如果是架构改动，还必须新增或更新 ADR。

## Small Change 不强制完整模板

Level A 小改不需要创建完整 `specs/` 目录。

但仍需要在最终说明或 PR 中写清楚：

- 改了什么。
- 没改什么。
- 怎么验证。

这样可以避免流程压垮小改，同时保留复杂变更所需的边界治理。

## Mini Spec

Level B module change 可以使用 mini spec。

mini spec 可以写在 PR、任务描述、相关 issue 或现有 spec 的短章节中，至少说明：

- 目标。
- 影响文件或模块。
- Non-goals。
- 验证方式。

如果执行中发现影响面扩大到 GraphState、stream protocol、Prisma schema、API contract 或 HITL 行为，必须升级为 Level C。

## Full Spec

Level C / D 必须使用完整 spec。

完整 spec 的作用：

- 限定 AI coding 的工作范围。
- 防止提前实现后续版本。
- 防止 runtime、DB、stream、frontend 同时无边界扩张。
- 把验收条件前置。
- 让后续 reviewer 能检查 spec drift。

完整流程建议：

1. 写 `spec.md`，明确目标、用户行为、系统行为、Non-goals 和成功标准。
2. 对 Level C / D 执行 Spec Kit clarify gate（Codex skills 为 `$speckit-clarify`，其他 agent 可用对应 slash command）或人工等价澄清，再进入 `plan.md`。
3. 写 `plan.md`，说明真实路径、职责边界、兼容性和验证策略。
4. 写 `acceptance.md`，把验收条件拆成可检查条目。
5. 对 Level C / D 执行 Spec Kit checklist gate（Codex skills 为 `$speckit-checklist`）或人工等价质量清单，检查需求是否完整、可验收、没有把 Non-goals 写成隐性任务。
6. 写 `tasks.md`，把实现拆成有顺序、有暂停点、可验证的任务。
7. 对 Level C / D 执行 Spec Kit analyze gate（Codex skills 为 `$speckit-analyze`）或人工等价一致性分析，确认 spec / plan / tasks / acceptance / decisions 没有冲突或遗漏。
8. 进入实现，并只实现当前 task。

Level A 不走完整流程。Level B 默认使用 mini spec；只有发现边界不清、影响面扩大或可能升级为 Level C 时，才选择性使用 clarify / checklist / analyze。

v0.3.2 开始，AI Mind 将官方 Spec Kit CLI 与 Codex skills 作为双轨 pilot。CLI、skills 和人工等价三种路径的职责见 [Spec Kit Tooling](./spec-kit-tooling.md)。

## Spec Drift

Spec drift 指实现和规格资产发生偏离。

常见形式：

- 代码改了 API contract，但 spec / docs 没改。
- stream protocol 新增字段，但 stream-core tests 或 reducer tests 没改。
- GraphState shape 改了，但 architecture docs 和 baseline spec 没改。
- Prisma schema 改了，但 migration、database docs、integration tests 没改。
- 实现触碰了 Non-goals。
- ADR 决策被实际代码绕过。

处理原则：

- 如果实现错了，修实现。
- 如果 spec 已过时，在同一变更中更新 spec / docs / ADR。
- 不允许留下两套互相竞争的事实。

## private-folder 的位置

`private-folder/` 可以继续保留，但它不再是正式 AI coding 工作区。

推荐使用方式：

- 保存早期想法、长文推演、博客素材、面试复盘和历史过程。
- 用户明确要求回看历史时再读取。
- 如果和 `specs/`、代码测试、ADR 或 architecture docs 冲突，以正式工作区为准。
- 从 `private-folder/` 整理到公开 docs 时，必须做公开化清理。

## 版本收口

版本收口时至少检查：

- `specs/<version-topic>/` 是否反映真实实现。
- `docs/versions/` 是否适合对外讲解。
- `docs/releases/` 是否说明已完成能力和已知边界。
- `docs/tasklists/` 是否保留公开版任务进度。
- ADR 和 architecture docs 是否覆盖长期决策。
- README 是否需要同步当前版本和 Roadmap。
