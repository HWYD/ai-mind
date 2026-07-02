# ADR-0011: Phase-aware Delegation Policy and Parallel Review Group

状态: Accepted
日期: 2026-07-02

## 背景

v0.4.0 引入了 `ControlledDeliveryManager` 和固定 `DelegationPolicy`：所有 tool call 串行执行，全局 `allowParallel: false`，全程保持 `plan -> task -> review` 顺序。

v0.4.1 的目标是把 Review 阶段从单 `review-subagent` 升级为 3 个并行 review-class subagent（`review-subagent`、`risk-subagent`、`boundary-subagent`），但不改变 Plan/Task 阶段的串行约束。

核心问题：

- 如何在"全局仍不允许多 tool calls 并行"的前提下，只允许 Review 阶段内部并行？
- 如何不让 Manager 主循环感知每个具体 review tool 的细节？
- 如何安全处理部分 review 失败的情况？

## 决策

### Phase-aware DelegationPolicy

不修改全局 `allowParallel`（保持 `false`），而是引入 `DeliveryPhase` 枚举和 `ReviewGroupPolicy` 接口：

```text
DeliveryPhase = 'plan' | 'task' | 'review-group'
```

`ReviewGroupPolicy` 独立控制：

```text
allowedReviewTools: ['review-subagent', 'risk-subagent', 'boundary-subagent']
allowParallelInReview: true
maxReviewToolCalls: 3
```

`validateToolCallBatch` 扩展为 `validateToolCallBatchForPhase(phase, toolCalls)`：

- Plan/Task phase：count > 1 时 fail closed（与 v0.4.0 一致）
- Review phase：count ≤ `maxReviewToolCalls` 时允许，且仅允许 `allowedReviewTools`

`validateReviewGroupToolCall` 新增：

- Review phase 内拒绝未注册 tool
- Review phase 内拒绝 plan/task tool
- Review phase 内拒绝 nested delegation
- Review phase 内拒绝缺少必要 artifacts 的 review tool call

`deliveryChainDelegationPolicy.maxToolCalls` 从 3 调整为 5（plan + task + 3 个 review）。

### Review Group 并行执行

Manager 主循环改造为 phase 结构：

```text
Phase plan (串行) → Phase task (串行) → Phase review-group (并行) → synthesis
```

Review phase 内：

1. 构造 manager messages，指定 3 个 review-class tools
2. `toolBoundModel.invoke`，解析返回的 tool calls
3. `Promise.all` 并行调用 `executeToolCall`，每个传 `runtimeScope: 'delivery-chain-manager'`
4. 收集结果，构造 `ReviewBundle`

### Partial failure 策略

- 1-2 个 review failed：标记 `failedReviews`，继续 `synthesizeReviewBundle`
- 3 个 review 全部 failed：fail closed，输出安全失败报告
- 模型未返回某 tool call：该 review 标记为 failed
- `executeToolCall` 返回 `status: 'failed'`：计入 `failedReviews`

### ReviewBundle 和 Manager synthesis

`ReviewBundle` 是 run-local 内部结构，包含：

- `generalReview`、`riskReview`、`boundaryReview`（各为 `SubagentToolResult | null`）
- `failedReviews` 数组

`synthesizeReviewBundle` 采用规则优先模式：

1. boundary blocked → final = blocked
2. boundary failed → final ≥ needs_review
3. review failed → final = needs_review
4. risk severity = high/blocker → report 含 high risk section
5. risk failed → report 标注 risk review missing
6. 相同问题合并
7. 冲突意见标注

v0.4.1 先交付纯规则 synthesis，LLM 润色延后到后续版本。

### Workflow progress

新增 `delegate-review-group` stepId，以单 step 汇总并行评审进度。progress 不包含 raw invocation / raw result / RuntimeArtifact。

## 影响

正向影响：

- Review 阶段从单维度升级为三维度并行（通用评审 + 风险评估 + 边界检查）。
- Phase-aware policy 让"局部并行、全局不并行"有明确的实现模式，后续可复用到其他阶段。
- Partial failure 策略保证了非关键评审失败不会阻塞整个 delivery chain。
- `ReviewBundle` 作为内部交接结构，避免每个 review result 直接暴露给报告生成逻辑。
- 不修改全局 `allowParallel`，不修改 `ToolRuntimeScope`，不修改 stream-core chunk union。

代价：

- Manager 主循环从简单的 `for-of` 顺序遍历升级为 phase-aware 结构，复杂度增加。
- `DelegationPolicy` 从单一 `validateToolCallBatch` 拆分为 `validateToolCallBatchForPhase` + `validateReviewGroupToolCall`。
- 测试需要覆盖并行失败组合（1 failed、2 failed、3 failed、unregistered、plan/task in review group 等）。

## 备选方案

全局启用 `allowParallel: true`：

- 简单，但会让 Plan/Task 阶段也可以并行，违反"只允许 Review 阶段并行"的约束。
- 需要额外在 Manager 主循环中判断阶段来决定行为，不如 phase-aware policy 清晰。

在 Manager 主循环中硬编码并行逻辑：

- 实现上可能更快，但无法复用 DelegationPolicy 的校验逻辑。
- Manager 主循环会感知每个具体 review tool 的细节，违反分层原则。

不做并行，保持 3 个 review 串行：

- 实现最简单，不增加复杂度。
- 但无法展示 AI Mind 的并行 Agent 调度能力，也失去了"多维度评审结果综合判断"的核心价值。

## 后续事项

- 同步 `docs/architecture/agent-runtime-roadmap.md`（v0.4.1 section）。
- LLM 润色在后续版本评估是否引入。
- 后续版本如需新增其他 phase 的并行能力，可复用 `ReviewGroupPolicy` 的模式。
- Phase-aware policy 不应在 v0.4.1 之后继续膨胀为通用 policy engine；若需要更复杂的并行控制，应引入独立的 `ParallelPolicy` 层。
