# Data Model 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29

## 数据模型结论

v0.3.4 不新增数据库表，不修改 Prisma schema，不修改 PostgresSaver checkpoint schema。

本文件只定义实现时需要遵守的 runtime metadata DTO 边界。这些 DTO 不持久化，不进入 GraphState，不进入 stream chunk。

## TasklistLangSmithConfig

用途：描述 LangSmith 是否启用，以及 project / environment 等非敏感配置。

字段建议：

```ts
type TasklistLangSmithConfig = {
    enabled: boolean
    project: string
    environment: 'development' | 'production' | 'test' | 'unknown'
}
```

约束：

- `enabled = LANGSMITH_TRACING === "true" && LANGSMITH_API_KEY 存在`。
- 不在 public DTO 输出 API key。
- 不把 config 放入 GraphState。

## TasklistLangSmithRunMetadata

用途：initial run / resume trace 的基础关联 metadata。

字段建议：

```ts
type TasklistLangSmithRunMetadata = {
    app: 'ai-mind'
    agentType: string // VERSION_PLAN_TASKLIST_AGENT_NAME / AgentRun.agentType
    agentVersion: string
    graphVersion: string
    runId: string
    threadId: string
    assistantMessageId: string
    versionPlanUri: string
    modelId: string
    provider?: string
    reasoningEnabled: boolean
    environment: string
}
```

约束：

- `versionPlanUri` 允许上传。
- version plan 正文不允许上传。
- `provider` 是 provider 名称，不是 provider config。

## TasklistLangSmithHitlMetadata

用途：interrupt / human decision / resume 的摘要 metadata。

字段建议：

```ts
type TasklistLangSmithHitlMetadata = {
    interruptKind?: 'strategy_review' | 'tasklist_revision_review'
    interruptId?: string
    decisionType?: 'approve' | 'edit' | 'reject' | 'respond'
    reviewRound?: number
    strategyRegenerations?: number
    draftRevision?: number
    fixNowCount?: number
    blockingIssueCount?: number
    weakSectionCount?: number
}
```

约束：

- 不上传完整 decision。
- 不上传完整 user feedback。
- 不上传完整 markdown。
- 不上传完整 strategy notes。

## TasklistLangSmithResultMetadata

用途：final / blocked / rejected / failed 结果 metadata。

字段建议：

```ts
type TasklistLangSmithResultMetadata = {
    runStatus: 'completed' | 'paused' | 'resuming' | 'rejected' | 'failed'
    resultStatus?: 'final' | 'final_with_manual_review_items' | 'blocked' | 'rejected'
    artifactGenerated: boolean
    durationMs: number
    failureCode?: string
    sanitizedFailureMessage?: string
}
```

约束：

- failed path 只上传 failure code 和 sanitized message。
- raw Error 不允许进入 metadata。
- blocked 不等同于 failed。

## Tags

允许 tags：

```ts
type TasklistLangSmithTag =
    | 'ai-mind'
    | 'tasklist-agent'
    | 'hitl'
    | 'initial'
    | 'resume'
    | 'completed'
    | 'final'
    | 'final-with-manual-review-items'
    | 'blocked'
    | 'rejected'
    | 'failed'
    | 'development'
    | 'production'
    | 'unknown'
    | 'demo'
```

约束：

- 不把 `runId`、`threadId`、`assistantMessageId`、`interruptId` 放入 tags。

## 禁止进入 DTO 的数据

- GraphState。
- checkpoint。
- Prisma row。
- request / response object。
- writer。
- AbortSignal。
- raw Error。
- model client。
- tool client。
- API key。
- session cookie。
- ownerSessionHash。
- provider config。
- prompt。
- full model input / output。
- version plan 正文。
- user feedback 正文。
- tasklist markdown。
