# 功能规格：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**功能分支**：`[043-tool-agent-final-turn-memory]`

**创建时间**：2026-07-03

**状态**：Draft

**输入**：用户需求描述：“在 v0.4.2 LangGraph Single Thread Memory Baseline 基础上，扩展普通 tool、MCP/resource、Tasklist Agent、Delivery Chain 和未来 Agent 的 final-turn eligibility。只把用户问题和最终用户可见回答保存为 current chat ThreadState recent messages；不得保存中间执行态、raw tool transcript、GraphState、HITL checkpoint、RuntimeArtifact、workflow progress、subagent raw invocation/result、raw prompt 或 raw provider response。”

## 澄清记录

### 会话 2026-07-03

- Q：Tasklist 和 Delivery 的长 final text 怎么处理？ → A：使用确定性截断，不做模型摘要。Delivery final report 最多保存 8000 字符；Tasklist 仍然只保存 final answer text summary。
- Q：用户可见的失败报告或异常报告是否属于可保存 final turn？ → A：只保存 completed、final 或 controlled blocked 的最终回答；failed 或 exception 报告不保存。
- Q：`source`、`turnId`、`displayKind` 这些 metadata 是否要持久化到 ThreadState？ → A：不持久化；只在 append 阶段用于 guardrail、logging 和 duplicate prevention。
- Q：在不持久化 metadata 的前提下，如何避免 final-turn 重复写入？ → A：写入前先对比当前 ThreadState；有 message id 时按 message id 去重，否则按相同 user/assistant final text pair 去重。
- Q：Tasklist Agent 的 artifact markdown 是否进入 chat memory？ → A：只保存 Tasklist final answer text summary，不保存 tasklist artifact markdown。

## 用户场景与测试（必填）

### 用户故事 1 - 恢复 Tool 与 Resource 的最终回答（优先级：P1）

用户在同一浏览器会话中使用普通工具、reader utility、docs summary 或 MCP/resource 能力后刷新页面，仍能看到该轮的用户问题和最终助手回答，而不是只恢复普通直答历史。

**为什么是这个优先级**：普通 tool/resource 已经是当前聊天体验的一部分。刷新后丢失这些最终问答，会让同会话 memory 行为不一致。

**独立测试**：完成一轮普通 tool 或 MCP/resource 辅助回答后刷新页面。刷新后只恢复用户问题和最终回答文本，不恢复 tool/resource 卡片或 raw transcript。

**验收场景**：

1. **Given** 用户完成一轮普通 tool-assisted 回答，**When** 用户刷新页面，**Then** 聊天页恢复该轮用户问题和最终助手文本回答。
2. **Given** 用户完成一轮 MCP/resource 辅助回答，**When** 用户请求恢复当前线程，**Then** 恢复数据只包含 text messages，不包含 resource raw content、MCP envelope、tool args 或 tool result raw payload。
3. **Given** tool 执行过程中产生中间卡片、错误卡片或资源预览，**When** final turn 被保存，**Then** chat memory 只保存最终用户可见回答文本，不保存中间卡片内容。

---

### 用户故事 2 - 恢复 Tasklist Agent 的最终回合（优先级：P2）

用户通过 `/tasklist + @demo://version-plans/*.md` 完成受控 Tasklist Agent 运行后刷新页面，能恢复该轮用户目标和最终用户可见文本摘要；但 Tasklist artifact markdown、Tasklist GraphState、HITL checkpoint、interrupt payload 和 AgentRun 内部状态仍保持隔离。

**为什么是这个优先级**：Tasklist Agent 对用户来说也是一轮完整对话。最终结果缺失会让刷新后的聊天历史断裂；但把 Agent 内部状态混入 chat memory，会破坏现有边界。

**独立测试**：完成一轮 Tasklist Agent final run 后刷新页面。恢复结果应包含普通文本气泡，不包含 agent-step、agent-interrupt、artifact、tasklist artifact markdown 或 GraphState。

**验收场景**：

