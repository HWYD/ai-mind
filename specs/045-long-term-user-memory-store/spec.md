# Feature Specification: AI Mind v0.4.5 Long-term User Memory Store Baseline

**Feature Branch**: `[045-long-term-user-memory-store]`

**Created**: 2026-07-06

**Status**: Finalized

## Summary

v0.4.5 在 v0.4.4 “多会话短期记忆容器”之上，引入当前 browser session 范围内的长期 `UserMemory`。用户在 conversation A 中明确要求系统长期记住的偏好、稳定用户背景、稳定指令或工作流规则，可以在同一 browser session 下的 conversation B 的相关问题中被召回，并作为受控补充上下文注入模型输入。

`UserMemory` 是长期用户记忆，不是完整聊天历史、账号级用户画像或项目规则库。它必须与 conversation-scoped `ThreadState` 保持分离：`ThreadState` 仍然是 selected conversation 的短期上下文事实源，`UserMemory Store` 只保存跨 conversations 可复用、经过校验的长期记忆。UserMemory 不进入 hydration payload，不混入 Conversation Registry，不写入 `ThreadState.messages` 或 `pinnedDecisions`，也不作为 ChatMessage business history。

本版本的最小产品边界是：在每个 eligible completed ordinary turn 后必须 enqueue 一个 in-process best-effort UserMemory extraction job；用模型结构化输出 `0..N` 条候选长期记忆；把 explicit memory intent 作为强信号而不是唯一入口；在 compaction 成功后对新增或变化的 `pinnedDecisions` 做可选 promotion；用 deterministic validation 决定候选能否入库；在 eligible ordinary chat path 中按相关性召回少量记忆并有界注入；当 Store 不可用时安全降级到无长期记忆模式。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Extract Memory From Eligible Completed Turns (Priority: P1)

每个 eligible ordinary text chat 或 tool-assisted ordinary chat 的 completed turn 结束后，系统必须 enqueue 一个 in-process best-effort UserMemory extraction job。pipeline 只能从本轮 user message、assistant final text 和少量安全短期上下文中结构化抽取 `0..N` 条候选记忆；用户明确说“记住我喜欢吃桃子”或“以后解释技术问题时，先用大白话，再补充专业说法”时应作为强信号处理。保存失败不能影响已经完成的用户可见回答。

**Independent Test**: 在一个 persisted conversation 中发送普通 completed turn 和明确记忆请求，等待 assistant final turn 完成。验证每个 eligible turn 都 enqueue 一个 in-process best-effort extraction job；模型结构化输出带 `stability` 与 `identity` 字段的 `0..N` candidates；安全 candidate 通过 validation 后写入当前 browser session scope 并记录来源 conversation；如果 Store 写入失败，最终回答仍然完成且 selected conversation ThreadState 不被破坏。

**Acceptance Scenarios**:

1. **Given** 一个 eligible ordinary completed turn 已完成，**When** final-turn 后处理执行，**Then** 系统必须 enqueue 一个 in-process best-effort UserMemory extraction job，且不阻塞用户可见回答。
2. **Given** 用户在 persisted conversation 中说“记住我喜欢吃桃子”，**When** extraction job 运行，**Then** 结构化 candidate 应把 explicit intent 作为强信号并可保存“用户喜欢吃桃子”作为长期 UserMemory。
3. **Given** 用户说“以后解释技术问题时，先用大白话，再补充专业说法”，**When** extraction job 运行，**Then** 系统可以保存该回答风格偏好作为长期 UserMemory。
4. **Given** completed turn 没有长期记忆价值，**When** extraction job 运行，**Then** 模型可以结构化输出 0 条 candidate，系统不得写入无关记忆。
5. **Given** UserMemory Store 写入失败，**When** assistant final turn 已经完成，**Then** 用户仍然收到正常回答，当前 conversation 的 ThreadState 不回滚、不串线、不暴露 raw store error。

---

### User Story 2 - Reuse Memory Across Conversations (Priority: P1)

用户在 conversation A 中保存了长期偏好后，新开 conversation B 提问相关问题时，系统可以召回少量相关 UserMemory 并作为补充上下文使用。

