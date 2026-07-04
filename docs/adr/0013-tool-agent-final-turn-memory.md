# ADR-0013: Tool & Agent Final Turn Memory

状态: Accepted
日期: 2026-07-04

## 背景

v0.4.2 已为普通 text chat 建立了单会话 chat memory baseline，但仍明确排除了：

- ordinary tool transcript
- MCP tool / resource transcript
- Tasklist final answer
- Delivery final report

结果是普通聊天刷新后能恢复，但用户刚刚完成的一轮 tool、Tasklist 或 Delivery 对话刷新后仍会丢掉最终可见回答。

核心问题不是“要不要把更多执行过程持久化”，而是：

- 如何只恢复用户真正需要看到的最终问答？
- 如何保持 ThreadState、hydration DTO、context builder 和 compaction 继续 text-only？
- 如何不把 Tasklist GraphState、HITL checkpoint、Delivery RuntimeArtifact 或 subagent raw result 混进 chat memory？

## 决策

### 扩展 final-turn write eligibility，但不扩展 persisted schema

v0.4.3 允许下列 completed final turn 写入 chat ThreadState：

- ordinary tool / authoritative tool final answer
- reader / utility / docs summary final answer
- MCP / resource-assisted final answer
- Tasklist completed / blocked final answer text summary
- Delivery completed / blocked final report text

persisted `ChatThreadMessage` 继续只保存：

- `id`
- `role`
- `text`
- `createdAt`

不持久化 `source`、`turnId`、`displayKind` 或其他 runtime metadata。

### append-time source metadata 只用于 guardrail

`source`、turn identity 和 final-turn classification 只存在于 append 阶段，用于：

- write eligibility
- duplicate prevention
- logging / diagnostics

它们不进入 persisted ThreadState，不透传前端，也不直接注入 model context。

### Tasklist 和 Delivery 只保存用户可见 final text

Tasklist 只保存 final answer text summary，不保存：

- artifact markdown
- GraphState
- checkpoint / interrupt payload
- AgentRun internals

Delivery 只保存 completed / blocked final report text，不保存：

- RuntimeArtifact
- workflow progress
- subagent raw invocation / result

failed / exception / cancelled / interrupted / paused output 不保存为 completed memory。

### boundedness 继续通过 text-only 策略解决

Delivery final report 如果过长，在保存前按 8000 字符做确定性截断。

本版本不引入：

- execution summary
- reasoning summary
- contextEntries
- 新的业务历史表

### DTO、stream protocol 和 reducer 兼容性优先

`GET /api/chat/thread` 继续返回 v0.4.2 的安全 DTO。

本版本不修改：

- `@ai-mind/stream-core` chunk union
- frontend reducer public shape
- Prisma schema / chat history 业务表

## 影响

正向影响：

- tool / MCP / Tasklist / Delivery final turns 刷新后可恢复。
- chat memory 继续保持 text-only、安全 hydration 和 server-authoritative context。
- 不需要引入新的协议、业务表或 execution-summary 子系统。

代价：

- runtime 需要维护 append-time final-turn adapter、write eligibility 和 duplicate prevention。
- Tasklist / Delivery 需要额外 guardrail，确保 final text append 不越过各自 runtime 边界。
- 版本 closing 需要同步 README、architecture docs、ADR 和 public docs。

## 后续事项

- 后续如果要做 source badge、execution summary、contextEntries 或 Memory Inspector，必须新开 spec，并重新评估前端 DTO、message shape 和持久化边界。
- 后续如果要做多会话历史或产品级查询，必须重新评估业务表与 checkpoint 的职责分离。
