# Plan 030：v0.3.0 Released Runtime Architecture

状态：Released Baseline
版本：v0.3.0
归档日期：2026-06-27

## 目的

记录 v0.3.0 已经落地的真实运行架构，作为后续修改 Tasklist Agent、HITL、AgentRun、checkpoint、stream 或前端 resume 行为时的基线。

本文件不是新的实施计划，不应被理解为待办。

## Chat -> Interrupt 链路

当前已发布链路：

```text
POST /api/chat
  -> apps/webapp/app/api/chat/route.ts
  -> apps/webapp/lib/ai/chat-service.ts
  -> apps/webapp/lib/ai/runtime/chat-orchestrator.ts
  -> Tasklist Agent entry
  -> AgentRunService.createRun()
  -> CheckpointerProvider
  -> Tasklist StateGraph
  -> review node interrupt(payload)
  -> runner 读取 active interrupt snapshot
  -> AgentRunService.persistInterrupt()
  -> agent-interrupt chunk
  -> HTTP stream closes
```

关键边界：

- `/tasklist + @docs://versions/*.md` 才进入 Tasklist Agent。
- `AgentRunService.createRun()` 创建业务 run 记录。
- `CheckpointerProvider` 只负责 LangGraph checkpointer 获取，不承担业务 run 查询。
- review node 不持久化、不写 stream、不调用模型或工具。
- runner / coordinator 在 graph 暂停后识别 active interrupt，再持久化业务 interrupt 并输出 stream chunk。

## Resume 链路

当前已发布链路：

```text
POST /api/agent-runs/[runId]/resume
  -> session ownership validation
  -> AgentRunService.beginResume()
  -> repository transaction
  -> version validation
  -> decision validation
  -> CheckpointerProvider
  -> graph.invoke(new Command({ resume: decision }))
  -> next interrupt or final
  -> agent-resume chunk
  -> update original assistant message stream
```

关键边界：

- resume 必须使用同一个 `threadId`。
- `beginResume()` 在事务中消费 pending interrupt，duplicate resume fail closed。
- `agentVersion` / `graphVersion` mismatch fail closed。
- resume decision 必须匹配当前 interrupt kind 的 strict schema。
- `agent-resume` chunk 把流式写入指回原 assistant message。
- 如果 resume 后再次产生 interrupt，继续由 coordinator 持久化并关闭 HTTP stream。
- 如果 run 结束，`AgentRunService.markCompleted()` 更新业务状态。

## Graph Runtime

Tasklist Agent 的 graph runtime 已固定：

- Graph 定义位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/create-version-plan-tasklist-graph.ts`。
- Graph 执行入口位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph.ts`。
- GraphState 定义位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state.ts`。
- HITL nodes 位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/nodes/hitl-nodes.ts`。
- Route 逻辑位于 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/`。

GraphState 分区包括 `input / source / planning / tasklist / execution / output / graph`。

GraphState 不保存：

- Prisma client
- pg pool
- request
- AbortSignal
- writer
- raw Error
- raw checkpoint
- API Key
- session cookie
- AgentRun 数据库整行
- AgentInterrupt 数据库整行

## Persistence 边界

业务状态：

- package：`@ai-mind/database`
- schema：`packages/database/prisma/schema.prisma`
- 业务 repository/service：`apps/webapp/lib/ai/agent-runs/`
- 业务对象：`AgentRun`、`AgentInterrupt`

Checkpoint 状态：

- provider：`apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider.ts`
- runtime owner：LangGraph `PostgresSaver`
- tables：由 PostgresSaver 管理，不进入 Prisma schema。

职责结论：

- Prisma 管业务表。
- PostgresSaver 管 checkpoint tables。
- Webapp AgentRunService 管 session ownership、状态转移、decision schema 和业务错误。
- Graph node 不直接写业务数据库。

## Stream / Frontend 边界

协议层：

- `packages/stream-core/src/protocol/chat-stream-chunk.ts`
- `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

Webapp schema / reducer：

- `apps/webapp/lib/ai/stream-chunk-schema.ts`
- `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`
- `apps/webapp/components/instamind/chat-stream/message-factory.ts`
- `apps/webapp/components/instamind/chat-stream/message-operations.ts`
- `apps/webapp/components/instamind/use-chat-stream.ts`

UI：

- `apps/webapp/components/instamind/human-review/human-review-composer-panel.tsx`
- `apps/webapp/components/chat/message-list/parts/agent-trace-panel.tsx`
- `apps/webapp/components/chat/message-list/parts/agent-text-artifact-panel.tsx`

前端不直接读取 raw checkpoint 或 raw GraphState。pending interrupt 存在时，Composer 被锁定，用户只能通过审核卡提交受控 decision。

## Compatibility

v0.3.0 保持以下兼容性：

- 普通聊天路径不受 HITL 影响。
- Skill / Tool / MCP 路径不受 HITL 影响。
- 已有 `agent-step`、artifact、text、error chunk 语义保持兼容。
- `AgentTracePanel` 继续消费脱敏后的 graph event / patch summary。
- stream protocol 新增 chunk 时保持旧消费者安全。