**Independent Test**: 在 conversation A 保存“用户喜欢吃桃子”，再从 blank draft 创建 conversation B 并问“给我推荐几种水果”。验证召回只发生在当前 browser session scope，注入内容包含相关 UserMemory，且 conversation B 的 ThreadState 不包含 conversation A 的 messages。

**Acceptance Scenarios**:

1. **Given** conversation A 已保存“用户喜欢吃桃子”，**When** 同一 browser session 下的 conversation B 询问“给我推荐几种水果”，**Then** 系统可以召回该 UserMemory 并优先推荐桃子。
2. **Given** conversation A 有完整聊天 messages，**When** conversation B 触发 UserMemory retrieval，**Then** 系统不得把 conversation A 的完整 messages、summary 或 raw transcript 注入 conversation B。
3. **Given** UserMemory 与当前用户输入冲突，**When** 系统组装上下文，**Then** 当前 latest user message 优先于旧 UserMemory。

---

### User Story 3 - Do Not Inject Irrelevant Memory (Priority: P1)

用户保存过某条用户偏好后，询问无关技术问题时，系统不应强行注入不相关 UserMemory。

**Independent Test**: 保存“用户喜欢吃桃子”后询问“解释一下 React useEffect”。验证 selected UserMemories 为空，模型上下文不包含这条用户偏好。

**Acceptance Scenarios**:

1. **Given** UserMemory Store 中只有“用户喜欢吃桃子”，**When** 用户问“解释 React useEffect”，**Then** 系统不得注入这条用户偏好。
2. **Given** 没有相关 UserMemory，**When** eligible chat request 组装上下文，**Then** 系统允许注入 0 条长期记忆。
3. **Given** Store 里存在多条记忆，**When** latest user input 只匹配其中一部分，**Then** 系统只选择相关且通过边界限制的少量 UserMemory。

---

### User Story 4 - Validate And Reject Unsafe Candidates (Priority: P1)

系统只保存经过 deterministic validation 的长期记忆候选。低置信、敏感、过长、重复、raw runtime state 或完整聊天记录必须被拒绝；临时情绪或推测性表达应优先在结构化提取阶段被归零，或者在模型显式输出 `stability=temporary/speculative` 时被程序拒绝，不再依赖窄关键词 validation 硬拒绝。

**Independent Test**: 分别提交敏感信息、临时情绪、完整 transcript、raw tool result、重复偏好和正常偏好，验证只有安全、稳定、相关且去重后的候选可以入库；临时情绪应在提取阶段返回 0 candidate 或最终不写入。

**Acceptance Scenarios**:

1. **Given** 用户说“这是我的身份证号……请记住”，**When** memory candidate validation 执行，**Then** 系统必须拒绝保存该敏感信息。
2. **Given** 用户说“我现在很难过”，**When** 没有明确长期记忆意图或稳定偏好，**Then** 系统不得保存临时情绪，且不要求依赖关键词 validation 硬拒绝。
3. **Given** candidate 包含完整 conversation transcript、raw tool result、MCP raw envelope、GraphState、RuntimeArtifact、provider response、raw prompt、API key、cookie 或 provider config，**When** validation 执行，**Then** 系统必须拒绝保存。
4. **Given** 已存在等价稳定记忆，**When** 系统处理重复 candidate，**Then** 系统不得创建重复 UserMemory。

---

### User Story 5 - Handle Conflict Or Update Signals (Priority: P2)

当用户明确否定或更新旧记忆时，系统应识别 conflict/update signal，并避免继续强化被否定的 UserMemory。

**Independent Test**: 先保存“用户喜欢吃桃子”，再发送“我现在不太喜欢吃桃子了，以后别按这个推荐”。验证系统识别更新或 suppression，后续水果推荐不再按旧记忆强化桃子。

**Acceptance Scenarios**:

1. **Given** Store 中已有“用户喜欢吃桃子”，**When** 用户明确说“不太喜欢吃桃子了，以后别按这个推荐”，**Then** 系统应将其识别为对旧 UserMemory 的 conflict/update signal。
2. **Given** 旧记忆已被明确否定，**When** 后续相关问题触发 retrieval，**Then** 系统不应继续使用旧记忆强化回答。
3. **Given** update 能归一到同一 stable key，**When** 系统保存更新后的偏好，**Then** 系统应更新或取代原记忆，而不是创建互相矛盾的重复记忆。

