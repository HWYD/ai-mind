# 验收 031：Spec Kit Governance Baseline

状态：已完成
版本：v0.3.1
日期：2026-06-27

## 项目应该能回答的问题

### AI Mind 的长期工程原则在哪里？

在 `.specify/memory/constitution.md`。

后续跨边界或架构改动必须先检查 constitution，尤其是 Agent 边界、GraphState、review node、副作用、业务状态与 checkpoint 分离、stream compatibility、public DTO 安全和 minimal abstraction。

### 后续复杂版本从哪个 spec 入口开始？

从 `specs/<version-topic>/spec.md` 开始。

复杂版本至少需要：

- `spec.md`
- `plan.md`
- `tasks.md`
- `acceptance.md`
- `decisions.md`

### Codex 改代码前应该先读什么？

优先顺序：

1. `.specify/memory/constitution.md`
2. 当前 feature 的 `spec.md`
3. 当前 feature 的 `plan.md`
4. 当前 feature 的 `tasks.md`
5. 相关 ADR
6. 相关 architecture docs
7. `private-folder/` 仅在用户明确要求回看草稿、历史过程或个人内部材料时读取

对 Level C / D，Codex 在实现前还应完成 clarify / checklist / analyze 或人工等价检查，确认规格没有明显歧义、遗漏和冲突。

### 哪些改动必须写 ADR？

Change Level D 必须新增或更新 ADR。

典型情况包括：

- Agent 边界变化。
- 数据库职责变化。
- runtime 主链路变化。
- checkpoint / resume 语义变化。
- 部署拓扑变化。
- 新 service 接入。
- 会长期约束后续版本的架构选择。

### 哪些改动必须更新 stream / API / DB / GraphState 文档？

修改以下内容时必须同步 spec / plan / tasks / docs / ADR：

- API contract。
- stream protocol。
- GraphState。
- Prisma schema。
- AgentRun state transition。
- AgentInterrupt payload。
- CheckpointerProvider。
- deployment script。
- env requirement。
- user-visible behavior。
- version boundary。
- security boundary。

### 如何判断 PR 是否发生 spec drift？

PR checklist 必须检查：

- 实现是否超出 Related Spec。
- Non-goals 是否被修改。
- API / stream / DB / GraphState / AgentRun / AgentInterrupt 文档是否同步。
- ADR 是否新增、更新或明确不需要。
- docs/versions、README 是否被评估。
- 验证命令是否覆盖了实际影响面。

### 如何区分小改、中改、跨边界改动和架构改动？

使用 `docs/architecture/ai-coding-workflow.md` 中的 Change Level：

- Level A：Small Change。
- Level B：Module Change。
- Level C：Cross-boundary Change。
- Level D：Architecture Change。

Level C 必须完整 spec / plan / tasks。Level D 必须完整 Spec Kit 流程并新增或更新 ADR。

### v0.3.0 的 HITL / durable resume 边界在哪里沉淀？

在 `specs/030-tasklist-agent-hitl-checkpoint-resume/` 和相关 ADR 中。

公开讲解仍看 `docs/versions/v0.3.0-tasklist-agent-hitl-checkpoint-resume-mvp.md` 与 `docs/releases/v0.3.0.md`。

### 后续 v0.3.2 / v0.4.0 如何复用这套流程？

后续版本应先判断 Change Level：

- Level A：直接说明范围和验证。
- Level B：写 mini spec 或引用现有 spec。
- Level C：创建完整 `specs/<version-topic>/`，并执行 clarify / checklist / analyze 或人工等价检查。
- Level D：创建完整 spec，同时新增或更新 ADR 和 architecture docs，并执行 clarify / checklist / analyze 或人工等价检查。

版本收口时同步：

- `docs/versions/`
- `docs/releases/`
- `docs/tasklists/`
- 必要时同步 README 和 package version。

`private-folder/` 可以保存草稿、历史过程和个人内部材料，但不作为后续版本的默认正式工作区。

## 完成标准

- [x] Constitution 已存在。
- [x] v0.3.0 baseline specs 已存在。
- [x] v0.3.1 governance specs 已存在。
- [x] ADR 目录、模板和首批 ADR 已存在。
- [x] AI coding workflow docs 已存在。
- [x] PR template 已存在。
- [x] README 治理入口已存在。
- [x] Level C / D 的 clarify、checklist、analyze 质量闸门已写入正式流程，且未强制所有任务执行。
- [x] 最小验证已执行并记录结果。
