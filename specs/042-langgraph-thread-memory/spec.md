# Feature Specification: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Feature Branch**: `[042-langgraph-thread-memory]`

**Created**: 2026-07-02

**Status**: Implemented

**Input**: User description: "为当前唯一聊天会话引入 LangGraph thread memory baseline。刷新后恢复 recent messages，并通过 summary compaction 和 pinnedDecisions 控制模型上下文大小。不做多会话历史、长期记忆、HITL、tool transcript 持久化或 Tasklist / Delivery Chain 内部状态纳入 chat memory。"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Refresh Restores Current Chat (Priority: P1)

用户在当前浏览器中完成普通聊天后刷新页面，系统恢复同一单会话的最近可见对话，让用户可以继续在上下文中提问，而不是从空白聊天重新开始。

**Why this priority**: 这是本版本的核心用户价值。当前页面刷新会丢失前端内存中的消息，导致普通聊天缺少最基本的会话连续性。

**Independent Test**: 可以通过一次普通问答后刷新页面验证。刷新后最近用户消息和助手回答仍显示在聊天页，并且用户继续提问时系统能参考已恢复的上下文。

**Acceptance Scenarios**:

1. **Given** 用户在同一浏览器会话中完成至少一轮普通聊天，**When** 用户刷新页面，**Then** 聊天页恢复最近可见消息，并标记本次恢复成功。
2. **Given** 当前浏览器会话没有已保存的聊天记忆，**When** 用户打开或刷新聊天页，**Then** 聊天页保持空状态，并且不会显示错误或内部恢复细节。
3. **Given** 用户清除浏览器会话 cookie 或换到另一个浏览器，**When** 用户打开聊天页，**Then** 系统不恢复原浏览器的聊天记忆。

---

### User Story 2 - Continue With Compacted Context (Priority: P1)

用户连续聊天很多轮后，系统保留近期对话，并用更早对话摘要和关键决策维持上下文连续性，避免每次请求都携带无限完整历史。

**Why this priority**: 单会话记忆如果只追加完整消息，会很快触发输入长度限制或造成响应退化。本版本必须把可恢复和可控上下文作为同一个能力交付。

**Independent Test**: 可以通过构造超过阈值的多轮聊天验证。继续提问时，系统只使用近期消息、早期摘要和关键决策，不注入全部历史。

**Acceptance Scenarios**:

1. **Given** 当前聊天消息超过压缩阈值，**When** 一轮助手回答成功完成，**Then** 系统保留最近消息，并将更早内容压缩进摘要。
2. **Given** 对话中包含用户明确表达的关键结论或架构边界，**When** 系统压缩上下文，**Then** 关键结论被保留在受控数量的 pinned decisions 中。
3. **Given** 压缩过程失败，**When** 用户已经收到本轮回答，**Then** 本轮回答不被回滚，已有可用记忆不被破坏，下一轮聊天仍可继续。
4. **Given** 普通 chat memory 路径触发上下文压缩，**When** 压缩开始、成功或失败，**Then** 前端收到向后兼容的压缩状态事件，并以独立弱提示展示，而不是把状态文案写进聊天正文。

---

### User Story 3 - Safe Hydration Payload (Priority: P2)

用户刷新页面时，前端只拿到可展示的恢复数据，而不是运行时 checkpoint、内部 prompt、provider response、Tasklist GraphState 或 Delivery Chain 内部产物。

**Why this priority**: 本项目已有 AgentRun、LangGraph checkpoint、Delivery Chain RuntimeArtifact 等内部状态。单会话记忆必须避免把这些内部运行态误暴露为产品数据。

**Independent Test**: 可以直接请求 hydration 数据并校验响应字段。响应只包含 thread 标识、recent messages、安全摘要预览、pinned decisions 和 restored 状态。

**Acceptance Scenarios**:

1. **Given** 当前 chat thread 已保存记忆，**When** 前端请求恢复数据，**Then** 响应只返回最近可见消息、摘要预览、关键决策和恢复状态。
2. **Given** checkpoint 中存在 runtime 内部字段，**When** 前端请求恢复数据，**Then** 响应不得包含 raw checkpoint、raw prompt、raw provider response、stack trace 或内部 GraphState。
3. **Given** Tasklist Agent 或 Delivery Chain 曾在页面中运行，**When** 前端请求普通 chat hydrate，**Then** 响应不得包含 Tasklist GraphState、HITL checkpoint、Delivery Chain RuntimeArtifact 或 subagent raw invocation/result。

---

### User Story 4 - Existing Agent And Delivery Paths Do Not Regress (Priority: P2)

用户继续使用 Tasklist Agent HITL / checkpoint / resume 和 Delivery Chain ControlledDeliveryManager 时，这些路径保持原有语义，不被普通 chat memory 接管或污染。

**Why this priority**: 当前项目已经把 Tasklist Agent checkpoint resume 和 Delivery Chain run-local artifact 作为稳定边界。本版本新增记忆不能破坏已有能力。

**Independent Test**: 可以通过现有 Tasklist resume 和 Delivery Chain workflow 回归测试验证。普通 chat memory 开关开启后，原路径行为、公开 DTO 和流式展示仍保持兼容。

