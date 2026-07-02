# Spec 041: Parallel Review Subagents + Manager Synthesis

状态: Completed
版本: v0.4.1
日期: 2026-07-02
建议 Change Level: Level C - Controlled Agent Runtime Extension

## 评估结论

v0.4.1 的正式目标是把 `/delivery-chain` 从"串行 Agent-as-tool 委派"升级为"受控并行评审子 Agent + Manager 综合判断"。

本版本不是自由 Supervisor，不是全局 Agent Catalog，也不是开放式多 Agent 平台。它在 v0.4.0 的 `ControlledDeliveryManager` 基础上，把 Review 阶段从单个 `review-subagent` 扩展为三个并行评审子 Agent（`review-subagent`、`risk-subagent`、`boundary-subagent`），并要求 Manager 对多个评审结果做综合判断，不允许简单拼接。

核心改动：

- Plan 和 Task 阶段保持串行不变。
- 只有 Review 阶段允许并行，且只允许 `review`、`risk`、`boundary` 三个 review-class tools。
- Manager synthesis 必须基于规则优先处理 blocked 判断、冲突合并、风险排序，再由 LLM 润色最终报告。
- 继续保持 RuntimeArtifact run-local、workflow progress 安全摘要、Tasklist Agent non-regression。

## Summary

目标架构：

```text
/delivery-chain request
  -> resolveDeliveryChainInvocation
  -> load demo context
  -> ControlledDeliveryManager
       -> phase: plan (串行)
            -> call plan-subagent tool
            -> receive plan artifact
       -> phase: task (串行)
            -> call task-subagent tool with plan artifact
            -> receive tasks artifact
       -> phase: review-group (并行)
            -> call review-subagent tool with plan + tasks artifacts
            -> call risk-subagent tool with plan + tasks artifacts
            -> call boundary-subagent tool with plan + tasks artifacts
            -> receive 3 review results
       -> phase: synthesis
            -> construct ReviewBundle
            -> apply synthesis rules (blocked / conflict / merge)
            -> LLM polish final report
            -> output Delivery Chain Report
  -> output final report
```

v0.4.1 的核心变化是 Review 阶段并行化和 Manager synthesis 升级。Public surface 保持不变：

- 仍然只有 `/delivery-chain`。
- 不新增 `/plan`、`/task`、`/review`。
- 不新增用户可选 subagent picker。
- 不新增 `@artifact://`。
- 不新增 DB / persistence。
- 不修改 stream-core chunk union。
- 不修改 frontend reducer public shape。

## Goals

- 新增 `risk-subagent tool` 和 `boundary-subagent tool`，与 `review-subagent` 并列。
- 新增 phase-aware DelegationPolicy，支持 Review Group 内并行 tool calls。
- 改造 `ControlledDeliveryManager` 主循环为 phase 结构：plan(串行) -> task(串行) -> review-group(并行) -> synthesis。
- 新增 `ReviewBundle` run-local 内部结构，聚合三个评审结果。
- 新增 `synthesizeReviewBundle` 函数，规则优先处理 blocked 判断、冲突合并、风险排序，再由 LLM 润色。
- 新增 `delegate-review-group` workflow progress step，以单 step 汇总并行评审进度。
- 扩展 `createSubagentResultArtifacts`，risk/boundary 也产出 `kind: 'review'` + `metadata.reviewType`。
- 保持 RuntimeArtifact run-local，不新增 artifact kind。
- 保持 stream-core chunk union 不变。
- 保持 frontend reducer public shape 不变。
- 保持 Tasklist Agent / HITL / checkpoint / resume / AgentRun 边界不变。
- 保持 @demo:// boundary 不变。

## Non-goals

v0.4.1 不做：

- 不做 HITL / checkpoint / resume。
- 不做 DB / persistence。
- 不做 `@artifact://`。
- 不新增 `/plan`、`/task`、`/review` public command。
- 不做用户可选 subagent picker。
- 不做全局 Agent Catalog。
- 不做自由 Supervisor。
- 不做 Agent group chat。
- 不做 subagent-to-subagent 通信。
- 不做 Agent message bus。
- 不做 nested subagent。
- 不做 Plan 阶段并行。
- 不做 Task 阶段并行。
- 不做任意 tool 并行（只允许 Review Group 内的三个 review-class tools 并行）。
- 不修改 stream-core chunk union。
- 不修改 frontend reducer public shape。
- 不把 RuntimeArtifact 暴露为 public artifact。
- 不调用 Tasklist Agent HITL Graph。
- 不污染普通 chat / skill-binding tool list。
- 不把非法 tool call 交给模型二次纠错；MVP 直接 fail closed。
- 不新增 ToolRuntimeScope。
- 不新增 RuntimeArtifact kind（继续使用 `kind: 'review'` + `metadata.reviewType`）。

