# Spec 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29
Change Level：Level C（Cross-boundary Runtime Integration）

## 摘要

v0.3.4 为 v0.3.0 已落地的 Tasklist Agent HITL checkpoint resume 链路接入 LangSmith observability。

本版本只让 `/tasklist + @docs://versions/*.md` 这条受控 Tasklist Agent 路径具备可观测、可排查、可复盘能力。它记录 initial run、HITL interrupt、human decision、resume、final / blocked / rejected / failed 等关键生命周期 metadata，并支持通过 `runId`、`threadId`、`assistantMessageId` 在 LangSmith 中定位同一轮 Agent run。

本版本不是 LLMOps 平台化版本，不做 LangSmith Dataset / Evaluation / Experiment Compare，也不新增 AI Mind 内置 Trace Viewer 或 Run History。

## 背景

v0.3.0 已完成 Tasklist Agent HITL Checkpoint Resume MVP：

- Strategy Review 必停。
- Tasklist Revision Review 条件式 HITL。
- 最多两轮受控修订。
- AgentRun / AgentInterrupt 业务状态。
- PostgreSQL + PostgresSaver durable checkpoint。
- 同 thread resume。
- resume 后继续更新原 assistant message。
- 刷新后 pending HITL 不恢复，刷新视为放弃当前前端会话，需要重新发起 `/tasklist`。

这条链路已经具备业务可运行性，但线上排查仍主要依赖日志、stream 展示和数据库状态。对于 HITL / resume 这类跨 request、跨 checkpoint 的链路，单看日志很难快速回答：

- 这轮 Tasklist Agent 是从哪个 run / thread / assistant message 开始的？
- 运行中断在 strategy review 还是 revision review？
- 用户选择了 approve / edit / reject / respond 中的哪一种？
- resume 后是 completed、blocked、rejected 还是 failed？
- 如果失败，失败发生在 initial run、interrupt 持久化、resume 还是 final classification？

v0.3.4 通过 LangSmith 增加一层外部观测能力，但不改变业务状态机、GraphState、checkpoint、stream protocol 或前端 reducer。

## 目标

- 只为 Tasklist Agent `/tasklist + @docs://versions/*.md` 接入 LangSmith tracing。
- 记录 initial run 的安全 metadata。
- 记录 HITL interrupt 的安全 metadata。
- 记录 human decision 的安全 metadata。
- 记录 resume 的安全 metadata。
- 记录 final / blocked / rejected / failed 的安全 metadata。
- 支持通过 `runId`、`threadId`、`assistantMessageId` 关联和检索 trace。
- 建立 redaction / privacy boundary，禁止上传 raw runtime internals 和完整业务正文。
- LangSmith disabled、缺少 API key 或上报失败时，Tasklist Agent 主流程必须完全不受影响。
- 增加 docs，说明如何开启、如何查看、上传哪些字段、不上传哪些字段。

## 非目标

v0.3.4 不做：

- 不做 LangSmith Dataset。
- 不做 LangSmith Evaluation。
- 不做 Experiment Compare。
- 不新增 AI Mind 内置 Trace Viewer。
- 不新增 Run History 页面。
- 不新增 `agent_run_events`。
- 不做 pending HITL refresh recovery。
- 不做 conversation / message persistence。
- 不修改 Prisma schema。
- 不修改 PostgresSaver checkpoint schema。
- 不修改 Tasklist Agent Graph topology。
- 不修改 HITL decision contract。
- 不修改 stream protocol。
- 不修改 frontend message reducer。
- 不把普通聊天、reader-skill、utility-skill、MCP 或通用 Tool Calling 全量接入 LangSmith。
- 不让 LangSmith 上报失败影响 `/tasklist` 主流程。
- 不默认上传完整 prompt、完整 model input、完整 model output、完整 tasklist markdown 或完整用户 feedback。

## 用户故事

### US1：维护者定位 Tasklist Agent run（P1）

作为 AI Mind 维护者，我希望每次 `/tasklist + @docs://versions/*.md` 都能在 LangSmith 中看到一条可定位的 Tasklist Agent trace，这样当线上用户反馈“tasklist agent 卡住 / 被拒绝 / 最终 blocked / resume 失败”时，我能通过 `runId`、`threadId` 或 `assistantMessageId` 快速定位这轮执行。

独立验收：

- 启用 LangSmith 后执行一次 Tasklist Agent initial run。
- LangSmith 中能看到 tasklist 相关 trace。
- trace metadata 至少包含 `agentType`、`agentVersion`、`graphVersion`、`runId`、`threadId`、`assistantMessageId`、`versionPlanUri`、`modelId`、`provider`、`reasoningEnabled`、`environment`。

### US2：维护者复盘 HITL interrupt 与 human decision（P1）

