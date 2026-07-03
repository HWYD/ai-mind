# ADR-0012: Chat Thread Memory Baseline

状态: Accepted
日期: 2026-07-02

## 背景

v0.4.2 需要为当前唯一普通聊天会话引入可恢复的 thread memory，让用户刷新页面后能够恢复 recent messages，并在长对话中通过 summary compaction 与 pinned decisions 控制上下文大小。

项目里已经存在两类敏感 runtime state：

- Tasklist Agent 的 GraphState、HITL checkpoint / resume 和 AgentRun 业务状态
- Delivery Chain 的 run-local RuntimeArtifact、workflow progress 和受控 subagent delegation

核心问题不是"能不能存聊天历史"，而是：

- 如何在不引入 ChatSession / ChatMessage 业务表的前提下，为普通 chat 提供可恢复 memory？
- 如何保证 chat memory 不和 Tasklist Agent checkpoint / resume 混用？
- 如何保证 hydrate DTO 不暴露 raw checkpoint、raw prompt、provider response、GraphState 或 RuntimeArtifact？

## 决策

### 单独的 chat thread namespace 和 checkpoint schema

普通 chat memory 使用派生 thread id：

```text
chat:${sessionHash}
```

其中 `sessionHash` 来自当前 HttpOnly browser session id 与服务端 secret 的派生值，不暴露原始 session id。

chat memory 使用独立的 LangGraph checkpoint schema：

```text
langgraph_chat_memory
```

Tasklist Agent 继续使用原有 `langgraph_checkpoint`。两者可以共用同一个 PostgreSQL 实例，但表空间、thread namespace 和 state shape 必须隔离。

### ThreadState 只保存普通 chat 的 bounded text memory

v0.4.2 的 `AiMindThreadState` 只允许包含：

- text-only recent user / assistant messages
- bounded `summary`
- bounded `pinnedDecisions`
- optional `lastCompactedAt`

明确不允许进入 ThreadState 的内容：

- ordinary tool transcript
- MCP tool / resource transcript
- Tasklist GraphState
- HITL checkpoint / interrupt payload
- Delivery RuntimeArtifact
- subagent raw invocation / result
- raw prompt
- raw provider response
- stack trace
- cookie value
- API key

### chat memory 是 runtime support，不是业务历史表

chat memory checkpoint 只承担：

- refresh recovery
- bounded model context reconstruction

它不承担：

- 多会话历史查询
- 历史分页 / 搜索
- ChatSession / ChatMessage 产品数据模型
- 长期记忆或跨会话记忆

Prisma schema 不新增 chat history 业务表，也不管理 checkpoint tables。

### hydrate 只返回严格安全 DTO

前端恢复只能通过：

```text
GET /api/chat/thread
```

返回严格 allowlist DTO：

- `threadId`
- `messages`
- `summaryPreview?`
- `pinnedDecisions`
- `restored`

不得返回：

- raw checkpoint
- raw prompt
- provider response
- GraphState
- RuntimeArtifact
- raw session id

### compaction failure 必须 no-op

chat memory 在 completed assistant turn 之后最多写一次。超过 recent threshold 时可以 compact older messages，但 compaction output 必须经过严格 schema 校验。

如果 compaction 失败：

- 已完成的用户回答不能失败或回滚
- 现有可用 memory 不能被损坏
- 下轮普通 chat 仍可继续

### 普通 chat 模型上下文以后端 ThreadState 为历史事实源

v0.4.2 的普通 chat memory 路径采用 server-authoritative memory：前端请求可以继续携带本地历史 `messages` 以兼容当前 UI，但后端模型上下文只使用本轮最新 user input；历史上下文来自 chat ThreadState 中的 `summary`、`pinnedDecisions` 和 bounded recent messages。

这避免前端本地历史和后端 ThreadState recent messages 被重复注入，也让后续迁移到“前端只发送当前 user turn”更自然。

## 影响

正向影响：

- 普通 chat 首次具备 same-session refresh recovery。
- chat memory 与 Agent / Delivery runtime state 的边界被显式固定。
- 生产环境可以使用 durable PostgresSaver，同时保持开发和测试的 MemorySaver 降级路径。
- 不需要新增 stream chunk、Prisma 业务表或前端 reducer public shape。

代价：

- runtime 新增一层 chat-memory boundary，需要维护 thread id、state schema、checkpointer provider、compaction 和 hydrate DTO。
- 版本 closing 需要同时维护 env、setup script、README、ADR、architecture docs 和 focused non-regression tests。
- 普通 chat 的"完整历史"不会持久化；这是刻意的范围控制。

## 备选方案

复用 Tasklist Agent 的 `langgraph_checkpoint` 和 thread namespace：

- 实现更快，但会把普通 chat memory 与 HITL resume state 放进同一 schema/table space。
- 不利于隔离 state shape，也会提高误恢复和误暴露风险。

新增 ChatSession / ChatMessage Prisma 业务表：

- 适合做多会话历史产品，但超出 v0.4.2 范围。
- 会把 runtime checkpoint 问题提前升级为产品数据建模问题。

持久化完整 `MindMessage[]` 或 ToolMessage transcript：

- 会把 UI parts、tool/resource cards、Agent trace 和 runtime internals 混入 memory state。
- hydrate 风险高，也不符合本版非目标。

## 后续事项

- 同步 `docs/architecture/runtime-boundary.md`，明确 chat memory 是 runtime support boundary。
- 同步 `README.md`、public version/release/tasklist 和 package version 到 `v0.4.2`。
- chat memory 后续如要扩展多会话 history、长期记忆或产品级查询，必须新开 spec，并重新评估业务表与 checkpoint 的职责分离。