## User Stories

### US1: Manager 通过受控并行 Review Group 执行评审

用户通过 `/delivery-chain` 发起请求后，Manager 先串行执行 plan-subagent 和 task-subagent，然后在 Review 阶段并行调用 review-subagent、risk-subagent、boundary-subagent 三个工具。三个评审子 Agent 同时消费相同的 plan + tasks artifacts，但从不同角度输出评审结果。

验收：

- 三个 review-class tool 只在 Review phase 并行执行。
- Plan/Task 阶段出现 parallel tool calls 时 fail closed。
- Review Group 内出现未注册 tool、plan/task tool、nested delegation 时 fail closed。

### US2: Manager 对多个评审结果做综合判断

三个评审子 Agent 返回结果后，Manager 构造 `ReviewBundle`，基于规则优先处理 blocked 判断、冲突合并、风险排序，再由 LLM 润色生成最终报告。最终报告不是三段 markdown 的简单拼接。

验收：

- boundary-subagent blocked 时，final conclusion = blocked。
- boundary-subagent failed 时，final conclusion 至少 needs_review。
- review-subagent failed 时，final conclusion = needs_review。
- risk-subagent failed 时，final report 标注 risk review missing。
- 多个子 Agent 提到相同问题时合并。
- 子 Agent 意见冲突时标注冲突并给出综合判断。

### US3: Partial failure 安全处理

三个并行 review 中有 1-2 个失败时，不 fail closed，继续 synthesis 并在报告中标注缺失检查。只有全部 3 个 review 都 failed 时才 fail closed。

验收：

- 1 个 review failed：synthesis 继续，report 标注对应 review missing。
- 2 个 review failed：synthesis 继续，report 标注 2 个 review missing。
- 3 个 review 全部 failed：fail closed，输出安全失败报告。

### US4: Workflow progress 展示并行评审

用户在 UI 中看到 Review 阶段的进度。使用单 step `delegate-review-group` 汇总并行评审进度，summary 安全描述，不泄露 raw invocation / raw result / RuntimeArtifact。

验收：

- workflow progress step 序列：load -> delegate-plan -> delegate-task -> delegate-review-group -> synthesize-report。
- `delegate-review-group` step 的 summary 不包含 raw invocation、raw result、RuntimeArtifact。
- 不新增 stream chunk 类型。

### US5: 非退化保障

v0.4.1 不破坏 v0.4.0 的已有能力和边界。

验收：

- 普通问答不退化。
- /tasklist 非退化。
- @demo:// boundary 非退化。
- stream schema 非退化。
- frontend reducer 非退化。
- assistant message workflow progress 非退化。
- ToolRuntimeScope suppression 不被破坏。
- Tasklist Agent Graph / HITL / checkpoint / resume / AgentRun 边界不变。

## Functional Requirements

### Parallel Review Group

- FR-041-01: Manager 主循环必须按 phase 执行：plan(串行) -> task(串行) -> review-group(并行) -> synthesis。
- FR-041-02: plan-subagent 必须先 completed，才能进入 task phase。
- FR-041-03: task-subagent 必须消费 plan artifact 并 completed，才能进入 review-group phase。
- FR-041-04: 只有 plan + tasks artifacts 都存在后，才能进入 Review Group。
- FR-041-05: Review Group 内允许 review-subagent、risk-subagent、boundary-subagent 三个 review-class tools 并行。
- FR-041-06: Review Group 外出现 parallel tool calls 必须 fail closed。
- FR-041-07: Review Group 内出现未注册 tool 必须 fail closed。
- FR-041-08: Review Group 内出现 plan/task tool 必须 fail closed。
- FR-041-09: Review Group 内出现 nested delegation 必须 fail closed。
- FR-041-10: 不修改全局 `allowParallel` 字段；并行仅通过 phase-aware policy 在 Review phase 内部允许。

### 三个评审子 Agent