**Acceptance Scenarios**:

1. **Given** Tasklist Agent 命中人工审核暂停，**When** 用户按原流程 resume，**Then** resume 仍使用 Tasklist Agent 自己的 thread 和业务状态，不读取或写入 chat thread memory。
2. **Given** 用户运行 Delivery Chain，**When** Manager 生成 run-local artifacts 和 workflow progress，**Then** 这些内部产物不进入普通 chat ThreadState。
3. **Given** 普通 chat memory 开启，**When** 现有 stream chunks 被前端 reducer 消费，**Then** chunk union 和前端 reducer public shape 不发生破坏性变化。

### Edge Cases

- 当前浏览器没有 session cookie 时，系统应创建新的浏览器会话，并返回空的 chat memory 恢复结果。
- checkpoint storage 暂时不可用时，普通聊天应尽可能降级为无记忆聊天；用户不应看到 raw database 或 checkpoint 错误。
- recent messages 为空但 summary 或 pinned decisions 存在时，系统可恢复上下文提示，但不应凭空展示不存在的聊天气泡。
- 用户快速刷新或连续发送时，系统不得把未完成流式回答保存为已完成助手消息。
- summary 或 pinned decisions 超过上限时，系统必须裁剪到受控范围。
- compaction 输出为空、格式无效或超时后，系统必须保留压缩前的可用状态。
- 结构化命令、tool/resource 卡片、agent trace、workflow progress 和 artifacts 不得被当作普通 chat memory 的完整消息保存。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-042-001**: System MUST provide a single current-chat memory for the current browser session.
- **FR-042-002**: System MUST restore recent user-visible chat messages after a page refresh within the same browser session.
- **FR-042-003**: System MUST distinguish chat memory threads from Tasklist Agent, Delivery Chain, and any future runtime threads by namespace.
- **FR-042-004**: System MUST NOT mix chat memory thread identifiers with Tasklist Agent checkpoint / resume thread identifiers.
- **FR-042-005**: System MUST NOT expose raw browser session identifiers in public DTOs or client-readable thread identifiers.
- **FR-042-006**: System MUST store only text-based user-visible recent messages in chat memory for this version.
- **FR-042-007**: System MUST NOT store ordinary tool transcripts, MCP tool/resource transcripts, Tasklist GraphState, HITL checkpoint state, Delivery Chain RuntimeArtifact, subagent raw invocation/result, raw prompt, raw provider response, stack trace, API key, cookie value, or provider config in chat ThreadState.
- **FR-042-008**: System MUST keep chat memory recent context bounded by a configurable or documented recent-turn threshold, with message-count retention derived from whole user/assistant turns.
- **FR-042-009**: System MUST compact older conversation content into a bounded summary when recent stored messages exceed the derived threshold.
- **FR-042-010**: System MUST preserve a bounded list of pinned decisions that represent important user decisions, architecture boundaries, and explicit conclusions.
- **FR-042-011**: System MUST ensure compaction failure does not corrupt existing chat memory or fail an already completed user-facing answer.
- **FR-042-012**: System MUST write chat memory at most once per completed assistant turn, not once per streaming chunk.
- **FR-042-013**: System MUST NOT save cancelled, transient, or incomplete assistant placeholders as completed memory messages.
- **FR-042-014**: System MUST build model-visible context from summary, pinned decisions, and recent messages rather than injecting all historical messages.
- **FR-042-015**: System MUST provide a safe hydration response containing only threadId, recent messages, optional summary preview, pinned decisions, and restored status.
- **FR-042-016**: System MUST validate hydration response shape before it reaches the frontend.
- **FR-042-017**: System MUST allow development and test environments to use non-durable memory checkpoint behavior while the release target supports durable checkpoint behavior.
- **FR-042-018**: System MUST keep checkpoint storage ownership separate from Prisma business tables.
- **FR-042-019**: System MUST NOT add a full ChatSession or ChatMessage business history table in this version.
- **FR-042-020**: System MUST keep Tasklist Agent HITL / checkpoint / resume semantics unchanged.
- **FR-042-021**: System MUST keep Delivery Chain ControlledDeliveryManager, RuntimeArtifact run-local boundary, and ToolRuntimeScope transcript suppression unchanged.
- **FR-042-022**: System MUST keep stream protocol chunk union backward-compatible unless a later approved spec explicitly changes it.
- **FR-042-023**: System MUST keep the frontend message reducer public shape compatible with existing messages.
- **FR-042-024**: System MUST provide user-friendly fallback behavior when chat memory read, write, or compaction is unavailable.
- **FR-042-025**: System MUST use model-generated structured output for compaction and validate only `summary` and `pinnedDecisions` from the model result.
- **FR-042-026**: System MUST derive `recentMessages` and `lastCompactedAt` locally after a successful compaction, rather than trusting model output for those fields.
- **FR-042-027**: System MUST use the fixed internal compaction model id `deepseek/deepseek-v4-pro` for v0.4.2, independent from the user's selected chat model id.
- **FR-042-028**: System MUST disable reasoning and use non-streaming invocation for the internal compaction call.
- **FR-042-029**: System MUST reduce retained recent turns to half of `CHAT_MEMORY_RECENT_TURN_LIMIT` after a successful compaction so the next turn does not immediately re-trigger compaction.
- **FR-042-030**: System MUST treat server-side chat ThreadState as the authoritative model-context history source for eligible chat memory paths.
- **FR-042-031**: System MUST use only the latest eligible user message from the frontend chat request as the current turn input when chat memory is authoritative; frontend-sent historical messages are compatibility/UI payload, not model-context history.
- **FR-042-032**: System MUST apply input length validation to the effective server-authoritative model input for eligible chat memory paths, so oversized frontend history payloads do not block a request that only needs the latest user turn plus bounded ThreadState context.
- **FR-042-033**: System MUST emit a backward-compatible `thread-memory-status` stream chunk when eligible chat memory compaction starts, succeeds, or fails.
- **FR-042-034**: System MUST keep compaction status hints outside ordinary assistant message正文; success and failure hints may persist in the UI after stream completion until a later turn supersedes them.