1. **Given** Tasklist Agent 完成并输出最终用户可见回答，**When** chat thread 被恢复，**Then** 用户看到原始用户目标和最终回答文本摘要。
2. **Given** Tasklist Agent 在 HITL 审核点暂停，**When** chat memory 写入判定运行，**Then** 不保存 paused/interrupted turn 为 completed memory。
3. **Given** Tasklist Agent resume 使用自己的 thread id 和业务 run 状态，**When** chat memory 开启，**Then** resume 仍不读取、不写入、不接受 chat memory thread id。

---

### 用户故事 3 - 恢复 Delivery Chain 的最终报告（优先级：P2）

用户运行 `/delivery-chain` 并获得最终交付报告后刷新页面，能恢复该轮输入和最终用户可见报告文本；但 Delivery Chain 的 workflow progress、RuntimeArtifact、subagent raw invocation/result 和 manager trace 仍只存在于运行时边界内。

**为什么是这个优先级**：Delivery Chain 的最终报告是用户可见的最终回答，应具备和普通聊天一致的刷新恢复能力；同时 Delivery Chain 仍必须保持 run-local、无 checkpoint/resume 语义。

**独立测试**：完成一轮 Delivery Chain 后刷新页面。恢复结果只包含用户输入和最终报告文本，不包含 progress panel、runtime artifact、subagent trace 或 raw result。

**验收场景**：

1. **Given** Delivery Chain 完成并输出 final report，**When** 用户刷新页面，**Then** 最近消息恢复包含该 final report 的普通 text assistant message。
2. **Given** Delivery Chain 执行过程中产生 workflow progress，**When** chat memory 写入 final turn，**Then** workflow progress 不进入 messages、hydration 或 model context。
3. **Given** Delivery Chain 内部生成 run-local artifacts 和 subagent results，**When** final report 被保存，**Then** chat memory 只保存用户可见 report text，不保存 artifact object、trace 或 raw subagent result。

---

### 用户故事 4 - 保持 Memory 安全且有界（优先级：P1）

系统在扩展 final-turn memory 后，仍保持 v0.4.2 的安全 hydration、server-authoritative context、有界 recent messages、summary compaction 和 raw runtime state exclusion。

**为什么是这个优先级**：v0.4.3 的主要风险不是缺少写入能力，而是误把执行态当成聊天历史，导致隐私、安全和架构边界回归。

**独立测试**：通过 hydration DTO、model context、compaction 和 non-regression tests 验证。无论 final turn 来源是什么，公开恢复数据和模型上下文都只包含安全文本。

**验收场景**：

1. **Given** ThreadState recent messages 包含普通 chat、tool final、Tasklist final 和 Delivery final turns，**When** 构建下一轮模型上下文，**Then** 只注入 summary、pinned decisions、recent text messages 和当前用户输入。
2. **Given** 旧消息超过 recent window，**When** compaction 触发，**Then** 旧的 final turns 可被压缩进 summary/pinned decisions，但 raw transcript 和 runtime state 仍不得出现。
3. **Given** hydration route 返回当前 thread，**When** 响应被校验，**Then** DTO 不包含 forbidden raw fields、execution state、tool/resource/agent/workflow/artifact parts 或 provider internals。

### 边界场景

- 用户刷新时没有已保存 memory：返回空恢复结果，不显示内部错误。
- 用户取消请求或连接中断：不得把未完成 assistant message 保存为 completed final turn。
- final answer 文本为空或只有空白：不得保存该 turn。
- tool/resource 执行失败但最终模型生成了用户可见解释：只可保存最终解释文本，不保存 raw failure object。
- Tasklist Agent paused/interrupted：不得保存为 final turn；resume 仍由 Tasklist Agent 自己的 run 和 checkpoint 语义处理。
- Delivery Chain 或 Tasklist Agent 失败并输出安全失败报告：不作为 v0.4.3 final-turn memory 写入对象。
- 同一 final turn 被 orchestrator、agent coordinator 或 workflow runtime 多次观察：写入前必须基于当前 ThreadState 的 message id 或相同 user/assistant final text pair 跳过重复写入。
- final report 过长：系统必须保存确定性截断版 final text。Delivery final report 上限为 8000 字符；不得引入 execution summary、模型摘要，或让单个 final turn 破坏恢复、上下文构建或 compaction。
- Tasklist artifact markdown 过长或存在：不得保存 artifact markdown；只保存最终文本摘要。

