# Data Model: Structured Supervisor Review Loop

## Modeling Principles

1. **Agent draft 与 Runtime canonical entity 分离**：模型不能产生或覆盖 Runtime-owned IDs。
2. **Schema 是事实源**：Zod schema 定义运行时校验，TypeScript 类型由 schema 推导。
3. **所有控制对象 closed**：root 与 nested objects 均拒绝未知字段。
4. **Markdown 与机器字段分离**：Markdown 可自由表达，但不参与状态、权限、依赖、风险或返修判断。
5. **单 run、无持久化**：所有实体在一次 `/delivery-chain` run 内创建、引用并销毁。

## Bounded Contract Limits

- 除 Markdown 外，结构化文本为 1–1,000 个字符；Markdown 为 1–24,000 个字符。
- 普通标量数组最多 20 项；Plan phases、Tasks、findings 最多 40 项；RevisionRequests 最多 20 项；finding evidence 最多 10 项。
- 结构化对象嵌套最多 4 层。safe Contract repair 最多 5 个 issue，每个 path 最长 160 个字符。

## Entity Relationship

```text
SupervisorDispatchPlan (1 per run)
|-- preDecision
|-- postReviewDecision? -------- RevisionRequest[*]
|
|-- PlanArtifact (stable id, revision 1..2)
|   `-- TaskArtifact (stable id, revision 1..2; references Plan revision)
|
|-- ReviewCycle 1
|   `-- ReviewBundle
|       |-- GeneralReviewResult
|       |-- RiskReviewResult
|       |-- BoundaryReviewResult
|       `-- ReviewFinding[*] (runtime findingId)
|
|-- RevisionOutcome? ----------- source findingIds
`
`-- DeliveryChainReport -------- first ReviewBundle + optional RevisionOutcome
```

## Supervisor Contracts

### SupervisorPreDecisionDraft

Agent-owned discriminated union，不包含 `dispatchPlanId`。

```ts
type SupervisorPreDecisionDraft =
    | {
          branch: 'execute'
          assumptions: string[]
          planningFocus: string[]
          taskFocus: string[]
          reviewFocus: {
              general: string[]
              risk: string[]
              boundary: string[]
          }
          stageIntents: Array<{
              stage: 'plan' | 'tasks' | 'review'
              objective: string
          }>
          reviewerRoles: ReviewerRole[]
      }
    | {
          branch: 'clarification_required'
          reason: string
          missingInformation: string[]
          nextStep: string
      }
    | {
          branch: 'blocked'
          reason: string
          boundaryEvidence: string[]
          nextStep: string
      }
```

Validation:

- `execute.reviewerRoles` 由 Contract 先校验为已知枚举数组，再由 Runtime exact-set policy 校验完整性。
- 非 execute 分支不得携带 focus、stage 或 Reviewer 字段。
- 所有文本数组非空、去除空白后仍必须有内容；限制单项与总项数，防止 repair/error surface 失控。

### SupervisorPostReviewDecisionDraft

Agent-owned discriminated union，不包含 `dispatchPlanId`，也不能重复提供 pre-decision。

```ts
type SupervisorPostReviewDecisionDraft =
    | {
          action: 'finalize'
          rationale: string
      }
    | {
          action: 'revise'
          rationale: string
          revisionTargets: RevisionTarget[]
          requests: RevisionRequestDraft[]
      }
    | {
          action: 'blocked'
          rationale: string
          sourceFindingIds: string[]
      }