---

### User Story 6 - Promote Stable Pinned Decisions After Compaction (Priority: P2)

conversation compaction 成功后，如果 `pinnedDecisions` 中出现新增或变化的长期稳定偏好，系统可以把这些变化评估为 UserMemory promotion candidate。

**Independent Test**: 触发 conversation compaction，生成新增 pinnedDecision “用户偏好技术解释先大白话，再专业说明”。验证系统只评估新增或变化的 pinnedDecision，经过 validation 后才可 promotion，不把 summary 或全部 pinnedDecisions 直接写入长期记忆。

**Acceptance Scenarios**:

1. **Given** conversation compaction 成功完成且 pinnedDecisions 有新增内容，**When** promotion 评估执行，**Then** 系统只评估新增或变化的 pinnedDecisions。
2. **Given** compaction summary 已生成，**When** promotion 评估执行，**Then** 系统不得把 summary 整段直接保存为 UserMemory。
3. **Given** pinnedDecision 不具备长期记忆价值或未通过 validation，**When** promotion 评估完成，**Then** 系统不得写入 UserMemory。

---

### User Story 7 - Draft First Message Memory Extraction Is Enqueued Only After Promotion (Priority: P2)

用户在 blank draft 首条消息中说“记住我不吃香菜”时，系统必须先完成 draft promotion 并获得 persisted conversationId；只有 assistant final turn 完成后，才能 enqueue 带 source conversation 的 UserMemory extraction job，且只有 candidate 通过 validation 后才允许写入。

**Independent Test**: 从 blank draft 发送“记住我不吃香菜”。验证请求被接受后先创建 persisted conversation，assistant final turn 完成后才 enqueue extraction job，并记录 sourceConversationId；如果首条消息失败、取消或被拒绝，不 enqueue extraction、不写入长期记忆。

**Acceptance Scenarios**:

1. **Given** 用户处于 blank draft，**When** 首条 user message 被接受，**Then** 系统先完成 draft promotion 并获得 persisted conversationId。
2. **Given** draft 首条消息包含 explicit memory intent，**When** assistant final turn 完成，**Then** 系统必须 enqueue UserMemory extraction job，并关联 sourceConversationId。
3. **Given** draft 首条消息失败、取消或被拒绝，**When** memory extraction 后处理本应发生，**Then** 系统不得 enqueue extraction，也不得写入 UserMemory。

---

### User Story 8 - Store Failure Degrades Safely (Priority: P1)

当 UserMemory Store 读取或写入失败时，普通聊天继续，长期记忆功能降级为未启用状态。

**Independent Test**: 模拟 Store read/write unavailable。验证普通 chat 继续完成；retrieval 注入 0 条；write failure 不影响 final-turn memory；用户界面和 stream 不暴露 raw database/store/provider internals。

**Acceptance Scenarios**:

1. **Given** Store retrieval 失败，**When** 用户发送普通 chat request，**Then** 系统继续回答且注入 0 条 UserMemory。
2. **Given** Store write 失败，**When** assistant final turn 已完成，**Then** 用户可见回答、selected conversation ThreadState 和 streaming 状态不受影响。
3. **Given** Store 抛出内部错误，**When** 系统返回用户可见内容，**Then** 不暴露 raw database error、raw store envelope、raw checkpoint、API key、cookie 或 provider config。

### Edge Cases