## 需求（必填）

### 功能需求

- **FR-043-001**：System MUST persist completed user-visible final turns for ordinary chat, tool-assisted chat, reader/utility answers, docs summary answers, MCP/resource-assisted answers, Tasklist Agent final answers, Delivery Chain final reports, and future controlled agent final answers when they are eligible.
- **FR-043-002**：System MUST persist only the latest user input text and the final assistant text visible to the user for each eligible final turn.
- **FR-043-003**：System MUST NOT persist intermediate execution state, raw tool calls, raw tool messages, raw tool args/results, raw MCP envelopes, raw MCP resource content, workflow progress, Tasklist GraphState, HITL checkpoint, interrupt payload, Delivery RuntimeArtifact, subagent raw invocation/result, raw prompt, raw provider response, stack trace, API key, cookie value, or provider configuration in chat memory.
- **FR-043-004**：System MUST keep hydration output compatible with the existing text message recovery behavior: hydrated messages are ordinary completed user/assistant text messages.
- **FR-043-005**：System MUST keep final-turn memory writes separate from model context eligibility so structured runtimes can write final text without automatically inheriting ordinary chat context or resume semantics.
- **FR-043-006**：System MUST preserve v0.4.2 server-authoritative context assembly for eligible chat paths: model-visible history comes from bounded ThreadState summary, pinned decisions, recent text messages, and the latest current user input.
- **FR-043-007**：System MUST keep persisted ThreadState messages text-only for v0.4.3 and MUST NOT persist source, turn identity, display kind, or other final-turn metadata in ThreadState.
- **FR-043-008**：System MAY use source and turn identity internally during append for guardrails, logging, and duplicate prevention, but this metadata MUST NOT be hydrated, injected into model context, or persisted as message fields.
- **FR-043-009**：System MUST reject empty, cancelled, incomplete, paused, or transient outputs as final turns.
- **FR-043-010**：System MUST prevent duplicate writes for the same completed final turn by checking current ThreadState for an existing matching message id when available or an identical user/assistant final text pair before appending.
- **FR-043-011**：System MUST keep Tasklist Agent checkpoint/resume thread identity separate from chat memory thread identity.
- **FR-043-012**：System MUST keep Delivery Chain run-local behavior unchanged and MUST NOT introduce checkpoint, resume, artifact persistence, or long-term history semantics for Delivery Chain.
- **FR-043-013**：System MUST keep recent messages bounded and continue to compact older text-only turns into summary and pinned decisions when thresholds are exceeded.
- **FR-043-014**：System MUST ensure compaction failure does not corrupt existing memory or fail an already completed user-facing answer.
- **FR-043-015**：System MUST preserve safe degraded behavior when memory read, write, or compaction is unavailable.
- **FR-043-016**：System MUST keep stream protocol compatibility and MUST NOT require new final-turn stream chunks for v0.4.3.
- **FR-043-017**：System MUST keep frontend reducer public shape compatible with existing messages.
- **FR-043-018**：System MUST NOT add ChatSession or ChatMessage business history tables, long-term memory, multi-session history list, LangGraph Store, PostgresStore, Memory Inspector, contextEntries, reasoning summary, execution summary, tool observation summary, or agent run summary in v0.4.3.
- **FR-043-019**：System MUST bound long structured final text before saving to chat memory by deterministic truncation, not model summary; Delivery Chain final report MUST be saved up to 8000 characters and MUST NOT create or persist execution summary data.
- **FR-043-020**：System MUST save only completed, final, or controlled blocked final answers; failed runs, exception reports, cancelled turns, and paused/interrupted turns MUST NOT be saved as completed final turns.
- **FR-043-021**：System MUST save only the Tasklist Agent final answer text summary and MUST NOT save tasklist artifact markdown in chat memory.