```

Validation:

- `revise` 的 targets 只允许 `plan | tasks`，非空且唯一。
- 每个 request 引用当前初次 Review cycle 中已经 Runtime 分配的 finding IDs。
- `blocked` 只能引用已验证的 hard-blocker findings；Runtime 不接受 Supervisor 自造 blocker。
- Revision 后不再调用第二个 Review Group 或 post-review guidance，不存在第二次 revise。

### SupervisorDispatchPlan

Runtime-owned canonical entity。

```ts
interface SupervisorDispatchPlan {
    dispatchPlanId: string
    preDecision: SupervisorPreDecisionDraft
    postReviewDecision?: SupervisorPostReviewDecisionDraft
}
```

Invariants:

- 每个 run 恰好 0 或 1 个：pre Contract 未通过时为 0；首次通过后为 1。
- `dispatchPlanId` 只生成一次，后续不可替换。
- post-review 更新是 append-only；不得删除或覆盖 pre-decision。
- 非 execute pre-decision 不允许追加 post-review guidance 或 Runtime post-review action。

## Artifact Contracts

### PlanArtifactDraft

```ts
interface PlanArtifactDraft {
    requirementRefs: string[]
    scope: {
        included: string[]
        excluded: string[]
    }
    assumptions: string[]
    deliveryPhases: Array<{
        phaseKey: string
        title: string
        objective: string
        requirementRefs: string[]
        dependsOnPhaseKeys: string[]
    }>
    acceptanceCriteria: Array<{
        criterionKey: string
        description: string
        requirementRefs: string[]
    }>
    summary: string
    markdown: string
}
```

### PlanArtifact

```ts
interface PlanArtifact extends PlanArtifactDraft {
    artifactId: string
    kind: 'plan'
    revision: 1 | 2
}
```

Invariants:

- `artifactId` 由 Runtime 创建，返修保持不变。
- revision 初版为 1，唯一正式返修后至多为 2。
- phase keys 唯一，依赖只引用当前 Plan 的 phase keys，且必须无环。
- requirement refs 必须来自当前 run 的受限 requirement context。

### TaskArtifactDraft

```ts
interface TaskArtifactDraft {
    tasks: Array<{
        taskId: string
        title: string
        requirementRefs: string[]
        dependsOnTaskIds: string[]
        acceptanceCriteria: string[]
        targetArea: string
    }>
    summary: string
    markdown: string
}
```

### TaskArtifact

```ts
interface TaskArtifact extends TaskArtifactDraft {
    artifactId: string
    kind: 'tasks'
    revision: 1 | 2
    planRef: {
        artifactId: string
        revision: 1 | 2
    }
}
```

Invariants:

- task IDs 唯一；依赖必须存在、不能自引用、不能成环。
- 初次 Tasks 必须引用 Plan v1。
- Tasks 返修必须引用当前 Plan revision。
- Plan-only 返修时允许保留 Tasks v1；本版本不再自动复评，报告必须引导人工确认 Plan/Tasks 是否仍对齐，返修后的 run status 为 `needs_review`。

## Review Contracts

### ReviewerRole

```ts
type ReviewerRole = 'general' | 'risk' | 'boundary'
```

Required multiset per cycle:

```text
general x 1
risk x 1
boundary x 1
```

不要求输入数组顺序固定，但禁止 Runtime 排序、去重、补齐后把非法集合变成合法集合。

### ReviewFindingDraft

```ts
interface ReviewFindingDraft {
    targetArtifacts: Array<'plan' | 'tasks'>
    findingType: 'issue' | 'observation'
    requirement: 'required' | 'advisory'
    severity: 'blocker' | 'high' | 'medium' | 'low' | 'info'
    evidence: string[]
    description: string
    suggestedAction: string
}
```

Agent 不得提供 `findingId`、`cycleId`、`sourceRole` 或 run identity。

### ReviewFinding

```ts
interface ReviewFinding extends ReviewFindingDraft {
    findingId: string
    cycleId: string
    sourceRole: ReviewerRole
}
```

Invariants:

- `findingId` 在 run 内唯一，由 Runtime 在 Reviewer Contract 完整通过后分配。
- finding 永不按 Markdown、前缀或语义相似度自动合并。
- source role 由正在执行的 Reviewer role 注入，不能由模型声明。
- `issue` 表示需要处理的具体缺口；只有 `issue + required` 能进入 RevisionRequest、未解决事项与 `needs_changes` 判断。`observation` 是正向或信息性评审证据，不得触发返修。

### Role-specific Results

```ts
interface GeneralReviewResultDraft {
    role: 'general'
    disposition: 'pass' | 'needs_changes' | 'blocked'
    planTaskAlignment: 'aligned' | 'misaligned'
    summary: string
    findings: ReviewFindingDraft[]
    markdown: string
}

interface RiskReviewResultDraft {
    role: 'risk'
    severity: 'blocker' | 'high' | 'medium' | 'low' | 'info'
    summary: string
    findings: ReviewFindingDraft[]
    markdown: string
}

interface BoundaryReviewResultDraft {
    role: 'boundary'
    boundaryStatus: 'passed' | 'needs_review' | 'blocked'
    violations: string[]
    summary: string
    findings: ReviewFindingDraft[]
    markdown: string
}
```

Runtime enriched result 增加 `cycleId`、artifact version refs 和带身份的 findings。业务字段不再复制到 generic metadata。

### ReviewCoverage

```ts
type ReviewExecutionState = 'completed' | 'contract_failure' | 'execution_failed' | 'timeout'

type ReviewCoverage = Record<ReviewerRole, ReviewExecutionState>
```

非法 Reviewer 集合不会产生 ReviewCoverage 或 ReviewBundle，因为整个 cycle 在启动前已被 policy 拒绝。

### ReviewBundle

```ts
interface ReviewBundle {
    cycleId: string
    sequence: 1 | 2
    artifactRefs: {
        plan: { artifactId: string; revision: 1 | 2 }
        tasks: { artifactId: string; revision: 1 | 2 }
    }
    coverage: ReviewCoverage
    results: {
        general?: GeneralReviewResult
        risk?: RiskReviewResult
        boundary?: BoundaryReviewResult
    }
    findings: ReviewFinding[]
}
```

Invariants:

- 三个 Reviewer 消费同一个 immutable artifact snapshot。
- `results[role]` 仅在对应 coverage 为 completed 时存在。
- 1–2 个执行失败时仍可形成 partial bundle；3 个都失败时不伪造业务 bundle，以 failure summary 收口。
- ReviewBundle 不接收模型自报 canonical run status。

## Revision Contracts

### RevisionRequestDraft

```ts
type RevisionTarget = 'plan' | 'tasks'

