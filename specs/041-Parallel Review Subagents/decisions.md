# Decisions 041: Parallel Review Subagents + Manager Synthesis

状态: Completed
版本: v0.4.1
日期: 2026-07-02

## D041-001: 版本名

Decision:

- 使用 `Parallel Review Subagents + Manager Synthesis`。
- 版本号 v0.4.1。

Reason:

- 用户明确指定 v0.4.1 作为当前开发和文档更新的基准版本。
- 名称准确描述了核心能力：并行评审子 Agent + Manager 综合判断。
- 与 v0.4.0 的 `Controlled Agent-as-tool Delivery Manager MVP` 形成自然递进。

## D041-002: 并行范围

Decision:

- 只有 Review 阶段允许并行。
- Plan 和 Task 阶段保持串行不变。

Reason:

- Plan 和 Task 有严格的依赖链（Task 依赖 Plan 产物），并行没有意义且会增加复杂度。
- Review 阶段的三个评审天然独立（general / risk / boundary），并行有价值。
- 限制并行范围可以保持 DelegationPolicy 的可控性。

## D041-003: 三个评审子 Agent 全部进入 MVP

Decision:

- `review-subagent`、`risk-subagent`、`boundary-subagent` 三个都做。

Reason:

- 用户拍板三个都做。
- 没有 risk-subagent，synthesis 的"风险排序"能力无法展示。
- 没有 boundary-subagent，synthesis 的"blocked 判断"能力无法展示。
- 三个合在一起才能体现多 Agent 协作价值。

## D041-004: Partial failure 规则

Decision:

- 1-2 个 review failed 时：synthesis 继续，report 标注缺失检查。
- 3 个 review 全部 failed 时：fail closed。

Reason:

- 用户拍板"全部失败才 fail closed"。
- 并行场景下 partial failure 是常态，不应因为 1 个 review 失败就丢弃其余 2 个有效结果。
- 全部 failed 说明整个评审链路不可用，应 fail closed。

## D041-005: Manager synthesis 实现方式

Decision:

- 规则优先 + LLM 润色。
- 先用代码规则处理 blocked 判断、冲突合并、风险排序。
- 再由 LLM 基于规则结果润色最终报告。
- LLM 润色失败时降级为纯规则生成的报告。

Reason:

- 用户拍板"规则优先 + LLM 润色"。
- 纯规则可以保证安全性和可测试性。
- LLM 润色可以提升报告的可读性和自然度。
- 降级机制保证 LLM 失败时不影响核心流程。

## D041-006: 不修改全局 allowParallel

Decision:

- `deliveryChainDelegationPolicy.allowParallel` 保持 `false` 不变。
- Review phase 的并行通过新增 `ReviewGroupPolicy` 独立控制。

Reason:

- 修改全局 `allowParallel` 会破坏 v0.4.0 的 fail-closed 保障，导致 Plan/Task 阶段也允许并行。
- phase-aware policy 保证并行只在 Review phase 内部生效。
- 与 constitution 的 "Controlled Agent First" 原则一致。

## D041-007: 不新增 RuntimeArtifact kind

Decision:

- 继续使用 `RuntimeArtifact(kind = 'review')`。
- 通过 `metadata.reviewType` 区分 general / risk / boundary。

Reason:

- `metadata` 已经是 `z.record(z.string(), z.unknown()).optional()`，天然支持扩展。
- 不修改 schema 定义，减少 breaking change 风险。
- 不会导致 RuntimeArtifact 过早膨胀。
- 与 v0.4.0 的 D040-008 "RuntimeArtifact 作用域" 一致。

## D041-008: 不修改 stream-core 和 frontend reducer

Decision:

- 不新增 stream chunk 类型。
- 不修改 frontend reducer public shape。
- workflow progress 使用单 step `delegate-review-group` 汇总并行评审。

Reason:

- 用户拍板"单 step 汇总"。
- `WorkflowProgressStepChunk` 的 `stepId: string` 天然支持新 step。
- 不需要并行 3 个 step，一个汇总 step 更清晰。
- 与 v0.4.0 的 D040-009 "Tool 系统复用边界" 一致。

## D041-009: risk/boundary executor 放在 subagent-tools.ts

Decision:

- risk-subagent 和 boundary-subagent 的 executor 放在 `subagent-tools.ts` 内部。
- 与 review-subagent 并列，不单独拆文件。

Reason:

- 三个 executor 结构一致，共享辅助函数。
- 代码量小（每个 ~60 行），拆成单独文件会导致过度碎片化。
- 与 v0.4.0 的评估结论一致。

## D041-010: maxToolCalls 调整为 5

Decision:

- `maxToolCalls` 从 3 调整为 5（plan + task + 3 个 review）。

Reason:

- Review Group 有 3 个并行 review-class tool，加上 plan 和 task，总共 5 次 tool call。
- 保持 `maxToolCalls` 的"防止无限循环"语义。

## D041-011: 测试策略

Decision:

- 继续使用 fake tool-call model 主测 Manager。
- 不要求真实 provider e2e 作为验收硬门槛。
- partial failure 组合只测试关键场景：全成功、1 个失败、boundary blocked、全失败。

Reason:

- 与 v0.4.0 的 D040-010 一致。
- 真实 provider tool-calling 输出不稳定，contract tests 应确定性。
- 27 种组合全测会导致测试爆炸，只覆盖关键路径。

## D041-012: HITL 放到后续版本

Decision:

- v0.4.1 不做 HITL。
- HITL-aware Subagent Delegation 放到后续版本。

Reason:

- v0.4.1 的复杂度已经不低（主循环重写 + synthesis + 并行 policy）。
- HITL 涉及 checkpoint / resume / AgentRun 持久化 / interrupt chunk / frontend 审核 UI，复杂度远超 v0.4.1。
- v0.4.1 在不引入 HITL 的前提下展示 Agent 协作价值，是更合理的版本选择。

## D041-013: risk severity = blocker 等同于 boundary blocked

Decision:

- risk-subagent 的 severity 包含 `blocker` 级别。
- 当 risk severity = blocker 时，等同于 boundary blocked，final conclusion = blocked。

Reason:

- `blocker` 表示存在阻塞性风险，与 boundary blocked 语义一致。
- 如果只处理 `high` 而忽略 `blocker`，会导致阻塞级风险被降级为普通高风险。
- 与 FR-041-38a 对齐。
