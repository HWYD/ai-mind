# Spec 031：Spec Kit Governance Baseline

状态：已完成
版本：v0.3.1
日期：2026-06-27

## 摘要

v0.3.1 是治理基线版本，不新增业务功能，不改变应用运行时。

本版本把 AI Mind 后续开发从“人工写计划 + Codex 执行”升级为更稳定的规格驱动流程：

```text
constitution -> spec -> plan -> tasks -> acceptance -> decisions -> implementation review
```

这套流程参考 Spec Kit 风格，但根据 AI Mind 当前真实仓库做了轻量化微调：复杂版本必须有完整 spec，普通小改不强制套完整模板。

## 目标

- 新增项目级 constitution：`.specify/memory/constitution.md`。
- 新增 `specs/` 目录，作为后续 AI coding agent 的规格入口。
- 将 v0.3.0 HITL Checkpoint Resume 归档为已发布 baseline spec。
- 新增 v0.3.1 governance spec。
- 新增 ADR 目录、README、模板和首批关键 ADR。
- 新增 AI coding workflow 文档。
- 新增 Spec-driven development 文档。
- 新增 Tasklist Agent runtime boundaries 文档。
- 新增 PR checklist，检查 constitution、spec drift 和验证范围。
- 新增 Change Level A/B/C/D 分级规则。
- 新增 Level C / D 的 clarify、checklist、analyze 质量闸门规则，但不强制所有任务执行。
- 新增 release closing checklist。
- 更新 README，让后续开发者能快速找到治理入口。

## 非目标

- 不修改 runtime 代码。
- 不修改 Tasklist Agent Graph。
- 不修改 HITL 流程。
- 不修改 AgentRun / AgentInterrupt schema。
- 不修改 PostgresSaver。
- 不修改 stream chunk 协议。
- 不修改 API route。
- 不修改前端 message reducer。
- 不实现 pending HITL recovery。
- 不实现 Run History。
- 不实现 `agent_run_events`。
- 不实现 Time Travel。
- 不修改部署架构。
- 不做大范围重构。
- 不让 AI coding agent 全量重塑项目结构。

## 用户故事

- 作为后续 Codex，我可以先读 constitution 和当前 spec，再决定能不能改代码。
- 作为维护者，我可以根据 Change Level 判断一次改动需要 mini spec、完整 spec 还是 ADR。
- 作为 reviewer，我可以用 PR checklist 发现 spec drift、协议漂移和验证缺口。
- 作为未来版本作者，我可以复制 v0.3.1 的流程启动 v0.3.2 或 v0.4.0，不必重新发明治理结构。

## 功能性要求

- `FR-031-01`：仓库必须包含 AI Mind 长期工程原则。
- `FR-031-02`：仓库必须包含 v0.3.0 released baseline specs。
- `FR-031-03`：仓库必须包含 v0.3.1 governance specs，包括 spec、plan、tasks、acceptance、decisions。
- `FR-031-04`：仓库必须包含 ADR README、template 和首批关键 ADR。
- `FR-031-05`：仓库必须包含 AI coding workflow 文档，并定义 Change Level A/B/C/D。
- `FR-031-06`：仓库必须包含 PR template，覆盖 constitution check、spec drift check 和 verification。
- `FR-031-07`：README 必须有简短治理入口，但不能变成长流程文档。
- `FR-031-08`：版本文档必须说明 v0.3.1 是治理基线，不是业务功能版本。
- `FR-031-09`：Level C / D 变更必须在实现前执行 clarify、checklist、analyze 或人工等价检查；Level A / B 不强制完整闸门。

## 成功标准

v0.3.1 完成后，项目应该能回答：

- AI Mind 的长期工程原则在哪里？
- 后续复杂版本从哪个 spec 入口开始？
- Codex 改代码前应该先读什么？
- 哪些改动必须写 ADR？
- 哪些改动必须更新 stream / API / DB / GraphState 文档？
- 如何判断 PR 是否发生 spec drift？
- 如何区分小改、中改、跨边界改动和架构改动？
- clarify、checklist、analyze 应该在什么时候用于 Level C / D？
- v0.3.0 的 HITL / durable resume 边界在哪里沉淀？
- 后续 v0.3.2 / v0.4.0 如何复用这套流程？

## 范围外验证

因为本版本不改 runtime，以下验证不属于本版本最小门槛：

- 浏览器级 HITL smoke。
- Docker build。
- migration deploy。
- production deploy。
- full webapp build。

除非 README 命令、package scripts、依赖或 runtime 代码被修改，否则不强制执行这些重验证。