interface RevisionRequestDraft {
    requestKey: string
    sourceFindingIds: string[]
    targets: RevisionTarget[]
    requiredActions: string[]
    summary: string
}
```

Runtime validation:

- request keys 在本次 decision 内唯一。
- finding IDs 非空、唯一、存在于初次 Review cycle，且没有跨 run/cycle 引用。
- targets 必须覆盖每个 source finding 的 target artifacts；不得扩大到无关 artifact。
- required hard-blocker finding 不允许通过普通 revise 分支删除或降级。
- 多个 request 可以引用不同 findings；同一 finding 是否允许进入多个 request 应默认拒绝，避免返修责任重复。

### RevisionOutcome

```ts
interface RevisionOutcome {
    revisionSequence: 1
    requests: Array<{
        requestKey: string
        sourceFindingIds: string[]
        updatedTargets: RevisionTarget[]
        artifactRefs: Array<{
            target: RevisionTarget
            artifactId: string
            revision: 2
        }>
        outcomeSummary: string
    }>
}
```

## Canonical RunStatus

```ts
type RunStatus = 'pass' | 'clarification_required' | 'needs_changes' | 'needs_review' | 'blocked' | 'failed'
```

`finalize`、`revise` 是 Supervisor action，不是 RunStatus。

### Deterministic Status Matrix

| Condition                                                                  | RunStatus                        |
| -------------------------------------------------------------------------- | -------------------------------- |
| Supervisor pre Contract 两次失败                                           | `failed`                         |
| Pre branch clarification                                                   | `clarification_required`         |
| Pre branch blocked                                                         | `blocked`                        |
| Plan/Tasks/Revision Worker Contract 两次失败或执行失败                     | `failed`                         |
| Post-review Supervisor Contract 两次失败                                   | `failed`，不得 Revision          |
| Reviewer exact-set 非法                                                    | `failed`，且 Reviewer 启动数为 0 |
| 合法调度后三个 Reviewer 全失败                                             | `failed`                         |
| 1–2 Reviewer 失败，其他有效结果存在 hard blocker                           | `blocked`                        |
| 1–2 Reviewer 失败，无 hard blocker                                         | `needs_review`                   |
| 完整 Review 且存在 Boundary blocked / Risk blocker / General blocked       | `blocked`                        |
| 完整首次 Review 的 General `planTaskAlignment=misaligned`，无 hard blocker | `needs_changes`                  |
| 完整首次 Review 有 `issue + required` finding，尚未成功返修                | `needs_changes`                  |
| 一次 Revision 成功                                                         | `needs_review`                   |
| 完整首次 Review 无 required issue finding                                  | `pass`                           |

已验证的 blocker、coverage 和 artifact 信息即使在后续执行完整性失败时也必须保留在安全报告中；RunStatus 不得由 Markdown 覆盖。

## DeliveryChainReport

Inputs:

- 唯一 `SupervisorDispatchPlan`
- 最新 PlanArtifact
- 最新 TaskArtifact
- 最新可信 ReviewBundle 或安全 failure summary
- optional RevisionOutcome
- canonical RunStatus

Required user-visible fields:

- review coverage
- key findings with IDs/source/targets
- revision performed and source findings
- revision basis and revised artifacts when a Revision ran
- assumptions
- actionable next step

Normal reports do not display the canonical status or `resolved`/`unresolved` conclusions. A Revision path ends with an explicit manual-confirmation next step.

Safe failure summary 还必须保留已完成阶段、latest artifact revisions、review coverage、已验证 hard blocker evidence 和失败类别；不得包含 raw Contract 值或敏感 runtime 数据。

Forbidden:

- raw prompt/reasoning/model response
- invalid raw Contract value
- provider config/stack/secrets/internal sensitive paths
- 从 Markdown 重新推导业务字段

## Final v0.4.11 Revision Model

- `StructuredReviewBundle` represents only the initial Review Group and contains artifact refs, coverage, cycle ID, findings, and role results. It has no `sequence` or `resolutions` field.
- `RevisionOutcome` retains source finding IDs, updated targets, stable artifact IDs and revision `2`; it is evidence that a controlled revision was produced, not evidence that a finding is resolved.
- A successful one-time Revision sets internal `RunStatus` to `needs_review`. No second Review Group, new finding, `resolved`/`unresolved` state, or second Revision exists in v0.4.11.
- `DeliveryChainReport` consumes the initial `ReviewBundle` and optional `RevisionOutcome`. It does not render the canonical terminal status; with a revision it renders revision basis, revised artifacts and an explicit manual-confirmation next step.

## Lifecycle

```text
uninitialized
  -> pre_decision_validated
     -> clarification_required | blocked
     -> executing
        -> plan_ready
        -> tasks_ready
        -> review_cycle_1_ready
        -> post_decision_appended
           -> finalized
           -> blocked
           -> revising
              -> artifacts_revised
              -> needs_review
              -> report_ready
```

任意 Agent stage 在 Contract repair 后仍失败可进入 `failed`；不引入 checkpoint/resume 状态。