- 当前 browser session 没有任何 UserMemory：retrieval 返回空选择，不影响 ordinary chat。
- UserMemory Store 暂时不可用：普通聊天降级为 no-long-term-memory mode。
- explicit memory intent 出现在 blank draft 首条消息中：必须先 promotion 为 persisted conversation，再在 final turn 后 enqueue memory extraction job。
- assistant final turn 尚未完成：不得写入长期记忆。
- assistant response cancelled、failed 或 rejected：不得写入长期记忆。
- eligible completed ordinary turn 没有长期记忆价值：structured extraction 应输出 0 条 candidate，系统不得写入无关记忆。
- 用户请求“记住”但内容为空、过短、过长、低置信或不可归类：拒绝保存。
- 用户要求保存敏感个人信息：默认拒绝。
- 用户要求保存完整聊天记录、raw tool result、MCP raw envelope、GraphState、RuntimeArtifact、workflow progress、provider response、raw prompt 或 provider config：拒绝保存。
- 用户重复保存同一偏好：stable key / dedupe 应避免重复记忆。
- 用户显式否定旧偏好：旧 UserMemory 应持久标记为 inactive/suppressed，后续 retrieval 不应继续强化旧记忆。
- 用户当前输入与旧 UserMemory 冲突：当前输入优先。
- Store 中存在多条相关记忆：最多选择 3 条，每条最多 300 字，总注入最多 900 字，且候选 confidence 必须 >= 0.7。
- Store 中存在无关记忆：允许注入 0 条或只注入相关子集。
- Hydration、sidebar list loading 或 conversation switching：不得触发 UserMemory retrieval 或把 UserMemory 放进 payload。
- Tasklist / Delivery 路径：v0.4.5 不接入 UserMemory retrieval，也不 enqueue UserMemory extraction job，只保持既有 final-turn memory 与 checkpoint/resume non-regression。
- Conversation A 的 UserMemory 可跨 conversation 召回，但 conversation A 的 messages、summary、pinnedDecisions 不得泄漏到 conversation B。

## Requirements _(mandatory)_

### Functional Requirements

#### UserMemory Store

- **FR-045-001**: System MUST provide a browser-session scoped UserMemory Store.
- **FR-045-002**: UserMemory Store MUST use the LangGraph Store abstraction.
- **FR-045-003**: UserMemory Store MUST support PostgresStore as the durable provider for production-oriented validation.
- **FR-045-004**: System MAY support an InMemoryStore fallback for local development and tests.
- **FR-045-005**: UserMemory Store MUST be separate from conversation ThreadState checkpoint storage.
- **FR-045-006**: UserMemory Store MUST be separate from Conversation Registry.
- **FR-045-007**: UserMemory namespace/key and safe source metadata MUST allow tracing the originating persisted conversation without exposing raw browser session id, raw checkpoint id, API key, cookie, provider config, raw provider response, or internal runtime state.

#### UserMemory Content

- **FR-045-008**: UserMemory MAY store long-term user preferences, stable user context, standing instructions, workflow preferences, recurring constraints, project-related context, and risk-control preferences.
- **FR-045-009**: UserMemory MUST NOT store full chat history, full conversation transcript, ChatMessage business history, account-level user profile, cross-device profile, raw tool result, MCP raw envelope, raw resource content, GraphState, RuntimeArtifact, workflow progress, raw prompt, raw provider response, stack trace, API key, cookie, or provider config.
- **FR-045-010**: UserMemory MUST NOT be written into ThreadState messages, ThreadState summary, ThreadState pinnedDecisions, hydration payload, Conversation Registry, frontend reducer public shape, or stream-core chunk payload.
- **FR-045-011**: System MUST treat selected conversation ThreadState as the short-term context source of truth, with UserMemory only as supplemental context.

#### Write Sources

- **FR-045-012**: System MUST provide an internal asynchronous UserMemory extraction pipeline for eligible completed ordinary turns.
- **FR-045-013**: System MUST enqueue one in-process best-effort UserMemory extraction job for every eligible completed ordinary turn, only after assistant final turn completion and only when a persisted source conversation identity is available.
- **FR-045-014**: System MUST NOT write UserMemory before assistant final turn completion.
- **FR-045-015**: System MUST NOT roll back or fail a completed user-facing answer because UserMemory extraction, validation, or write fails.
- **FR-045-016**: System SHOULD support UserMemory promotion candidates from newly added or changed pinnedDecisions after successful conversation compaction.
- **FR-045-017**: System MUST evaluate only newly added or changed pinnedDecisions for promotion.
- **FR-045-018**: System MUST run extraction only for eligible ordinary text chat and tool-assisted ordinary chat completed turns; Tasklist and Delivery turns MUST NOT enqueue UserMemory extraction jobs in v0.4.5.
- **FR-045-019**: System MUST NOT write compaction summary directly as UserMemory.
- **FR-045-020**: System MUST NOT scan full conversation transcripts to auto-extract UserMemory; extraction input must be bounded to the completed turn payload and safe short-term context.
- **FR-045-021**: System MUST treat explicit memory intent as a high-priority extraction signal, but explicit intent MUST NOT be the only trigger for the background pipeline.
- **FR-045-022**: System MUST NOT expose a direct memory-write tool to the main assistant in v0.4.5.

