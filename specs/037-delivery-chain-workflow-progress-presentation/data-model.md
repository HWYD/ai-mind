# Data Model 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

> 本文档定义的是 stream / presentation-level 数据模型。
> 这些类型不进入数据库、PostgresSaver、checkpoint、artifact store 或 Agent event store。

## 1. WorkflowProgressStatus

```ts
type WorkflowProgressStepStatus = 'running' | 'completed' | 'failed'

type WorkflowProgressRunStatus = 'running' | 'completed' | 'failed'
```

说明：

- v0.3.7 不需要 `pending`，因为未来 step 不提前出现。
- v0.3.7 不引入 `paused`，因为本版本不做 HITL / interrupt。
- 如后续 Agent 需要 pause/resume，必须由对应版本重新扩展 contract。

## 2. WorkflowProgressStartChunk

```ts
type WorkflowProgressStartChunk = {
    type: 'workflow-progress-start'
    partId: string
    workflowId: string
    workflowKind: string
    title: string
    summary?: string
    startedAt?: number
}
```

字段说明：

- `partId`: 前端 message part id。
- `workflowId`: 当前 workflow run 的公开 id，只用于本轮 stream 分组。
- `workflowKind`: 首版为 `delivery-chain`，类型保持 string 以便未来扩展。
- `title`: 展示标题，例如 `正在生成交付计划...`。
- `summary`: 可选执行摘要。
- `startedAt`: epoch milliseconds；仅用于展示和 duration 计算，不代表持久 trace 时间戳。

约束：

- start chunk 不携带完整 steps。
- start chunk 不携带 raw graph node 列表。

## 3. WorkflowProgressStepChunk

```ts
type WorkflowProgressStepChunk = {
    type: 'workflow-progress-step'
    partId: string
    workflowId: string
    stepId: string
    title: string
    status: WorkflowProgressStepStatus
    summary?: string
    details?: string[]
    startedAt?: number
    endedAt?: number
    durationMs?: number
    failureMessage?: string
}
```

字段说明：

- `stepId`: presentation-safe step id，例如 `load`、`plan`、`task`、`review`、`report`。
- `title`: 用户可见标题，例如 `方案规划`。
- `status`: 当前 step 状态。
- `summary`: 一行摘要，例如 `已读取 demo 上下文 6 项`。
- `details`: 少量安全详情，例如 `调用模型：生成方案 (plan)`。
- `failureMessage`: 脱敏失败摘要。

约束：

- `details` 不得包含 raw provider error、真实路径、prompt、GraphState、API key 或 cookie。
- 同一 `stepId` 可以先收到 running，再收到 completed / failed。
- 不同 step 按实际执行进度出现。

## 4. WorkflowProgressEndChunk

```ts
type WorkflowProgressEndChunk = {
    type: 'workflow-progress-end'
    partId: string
    workflowId: string
    status: Exclude<WorkflowProgressRunStatus, 'running'>
    summary?: string
    endedAt?: number
    durationMs?: number
    failureMessage?: string
}
```

字段说明：

- `status`: workflow 最终状态。
- `summary`: 折叠行展示摘要，例如 `已处理 6m25s`。
- `durationMs`: 总耗时，用于前端格式化。
- `failureMessage`: workflow 级脱敏失败摘要。

约束：

- `workflow-progress-end` 之后前端可以把 progress panel 默认折叠。
- `workflow-progress-end` 不代表 checkpoint complete，也不代表 durable run 已保存。

## 5. WorkflowProgressStep

前端 message model 中的 step view model：

```ts
type WorkflowProgressStep = {
    id: string
    title: string
    status: WorkflowProgressStepStatus
    summary?: string
    details: string[]
    startedAt?: number
    endedAt?: number
    durationMs?: number
    failureMessage?: string
}
```

说明：

- reducer 根据 `stepId` upsert。
- step 顺序以首次出现顺序为准。
- UI 不渲染未出现的 pending step。

## 6. WorkflowProgressPart

```ts
type WorkflowProgressPart = {
    id: string
    type: 'workflow-progress'
    workflowId: string
    workflowKind: string
    title: string
    status: WorkflowProgressRunStatus
    summary?: string
    steps: WorkflowProgressStep[]
    startedAt?: number
    endedAt?: number
    durationMs?: number
    failureMessage?: string
    visibility: 'expanded' | 'collapsed'
}
```

状态规则：

- start 后 `status = running`，`visibility = expanded`。
- end 后 `status = completed | failed`，`visibility = collapsed`。
- 用户点击后可以在 UI 本地切换 expanded / collapsed。

约束：

- `WorkflowProgressPart` 是 frontend view model，不是 DB MessagePart schema。
- v0.3.7 不做刷新恢复。

## 7. DeliveryChainWorkflowStepMap

```ts
type DeliveryChainWorkflowStepId = 'load' | 'plan' | 'task' | 'review' | 'report'

type DeliveryChainWorkflowStepMap = Record<
    'loadDeliveryChainContext' | 'runPlanStage' | 'runTaskStage' | 'runReviewStage' | 'buildDeliveryChainReport',
    {
        stepId: DeliveryChainWorkflowStepId
        title: string
        runningSummary: string
        completedSummary?: string
        details?: string[]
    }
>
```

推荐映射：

```text
loadDeliveryChainContext -> load -> 读取上下文
runPlanStage -> plan -> 方案规划
runTaskStage -> task -> 任务拆解
runReviewStage -> review -> 交付评审
buildDeliveryChainReport -> report -> 生成交付计划报告
```

说明：

- 内部 node id 只参与 runtime mapping。
- 前端默认只展示 `title`、`summary`、`details`。

## 8. ReportSection

```ts
type ReportSection = {
    id: string
    title: string
    markdown: string
}
```

说明：

- `ReportSection` 是 UI parsing result。
- 如果无法可靠解析，直接展示 `fallbackMarkdown`。
- 不作为 artifact handoff contract。