- FR-041-11: `review-subagent` 做 general review，检查 plan/tasks 对齐、任务拆解合理性、漏项、优先级和验收清晰度。
- FR-041-12: `risk-subagent` 专门做风险评审，检查实现复杂度、测试覆盖、tool-calling 稳定性、parallel policy、Manager synthesis、ToolRuntimeScope、维护成本等风险，输出 high / medium / low risk 和缓解建议。
- FR-041-13: `boundary-subagent` 专门做边界检查，检查是否碰 DB / HITL / checkpoint / resume / @artifact:// / Tasklist Agent / stream UI / RuntimeArtifact public exposure / 普通 tool list 暴露 / raw prompt 泄露 / nested / group chat / message bus，输出 boundaryStatus: passed / needs_review / blocked。
- FR-041-14: 三个 review-class tool 都声明 `runtimeScopes: ['delivery-chain-manager']`。
- FR-041-15: 三个 review-class tool 都通过 `createSubagentChatToolDefinition` 框架创建，复用 invocation 回调机制。
- FR-041-16: risk-subagent 和 boundary-subagent 的 executor 放在 `subagent-tools.ts` 内部，与 review-subagent 并列，不单独拆文件。

### Result Schema

- FR-041-17: 继续沿用 v0.4.0 强 JSON Schema（`subagentToolJsonResultSchema`），不修改 schema 定义。
- FR-041-18: review-subagent 的 `metadata.reviewType = 'general'`。
- FR-041-19: risk-subagent 的 `metadata.reviewType = 'risk'`。
- FR-041-20: boundary-subagent 的 `metadata.reviewType = 'boundary'`。
- FR-041-21: risk-subagent 的 `metadata.severity` 为 `'blocker' | 'high' | 'medium' | 'low' | 'info'`。
- FR-041-22: boundary-subagent 的 `metadata.boundaryStatus` 为 `'passed' | 'needs_review' | 'blocked'`。
- FR-041-23: failed result 不生成正式 RuntimeArtifact。
- FR-041-24: blocked boundary result 必须标记 `metadata.blocked = true`。
- FR-041-25: 不允许 raw prompt / raw response / provider config / stack / real file path 进入 result。

### RuntimeArtifact

- FR-041-26: 不新增 artifact kind，继续使用 `RuntimeArtifact(kind = 'review')`。
- FR-041-27: risk-subagent 和 boundary-subagent 产出的 artifact 也使用 `kind: 'review'`，通过 `metadata.reviewType` 区分。
- FR-041-28: `createSubagentResultArtifacts` 扩展：risk-subagent completed 产出 `kind: 'review'` + `metadata.reviewType: 'risk'`。
- FR-041-29: `createSubagentResultArtifacts` 扩展：boundary-subagent completed/blocked 产出 `kind: 'review'` + `metadata.reviewType: 'boundary'`。

### ReviewBundle

- FR-041-30: 新增 `ReviewBundle` run-local 内部结构，包含 `generalReview`、`riskReview`、`boundaryReview`（各为 `SubagentToolResult | null`）和 `failedReviews` 数组。
- FR-041-31: ReviewBundle 只在 Manager synthesis 内部使用，不进入 DB / stream / frontend message / public DTO。
- FR-041-32: ReviewBundle 类型定义放在 `types.ts`。

### Manager Synthesis

- FR-041-33: Manager synthesis 不能简单拼接三段 markdown。
- FR-041-34: synthesis 采用规则优先 + LLM 润色模式：先用代码规则处理 blocked 判断、冲突合并、风险排序，再由 LLM 润色最终报告。
- FR-041-35: 硬规则 1：boundary-subagent blocked → final conclusion = blocked。
- FR-041-36: 硬规则 2：boundary-subagent failed → final conclusion 至少 needs_review。
- FR-041-37: 硬规则 3：review-subagent failed → final conclusion = needs_review。
- FR-041-38: 硬规则 4：risk-subagent severity = high → final report 必须包含 high risk section。
- FR-041-39: 硬规则 5：risk-subagent failed → final report 标注 risk review missing。
- FR-041-40: 硬规则 6：多个子 Agent 提到相同问题 → 合并。
- FR-041-41: 硬规则 7：子 Agent 意见冲突 → 标注冲突并给出综合判断。
- FR-041-42: Partial failure 规则：1-2 个 review failed 时 synthesis 继续，report 标注缺失检查；3 个 review 全部 failed 时 fail closed。
- FR-041-43: 最终报告结构包含：综合结论、本轮评审覆盖情况、Review 总评、风险评估、边界检查、合并后的关键问题、阻塞项/高风险项、建议下一步。
- FR-041-44: `synthesizeReviewBundle` 函数放在 `report-synthesis.ts`。
- FR-041-45: `buildDeliveryManagerReport` 升级为接收 `ReviewBundle` 而非单个 `reviewArtifact`。

### Workflow Progress