#### Candidate Extraction And Validation

- **FR-045-023**: System MUST use structured candidate extraction for the model-assisted extraction step, with schema-constrained output for `0..N` candidates.
- **FR-045-024**: Structured model output MAY propose candidate type, clean text, tags, confidence, stability, identity, action, reason, and conflictSignal. `identity` SHOULD be a small structured object such as `subject`, optional `facet`, and optional `polarity`, so the program can build a deterministic stable key without parsing sentence wording. When tags are present, they SHOULD include both the specific subject/object and a small number of reusable retrieval anchors that future related queries can directly overlap with.
- **FR-045-025**: System MUST make the final write/no-write decision with deterministic validation rules rather than model output alone.
- **FR-045-026**: System MUST validate every UserMemory candidate before writing.
- **FR-045-027**: System MUST reject low-confidence, unsafe, duplicate, oversized, or irrelevant candidates. Temporary emotion or speculative language SHOULD be filtered primarily by structured extraction guidance; when the structured candidate marks `stability` as `temporary` or `speculative`, deterministic validation MUST reject it rather than relying on narrow keyword deny-lists.
- **FR-045-028**: System MUST reject candidates containing sensitive personal information by default in v0.4.5.
- **FR-045-029**: System MUST reject candidates containing full conversation transcript or raw runtime state.
- **FR-045-030**: System MUST reject candidates whose memory type is outside the allowed UserMemory content categories for this version.
- **FR-045-031**: System MUST deduplicate UserMemory by stable key or an equivalent normalized identity.
- **FR-045-032**: System SHOULD generate stable keys with deterministic normalization over structured candidate identity. Model output MAY provide identity fields such as `subject`, `facet`, and `polarity`, but the final stable key MUST still be program-built and normalized. v0.4.5 SHOULD NOT rely on code-maintained sentence-parsing heuristics as the primary stable-key derivation path.

#### Conflict / Update

- **FR-045-033**: System SHOULD detect explicit memory conflict or update signals.
- **FR-045-034**: System SHOULD NOT continue reinforcing a UserMemory after the user clearly contradicts it.
- **FR-045-035**: If an update maps to an existing stable key, System SHOULD update, supersede, or suppress the existing memory instead of creating duplicate contradictory memories.
- **FR-045-036**: Full Memory Inspector, memory edit UI, memory delete UI, and memory management backend are out of scope for v0.4.5.
- **FR-045-037**: Natural-language “forget” or explicit negation requests MUST persistently mark the contradicted UserMemory as inactive or suppressed so it no longer participates in retrieval; v0.4.5 MUST NOT physically delete memory for this flow.

#### Retrieval

- **FR-045-038**: System MUST retrieve UserMemory only within the current browser session scope.
- **FR-045-039**: System MUST retrieve only memories relevant to latest user input. Retrieval relevance SHOULD rely on structured memory fields such as type, tags, and normalized text overlap, rather than code-maintained domain keyword taxonomies.
- **FR-045-040**: System MUST allow zero UserMemory injection when no relevant memory exists.
- **FR-045-041**: System MUST limit retrieval MVP injection to at most 3 UserMemory entries, at most 300 Chinese characters per entry, at most 900 Chinese characters total, and candidate confidence >= 0.7.
- **FR-045-042**: System MUST NOT retrieve UserMemory during hydration, sidebar list loading, or conversation switching.
- **FR-045-043**: System MUST apply UserMemory retrieval to ordinary text chat and tool-assisted ordinary chat.
- **FR-045-044**: Tasklist and Delivery paths MUST NOT use or depend on UserMemory retrieval in v0.4.5; their existing checkpoint/resume and run-local semantics must remain unchanged.
- **FR-045-045**: Tool-assisted ordinary chat MUST use UserMemory retrieval only when it shares the same ordinary chat context boundary and does not change Tool, MCP, Tasklist, or Delivery authority.

#### Context Integration