### Key Entities _(include if feature involves data)_

- **Chat Thread Memory**: The recoverable state for the current browser chat session. It contains recent text messages, a bounded summary, bounded pinned decisions, and optional compaction metadata.
- **Recent Message**: A text-only, user-visible message suitable for restoring the chat UI and reconstructing short-term model context.
- **Conversation Summary**: A bounded natural language summary of earlier conversation turns that are no longer kept as recent messages.
- **Pinned Decision**: A concise record of an important user decision, architecture boundary, or explicit conclusion that should survive compaction.
- **Hydration Payload**: The public response used by the frontend to restore the current chat view after refresh.
- **Runtime Thread Identifier**: A namespaced identifier that separates chat memory from Tasklist Agent and Delivery Chain runtime state.

## Scope Boundaries

### In Scope

- Current browser single-session chat memory.
- Refresh recovery for recent text-only messages.
- Summary compaction for older chat turns.
- Pinned decisions for important conclusions and boundaries.
- Safe hydration DTO.
- Durable release target for chat checkpoint state.
- Non-regression for Tasklist Agent, Delivery Chain, stream protocol, and frontend reducer shape.

### Non-Goals

- Multiple chat sessions menu.
- ChatGPT-style left sidebar history.
- Full ChatSession / ChatMessage business tables.
- Historical message pagination.
- Historical search.
- Message edit or delete persistence.
- Long-term memory across sessions or users.
- LangGraph Store / PostgresStore.
- Vector memory or pgvector.
- Memory Inspector.
- HITL or checkpoint resume product UI for chat memory.
- Tool-calling transcript persistence.
- Tasklist Agent or Delivery Chain internal runtime state inside chat memory.
- Delivery Chain subagent raw invocation/result persistence.
- Raw runtime trace exposure.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-042-001**: After completing a normal chat turn and refreshing the page in the same browser session, the user sees restored recent messages in at least 95% of healthy storage cases.
- **SC-042-002**: A chat with more than the configured recent-turn threshold continues without sending the full historical conversation to the model.
- **SC-042-003**: Hydration responses contain zero raw checkpoint, raw prompt, provider response, stack trace, Tasklist GraphState, or Delivery Chain RuntimeArtifact fields in contract tests.
- **SC-042-004**: Compaction failure does not prevent the user from receiving the already completed assistant answer in 100% of tested failure scenarios.
- **SC-042-005**: Existing Tasklist Agent HITL resume tests and Delivery Chain manager tests continue to pass with chat memory enabled.
- **SC-042-006**: Existing stream protocol schema tests and frontend message reducer tests continue to pass without requiring breaking consumer changes.
- **SC-042-007**: The restored chat view remains usable when no prior memory exists, with no user-visible internal error message.

## Assumptions

- The current product still has exactly one visible chat session per browser session.
- Browser session ownership is based on the existing HttpOnly session cookie mechanism.
- Public thread identifiers use a derived, non-raw session identity.
- Chat memory release behavior targets durable checkpoint storage; development and tests may use non-durable memory checkpoint behavior.
- Chat memory checkpoint storage remains separate from Prisma-managed business tables.
- Chat memory uses its own checkpoint namespace or schema so Tasklist Agent checkpoint state remains isolated.
- Summary and pinned decisions are model-generated through structured output, provided the output is bounded, validated, and failure-safe.
- The first v0.4.2 UI focuses on restoring recent messages; summary preview and pinned decisions may be returned for safe DTO completeness without becoming a prominent user-facing panel.
- The compaction status hint is a subtle runtime affordance near the composer area rather than a persisted chat bubble or hydration payload field.
- Structured command turns such as Tasklist Agent and Delivery Chain are not saved into chat ThreadState in this version.
- The internal compaction model id is fixed for this version even though the same provider model name may be served by different upstream providers.
- For eligible ordinary chat memory paths, frontend `messages` remains accepted for API compatibility and UI state, but the model-visible history is assembled server-side from ThreadState plus the latest frontend user message.
