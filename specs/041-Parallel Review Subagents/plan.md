# Plan 041: Parallel Review Subagents + Manager Synthesis

状态: Completed
版本: v0.4.1
日期: 2026-07-02

## 实现路径

基于 v0.4.0 的真实代码实现，v0.4.1 按 Phase 1-7 推进。每个 Phase 说明目标、涉及文件、风险和验收标准。

### Phase 1: Spec / decisions / acceptance

**目标**：完成 spec 资产，确认设计决策和验收边界。

**涉及文件**：

- `specs/041-Parallel Review Subagents/spec.md`
- `specs/041-Parallel Review Subagents/decisions.md`
- `specs/041-Parallel Review Subagents/plan.md`
- `specs/041-Parallel Review Subagents/tasks.md`
- `specs/041-Parallel Review Subagents/acceptance.md`

**风险**：partial failure 规则和 synthesis 规则需在 spec 中明确。

**验收标准**：

- spec.md 包含完整的 Goals / Non-goals / User Stories / FR / Edge Cases / Test Requirements / Success Criteria。
- decisions.md 记录所有拍板决策。
- acceptance.md 定义可执行的验收门禁。

### Phase 2: Contract and schema

**目标**：扩展 `subagentToolIds`、`SubagentToolDefinition`、`ReviewBundle` 类型定义。

**涉及文件**：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tool-schemas.ts`：扩展 `subagentToolIds` 新增 `'risk-subagent'`、`'boundary-subagent'`。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts`：新增 `ReviewBundle` 接口。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`：新增 `DELIVERY_CHAIN_SUBAGENT_DEFINITIONS` 中的 risk/boundary 条目。

**不做**：

- 不修改 `SubagentToolJsonResult` schema（metadata 已是 `z.record(z.string(), z.unknown())`）。
- 不修改 `RuntimeArtifact` schema（metadata 已支持）。
- 不新增 `RuntimeArtifactKind`。

**风险**：`subagentToolIds` 扩展后需要同步所有引用此常量的位置。

**验收标准**：

- `subagentToolIds` 包含 5 个 tool id。
- `ReviewBundle` 类型定义完成。
- contract tests 通过（`delivery-chain-manager-contract.test.ts`）。

### Phase 3: Risk / Boundary subagent tools

**目标**：新增 `risk-subagent` 和 `boundary-subagent` 的 executor 和 tool definition。

**涉及文件**：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/subagent-tools.ts`：
    - 新增 `createRiskSubagentExecutor(model)` 函数。
    - 新增 `createBoundarySubagentExecutor(model)` 函数。
    - 扩展 `createDeliveryChainSubagentTools` 绑定新的 executors。
    - 扩展 `getDefaultArtifactTitle` 新增 risk/boundary 的默认标题。

**设计要点**：

- risk-subagent executor：SystemMessage 为风险评审专家，输出 markdown 含 severity 等级和缓解建议。`metadata.reviewType = 'risk'`。
- boundary-subagent executor：SystemMessage 为边界检查专家，输出 markdown 含 boundaryStatus。`metadata.reviewType = 'boundary'`。blocked 时 `metadata.boundaryStatus = 'blocked'`。
- 两个 executor 都消费 `plan` + `tasks` artifacts（与 review-subagent 一致）。

**不做**：

- 不单独拆文件（放在 `subagent-tools.ts` 内部，与 review-subagent 并列）。
- 不修改 `createSubagentChatToolDefinition` 框架。

**风险**：executor 实现应与 review-subagent 结构一致，但 prompt 和输出格式不同。

**验收标准**：

- 5 个 subagent tool 都能被 registry 注册。
- risk/boundary 的 `runtimeScopes` 为 `['delivery-chain-manager']`。
- `createSubagentResultArtifacts` 能正确处理 risk/boundary 的 result。

### Phase 4: Parallel Review Group policy and manager loop

**目标**：扩展 `DelegationPolicy` 为 phase-aware，改造主循环支持 Review phase 并行。

**涉及文件**：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/delegation-policy.ts`：
    - 新增 `ReviewGroupPolicy` 接口。
    - 新增 `deliveryChainReviewGroupPolicy` 实例。
    - 扩展 `validateToolCallBatch`：传入 phase 上下文，Review phase 允许 count > 1。
    - 扩展 `validateDelegationToolCall`：Review phase 允许多个 review-class tool。
    - `maxToolCalls` 从 3 调整为 5。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`：
    - 主循环从 `for (expectedToolId of CONTROLLED_SUBAGENT_ORDER)` 改为 phase 结构。
    - Plan phase：串行调用 plan-subagent（保持 v0.4.0 逻辑）。
    - Task phase：串行调用 task-subagent（保持 v0.4.0 逻辑）。
    - Review phase：构造 manager messages 指定 3 个 review-class tools，`toolBoundModel.invoke`，解析多个 tool calls，`Promise.all` 并行 `executeToolCall`。
    - Review phase manager prompt 结构：SystemMessage 改为"请同时调用以下 3 个评审工具"，HumanMessage 提供 3 个 invocationId 的 JSON 数组。
    - Partial failure：1-2 个 failed 时继续，3 个全 failed 时 fail closed。

