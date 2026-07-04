# 决策记录 043：Tool & Agent Final Turn Memory

状态：Implemented  
版本：v0.4.3  
日期：2026-07-04

## D043-001：persisted ThreadState 保持 text-only

**决策**：

- `ChatThreadMessage` 在 v0.4.3 继续只保存 `id` / `role` / `text` / `createdAt`。
- 不持久化 `source`、`turnId`、`displayKind` 或其他 final-turn metadata。

**原因**：

- v0.4.2 的 hydration、context builder、compaction 已经建立在 text-only `ThreadState` 上。
- 本版目标是扩 final-turn eligibility，不是引入新的 message schema。
- 这样可以避免 checkpoint schema churn 和 frontend shape 兼容风险。

## D043-002：`source` / turn identity 只存在于 append 阶段

**决策**：

- `source` 和 final-turn identity 只在 append 阶段作为 guardrail、logging 和 duplicate prevention 的输入使用。
- 不透传前端，不注入 model context，不写入 persisted ThreadState。

**原因**：

- 当前版本没有 source badge、memory inspector 或 execution summary UI。
- append-time metadata 已足够解决 eligibility、去重和审计需求。
- 这与用户拍板的“内部用，但不存下来”一致。

## D043-003：将 write eligibility 与 context eligibility 分离

**决策**：

- 新增或等价实现 final-turn write eligibility。
- 保留 ordinary chat context eligibility 的既有语义。

**原因**：

- 直接放开 `/tasklist` 和 `/delivery-chain` 的原 eligibility，会误把 structured runtime 纳入 ordinary chat context / 输入校验 / resume 语义。
- 本版要的是“能写 final text”，不是“structured runtime 自动继承 chat memory”。

## D043-004：普通 tool / MCP / resource 路径复用现有 orchestrator append 链路

**决策**：

- 普通 tool、authoritative tool、reader/utility、docs summary、MCP/resource final answer 继续复用现有 orchestrator final text append 路径。
- 重点补 tests、guardrail 和 final-turn adapter，而不是重建 transcript parser。

**原因**：

- 这些路径已经有 final assistant text capture 和 append timing。
- 重新从 stream chunks 回拼 final answer，风险更高，也更容易混入中间 parts。

## D043-005：Tasklist 只保存 final answer text summary

**决策**：

- Tasklist chat memory 只保存 final answer text summary。
- 不保存 tasklist artifact markdown。

**原因**：

- artifact markdown 属于 Agent artifact output，不属于 chat memory。
- final answer text summary 本来就更短，也更适合作为刷新恢复时的“这轮对话结果”。
- 这样能保持 Tasklist GraphState / artifact / HITL 与 chat memory 的边界。

## D043-006：Delivery 只保存 completed 或 blocked 的 final report text

**决策**：

- Delivery final-turn memory 只保存 completed / blocked final report text。
- failed / exception / cancelled output 不保存。

**原因**：

- Delivery Chain 对用户可见的最终结果就是 final report text。
- failed report 混入 memory 会扩大语义和判定复杂度。
- 这样可以保持 Delivery 仍然是 run-local workflow，而不是 durable execution history。

## D043-007：长 Delivery final text 使用确定性截断

**决策**：

- Delivery final report 超长时按 8000 字符做确定性截断。
- 不引入模型摘要，也不引入 `execution_summary` 概念。

**原因**：

- 截断是最小、可测、无额外模型调用的 boundedness 方案。
- 当前版本只需要恢复 final text，不需要额外的执行摘要产品语义。
- 这和 compaction、hydration payload、refresh 恢复边界更一致。

## D043-008：duplicate prevention 使用当前 ThreadState，而不是 persisted turnId

**决策**：

- append 前先读取当前 ThreadState。
- 优先按 message id 去重；没有稳定 id 时按相同 user/assistant final text pair 去重。

**原因**：

- 用户已经拍板不持久化 `turnId`。
- 本版 memory 是 bounded recent history，不需要额外历史表级别的强幂等模型。

## D043-009：不扩展 stream-core、frontend reducer 或 database contract

**决策**：

- 不修改 `@ai-mind/stream-core` chunk union。
- 不修改 frontend reducer public shape。
- 不新增 ChatSession / ChatMessage 表、LangGraph Store 或 PostgresStore。

**原因**：

- v0.4.3 的价值在 server-side final-turn append 和既有 hydration restore。
- 改协议、改 reducer 或加业务表，都会显著扩大版本范围。

## D043-010：Tasklist 与 Delivery 的 raw runtime state 仍是禁止的 memory 输入

**决策**：

- Tasklist GraphState、checkpoint、interrupt payload、AgentRun internals 不能作为 final-turn adapter 输入。
- Delivery RuntimeArtifact、workflow progress、subagent raw invocation/result 不能作为 final-turn adapter 输入。

**原因**：

- 这些对象属于 runtime 执行态，不是用户可见聊天历史。
- 一旦进入 ThreadState、hydration 或 model context，会直接破坏 constitution 中的安全 DTO 和 runtime boundary 原则。