- **FR-045-046**: System MUST inject selected UserMemory separately from selected conversation ThreadState.
- **FR-045-047**: System MUST keep selected conversation ThreadState as short-term context source of truth.
- **FR-045-048**: System MUST ensure UserMemory does not override latest user input.
- **FR-045-049**: System MUST ensure UserMemory does not cause cross-conversation message leakage.
- **FR-045-050**: System MUST NOT include UserMemory in hydration payload.
- **FR-045-051**: System MUST NOT inject all memories by default.
- **FR-045-052**: System MUST keep UserMemory context bounded and identifiable as supplemental memory in model-visible context.

#### Draft Conversation Rule

- **FR-045-053**: If explicit memory intent or any eligible memory signal appears in a draft first message, System MUST complete draft promotion before enqueueing UserMemory extraction.
- **FR-045-054**: UserMemory writes MUST require a persisted source conversation identity.
- **FR-045-055**: System MUST NOT create a ghost conversation solely to write UserMemory.
- **FR-045-056**: If draft first message fails, is cancelled, or is rejected, System MUST NOT write UserMemory for that draft.

#### Failure Degradation

- **FR-045-057**: UserMemory Store read failure MUST degrade to no-long-term-memory mode.
- **FR-045-058**: UserMemory extraction or write failure MUST NOT affect selected conversation ThreadState, final-turn memory, streaming, or completed user-facing answer.
- **FR-045-059**: System MUST NOT expose raw database, store, checkpoint, provider, API key, cookie, or internal runtime errors to users when UserMemory Store fails.
- **FR-045-060**: System MUST NOT add a separate remembered-status UI, stream chunk, or reducer state in v0.4.5; the assistant MAY naturally acknowledge memory intent in ordinary answer text.

#### Non-regression

- **FR-045-061**: System MUST keep v0.4.4 Conversation Registry behavior unchanged.
- **FR-045-062**: System MUST keep per-conversation ThreadState isolation unchanged.
- **FR-045-063**: System MUST keep v0.4.3 final-turn memory behavior compatible.
- **FR-045-064**: System MUST keep Tasklist checkpoint/resume semantics unchanged.
- **FR-045-065**: System MUST keep Delivery run-local semantics unchanged.
- **FR-045-066**: System MUST keep stream-core chunk union unchanged.
- **FR-045-067**: System MUST keep frontend reducer public shape unchanged.
- **FR-045-068**: System MUST NOT add contextEntries, reasoning_summary, execution_summary, or agent_run_summary in v0.4.5.

### Key Entities _(include if feature involves data)_

- **UserMemory**: 当前 browser session 范围内可跨 conversations 复用的长期用户记忆。它表示经过验证的用户长期偏好、稳定用户背景、稳定指令、工作流偏好、反复确认约束、项目相关上下文或风险控制偏好。
- **UserMemory Store**: 保存 UserMemory 的长期存储边界。它与 selected conversation ThreadState checkpoint storage、Conversation Registry、ChatMessage history 和 frontend hydration surface 分离。
- **UserMemory Candidate**: 由 eligible completed turn 后台 extraction pipeline 或 pinnedDecision promotion 产生的候选记忆。explicit memory intent 是候选提取的强信号。candidate 只有通过 deterministic validation、stable key / dedupe 和 conflict/update 判断后才能写入 Store。
- **UserMemory Identity**: candidate 中用于 stable key 的结构化身份信息，例如 `subject`、可选 `facet` 和可选 `polarity`。程序基于它生成 deterministic stable key，而不是从中文句子里硬编码解析偏好或指令语义。
- **UserMemory Extraction Job**: assistant final turn 完成后异步运行的内部 job。它接收 bounded completed turn payload 和安全短期上下文，调用结构化 candidate extraction，并把候选交给 validation/write service；它不是主 assistant 可调用 tool。
- **Stable Key**: 用于识别同一类长期记忆的稳定身份。它用于去重、更新、冲突处理和避免重复矛盾记忆，不得泄漏 raw browser session id 或 internal runtime state。
- **Memory Type**: UserMemory 的逻辑类型，例如 `user_preference`、`communication_preference`、`workflow_preference`、`standing_instruction`、`recurring_constraint`、`stable_user_context`、`project_context`、`risk_preference`。
- **Selected UserMemory**: 在某次 eligible chat request 中与 latest user input 相关、通过 scope 与边界过滤后被选中的少量 UserMemory。它只作为补充上下文注入，不进入 ThreadState 或 hydration payload。
- **Source Conversation**: 产生 UserMemory candidate 的 persisted conversation。v0.4.5 需要保留安全的来源关联，避免 draft 未转正或无来源记忆写入。
- **ThreadState**: selected conversation 的短期上下文状态，继续保存 recent messages、summary、pinnedDecisions 和 lastCompactedAt。UserMemory 不属于 ThreadState。
- **Conversation Registry**: v0.4.4 已引入的 browser-session scoped persisted conversation registry。v0.4.5 不把 UserMemory 混入 registry。