**不做**：

- 不修改 `deliveryChainDelegationPolicy.allowParallel`（保持 `false`）。
- 不修改 `ToolRuntimeScope` 定义。
- 不修改 `executeToolCall` 实现。

**风险**：**P0 风险集中区**。主循环重写是结构性改动，需要完整的回归测试。

**验收标准**：

- 串行路径（plan/task）不退化，v0.4.0 已有测试通过。
- Review phase 能并行执行 3 个 review-class tools。
- Plan/Task phase 出现 parallel tool calls 时 fail closed。
- Partial failure（1-2 个 failed）时 synthesis 继续。
- 全部 3 个 failed 时 fail closed。

### Phase 5: ReviewBundle and Manager synthesis

**目标**：实现 `ReviewBundle` 构造和 `synthesizeReviewBundle` 函数。

**涉及文件**：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/types.ts`：`ReviewBundle` 已在 Phase 2 定义。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/report-synthesis.ts`：
    - 新增 `synthesizeReviewBundle(bundle: ReviewBundle, options): SynthesisResult` 函数。
    - 规则优先：blocked 判断、冲突合并、风险排序、缺失检查。
    - LLM 润色：调用 `invokeMarkdown` 生成最终报告。
    - LLM 失败降级：降级为纯规则生成的模板报告。
    - 修改 `buildDeliveryManagerReport`：接收 `ReviewBundle` 而非单个 `reviewArtifact`。
    - 修改 `buildDeliveryManagerFailureReport`：适配新的失败场景。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/runtime-artifacts.ts`：
    - 扩展 `createSubagentResultArtifacts`：risk-subagent completed 产出 `kind: 'review'` + `metadata.reviewType: 'risk'`。
    - 扩展 `createSubagentResultArtifacts`：boundary-subagent completed/blocked 产出 `kind: 'review'` + `metadata.reviewType: 'boundary'`。
- `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts`：
    - Review phase 结束后构造 `ReviewBundle`。
    - 调用 `synthesizeReviewBundle` 而非直接 `buildDeliveryManagerReport`。

**设计要点**：

- synthesis 规则（按优先级）：
    1. boundary blocked → final = blocked
    2. boundary failed → final ≥ needs_review
    3. review failed → final = needs_review
    4. risk severity = high → report 必须包含 high risk section
    5. risk failed → report 标注 risk missing
    6. 相同问题合并
    7. 冲突意见标注
- 最终报告结构：综合结论 / 本轮评审覆盖情况 / Review 总评 / 风险评估 / 边界检查 / 合并后的关键问题 / 阻塞项·高风险项 / 建议下一步。
- LLM 润色使用 `subagentModelHandle`（非 streaming），prompt 包含规则生成的结构化摘要。

**风险**：synthesis 规则复杂度。LLM 润色失败时需降级。

**验收标准**：

- `synthesizeReviewBundle` 输出的报告包含综合结论，不是简单拼接。
- blocked 判断正确。
- 冲突合并正确。
- LLM 失败时降级为纯规则报告。
- `buildDeliveryManagerReport` 接收 `ReviewBundle`。

### Phase 6: Workflow progress and regression tests

**目标**：新增 `delegate-review-group` step，补充所有测试。

**涉及文件**：

- `apps/webapp/lib/ai/runtime/delivery-chain/manager/workflow-progress.ts`：
    - 新增 `'delegate-review-group'` 到 `DeliveryManagerProgressStepId`。
    - 新增 `REVIEW_GROUP_STEP_DEFINITION`。
- `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`：
    - `mapManagerProgressEvent` 新增 `delegate-review-group` 映射。
- 测试文件：
    - `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`：新增 risk/boundary schema、artifact 转换测试。
    - `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`：新增并行 review happy path、partial failure、fail closed 测试。
    - `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`：新增 `delegate-review-group` step 验证。
    - 确保现有测试不退化。

**不做**：

- 不修改 stream-core chunk union。
- 不修改 frontend reducer。
- 不新增 stream chunk 类型。

**风险**：测试组合数量增加，但通过只测试关键组合控制。

**验收标准**：

- typecheck / lint / test / build 全通过。
- 新增测试覆盖所有 Test Requirements。
- v0.4.0 已有测试不退化。

### Phase 7: Release close

**目标**：同步 docs、release notes、README。

**涉及文件**：

- `docs/releases/v0.4.1.md`：新增 release notes。
- `docs/versions/v0.4.1.md`：新增版本说明。
- `README.md`：检查是否需要更新。
- `docs/architecture/agent-runtime-roadmap.md`：更新 roadmap。
- `docs/adr/0011-phase-aware-delegation-policy-and-parallel-review-group.md`：新增 ADR，记录 phase-aware DelegationPolicy 和 Review Group 并行决策。
- `package.json`：同步 package version（如适用）。

**验收标准**：

- ADR-0011 记录了 phase-aware policy 设计决策和 Review Group 并行边界。
- speckit-converge 人工等价检查通过。
- release notes 包含版本定位、更新点、一句话总结。
- README 仍与真实实现一致。