- FR-041-46: 新增 `delegate-review-group` stepId，替代原 `delegate-review`（移除旧 stepId，同步更新 v0.4.0 测试中的 step 序列断言）。
- FR-041-47: `delegate-review-group` 使用单 step 汇总并行评审进度，summary 安全描述。
- FR-041-48: workflow progress step 序列：load -> delegate-plan -> delegate-task -> delegate-review-group -> synthesize-report。
- FR-041-49: progress 不包含 raw invocation / raw result / RuntimeArtifact。
- FR-041-50: 不新增 stream chunk 类型。
- FR-041-51: 不修改 frontend reducer public shape。
- FR-041-52: 不新增 Agent trace UI。

### DelegationPolicy

- FR-041-53: 新增 `ReviewGroupPolicy` 接口，包含 `allowedReviewTools`、`allowParallelInReview`、`maxReviewToolCalls`。
- FR-041-54: `deliveryChainDelegationPolicy` 的 `allowParallel` 保持 `false` 不变。
- FR-041-55: Review phase 的并行通过 `ReviewGroupPolicy` 独立控制。
- FR-041-56: `maxToolCalls` 从 3 调整为 5（plan + task + 3 个 review）。
- FR-041-57: `validateToolCallBatch` 扩展：传入 phase 上下文，Review phase 允许 count > 1。
- FR-041-58: `validateDelegationToolCall` 扩展：Review phase 允许多个 review-class tool。

### 安全与边界

- FR-041-59: 不修改 `ToolRuntimeScope` 定义，继续使用 `delivery-chain-manager`。
- FR-041-60: 并行 `executeToolCall` 调用时每个都传 `runtimeScope: 'delivery-chain-manager'`，transcript suppression 不被破坏。
- FR-041-61: 不修改 @demo:// boundary。
- FR-041-62: 不修改 Tasklist Agent Graph / HITL / checkpoint / resume / AgentRun 边界。
- FR-041-63: 不修改 Prisma schema / DB migration。

## Edge Cases

- 模型不支持 parallel tool calling 时：fail closed，输出安全失败报告（与 v0.4.0 的 tool-calling 不支持处理一致）。
- 模型在 Review phase 只返回 1 个或 2 个 tool call 时：执行已返回的，未返回的标记为 failed，进入 synthesis。
- 模型在 Review phase 返回 4 个以上 tool call 时：fail closed（超过 Review Group 允许的 3 个）。
- 模型在 Plan/Task phase 返回 parallel tool calls 时：fail closed（与 v0.4.0 一致）。
- Review Group 内 1 个 review 返回非法 JSON 时：该 review 标记为 failed，其余继续。
- LLM 润色失败时：降级为纯规则生成的报告，不 fail closed。

## Test Requirements

- plan -> task -> review group happy path（3 个并行 review 全部 completed）。
- review group parallel calls 仅在 task completed 后才接受。
- parallel before task completed 必须 fail closed。
- review group 内出现未注册 tool 必须 fail closed。
- nested delegation 仍然 fail closed。
- review group 不能调用 plan/task tool。
- risk-subagent metadata.reviewType = 'risk'。
- boundary-subagent metadata.reviewType = 'boundary'。
- failed risk-subagent 不生成正式 RuntimeArtifact。
- boundary blocked 强制 final report blocked。
- risk failed 在 final report 中标记 missing。
- 1 个 review failed：synthesis 继续，report 标注 missing。
- 2 个 review failed：synthesis 继续，report 标注 missing。
- 3 个 review 全部 failed：fail closed。
- ReviewBundle 构造正确。
- Manager synthesis 不是 raw concatenation。
- Manager synthesis 处理冲突结果。
- workflow progress 展示 delegate-review-group step。
- progress 不包含 raw invocation / raw result / RuntimeArtifact。
- stream schema 非退化。
- frontend reducer 非退化。
- assistant message workflow progress 非退化。
- /tasklist 非退化。
- @demo:// boundary 非退化。
- typecheck / lint / build 全通过。

## Success Criteria

- `/delivery-chain` 能正确执行 plan(串行) -> task(串行) -> review-group(并行) -> synthesis 完整流程。
- Manager synthesis 输出的报告包含综合结论，不是三段 markdown 简单拼接。
- Partial failure（1-2 个 review failed）时 synthesis 继续且报告标注缺失。
- workflow progress 正确展示 `delegate-review-group` step。
- v0.4.0 所有已有测试不退化。
- stream-core chunk union 不变。
- frontend reducer public shape 不变。
- Tasklist Agent 边界不变。
- @demo:// boundary 不变。
