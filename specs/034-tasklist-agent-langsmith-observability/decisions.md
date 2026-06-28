# 决策 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29

## D034-01：v0.3.4 定为 Level C

v0.3.4 按 **Level C：Cross-boundary Runtime Integration** 处理。

原因：

- 涉及 Tasklist Agent initial runner。
- 涉及 resume runner。
- 涉及 AgentRun coordinator / runtime context。
- 涉及 env config。
- 涉及 metadata / redaction。
- 涉及 docs / tests。

但本版本不改变架构事实源，不改变 Graph topology，不修改 HITL contract、stream protocol、Prisma schema 或 PostgresSaver schema，因此不升级为 Level D。

## D034-02：只接入 Tasklist Agent

LangSmith tracing 只作用于 `/tasklist + @docs://versions/*.md`。

普通聊天、reader-skill、utility-skill、MCP、普通 Tool Calling 和未来通用 Agent 不进入本版本范围。

这样可以避免 v0.3.4 从“Tasklist Agent 可观测性”膨胀成全平台 LLMOps 接入。

## D034-03：采用官方 LangSmith env，不新增 AI_MIND 双开关

本版本主配置只使用：

```env
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai-mind-dev
```

不新增 `AI_MIND_LANGSMITH_ENABLED`。

enabled 判断：

```ts
LANGSMITH_TRACING === "true" && LANGSMITH_API_KEY 存在
```

原因是双开关会制造“LangSmith 官方开了、AI Mind 又关了”这类排查成本。

## D034-04：`LANGSMITH_ENDPOINT` 只作为文档中的可选项

MVP 不把 `LANGSMITH_ENDPOINT` 放入主 env example。

自托管 LangSmith 或特殊 endpoint 场景可以在 docs 中说明，但不作为默认部署必填项。

## D034-05：优先显式白名单 metadata tracing，不默认自动上传完整 prompt

v0.3.4 不默认依赖会自动捕获完整 prompt、model input、model output 的全量 tracing。

本版本优先在 Tasklist Agent coordinator / runner 边界显式记录经过白名单筛选的 metadata。

原因：

- 当前项目安全边界明确禁止输出完整 prompt、GraphState、checkpoint、用户 feedback、tasklist markdown。
- LangSmith 自动 tracing 对模型调用非常方便，但如果默认上传完整输入输出，会和 v0.3.4 privacy goal 冲突。
- v0.3.4 的目标是 lifecycle observability，不是完整 LLM call replay。

如果后续版本要接入更深层模型调用 tracing，必须单独评估 redaction、sampling 和用户可见说明。

## D034-06：集成边界放在 coordinator / runner，不放进 graph review node

LangSmith integration 不写进 `review_tasklist_strategy` 或 `review_tasklist_revision` node。

review node 仍保持无副作用：

- 不调用模型。
- 不调用工具。
- 不读写数据库。
- 不调用 writer。
- 不调用 LangSmith。

HITL interrupt / decision / resume 的观测由 coordinator / runner 在节点外记录。

## D034-07：不修改 GraphState / HITL decision / stream protocol

v0.3.4 不为 LangSmith 修改：

- GraphState shape。
- Graph topology。
- HITL decision schema。
- stream chunk schema。
- frontend reducer。

LangSmith trace 是外部观测层，不成为业务恢复、前端渲染或 graph continuation 的事实源。

## D034-08：不修改 Prisma schema，不新增 agent_run_events

本版本不新增 `agent_run_events`，不在 AgentRun / AgentInterrupt 中保存 LangSmith trace id。

原因：

- v0.3.4 的核心目标是外部观测，不是 Run History。
- `runId`、`threadId`、`assistantMessageId` 已足够做 trace 关联。
- 保存 trace id 会引入新的持久化契约和 migration，超出 MVP。

如果后续要做 Run History 或内置 trace viewer，再单独设计业务表和 migration。

## D034-09：LangSmith 失败必须 soft fail

LangSmith SDK 初始化、trace 创建、event update、flush / end 失败，都不得影响 Tasklist Agent 主流程。

具体要求：

- 不改变 AgentRun status。
- 不影响 AgentInterrupt 持久化。
- 不影响 LangGraph checkpoint resume。
- 不中断 stream。
- 不影响 artifact 输出。

最多输出脱敏 warning，且不得记录 raw Error 或敏感 payload。

## D034-10：tags 放低基数字段，metadata 放高基数字段

LangSmith tags 只放低基数字段：

- `ai-mind`
- `tasklist-agent`
- `hitl`
- `initial` / `resume`
- `completed` / `blocked` / `rejected` / `failed`
- `dev` / `production` / `demo`

metadata 放高基数字段：

- `runId`
- `threadId`
- `assistantMessageId`
- `interruptId`
- `versionPlanUri`
- counters
- duration

这样避免 tags 被高基数 ID 污染，也便于 LangSmith 中按粗粒度过滤。

## D034-11：直接 import LangSmith SDK 时必须声明 direct dependency

当前仓库 lockfile 中已有 `langsmith@0.5.11`，但它来自 LangChain 间接依赖。

如果 v0.3.4 实现需要在 `apps/webapp` 里直接 import `langsmith`，必须在 `apps/webapp/package.json` 中显式添加 direct dependency，不能依赖 transitive dependency。

## D034-12：ADR-0008 记录长期观测与隐私边界

v0.3.4 虽然是 Level C，但 LangSmith 属于外部 observability service，会影响后续版本对 telemetry、privacy、prompt upload 的判断。

因此新增 ADR-0008，记录：

- Tasklist Agent-only 边界。
- sanitized metadata-first 策略。
- LangSmith soft fail 策略。
- 不把 LangSmith trace 当业务事实源。
