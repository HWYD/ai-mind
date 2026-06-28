# Research 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29

## R034-01：LangSmith 配置采用官方 env

决策：

```env
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai-mind-dev
```

理由：

- 与 LangSmith / LangChain 生态默认配置一致。
- 避免新增 `AI_MIND_LANGSMITH_ENABLED` 形成双开关。
- 本版本只需要最小开关、API key 和 project。

备选：

- 新增 `AI_MIND_LANGSMITH_ENABLED`：放弃，因为会带来双开关状态。
- 强制配置 `LANGSMITH_ENDPOINT`：放弃，MVP 默认使用官方 endpoint，自托管场景后置到 docs。

## R034-02：使用 sanitized metadata-first，而不是默认 full tracing

决策：

v0.3.4 优先显式记录 Tasklist Agent lifecycle metadata，不默认上传完整 prompt、model input、model output。

理由：

- AI Mind 当前安全边界明确禁止输出 raw GraphState、raw checkpoint、内部 prompt、完整用户 feedback、完整 tasklist markdown。
- 自动 full tracing 对 LLM call 排查有价值，但也更容易上传超出本版本白名单的内容。
- v0.3.4 的目标是 HITL checkpoint resume lifecycle observability，不是 LLM call replay。

备选：

- 直接依赖 LangChain 自动 tracing：后置，除非实现时能证明 redaction 覆盖完整且不会上传完整正文。

## R034-03：direct dependency 原则

决策：

如果 webapp 实现直接 import `langsmith`，必须在 `apps/webapp/package.json` 中声明 direct dependency。

当前事实：

- `pnpm-lock.yaml` 中存在 `langsmith@0.5.11`。
- 它来自 LangChain transitive dependency。
- `apps/webapp/package.json` 当前没有显式 `langsmith` dependency。

理由：

- 直接 import transitive dependency 会让依赖边界不稳定。
- 后续 LangChain 升级可能移除或改变 transitive dependency。

## R034-04：不新增数据库字段保存 trace id

决策：

v0.3.4 不修改 AgentRun / AgentInterrupt schema，不保存 LangSmith trace id。

理由：

- `runId`、`threadId`、`assistantMessageId` 足够做人工检索与关联。
- 保存 trace id 会带来 migration、查询契约和后续 Run History 想象空间，超出 MVP。
- LangSmith 只是外部观测层，不是业务事实源。

## R034-05：集成边界选择 coordinator / runner

决策：

优先在 `agent-run-coordinator.ts` 集成 observability。

理由：

- coordinator 已经知道 AgentRun / AgentInterrupt 的业务状态。
- coordinator 是 initial 和 resume 的共同边界。
- coordinator 可以在 `persistGraphResult()` 中观察 interrupted / completed / rejected / failed。
- graph review node 必须保持无副作用。

备选：

- 放在 graph node：放弃，违反 Review Node Must Be Side-effect Free。
- 放在 API route：信息不足，且会让 chat-service / route 过早感知 Tasklist Agent 内部生命周期。

## R034-06：trace tags 与 metadata 分离

决策：

tags 只放低基数分类，metadata 放高基数 ID 和计数。

理由：

- LangSmith 中 tags 主要用于粗粒度过滤。
- `runId`、`threadId`、`assistantMessageId` 放 tags 会造成高基数污染。
- metadata 更适合保存定位字段。

## R034-07：ADR-0008

决策：

新增 ADR-0008 记录 LangSmith observability boundary。

理由：

- LangSmith 是外部服务。
- observability / telemetry / privacy 边界会影响后续版本。
- 这类边界不应只留在单版本 spec 中。
