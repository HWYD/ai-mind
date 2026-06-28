# AI Coding Workflow

## 摘要

AI Mind 使用 spec-anchored workflow 管理 Codex 和其他 AI coding agent 的代码变更。

这套流程的目的不是让每个小改都变重，而是在跨边界、跨 package、涉及 Agent / Graph / DB / Stream / API 的改动中，先把边界说清楚，再让 AI 执行。

修改代码前，先判断 Change Level。

v0.3.3 起，official Spec Kit full skills 是 Level C / D 的默认执行入口。`speckit-*` 命名空间代表 official generated / vendored skills；AI Mind 项目约束通过 constitution、specs、ADR、architecture docs、template overrides 和 AGENTS 注入。

## Level A：Small Change

适用范围：

- 文案。
- 样式。
- README 小修。
- 非核心组件小 bug。
- 局部文档纠错。

要求：

- 不需要完整 spec。
- 需要说明修改范围和验证方式。
- 保持 diff 小，不做无关格式化。
- 不修改 runtime、协议、数据库或 Agent 行为。

## Level B：Module Change

适用范围：

- 单组件行为调整。
- 单 API 小字段。
- prompt 小范围调整。
- 单 Graph node 内部逻辑调整。
- 单模块测试或校验增强。

要求：

- 需要 mini spec 或明确引用现有 spec。
- 需要 targeted tests。
- 需要检查相关 Non-goals。
- 不一定需要 ADR；除非该改动形成长期架构决策。

## Level C：Cross-boundary Change

适用范围：

- GraphState。
- stream protocol。
- Prisma schema。
- AgentRun status。
- AgentInterrupt payload。
- CheckpointerProvider。
- API contract。
- 跨 package 改造。
- HITL 行为变化。

要求：

- 必须完整 `spec.md / plan.md / tasks.md`。
- 必须检查 `.specify/memory/constitution.md`。
- 默认使用 official Spec Kit full skills 执行 specify / clarify / plan / checklist / tasks / analyze。
- 实现后执行 `speckit-converge` 或人工等价收口检查。
- 如果本地没有 CLI、skills 或 slash command，则执行人工等价检查并记录结论。
- 必须更新相关 docs / contracts。
- 必须执行 targeted tests、typecheck、`git diff --check`。
- 必须确认 public DTO 不泄露 raw GraphState / checkpoint / error / API Key / session。

## Level D：Architecture Change

适用范围：

- Agent 边界变化。
- 数据库职责变化。
- runtime 主链路变化。
- checkpoint / resume 语义变化。
- 部署拓扑变化。
- 新 service 接入。

要求：

- 必须完整 Spec Kit 风格流程。
- 默认使用 official Spec Kit full skills，并把 clarify、checklist、analyze、converge 结果进入 PR / review 记录。
- 如果 tooling 不可用，必须执行人工等价流程并记录结论。
- 必须新增或更新 ADR。
- 必须更新 architecture docs。
- 必须进行完整版本验收 review。
- 必须最终人工 review 后再收口版本。

## Spec Kit Full Skills

Spec Kit full skills 是复杂变更的默认执行入口，不是所有任务都必须跑的固定仪式。

在 Codex skills 集成中，`$speckit-*` 表示 official generated / vendored skills。支持 slash command 的 agent 可以使用对应 `/speckit.*` 命令。如果仓库或当前环境没有 Spec Kit tooling，则执行人工等价检查。

推荐位置：

1. specify：版本启动时创建或定位正式 `specs/<version-topic>/`。
2. clarify：在 `spec.md` 初稿之后、`plan.md` 之前使用，用来消除目标、用户行为、Non-goals、边界和验收口径中的歧义。
3. plan：形成真实实施路径、职责边界、兼容性和验证策略。
4. checklist：在 `acceptance.md` 初稿之后、`tasks.md` 定稿之前使用，用来检查需求是否完整、可验收、没有把 Non-goals 写成隐性任务。
5. tasks：把实现拆成有顺序、有暂停点、可验证的任务。
6. analyze：在 `tasks.md` 定稿之后、实现之前使用，用来检查 spec / plan / tasks / acceptance / decisions 是否一致，是否存在遗漏、冲突或 spec drift 风险。
7. implement：只实现当前 task，不提前实现后续 task。
8. converge：实现后检查 spec / plan / tasks / docs / ADR / diff 是否收口。

按 Change Level 使用：

- Level A：不需要。
- Level B：不强制；只有 mini spec 仍有明显歧义，或执行中发现影响面可能升级时才使用 clarify 或人工澄清。
- Level C：默认使用 official full skills；无法运行命令时做人工等价检查。
- Level D：official full skills + ADR + architecture docs + 人工 review；无法运行命令时做人工等价检查。

如果本地没有 Spec Kit CLI、Codex skills、slash command 或自动化脚本，不阻塞实现；但不能跳过质量判断，需要用人工方式回答同样的问题并写明结论。

`speckit-taskstoissues` 暂时是 optional，不进入 AI Mind 默认主流程。双轨职责、official baseline 和失败回退见 [Spec Kit Tooling](./spec-kit-tooling.md)。

## Codex Execution Rule

在修改 AI Mind 代码前，必须先阅读：

1. `.specify/memory/constitution.md`
2. 当前 feature 的 `spec.md`
3. 当前 feature 的 `plan.md`
4. 当前 feature 的 `tasks.md`
5. 相关 ADR
6. 相关 architecture docs

`private-folder/` 仅在用户明确要求回看草稿、历史过程、博客素材或个人内部材料时读取，不作为默认开发事实源。

执行要求：

- Level C / D 默认使用 official full skills；如果 tooling 不可用，则先完成人工等价 specify / clarify / plan / checklist / tasks / analyze，再进入实现。
- Level C / D 实现后执行 converge 或人工等价收口检查。
- 只实现当前 task。
- 不提前实现后续 task。
- 不修改 Non-goals 范围。
- 不重构无关代码。
- 不新增无复用价值的 helper / mapper / util。
- 不绕过 GraphState。
- 不把数据库副作用塞进 graph node。
- 不把 raw GraphState / checkpoint / error / API Key / session 输出到 API 或 stream。
- 修改协议、数据库、GraphState、API 时必须同步测试和文档。
- 每个 task 结束前执行最相关 targeted tests。
- 每个阶段结束前执行 typecheck。
- 最终执行 `git diff --check`。

## Release Closing Checklist

版本收口前检查：

- spec、plan、tasks、acceptance、decisions 与真实实现一致。
- 当前版本 docs 和 release note 反映真实行为。
- 架构决策已有 ADR。
- README 已评估是否需要更新当前版本、能力和 Roadmap。
- package version 与本地维护的 `project-agent-config.yaml` 在 release 版本中保持同步。
- 已知验证缺口被明确记录。

## 常见判断

- 只改 README 一句话：Level A。
- 调整单个 UI 组件状态：Level B。
- 修改 stream chunk 字段：Level C。
- 改变 AgentRun 与 checkpoint 职责：Level D。
- 新增 pending HITL recovery：至少 Level C；如果改变 resume 语义，则 Level D。
- 新增 Run History Lite：至少 Level C；如果引入长期事件模型，则 Level D。
