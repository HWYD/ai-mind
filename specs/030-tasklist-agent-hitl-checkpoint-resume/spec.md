# Spec 030：Tasklist Agent HITL Checkpoint Resume Baseline

状态：Released Baseline
版本：v0.3.0
归档日期：2026-06-27

## 摘要

本目录不是重新设计 v0.3.0，而是把已经发布的 `Tasklist Agent HITL Checkpoint Resume MVP` 固化为后续版本的 baseline。

事实来源来自当前仓库的 v0.3.0 版本方案、tasklist、release note、runtime note、架构说明和现有代码路径。这里的描述应被后续 Codex / AI coding agent 视为“已发布行为边界”，不是“待实现计划”。

## 适用范围

v0.3.0 的 HITL / checkpoint / resume 能力只作用于：

```text
/tasklist + @docs://versions/*.md
```

它不影响普通聊天、reader-skill、utility-skill、Tool Calling、MCP Resource / Prompt / Tool 或其他未来 Agent。

## 已发布用户行为

- Strategy Review 必停，用户必须对策略进行审核后才能继续生成 tasklist。
- Strategy Review 支持 `approve / edit / reject / respond`。
- `respond` 最多触发一次策略重新生成。
- 第二次 Strategy Review 不再允许 `respond`，只能 `approve / edit / reject`。
- 用户 `edit` 会直接形成受控策略输入，并计入后续 revision budget。
- Tasklist Revision Review 只在 `warningDisposition.fixNow.length > 0` 时触发。
- Tasklist Revision Review 不以 `validation.status === "warning"` 作为触发条件。
- Tasklist Revision Review 每个 run 最多出现一次。
- 最多两轮受控 tasklist 修订，最多形成 `v1 -> v2 -> v3`，不生成 `v4`。
- 用户在 revision review 中选择 `edit` 会占用一次 revision budget。
- 第二轮修订自动执行，不再重复请求 HITL。
- 两轮后仍失败时输出 blocked artifact。
- blocked artifact 对应 `AgentRun.status = completed`，`resultStatus = blocked`。
- resume 后继续更新原 assistant message，而不是创建一条新的 assistant message。
- 刷新页面不恢复 pending HITL card；刷新视为放弃当前前端会话，用户需要重新发起 `/tasklist`。

## 已发布系统行为

- Tasklist Agent 固定走 LangGraph `StateGraph`，不存在 legacy runner 或 runtime switch。
- GraphState 是 Tasklist Agent 内部运行态事实源。
- Graph nodes 读取 GraphState 分区并返回 GraphState patch。
- PostgreSQL durable checkpoint 已接入。
- Prisma 管理 `AgentRun` / `AgentInterrupt` 业务表。
- LangGraph `PostgresSaver` 管理 checkpoint tables。
- Prisma schema 不管理 checkpoint tables。
- `PostgresSaver` 不替代 `AgentRun` / `AgentInterrupt` 业务查询。
- `@ai-mind/database` 是共享 database package，负责 Prisma schema、migration、generated client 和 database scripts。
- Webapp 仍拥有 Tasklist Agent 专属 `AgentRunRepository`、`AgentRunService` 和 session ownership。
- resume 使用同一个 `threadId`。
- duplicate resume fail closed，防止同一个 pending interrupt 被重复消费。
- version mismatch fail closed，避免跨 `agentVersion` / `graphVersion` 恢复。
- review node 必须无副作用，只构建 payload、调用 `interrupt(payload)`、解析 resume decision 并返回 GraphState patch。
- API、stream、debug summary 不输出 raw GraphState、raw checkpoint、raw provider error、API Key 或原始 session cookie。

## 公共契约

v0.3.0 对外新增或稳定的 contract 包括：

- `agent-interrupt` stream chunk。
- `agent-resume` stream chunk。
- `POST /api/agent-runs/[runId]/resume`。
- `GET /api/agent-runs/[runId]` 保留查询能力，但 v0.3.0 前端不使用它做刷新恢复。
- `TasklistAgentInterruptPayload` strict schema。
- `StrategyReviewDecision` strict schema。
- `TasklistRevisionReviewDecision` strict schema。

所有 public DTO 都必须经过 schema 校验，不把 LangGraph 或 Prisma 内部结构直接暴露成协议。

## 非目标

v0.3.0 明确不实现：

- pending HITL refresh recovery。
- Run History。
- Time Travel。
- 事件回放。
- 多人审批。
- 通用 Tool 审批。
- 多 Agent 编排。
- 任意节点暂停。
- 跨版本 checkpoint resume。
- checkpoint migration。
- AgentTrace 持久化。
- 自动写入 docs / tasklist 文件。
- 普通聊天、Skill、Tool Calling 或 MCP 的 HITL 扩展。

## 关键代码入口

- `apps/webapp/app/api/chat/route.ts`
- `apps/webapp/lib/ai/chat-service.ts`
- `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/index.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/nodes/hitl-nodes.ts`
- `apps/webapp/lib/ai/agent-runs/agent-run-service.ts`
- `apps/webapp/lib/ai/agent-runs/agent-run-repository.ts`
- `apps/webapp/app/api/agent-runs/[runId]/resume/route.ts`
- `packages/database/prisma/schema.prisma`
- `packages/stream-core/src/protocol/chat-stream-chunk.ts`
- `apps/webapp/components/instamind/use-chat-stream.ts`
- `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`