## Scope Boundaries

### In Scope

- browser-session scoped UserMemory Store。
- UserMemory candidate、document、namespace/key、validation、stable key / dedupe 和 conflict/update suppression 的正式边界。
- eligible completed turn 后台异步 UserMemory extraction pipeline。
- explicit memory intent 作为 extraction 强信号。
- 结构化 candidate extraction schema。
- compaction 后新增或变化 pinnedDecision promotion candidate。
- deterministic validation。
- relevant retrieval for ordinary eligible chat path。
- bounded context injection。
- Store read/write failure safe degradation。
- draft first message 的 promotion-before-write 规则。
- v0.4.4 per-conversation short-term memory isolation non-regression。
- v0.4.3 final-turn memory compatibility。
- Tasklist、Delivery、stream-core、frontend reducer non-regression。

### Non-Goals

- 完整聊天历史系统。
- 保存完整 conversation transcript。
- ChatMessage business history。
- 历史搜索。
- 消息分页。
- Memory Inspector。
- memory 管理 UI。
- memory 编辑 UI。
- memory 删除 UI。
- 账号级长期记忆。
- 跨设备同步。
- 用户全局画像。
- 默认保存敏感个人信息。
- embedding retrieval。
- pgvector。
- 主 assistant 可直接调用的 memory-write tool。
- chat 主链路同步等待长期记忆写入。
- summary 整段写入长期记忆。
- 所有 pinnedDecisions 自动写入长期记忆。
- UserMemory 写入 ThreadState。
- UserMemory 放进 hydration payload。
- UserMemory 混入 Conversation Registry。
- 保存 raw tool transcript。
- 保存 MCP raw envelope 或 raw resource content。
- 保存 Tasklist GraphState、HITL checkpoint 或 interrupt payload。
- 保存 Delivery RuntimeArtifact 或 subagent raw invocation/result。
- 保存 workflow progress。
- 保存 raw prompt、raw provider response、stack、API key、cookie 或 provider config。
- 新增 contextEntries。
- 新增 reasoning_summary、execution_summary 或 agent_run_summary。
- 修改 stream-core chunk union。
- 修改 frontend reducer public shape。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-045-001**: In eligible completed turn tests, UserMemory extraction jobs are enqueued only after assistant final turn completion in 100% of successful persisted ordinary chat flows.
- **SC-045-002**: In draft first-message tests, UserMemory extraction is enqueued zero times before draft promotion and UserMemory is written zero times when the first message fails, is cancelled, or is rejected.
- **SC-045-003**: In cross-conversation tests, a relevant UserMemory saved in conversation A can be selected for conversation B within the same browser session without injecting conversation A messages.
- **SC-045-004**: In irrelevant-memory tests, unrelated UserMemory appears zero times in model-visible context.
- **SC-045-005**: Candidate validation rejects 100% of tested sensitive personal information, full transcript, raw runtime state, raw tool result, API key, cookie, provider config, oversized, duplicate, and low-confidence candidates.
- **SC-045-006**: Retrieval selects no more than 3 UserMemory entries, keeps each selected entry at or below 300 Chinese characters, keeps total injected UserMemory at or below 900 Chinese characters, and excludes candidates with confidence < 0.7 in 100% of tested requests.
- **SC-045-007**: UserMemory appears zero times in hydration payloads, Conversation Registry payloads, ThreadState messages, ThreadState pinnedDecisions, stream-core chunks, and frontend reducer public state.
- **SC-045-008**: When Store read fails, ordinary chat still completes with zero UserMemory injection and no raw internal error exposure.
- **SC-045-009**: When Store write fails after a completed answer, selected conversation ThreadState, final-turn memory, streaming output, and user-facing answer remain intact.
- **SC-045-010**: When a user clearly contradicts an existing memory, subsequent relevant retrieval does not continue reinforcing the contradicted memory.
- **SC-045-011**: Existing v0.4.4 Conversation Registry and per-conversation ThreadState isolation checks continue to pass.
- **SC-045-012**: Existing v0.4.3 final-turn memory, Tasklist checkpoint/resume, Delivery run-local, stream-core protocol, and frontend reducer compatibility checks continue to pass.