### 关键实体（若涉及数据则必填）

- **Final Turn**：一轮已完成、用户可见的对话回合，由一条用户文本输入和一条最终助手文本回答组成。
- **Final Turn Source**：仅在 append 阶段使用、不会持久化的内部分类，用来对 ordinary chat、tool、MCP/resource、Tasklist Agent、Delivery Chain 或未来受控 agent 应用 source-specific guardrail。
- **Final Turn Identity**：仅在 append 阶段使用、不会持久化的内部身份，用来避免同一 completed turn 重复写入。
- **Chat Thread Memory**：当前浏览器会话可恢复的有界 memory，包含 recent text messages、summary、pinned decisions 和可选的 compaction metadata。
- **Forbidden Runtime State**：任何执行时对象或原始内部 payload。它们可能对运行 tools、agents、workflows、checkpoints 或 provider calls 有用，但不安全，也不适合作为可恢复聊天历史。

## 成功标准（必填）

### 可衡量结果

- **SC-043-001**：完成 ordinary tool-assisted final answer 并在同一浏览器会话中刷新后，用户在健康存储场景下能看到恢复的用户问题和最终助手回答。
- **SC-043-002**：完成 MCP/resource-assisted final answer 并在同一浏览器会话中刷新后，用户能看到恢复的用户问题和最终助手回答，且不包含 resource raw content 或 MCP envelope。
- **SC-043-003**：完成 Tasklist Agent final answer 并在同一浏览器会话中刷新后，用户能看到 text-only 的恢复结果，同时 Tasklist resume 行为保持不变。
- **SC-043-004**：完成 Delivery Chain final report 并在同一浏览器会话中刷新后，用户能看到 text-only 的恢复结果，同时 Delivery Chain 仍保持 run-local。
- **SC-043-005**：在 ordinary chat、tool、MCP/resource、Tasklist Agent 和 Delivery Chain final-turn 场景中，hydration 响应包含 0 个 forbidden raw runtime fields。
- **SC-043-006**：后续 ordinary chat 的 model-visible context 中，raw tool transcript、GraphState、RuntimeArtifact、workflow progress、subagent raw result、raw prompt 和 raw provider response 的数量为 0。
- **SC-043-007**：即使多个 runtime layer 都观察到 completion，同一个 completed final turn 最多也只写入一次。
- **SC-043-008**：Tasklist resume、Delivery Chain、ToolRuntimeScope transcript suppression、stream protocol、hydration、frontend reducer、typecheck、lint 和 build 的现有 focused non-regression suites 持续通过。
- **SC-043-009**：超长 Delivery final report 仍能以确定性截断后的 text message 恢复，上限 8000 字符；不新增 execution-summary 字段，也不暴露 runtime internals。
- **SC-043-010**：failed runs、exception reports、paused turns 和 cancelled turns 不会以 completed final turn 的形式出现在恢复后的 chat memory 中。
- **SC-043-011**：Tasklist artifact markdown 不会出现在 ThreadState messages、hydration 或 model-visible chat memory context 中。

## 假设

- v0.4.3 构建在 v0.4.2 的单 current-chat memory baseline 之上，不引入 multi-session history。
- 当前 chat memory 仍然是 runtime support feature，用于 refresh recovery 和 bounded context reconstruction，不是产品级 history database。
- `source` 和 turn identity metadata 在 v0.4.3 里只用于 append-time；persisted ThreadState messages 仍然是 text-only。
- 面向用户的 source badge、execution summary、collapsed history 或 memory inspection 会延后到后续版本。
- 对 structured runtimes 的 failure reports 采用保守策略：MVP memory 只覆盖 completed、final 或 controlled blocked 的最终回答。
- Tasklist Agent artifact markdown 仍然属于 Agent artifact output，不属于 chat memory 内容。
- 长文本 Delivery 输出在持久化前会先做确定性截断，只截取最终可见文本的前 8000 字符；v0.4.3 不使用模型摘要，也不创造新的 execution-summary 模型。