作为 AI Mind 维护者，我希望 Strategy Review 和 Tasklist Revision Review 的 interrupt、用户 decision、resume 能在 LangSmith 中形成可读的生命周期线索，这样我能判断执行分支是否符合 v0.3.0 HITL 设计。

独立验收：

- 执行 Strategy Review approve / edit / reject / respond 中至少一种路径。
- trace 能体现 interrupt kind、interrupt id、decision type、review round 等摘要信息。
- 如果触发 Tasklist Revision Review，trace 能体现 `fixNowCount`、`blockingIssueCount`、`weakSectionCount`、`draftRevision` 等摘要信息。
- trace 不上传完整用户 feedback、完整 strategy notes 正文或完整 tasklist markdown。

### US3：运维者安全启停 LangSmith（P1）

作为部署维护者，我希望 LangSmith 配置最少、行为清楚，并且关闭或配置不完整时不会影响线上 Tasklist Agent。

独立验收：

- `LANGSMITH_TRACING=false` 时不创建 LangSmith trace，Tasklist Agent 正常执行。
- `LANGSMITH_TRACING=true` 但 `LANGSMITH_API_KEY` 缺失时不创建 trace，Tasklist Agent 正常执行。
- LangSmith client 上报失败时只记录脱敏 warning，不改变 AgentRun status，不中断 stream，不影响 final result。

### US4：reviewer 验证隐私边界（P2）

作为 reviewer，我希望 LangSmith 上传字段有明确白名单和禁止清单，避免外部 observability 平台意外收到 prompt、checkpoint、GraphState、API key 或用户正文。

独立验收：

- 代码和测试中能看出 metadata 白名单。
- 单元测试覆盖禁止字段不会出现在 LangSmith payload 中。
- docs 明确说明上传哪些、不上传哪些。

## 功能性要求

- `FR-034-01`：系统必须只在 Tasklist Agent `/tasklist + @docs://versions/*.md` 路径接入 LangSmith，不影响普通聊天、reader-skill、utility-skill、MCP、普通 Tool Calling。
- `FR-034-02`：系统必须使用最小 LangSmith 配置：`LANGSMITH_TRACING`、`LANGSMITH_API_KEY`、`LANGSMITH_PROJECT`。
- `FR-034-03`：系统不得新增 `AI_MIND_LANGSMITH_ENABLED` 这类双开关；enabled 判断为 `LANGSMITH_TRACING === "true" && LANGSMITH_API_KEY` 存在。
- `FR-034-04`：`LANGSMITH_ENDPOINT` 不进入主配置模板；仅在 docs 中说明自托管或特殊 endpoint 场景可选。
- `FR-034-05`：LangSmith disabled 或 missing API key 时，Tasklist Agent 行为必须与 v0.3.3 相同。
- `FR-034-06`：LangSmith 上报失败必须 soft fail，不得影响 AgentRun / AgentInterrupt / checkpoint / stream / artifact。
- `FR-034-07`：initial run trace metadata 必须包含 run / thread / assistant message 关联字段。
- `FR-034-08`：HITL interrupt metadata 必须包含 interrupt kind、interrupt id 和 review 摘要计数；不得包含完整 interrupt payload 原文。
- `FR-034-09`：human decision metadata 必须包含 decision type；不得包含完整用户 feedback、完整 markdown、完整 notes 正文。
- `FR-034-10`：resume metadata 必须能通过同一组 `runId`、`threadId`、`assistantMessageId` 与 initial run 关联。
- `FR-034-11`：result metadata 必须包含 run status、result status、artifact generated、duration、failure code 和脱敏 failure message。
- `FR-034-12`：trace tags 与 metadata 必须分层：tags 只放低基数分类，metadata 放高基数 ID 与计数。
- `FR-034-13`：不得上传 raw GraphState、raw checkpoint、raw provider error、raw Prisma row、API key、session cookie、ownerSessionHash、provider config、request object、writer、AbortSignal 或 raw Error。
- `FR-034-14`：不得修改 GraphState shape、Graph topology、HITL decision schema、stream chunk schema、frontend reducer 或 Prisma schema。
- `FR-034-15`：如果实现需要直接 import LangSmith SDK，`apps/webapp` 必须显式声明 direct dependency，不依赖 lockfile 中的 transitive dependency。
- `FR-034-16`：必须增加测试覆盖 enabled/disabled、missing API key、soft fail、metadata redaction、initial/interrupted/resume/result lifecycle。
- `FR-034-17`：必须增加 docs / env example 说明如何开启 LangSmith、如何查看 trace、以及隐私边界。

## Key Entities / Metadata

本版本不新增数据库实体。

本版本只新增 observability metadata DTO / adapter 概念：

