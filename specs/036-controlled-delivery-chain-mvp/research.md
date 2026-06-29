# Research 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-29

## Decision 1: Change Level is Level C

结论: v0.3.6 是 Level C - Controlled Agent Runtime Extension。

理由:

- 新增 public Agent command `/delivery-chain`。
- 新增内部 orchestrator / stage runtime。
- 扩展 resource-backed Agent demo 能力。
- 但不修改 DB schema、stream protocol、frontend reducer、Tasklist Agent HITL contract 或 checkpoint schema，因此不升级为 Level D。

## Decision 2: Expose only `/delivery-chain`

结论: v0.3.6 只暴露 `/delivery-chain`。

备选:

- 同时暴露 `/plan`、`/task`、`/review`。

拒绝原因:

- 当前没有 `@artifact://last-plan` / `@artifact://last-tasks`，独立命令之间无法自然交接。
- `/task` 容易和现有 `/tasklist` 混淆。
- 三个 public command 会扩大 parser、UI、测试、文档和错误提示范围。

## Decision 3: Scenario-backed plus inline requirement

结论: 支持两种输入:

- `/delivery-chain + @demo://scenarios/*/requirement.md`
- `/delivery-chain <inline requirement text>`

理由:

- Scenario-backed 模式适合 public demo 和可重复测试。
- Inline 模式让用户快速体验能力。
- 两者都能保持 explicit command 和 resource boundary。

## Decision 4: Orchestrator is workflow runner, not multi-agent

结论: `DeliveryChainOrchestrator` 是受控 workflow runner。

理由:

- v0.3.6 的价值是先跑通“需求 -> 方案 -> 任务 -> 评审”。
- 真正多 Agent orchestration 需要 artifact handoff、agent catalog、message bus 或更完整 runtime contract，属于后续版本。

## Decision 5: Do not nest Tasklist Agent HITL

结论: TaskStage 不调用现有 Tasklist Agent HITL Graph。

理由:

- 现有 Tasklist Agent 有 HITL interrupt / resume / checkpoint 语义。
- 在 `/delivery-chain` 内嵌套会引入 nested HITL、resume 串联、状态合并和 UI 恢复问题。
- v0.3.6 只需要 lightweight task breakdown stage。

## Decision 6: Report is non-persistent

结论: Delivery Chain Report 是非持久化输出。

理由:

- v0.3.6 不做 chat persistence、artifact store 或 `@artifact://`。
- 如果 report 需要持久化，将自然牵引到 DB schema 和 MessagePart / Artifact 设计，超出本版本。

## Decision 7: Reuse `@demo://` resolver

结论: Delivery Chain 必须复用 v0.3.5 demo resource resolver。

理由:

- v0.3.5 已经定义 public Agent demo resource root 和安全边界。
- v0.3.6 不应重新打开 `docs/`、`specs/` 或真实项目目录。

## Decision 8: Roadmap is documented but not implemented

结论: v0.3.6 记录 v0.3.7-v0.5.0 路线，但 future roadmap 不能生成实现任务。

理由:

- Delivery Chain 是多 Agent / artifact-first handoff 的前置能力。
- 记录路线能减少后续反复讨论。
- 但把未来能力塞进 v0.3.6 会破坏版本粒度。

## Open Items for implementation phase

- 如果现有 output/artifact 表达无法承载 report，优先降级为普通 assistant markdown，而不是修改 stream protocol。
- rubrics / governance 缺失时使用内置最低规则还是 fail closed，需要在实现阶段根据现有 resolver/test 便利性固化。
- resource picker 是否做 command-aware scenario view，还是先用 quick access 提供 scenario 示例，需要在前端实现前评估现有组件结构。
