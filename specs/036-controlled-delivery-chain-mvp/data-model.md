# Data Model 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30

> 本文档在 2026-06-30 随 v0.3.6 Delivery Chain runtime 口径修正同步更新。
> 当前目标是把 `/delivery-chain` 收口为 LangGraph-controlled sequential workflow，
> 不是引入 checkpoint、interrupt、HITL、artifact persistence 或多 Agent。

## 1. DeliveryChainInvocation

`DeliveryChainInvocation` 是 command surface 的解析结果，只存在于 graph 外。

用途：

- 识别 `/delivery-chain` 是否命中。
- 在进入 graph 之前完成 scenario / inline / invalid 的 fail-closed 分流。
- 拒绝 `@docs://`、`@specs://`、`file://`、绝对路径、`../`、反斜杠路径和错误入口资源。

说明：

- `resolveDeliveryChainInvocation()` 仍保留在 graph 外。
- Graph 不负责解释 public command，也不负责把错误入口兜底成可执行输入。

## 2. DeliveryChainInput

`DeliveryChainInput` 是进入 `DeliveryChainGraph` 之前的归一化业务输入。

```ts
type DeliveryChainInput =
    | {
          source: 'demo_scenario'
          requirementRef: string
          scenarioId: string
          inlineRequirementText?: string
      }
    | {
          source: 'inline_requirement'
          requirementText: string
      }
```

字段说明：

- `source`: 区分 scenario-backed 与 inline requirement。
- `requirementRef`: 只保存 `@demo://scenarios/*/requirement.md` 的公开 URI，不保存真实文件系统路径。
- `scenarioId`: 用于 graph 内部读取同 scenario 的 `context.md`。
- `inlineRequirementText`: 允许 scenario 模式带补充说明。
- `requirementText`: inline 模式的用户输入正文。

约束：

- 不保存 raw fs path。
- 不保存 resolver internals。
- 不保存 request、writer、AbortSignal 或 stream chunk。

## 3. DeliveryChainResourceBundle

`DeliveryChainResourceBundle` 是 `loadDeliveryChainContext` 节点产出的上下文快照。

```ts
type DeliveryChainResourceBundle = {
    requirementText: string
    contextText?: string
    planRubricText: string
    taskRubricText: string
    reviewRubricText: string
    governanceText: string
    sourceRefs: string[]
    scenarioId?: string
    inlineRequirementText?: string
    warnings: string[]
}
```

字段说明：

- `requirementText`: 真正进入 stage prompt 的需求正文。
- `contextText`: 同 scenario 下的 `context.md`；缺失时允许降级，但要写入 warning。
- `planRubricText` / `taskRubricText` / `reviewRubricText`: demo rubric 正文或 fallback 文本。
- `governanceText`: demo governance 正文拼接结果或 fallback 文本。
- `sourceRefs`: 只记录公开 demo URI。
- `warnings`: 供 stage 和最终报告继承的边界提醒。

约束：

- 不保存 resource preview metadata。
- 不保存 adapter 返回的原始对象。
- 不保存真实目录扫描结果。

## 4. DeliveryChainStage

v0.3.6 的 graph stage 只包含三个业务阶段：

```ts
type DeliveryChainStage = 'plan' | 'task' | 'review'
```

说明：

- `buildDeliveryChainReport` 是 graph 的最终节点，但不单独作为业务 stage 类型暴露。
- v0.3.6 不把每个 stage 升级为独立 Agent。

## 5. DeliveryChainStageResult

每个 stage node 都输出同构结果，便于后续平滑演进为 specialist agent node 或 subgraph。

```ts
type DeliveryChainStageResult = {
    stage: DeliveryChainStage
    status: 'completed' | 'blocked' | 'failed'
    markdown: string
    warnings?: string[]
}
```

说明：

- `status` 只表达当前 stage 的业务结果，不引入 interrupt 或 resume 语义。
- `warnings` 可选，用于传播阶段性边界提醒。

## 6. DeliveryChainGraphState

`DeliveryChainGraphState` 是 v0.3.6 graph 的运行时事实源。

```ts
type DeliveryChainGraphState = {
    input: DeliveryChainInput
    resources?: DeliveryChainResourceBundle
    plan?: DeliveryChainStageResult
    task?: DeliveryChainStageResult
    review?: DeliveryChainStageResult
    reviewDisposition?: 'pass' | 'needs_changes' | 'blocked'
    reportMarkdown?: string
    warnings: string[]
    status: 'running' | 'completed' | 'blocked' | 'failed'
    failureMessage?: string
    visitedNodes: string[]
}
```

字段说明：

- `input`: graph 固定输入快照。
- `resources`: `loadDeliveryChainContext` 之后可用的资源 bundle。
- `plan` / `task` / `review`: 三个 stage node 的标准化输出。
- `reviewDisposition`: 从 ReviewStage markdown 提取的最终结论。
- `reportMarkdown`: `buildDeliveryChainReport` 的最终正文。
- `warnings`: graph 级公共警告集合。
- `status`: 运行态摘要，不映射为 checkpoint/HITL 状态机。
- `failureMessage`: soft fail 时对外可安全暴露的收口信息。
- `visitedNodes`: 仅用于 graph 顺序验证和轻量调试，不承载敏感内容。

硬边界：

- 只存可序列化业务状态。
- 不存 raw Error、stack、provider config、API key、session cookie。
- 不存 request / response / writer / AbortSignal。
- 不做聊天历史持久化。
- 不接 PostgresSaver。

## 7. DeliveryChainReportArtifact

v0.3.6 的最终产物仍然是非持久化报告，不引入 `@artifact://`。

```ts
type DeliveryChainReportArtifact = {
    title: 'Delivery Chain Report / 交付计划报告'
    markdown: string
    sourceRefs: string[]
    plan?: DeliveryChainStageResult
    task?: DeliveryChainStageResult
    review?: DeliveryChainStageResult
}
```

说明：

- 这里的 artifact 是展示语义，不代表数据库持久化实体。
- 实际输出仍复用现有 assistant message / markdown 承载方式。

## 8. Node Boundary Summary

建议节点边界：

```text
resolveDeliveryChainInvocation (graph 外)
  -> build initial DeliveryChainGraphState
  -> DeliveryChainGraph
       -> loadDeliveryChainContext
       -> runPlanStage
       -> runTaskStage
       -> runReviewStage
       -> buildDeliveryChainReport
```

约束：

- Graph 内部固定顺序执行。
- 不接 checkpoint。
- 不接 interrupt。
- 不接 HITL。
- 不接 Tasklist Agent subgraph。
- 不暴露 `/plan`、`/task`、`/review` public command。
