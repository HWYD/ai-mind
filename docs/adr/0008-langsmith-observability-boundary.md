# ADR-0008：LangSmith Observability Boundary

状态：Accepted
日期：2026-06-29

## 背景

v0.3.0 已经让 Tasklist Agent 具备 HITL checkpoint resume 能力。它通过 AgentRun / AgentInterrupt 记录业务状态，通过 PostgresSaver 记录 LangGraph checkpoint，并允许用户在 Strategy Review 和 Tasklist Revision Review 后 resume 同一 thread。

这条链路跨越 initial request、HITL interrupt、human decision、resume request 和 final result。线上排查时，单靠日志、stream UI 和数据库状态，很难快速复盘完整生命周期。

v0.3.4 引入 LangSmith observability，但 LangSmith 是外部观测服务。它如果直接接入自动 tracing，可能上传 prompt、model input / output、用户 feedback、tasklist markdown 或 runtime internals。因此需要一个长期边界，明确 AI Mind 允许上传什么、禁止上传什么，以及 LangSmith 与业务事实源的关系。

## 决策

AI Mind 在 v0.3.4 只为 Tasklist Agent `/tasklist + @docs://versions/*.md` 接入 LangSmith observability。

LangSmith 只作为外部观测层，不是业务事实源：

- AgentRun / AgentInterrupt 仍由 Prisma 业务表管理。
- LangGraph checkpoint 仍由 PostgresSaver 管理。
- GraphState 仍是 Tasklist Agent runtime 内部事实源。
- LangSmith trace 不决定 run status、不决定 resume、不决定 artifact 输出。

v0.3.4 采用 sanitized metadata-first 策略：

- 优先显式上传白名单 metadata。
- 不默认上传完整 prompt。
- 不默认上传完整 model input / output。
- 不上传完整 tasklist markdown。
- 不上传完整用户 feedback。
- 不上传 raw GraphState 或 raw checkpoint。

LangSmith 配置采用官方 env：

```env
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai-mind-dev
```

不新增 `AI_MIND_LANGSMITH_ENABLED` 双开关。

LangSmith disabled、missing API key 或上报失败时，Tasklist Agent 主流程必须不受影响。LangSmith 失败只能 soft fail。

## 影响

正向影响：

- Tasklist Agent HITL / resume 链路更容易排查。
- runId / threadId / assistantMessageId 可以跨 UI、DB、checkpoint、LangSmith 做人工关联。
- external telemetry 的隐私边界清晰。
- 后续如果扩展到更深层 LLM call tracing，有明确前置约束。

代价：

- v0.3.4 不提供完整 LLM prompt replay。
- LangSmith 中看到的是 lifecycle metadata，不是完整 tasklist 生成上下文。
- 如果要排查模型输出质量，仍需要结合本地日志、测试 fixture 或后续单独设计的 redacted model tracing。
- 实现需要额外维护 metadata allowlist 和 redaction tests。

明确限制：

- 不把 LangSmith 接入普通聊天、reader-skill、utility-skill、MCP 或普通 Tool Calling。
- 不新增 Run History 或内置 trace viewer。
- 不新增 `agent_run_events`。
- 不修改 Prisma schema。
- 不修改 PostgresSaver schema。
- 不修改 stream protocol。
- 不修改 HITL decision contract。

## 备选方案

直接开启 LangChain / LangSmith 自动 tracing：

- 优点是接入快，能看到更完整的 LLM call。
- 缺点是容易上传完整 prompt、model input / output 或业务正文，和 AI Mind 当前安全边界冲突。

自建 AI Mind Trace Viewer：

- 优点是完全可控。
- 缺点是会引入 Run History、event schema、前端页面和持久化设计，远超 v0.3.4 范围。

在 AgentRun 表中保存 LangSmith trace id：

- 优点是 DB 到 LangSmith 的跳转更方便。
- 缺点是需要 migration，并让外部 trace id 进入业务状态模型。本版本先不做。

不接入 LangSmith，只继续依赖日志：

- 优点是零依赖。
- 缺点是 HITL / resume 这类跨 request 链路仍然难以复盘。

## 后续事项

- 在 `specs/034-tasklist-agent-langsmith-observability/` 记录 spec、plan、tasks、acceptance、decisions。
- 实现 Tasklist Agent LangSmith observer 时必须使用 explicit allowlist。
- 增加 config、redaction、soft fail、coordinator lifecycle 测试。
- 更新 env example 和 docs。
- 如果后续版本要接入 full model call tracing，必须单独更新 ADR 或新增 ADR，重新评估 redaction、sampling、用户提示和合规边界。