- `TasklistLangSmithConfig`：从官方 LangSmith env 解析出的启用状态、project、可选 runtime environment。
- `TasklistLangSmithRunMetadata`：initial run 的安全 metadata；`agentType` 使用当前 AgentRun 中的 Tasklist Agent 类型值，粗粒度分类由 tag `tasklist-agent` 表达。
- `TasklistLangSmithHitlMetadata`：interrupt / decision / resume 的安全 metadata。
- `TasklistLangSmithResultMetadata`：completed / blocked / rejected / failed 的安全 metadata。
- `TasklistLangSmithRedactionBoundary`：上传字段白名单和禁止字段清单。

这些 DTO 不应成为持久化数据模型，不写入 Prisma schema。

## Metadata 初始白名单

### Initial run metadata

```ts
{
    app: ('ai-mind',
        agentType, // 当前代码中为 VERSION_PLAN_TASKLIST_AGENT_NAME
        agentVersion,
        graphVersion,
        runId,
        threadId,
        assistantMessageId,
        versionPlanUri,
        modelId,
        provider,
        reasoningEnabled,
        environment)
}
```

### HITL metadata

```ts
{
    ;(interruptKind,
        interruptId,
        decisionType,
        reviewRound,
        strategyRegenerations,
        draftRevision,
        fixNowCount,
        blockingIssueCount,
        weakSectionCount)
}
```

### Result metadata

```ts
{
    ;(runStatus, resultStatus, artifactGenerated, durationMs, failureCode, sanitizedFailureMessage)
}
```

## Redaction / Privacy 边界

禁止上传：

- 完整 GraphState。
- raw checkpoint。
- raw provider error。
- raw Prisma error / raw Prisma row。
- API Key。
- session cookie 原值。
- ownerSessionHash。
- provider config。
- request object。
- writer。
- AbortSignal。
- raw Error。
- 完整 version plan 正文。
- 完整 prompt。
- 完整 optional context 正文。
- 完整用户 feedback。
- 完整 tasklist markdown。
- 完整 strategy notes 正文。
- model client 或 tool client。

允许上传：

- ID：`runId`、`threadId`、`assistantMessageId`、`interruptId`。
- URI：`versionPlanUri`。
- 状态：run status、result status、interrupt kind、decision type。
- 计数：review round、revision、fixNow count、finding count。
- 耗时：durationMs。
- 模型摘要：public model id、provider、reasoning enabled。
- 错误摘要：failure code、脱敏后的 failure message。
- 环境摘要：dev / production / demo 等非敏感 environment。

## Edge Cases

- LangSmith disabled：不创建 client，不上报 trace，主流程继续。
- `LANGSMITH_TRACING=true` 但 `LANGSMITH_API_KEY` 缺失：视为 disabled，并输出脱敏 warning 或 debug 信息。
- LangSmith SDK 初始化失败：soft fail，主流程继续。
- LangSmith 上报失败：soft fail，主流程继续，不改变 AgentRun status。
- initial run 在创建 AgentRun 后、graph invoke 前失败：允许记录失败 metadata，但不得阻塞 markFailed。
- graph 返回 interrupted 后，AgentInterrupt 持久化失败：LangSmith 不得吞掉业务失败。
- resume decision validation 失败：不得上传 raw decision，只允许上传 decision parse failure 的脱敏摘要。
- rejected path：记录 rejected metadata，不生成 artifact，不把 rejected 当成 failed。
- blocked path：记录 `resultStatus=blocked`，不把 blocked 当成 failed。

## 成功标准

v0.3.4 完成后，项目应该能回答：

- 如何开启 / 关闭 Tasklist Agent LangSmith tracing？
- 哪些 `/tasklist` 生命周期事件会进入 LangSmith？
- 怎样用 `runId`、`threadId`、`assistantMessageId` 定位 trace？
- LangSmith disabled / missing API key / 上报失败时为什么不会影响主流程？
- 哪些字段允许上传，哪些字段禁止上传？
- 为什么本版本不修改 Graph topology、HITL contract、Prisma schema、stream protocol 或 frontend reducer？
- 为什么普通聊天和其他 skill / MCP 不在本版本接入 LangSmith？

## 假设

- LangSmith SDK / LangChain tracing 版本能力以当前仓库依赖可兼容版本为准；如果实现需要直接 import `langsmith`，必须新增 direct dependency。
- v0.3.4 优先使用显式、安全、白名单式 metadata tracing，而不是依赖自动捕获完整 prompt / model input / output 的全量 tracing。
- 本版本只要求 Tasklist Agent 级别可观测，不要求每个 LLM call 的完整 tracing。
- 生产部署可以通过服务器 env 配置 LangSmith，不要求 GitHub Actions 持有 LangSmith API key。
