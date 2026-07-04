# 研究记录：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**功能**：[spec.md](./spec.md)  
**日期**：2026-07-03

## 决策：persisted ChatThreadMessage 保持 text-only

**理由**：当前 v0.4.2 的 `ChatThreadMessage` 是严格的 text-only message，供 hydration、context builder 和 compaction 使用。v0.4.3 的澄清已经明确选择不持久化 `source`、`turnId` 或 `displayKind`。这样可以避免 checkpoint schema migration 风险，并保持 hydration/reducer 兼容性。

**考虑过的替代方案**：

- 持久化可选 metadata，但在 hydration 中隐藏：拒绝，因为这会在没有 v0.4.3 UI 价值的前提下制造 ThreadState schema churn。
- 只持久化 `turnId`：拒绝，因为 duplicate prevention 可以在 append 前基于现有 message id 或相同 final text pair 完成。
- 向前端暴露 metadata：拒绝，这属于后续的 UI/source-badge 议题。

## 决策：将 final-turn write eligibility 与 context eligibility 分离

**理由**：v0.4.2 的 `isChatMemoryEligibleRequest` 会排除 `/tasklist` 和 `/delivery-chain`，以避免 structured runtime state 进入 ordinary chat context。v0.4.3 需要让 structured runtimes 在完成后写入最终可见文本，但不能让它们自动继承 ordinary chat context 或 checkpoint/resume 语义。单独增加一层 write eligibility，是最小且安全的边界。

**考虑过的替代方案**：

- 直接把 `/tasklist` 和 `/delivery-chain` 从现有 eligibility 排除列表里去掉：拒绝，因为这还会影响 context building 和输入校验语义。
- 增加 contextEntries：拒绝，这是 v0.4.3 的明确非目标。
- 让前端把 final messages 再发回服务端做 persistence：拒绝，因为 server-authoritative memory 是 v0.4.2 的 baseline。

## 决策：普通 tool/MCP/resource final answers 复用现有 orchestrator append 路径

**理由**：当前普通 tool-calling 流程已经会通过 `streamAssistantParts` 流出最终模型回答，并在 final text 完成后调用 chat memory append。authoritative tool bypass 也会写入最终文本回答。v0.4.3 应该做的是补 tests 和 source-specific guards，而不是重建一套 transcript parser。

**考虑过的替代方案**：

- 从 stream chunks 重新拼 final answer：拒绝，因为有把 text 与 tool/resource/prompt parts 混在一起的风险。
- 持久化 tool/resource 的 start/end cards：拒绝，这等同于 raw transcript persistence。
- 增加新的 final-turn stream chunk：拒绝，因为不需要协议改动。

## 决策：Tasklist 只保存 final answer text summary

**理由**：Tasklist Agent 已经把 final text summary 和 artifact markdown 分开。澄清结论是：chat memory 只保留 final answer text summary，artifact markdown 继续作为 Agent artifact output。这样既能保护 bounded memory，也避免把 chat memory 变成 artifact persistence。

**考虑过的替代方案**：

- artifact markdown 短时也保存：拒绝，因为这会模糊 chat memory 与 Agent artifact 的边界。
- 不保存 summary，改保存截断后的 artifact markdown：拒绝，因为用户可见的 final answer summary 才是可恢复的对话回合。
- 整体推迟 Tasklist 接入：拒绝，因为功能目标已经明确覆盖 Agent final turns。

## 决策：Delivery 只保存 completed/blocked final report text

**理由**：Delivery Chain 面向用户暴露的是 final report text，同时 `RuntimeArtifact`、workflow progress 和 subagent trace 仍保持 run-local。v0.4.3 可以在不改变 Delivery run-local 语义的前提下，持久化有界的 final report text。

**考虑过的替代方案**：

- 持久化 `ControlledDeliveryManagerResult`：拒绝，因为其中包含 artifacts 和 trace。
- 持久化 workflow progress 摘要：拒绝，这属于 execution-summary/contextEntries 范围。
- 持久化 failed exception reports：拒绝；根据澄清，failure reports 不进入 MVP memory。

## 决策：用确定性截断约束过长的 Delivery final text

**理由**：Delivery reports 可能远长于普通回答。功能必须保持 memory 和 compaction 的有界性，所以长 Delivery final text 在保存时只做确定性截断，最多 8000 字符。Tasklist 不需要这个强约束，因为它只保存 final answer text summary，不保存 tasklist artifact markdown。这避免了额外模型调用、幻觉风险、延迟增加，以及与 `execution_summary` 非目标相冲突。

**考虑过的替代方案**：

- 始终保存完整 final text：拒绝，会增加 compaction 压力和 refresh payload 体积。
- 使用模型生成受控摘要：拒绝，因为会新增模型调用、失败模式，以及本版不需要的 summary 语义。
- 新增 `execution_summary` 或 `agent_run_summary`：拒绝，这是明确非目标。
- 对过长 final turns 直接不保存：拒绝，这会让恢复行为不一致。

## 决策：duplicate prevention 使用现有 state，而不是 persisted turnId

**理由**：澄清已经决定不持久化 metadata。因此 duplicate prevention 在 append 前读取当前 ThreadState：优先按相同 message id 去重，没有时按相同 user/assistant final text pair 去重。对于本版的 bounded recent-message memory 目标，这已经足够。

**考虑过的替代方案**：

- 持久化 turnId 以获得更严格的幂等：拒绝，因为这会重新引入 metadata persistence。
- 只依赖控制流避免重复：拒绝，因为 Tasklist resume 和 Delivery workflow completion 在集成时可能被多个 runtime layer 观察到。

## 决策：不扩展 public API、stream、frontend 或 database contract

**理由**：hydration 已经返回 text-compatible messages，frontend 也已经只消费 completed 的 user/assistant text-only messages。v0.4.3 可以在不改协议、不改 reducer shape 的前提下，实现 final turns 的 refresh recovery。

**考虑过的替代方案**：

- 在 hydration 中增加 source badge 或 display kind：拒绝，属于后续 UI 工作。
- 增加 ChatSession/ChatMessage tables：拒绝，这是 multi-session/product history 范围。
- 增加 LangGraph Store/PostgresStore：拒绝，这是 long-term memory 范围。