## Assumptions

- v0.4.5 使用 `UserMemory` 作为统一命名，不使用 `ProjectMemory` 作为主命名。
- v0.4.5 的长期记忆作用域是当前 browser session，不是账号级或跨设备。
- v0.4.5 的 UserMemory Store 技术基线是 LangGraph Store + PostgresStore；InMemoryStore 只作为本地开发和测试 fallback。
- v0.4.5 的 UserMemory retrieval 接入 ordinary text chat 和 tool-assisted ordinary chat；Tasklist / Delivery 不接入 UserMemory retrieval。
- 每个 eligible completed ordinary turn 必须 enqueue 一个 in-process best-effort 后台 UserMemory extraction job；explicit memory intent 是强信号，不是唯一触发；job 可以输出 0 条 candidate。
- 主 assistant 不获得 memory-write tool；UserMemory write 能力以内部 service / pipeline 形式实现。
- extraction 阶段使用模型结构化输出 candidate list，并显式输出 `stability` 和 structured `identity`；程序决定 validation、stable key、dedupe、suppression 和 Store write。
- pinnedDecision promotion 是 SHOULD。
- pinnedDecision promotion 只评估 compaction 后新增或变化的 pinnedDecision。
- Store failure 默认静默降级为 no-long-term-memory mode；v0.4.5 不新增独立“已记住”UI、stream 提示或失败提示，但 assistant 可以在普通回答文本中自然确认。
- 自然语言“忘记”或明确否定旧偏好时，本版使用持久 suppression：旧 UserMemory 标记为 inactive/suppressed，不再参与 retrieval；完整 edit/delete UI 和物理删除不进入本版。
- sourceConversationId 或等价安全来源关联是 UserMemory write 的必要条件。
- stable key 以程序可验证的 structured-identity normalization 为准；模型可以辅助提取候选文本、类型、标签、置信度和 `identity`，但不直接决定最终 stable key。
- retrieval MVP 不做 embedding 或 pgvector，按结构化 `type`、`tags`、规范化 text overlap、confidence 和 active status 等信号选择少量 UserMemory；最多 3 条，每条最多 300 字，总注入最多 900 字，confidence >= 0.7。代码不维护 food / clothing / activity 这类二级领域关键词分类表。
- latest user message 永远优先于 UserMemory。
- `ThreadState` 仍然只承载 selected conversation 的短期上下文，不因 v0.4.5 增加长期记忆字段。
- v0.4.5 不改变 stream protocol union、不改变 frontend reducer public shape、不新增 public runtime summary fields。

## Spec Boundary Summary

v0.4.5 引入当前 browser session 范围内的长期 `UserMemory Store`，让多个 conversations 可以共享经过 validation 的长期用户偏好、稳定用户背景、稳定指令、工作流偏好、反复确认约束和项目相关上下文。UserMemory 写入通过 eligible completed ordinary turn 后台异步 extraction pipeline 完成；模型负责结构化提出候选，并输出 `stability` 与 structured `identity`，程序负责 validation、stable key、dedupe、suppression 和 Store write。UserMemory 只在相关 ordinary eligible chat request 中作为受控、少量、可降级的补充上下文注入；selected conversation 的 `ThreadState` 仍然是短期上下文事实源。本版本不保存完整聊天历史、不做账号级用户画像、不默认保存敏感个人信息、不保存 raw runtime state、不做 ChatMessage business history、不做 Memory Inspector、不做 embedding retrieval、不做记忆管理 UI，也不改 stream-core chunk union 或 frontend reducer public shape。
