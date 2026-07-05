# Feature Specification: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Feature Branch**: `[044-multi-thread-chat-sessions]`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "将 v0.4.2/v0.4.3 的 single current chat memory 扩展为当前 browser session 下的最小 multi-conversation chat sessions。每个 conversation 对应一个隔离的 short-term memory thread。提供最小 ChatGPT-like 会话侧边栏和移动端选择入口，支持新建、最近列表、切换、刷新恢复 selected conversation；streaming 中禁止新建后切换或切换会话。不做长期记忆、不做完整聊天历史系统、不做 ChatMessage 业务表、不做搜索分页、不兼容 legacy single-thread id。"

## Summary

v0.4.4 将 AI Mind 从“一个 browser session 只有一个 current chat thread”演进为“一个 browser session 可以拥有多个 chat conversations”。每个 persisted conversation 对应一个独立的 chat memory thread，用户可以开始一个新的空白 draft、查看最近会话、切换会话，并在刷新后恢复 selected conversation 及其 recent messages。只有当首条 user message 真正提交时，draft 才会转化为正式 conversation 并进入 recent registry。

v0.4.4 是“多会话短期记忆容器”，不是长期记忆系统，也不是完整聊天历史系统。本版本只把 v0.4.2 的 Single Thread Memory Baseline 和 v0.4.3 的 Tool & Agent Final Turn Memory 从单 thread 扩展到多 conversation 隔离，不引入 ChatMessage 业务历史表、搜索分页、长期记忆、跨设备同步或完整 ChatGPT sidebar clone。

## Clarification Record

### Session 2026-07-04

- Q: 是否需要兼容 legacy `chat:${sessionHash}` thread id? -> A: 不兼容；v0.4.4 采用新的 multi-conversation 契约，不提供 legacy single-thread migration。
- Q: 默认 conversation 何时创建? -> A: 不再在聊天页初始化时创建 persisted default conversation；如果当前 browser session 没有 persisted conversation，页面进入空白 draft state。
- Q: active conversation 由什么决定? -> A: 服务端保存的 selected conversation 是事实源；localStorage 只可作为客户端恢复 hint；`updatedAt` 最新只能作为兜底，不作为主要规则。
- Q: conversation title 如何生成? -> A: 新建后先显示“新会话”；首条用户消息提交后可用首条用户消息确定性截断生成标题。
- Q: 移动端如何处理? -> A: 移动端进入 MVP，使用顶部 selected conversation 入口加 drawer 的最小会话选择方式，不常驻桌面侧边栏。
- Q: 无 conversationId 的旧 chat send / hydrate 是否自动落到 default conversation? -> A: 不兼容，按最小化处理；发送和恢复必须围绕 selected conversation identity，不自动猜测。
- Q: streaming 中新聊天和侧边栏会话项如何处理? -> A: 直接 disabled，防止 active stream 写入错误 thread。
- Q: 侧边栏是否需要折叠按钮? -> A: 需要，桌面端 sidebar 支持折叠/展开。
- Q: 是否允许空 conversation 出现在最近列表? -> A: 不允许；v0.4.4 改为纯 draft state，未发送首条消息前不创建 persisted conversation，也不进入 recent list / registry。
- Q: 最近会话数量是否限制? -> A: 需要限制，避免 v0.4.4 演变成完整聊天历史系统；具体上限以后续澄清为准。
- Q: 最近会话如何排序和淘汰，是否将上限从 20 改为 10? -> A: 按最近活跃时间排序和淘汰；发送消息和收到 completed assistant turn 会更新活跃时间，单纯切换会话只更新 selected state 不触发 recent 重排。当前 browser session registry、desktop sidebar 和 mobile drawer 最多保留/展示 10 个 conversations，超过后淘汰最久未活跃的 conversation。

### Session 2026-07-05

- Q: 后续多会话 UI 是否应优先复用当前 webapp 的组件基线? -> A: 是；优先复用 `apps/webapp/components/ui/` 下现有的本地 `shadcn/ui` 组件和当前 `radix-vega` 风格，只在缺少通用 primitive 时按同一基线补齐。
- Q: 是否把通过 MCP 或远程 registry 获取 UI 组件作为 v0.4.4 默认实现路径? -> A: 否；MCP 是运行时能力来源，不是本版前端组件来源。v0.4.4 UI 实现不应依赖 MCP 或 remote UI registry 拉取组件。
- Q: 多会话 UI 的风格应优先继承哪里? -> A: 优先继承当前 `instant-mind` 聊天页的布局、品牌壳层和 theme tokens，不切到官网 landing 页面那套营销视觉方向。
- Q: 空白新聊天是否应该立即创建正式 conversation? -> A: 否；按纯 draft state 设计处理。点击“新聊天”只进入 client-local blank draft，不创建 persisted conversation。首条 user message 提交时，系统才创建正式 conversation、分配 thread ownership，并把它加入 recent registry。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start New Draft Conversation (Priority: P1)

用户可以点击“新聊天”进入一个新的空白 draft state。draft 不继承旧 conversation 的 messages、summary 或 pinnedDecisions，也不会覆盖旧会话；只有当首条 user message 提交时，系统才创建正式 conversation。

**Why this priority**: 这是 multi-conversation 的最小入口。没有可进入的空白 draft，多会话能力只剩恢复旧状态，无法真正开始新的独立上下文；而把空白态直接持久化成正式 conversation 又会让 recent/history 语义变脏。

**Independent Test**: 在已有 conversation 存在时点击“新聊天”。系统切到空白 draft，聊天区显示空状态，recent list 数量不增加；发送首条 user message 后，系统创建并选中一个新的 persisted conversation，旧 conversation 仍可从最近会话中切回。

**Acceptance Scenarios**:

1. **Given** 当前 browser session 已有一个 persisted conversation，**When** 用户点击“新聊天”，**Then** 系统进入一个新的空白 draft state，而不是立即创建 persisted conversation。
2. **Given** 当前处于尚未发送消息的 draft，**When** 页面显示该 draft，**Then** messages 为空，title 显示“新会话”，且 recent list 不新增条目。
3. **Given** 用户从 draft 发送首条 user message，**When** 发送请求被接受，**Then** 系统创建一个新的 persisted conversation，并把该请求与后续 completed assistant turn 绑定到这个新 conversation。

---

### User Story 2 - Switch Recent Conversations (Priority: P1)

用户可以从最近会话列表切回旧 conversation。切换后页面恢复该 conversation 的 recent messages，不显示其他 conversation 的 messages。

**Why this priority**: 多会话的核心价值是用户能在不同短期上下文之间切换，而不是只能不停创建新会话。

**Independent Test**: 从 draft 分别创建 conversation A 和 B 并完成不同问答。从最近会话列表切回 A 后，页面只显示 A 的 recent messages，不显示 B 的内容。

**Acceptance Scenarios**:

1. **Given** 最近会话列表中存在多个 conversations，**When** 用户选择其中一个旧 conversation，**Then** selected conversation 切换到该 conversation。
2. **Given** conversation A 有 recent messages，**When** 用户切回 conversation A，**Then** 页面恢复 conversation A 的 recent messages。
3. **Given** conversation B 有不同 messages，**When** selected conversation 是 conversation A，**Then** 页面不显示 conversation B 的 messages。

---

### User Story 3 - Isolated Short-term Memory (Priority: P1)

conversation A 和 conversation B 的 messages、summary、pinnedDecisions 相互隔离。当前请求只使用 selected conversation 的 ThreadState 作为上下文来源，completed assistant turn 只写入本轮所属 conversation。

**Why this priority**: 隔离是本版本的安全和产品边界。任何串线都会让模型回答引用错误上下文，也会破坏 v0.4.2/v0.4.3 的 server-authoritative memory 约束。

**Independent Test**: 在 conversation A 讨论主题 X，在 conversation B 讨论主题 Y。分别触发 recent message restore、compaction 和 final-turn memory，验证任一请求只读取和写入 selected conversation 的 ThreadState。

**Acceptance Scenarios**:

1. **Given** conversation A 和 B 均有 ThreadState，**When** 用户在 conversation A 发送消息，**Then** model-visible context 只来自 conversation A 的 ThreadState。
2. **Given** conversation A 触发 summary compaction，**When** conversation B 被 hydrate，**Then** conversation B 的 summary 和 pinnedDecisions 不包含 conversation A 的内容。
3. **Given** assistant final turn 在 conversation A 中完成，**When** memory append 发生，**Then** completed turn 只写入 conversation A 对应的 chat memory thread。

---

### User Story 4 - Streaming Guard Blocks Conversation Changes (Priority: P1)

助手正在生成时，用户不能切换 conversation，也不能通过“新聊天”创建并立即切换到新 conversation。这个规则用于避免 active stream 和 final-turn memory 写入错误 thread。

**Why this priority**: MVP 阶段不支持一个页面内多个 active chat streams。直接禁止 streaming 中切换，是最小且可验证的安全交互策略。

**Independent Test**: 助手正在 streaming 时点击其他 conversation 或“新聊天”。UI 不切换 selected conversation；stream 完成后 final turn 仍归属 stream 开始时的 conversation。

**Acceptance Scenarios**:

1. **Given** assistant response 正在 streaming，**When** 用户点击其他 conversation，**Then** selected conversation 不改变。
2. **Given** assistant response 正在 streaming，**When** 用户点击“新聊天”，**Then** 系统不会切换到新 conversation。
3. **Given** stream 完成，**When** completed assistant turn 被保存，**Then** 该 turn 写入 stream 开始时对应的 conversation thread。

---

### User Story 5 - Minimal ChatGPT-like Sidebar And Mobile Selector (Priority: P2)

桌面端提供最小 ChatGPT-like 会话侧边栏，包含品牌区、新聊天入口、最近会话列表、当前会话高亮和折叠按钮。移动端进入 MVP，但使用顶部 selected conversation 入口加 drawer 的简化会话选择体验。

**Why this priority**: 会话 UI 是 multi-conversation 的产品入口，但 v0.4.4 不应扩展成完整聊天历史管理系统。

**Independent Test**: 桌面端可以通过左侧 sidebar 新建和切换最近会话；移动端可以通过顶部入口打开 drawer，并完成新建、查看最近会话、切换 selected conversation。

**Acceptance Scenarios**:

1. **Given** 用户在桌面端打开聊天页，**When** 页面加载完成，**Then** 左侧显示会话 sidebar，并包含品牌区、新聊天入口、最近会话列表、当前会话高亮和折叠按钮。
2. **Given** 用户在移动端打开聊天页，**When** 用户打开会话选择入口，**Then** drawer 展示新聊天入口、最近会话列表和当前会话高亮。
3. **Given** 最近会话标题较长，**When** sidebar 或 mobile drawer 展示该会话，**Then** 标题被合理截断且不破坏布局。
4. **Given** assistant response 正在 streaming，**When** sidebar 或 mobile drawer 展示会话操作，**Then** 新聊天入口和会话切换项处于 disabled 状态。

---

### User Story 6 - Existing Memory And Runtime Paths Do Not Regress (Priority: P1)

safe hydration、server-authoritative context、summary compaction、pinnedDecisions 和 v0.4.3 final-turn memory 继续工作。Tasklist、Delivery、stream protocol 和 frontend reducer public shape 不被破坏。

**Why this priority**: v0.4.4 是把已有短期记忆能力放进 conversation 容器，而不是重写 memory、agent、delivery 或 stream runtime。

**Independent Test**: 运行 v0.4.2 memory focused tests 与 v0.4.3 final-turn memory focused tests。Tasklist checkpoint/resume、Delivery run-local、stream protocol 和 frontend reducer 行为保持兼容。

**Acceptance Scenarios**:

1. **Given** selected conversation 有 ThreadState，**When** 页面刷新或切换后 hydrate，**Then** safe hydration 仍只返回 text-only 安全数据。
2. **Given** ordinary chat、tool、MCP/resource、Tasklist Agent 或 Delivery Chain final turn 完成，**When** final-turn memory append 发生，**Then** 写入内容仍只包含用户输入文本和最终用户可见助手文本。
3. **Given** Tasklist Agent resume 或 Delivery Chain run-local flow 正在使用既有语义，**When** v0.4.4 启用，**Then** 这些路径不读取、不写入、不接受 chat conversation thread 作为它们自己的 checkpoint/resume state。

### Edge Cases

- 当前 browser session 没有任何 persisted conversation：系统应进入一个空白 draft state，而不是创建 persisted default conversation。
- 新建 draft 后还没有任何 messages：页面显示空白聊天状态，title 显示“新会话”，不继承旧 conversation 内容，也不进入 recent list。
- 刷新页面后 selected conversation 仍有效：系统恢复该 selected conversation 及其 recent messages。
- 刷新页面时当前是未发送首条消息的 draft：系统可以恢复一个安全的 blank draft sentinel，但不得为此创建 ghost conversation 或 recent entry。
- 刷新页面后客户端保存的 selected conversation hint 与服务端 registry 不一致：以服务端可验证的 selected conversation 或安全 fallback 为准。
- selected conversation 不存在或不属于当前 browser session：系统不得 hydrate 或使用该 conversation。
- streaming 中点击其他 conversation：切换操作 disabled，selected conversation 不变。
- streaming 中点击“新聊天”：新聊天入口 disabled，不创建并切换到新 conversation。
- hydrate 某个 conversation 失败：不得展示其他 conversation 的数据；应展示安全空状态或可恢复错误状态。
- checkpoint storage 暂时不可用：普通聊天应尽量降级，不暴露 raw checkpoint、storage 或 provider internals。
- conversation A/B 快速切换：最终显示状态必须与最后一次有效 selected conversation 一致。
- 同样的消息内容出现在两个不同 conversation 中：仍按 conversation 隔离，不做跨 conversation 去重或合并。
- legacy single-thread memory 存在：v0.4.4 不迁移 legacy `chat:${sessionHash}`，也不承诺旧 single-thread memory 可见。
- 移动端空间不足：使用顶部 selected conversation 入口和 drawer，不常驻桌面 sidebar。
- 最近会话标题过长：标题必须截断，不能挤压布局或遮挡交互。
- 当前 selected persisted conversation 被系统认为不可用：回到安全 persisted fallback 或 blank draft state，避免串入其他 conversation。
- 当前 browser session 的 conversation registry 超过 10 个：系统只保留最近活跃的 10 个 conversation entries，不提供超出上限会话的搜索、分页或找回能力。
- abandoned draft 不应在服务端 registry 中留下空 conversation，也不应长期占用 recent capacity。

## Requirements _(mandatory)_

### Functional Requirements

#### Conversation / Registry

- **FR-044-001**: System MUST provide a minimal Conversation Registry for the current browser session.
- **FR-044-002**: Conversation Registry MUST be scoped to the current browser session; it is not a global system-wide conversation table.
- **FR-044-003**: System MUST retain at most 10 conversation entries in the current browser session registry.
- **FR-044-004**: System MUST show at most 10 recent conversations in the sidebar or mobile conversation drawer.
- **FR-044-005**: System MUST allow starting a new blank draft conversation when no assistant response is streaming.
- **FR-044-006**: System MUST enter a blank draft state when the chat page initializes and the current browser session has no persisted conversation.
- **FR-044-007**: System MUST allow selecting an existing conversation from the current browser session registry when no assistant response is streaming.
- **FR-044-008**: System MUST keep older persisted conversations intact when a new draft starts; only the first accepted user message from that draft may create an additional persisted conversation, subject to registry pruning.
- **FR-044-009**: System MUST NOT promise recovery for conversations pruned beyond the 10-entry registry limit.
- **FR-044-010**: Draft conversations MUST NOT appear in the recent conversation list or consume registry capacity before the first user message is accepted.
- **FR-044-011**: System MUST NOT persist abandoned drafts as empty conversations in the server registry; empty-conversation pruning rules are therefore not part of the steady-state registry contract.
- **FR-044-012**: System MUST sort recent conversations by last active time.
- **FR-044-013**: Accepting the first user message from a draft, sending later user messages, or receiving a completed assistant turn MUST update that conversation's last active time; actively selecting a conversation MUST update selected state without forcing recent-list reordering.
- **FR-044-014**: When the registry exceeds 10 persisted conversation entries, System MUST prune the least recently active persisted conversation entry.

#### Selected Conversation / Thread

- **FR-044-015**: Each conversation MUST map to one isolated chat memory thread.
- **FR-044-016**: Different conversations MUST NOT share messages, summary, pinnedDecisions, or lastCompactedAt.
- **FR-044-017**: The currently selected chat target MUST determine which ThreadState is hydrated; when the selected target is a draft, no persisted ThreadState is hydrated.
- **FR-044-018**: The currently selected chat target MUST determine which ThreadState is used for model-visible context; a draft target uses empty short-term memory plus the current eligible user input until promotion occurs.
- **FR-044-019**: Selected persisted conversation MUST determine which ThreadState receives completed assistant turns; for a draft send, System MUST create and bind one new persisted conversation before final-turn persistence occurs.
- **FR-044-020**: System MUST treat the server-validated selected persisted conversation as authoritative for persisted chat memory operations.
- **FR-044-021**: Client-side selected conversation persistence MAY be used as a restore hint, and a client-local draft sentinel MAY be used for blank-draft UX, but neither MAY override server validation for persisted conversation access.
- **FR-044-022**: `updatedAt` ordering MAY be used as a safe fallback for selecting a persisted conversation, but MUST NOT be the primary active conversation rule.

#### Hydration / Context

- **FR-044-023**: System MUST hydrate only the selected persisted conversation; draft state MUST use a safe empty local hydration surface.
- **FR-044-024**: System MUST keep hydration safe and compatible with existing text-only messages.
- **FR-044-025**: System MUST keep server-authoritative context behavior from v0.4.2.
- **FR-044-026**: Frontend historical messages MUST NOT become cross-conversation model history.
- **FR-044-027**: Model-visible context MUST be assembled from selected persisted conversation ThreadState plus the current eligible user input, or from an empty short-term memory baseline plus the current eligible user input when the user is in draft state.
- **FR-044-028**: Completed assistant turns MUST be appended only to the persisted conversation captured for that turn, including the newly created conversation produced by draft promotion.
- **FR-044-029**: Chat send and hydration operations MUST identify either a validated persisted conversation or an explicit draft-create path; v0.4.4 MUST NOT silently infer a default or active persisted conversation when identity is missing.
- **FR-044-030**: System MUST NOT expose raw checkpoint, raw browser session id, raw provider response, GraphState, RuntimeArtifact, workflow progress, raw tool transcript, API key, cookie value, provider config, or internal runtime state.
- **FR-044-031**: System MUST keep persisted ThreadState messages text-only.
- **FR-044-032**: System MUST keep summary compaction and pinnedDecisions isolated per conversation.
- **FR-044-033**: System MUST NOT migrate or reuse legacy single-thread id `chat:${sessionHash}` as the v0.4.4 conversation identity.

#### Conversation Title

- **FR-044-034**: A new blank draft MUST initially display the title “新会话”.
- **FR-044-035**: When a draft is promoted by the first accepted user message, System SHOULD assign the persisted conversation title from that first user message using deterministic truncation; “新会话” MAY be used as a temporary placeholder until that title is available.
- **FR-044-036**: System MUST NOT use complex LLM title generation in v0.4.4.
- **FR-044-037**: Conversation titles MUST be safely truncated in sidebar and mobile drawer layouts.

#### Sidebar / Mobile UX

- **FR-044-038**: Desktop frontend MUST provide a minimal ChatGPT-like conversation sidebar.
- **FR-044-039**: Desktop sidebar MUST include brand area, new chat entry, recent conversation list, selected conversation highlight, and collapse/expand control.
- **FR-044-040**: Desktop sidebar MUST remain usable when collapsed.
- **FR-044-041**: Mobile frontend MUST include a minimal conversation selector in v0.4.4 MVP.
- **FR-044-042**: Mobile conversation selector MUST use a compact top selected-conversation entry and a drawer-style recent conversation list.
- **FR-044-043**: Sidebar and mobile drawer MUST NOT include search, file library, projects, apps, more menu, delete, rename, archive, folder, tag, share, pagination, hover action menu, or complex action menus in this version.

#### Streaming Guard

- **FR-044-044**: Frontend MUST prevent switching conversation during assistant response streaming.
- **FR-044-045**: Frontend MUST prevent starting a new conversation during streaming if it would switch selected conversation.
- **FR-044-046**: New chat entry MUST be disabled during streaming.
- **FR-044-047**: Recent conversation items MUST be disabled during streaming.
- **FR-044-048**: System MUST ensure an active stream cannot write to another conversation thread.
- **FR-044-049**: After streaming completes or safely terminates, normal create and switch interactions MAY become available again.

#### Non-regression

- **FR-044-050**: System MUST keep v0.4.2 memory behavior compatible for safe hydration, server-authoritative context, bounded recent messages, compaction, and pinnedDecisions.
- **FR-044-051**: System MUST keep v0.4.3 final-turn memory behavior compatible for ordinary chat, tool-assisted chat, MCP/resource-assisted chat, Tasklist Agent final answers, Delivery Chain final reports, and future controlled agent final answers.
- **FR-044-052**: System MUST keep Tasklist Agent checkpoint/resume semantics unchanged.
- **FR-044-053**: System MUST keep Delivery Chain run-local semantics unchanged.
- **FR-044-054**: System MUST keep stream protocol chunk union unchanged.
- **FR-044-055**: System MUST keep frontend reducer public shape unchanged.
- **FR-044-056**: System MUST NOT add long-term memory, ProjectMemory Store, LangGraph Store, PostgresStore, Memory Inspector, ChatMessage business history, message pagination, history search, message edit/delete, conversation share, folder/archive/tag UI, source badge, agent badge, contextEntries, reasoning_summary, execution_summary, or agent_run_summary in v0.4.4.

#### UI Implementation Guardrails

- **FR-044-057**: v0.4.4 conversation UI MUST prefer the existing local `apps/webapp/components/ui/` `shadcn/ui` component baseline and current `radix-vega` style before introducing new wrappers or custom primitives.
- **FR-044-058**: v0.4.4 conversation UI MUST NOT require MCP-based component acquisition, remote UI registry fetching, or other runtime capability surfaces as its component source dependency.
- **FR-044-059**: Conversation session UI MUST inherit the current `apps/webapp/components/instamind/instantmind-page.tsx` shell, AI Mind brand area, and `apps/webapp/app/globals.css` theme tokens instead of switching to the landing / marketing page visual language.
- **FR-044-060**: For in-scope v0.4.4 conversation surfaces, when a suitable local `apps/webapp/components/ui/` `shadcn/ui` primitive exists, implementation MUST use that primitive in preference to bespoke presentational markup.
- **FR-044-061**: When a suitable primitive does not yet exist locally, implementation MUST vendor the official `shadcn/ui` primitive into `apps/webapp/components/ui/` first, then compose business components on top of it instead of importing a full example/block template directly.
- **FR-044-062**: `shadcn` MCP MAY be used during planning/review to inspect official registry items, examples, and add commands, but shipped v0.4.4 code MUST resolve to vendored local components and existing local theme tokens only.
- **FR-044-063**: Business wrappers such as conversation sidebar, mobile selector, hydration state, and review panel MAY remain feature-owned components, but their internal presentation SHOULD be converged onto local `shadcn/ui` primitives wherever an equivalent exists.
- **FR-044-064**: v0.4.4 MUST prioritize primitive-level convergence such as `sidebar`, `scroll-area`, `skeleton`, and `alert`; it MUST NOT pull in unrelated navigation/data block chrome that would expand the product scope beyond the minimal conversation session UI.

### Key Entities _(include if feature involves data)_

- **Chat Conversation**: 已经由首条 user message 正式创建的聊天会话容器。每个 persisted conversation 有自己的 short-term memory thread，并作为 recent list、hydrate、context 和 final-turn write 的用户级单位。
- **Conversation Registry**: 当前 browser session 下的 persisted conversation 清单，用于展示最近会话、恢复 selected persisted conversation，并把 registry 范围限制为最多 10 个 entries。它不是全系统所有会话的总表，也不是账号级长期历史。
- **Draft Conversation State**: 用户点击“新聊天”后进入的 client-local blank state。draft 没有 persisted `conversationId`，没有 registry entry，也没有 persisted ThreadState；只有首条 user message 提交后才会转正为正式 conversation。
- **Selected Chat Target**: 当前正在显示和发送消息的聊天目标，可以是一个 persisted conversation，也可以是一个 blank draft。hydrate、context assembly 和 completed turn append 必须根据 target 类型分别处理。
- **Chat Memory Thread**: conversation 对应的短期记忆 thread，保存 text-only messages、summary、pinnedDecisions 和 lastCompactedAt。
- **ThreadState**: 已有短期记忆状态。v0.4.4 不改变 ThreadState 的 text-only 决策，也不加入 raw runtime state 或 source metadata。
- **Hydration Payload**: 前端刷新或切换 persisted conversation 后用于恢复 selected conversation 的安全数据。它只能包含可展示、可验证、经过边界过滤的 conversation/thread 信息。
- **Conversation Sidebar**: 桌面端最小 ChatGPT-like 会话侧边栏，用于开始 blank draft、展示最近会话、切换 selected conversation、高亮当前会话和折叠/展开。
- **Mobile Conversation Selector**: 移动端的最小会话选择入口，由顶部 selected conversation entry 和 drawer-style recent conversation list 组成。
- **Streaming Guard**: 防止 streaming 中切换 conversation 或新建后切换的交互与运行时边界，避免 active stream 和 final-turn memory 写入错误 thread。

## Scope Boundaries

### In Scope

- 当前 browser session 下最多 10 个 persisted conversations 的最小 registry。
- 开始 blank draft、最近 conversation 列表、选择 persisted conversation、draft promotion。
- selected conversation refresh recovery。
- 每个 conversation 独立的 text-only ThreadState。
- per-conversation safe hydration、server-authoritative context、summary compaction、pinnedDecisions。
- v0.4.3 final-turn memory 写入 selected conversation。
- 桌面端最小 sidebar，包括折叠/展开。
- 移动端最小 selector 和 drawer。
- streaming 中禁用新建后切换和会话切换。
- v0.4.2/v0.4.3、Tasklist、Delivery、stream protocol、frontend reducer 的 non-regression。

### Non-Goals

- Long-term memory.
- ProjectMemory Store.
- LangGraph Store / PostgresStore.
- Memory Inspector.
- ChatMessage business history.
- Message pagination.
- History search.
- Message edit/delete.
- Conversation share.
- Folder/archive/tag UI.
- Complex LLM title generation.
- Cross-device account sync.
- Source badge / agent badge.
- contextEntries.
- reasoning_summary.
- execution_summary.
- agent_run_summary.
- stream-core chunk union change.
- frontend reducer public shape breaking change.
- Tasklist checkpoint/resume semantic changes.
- Delivery run-local semantic changes.
- Full ChatGPT sidebar clone.
- Search chats.
- File library entry.
- Projects entry.
- Apps entry.
- More entry.
- Hover action menu.
- Conversation delete/rename/archive.
- MCP-based UI component fetching or remote UI registries as a required delivery path.
- Re-skinning the chat page to the landing / marketing page visual language.
- Legacy `chat:${sessionHash}` migration.
- Recovery for conversations beyond the current browser session registry limit.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-044-001**: A user can enter a new blank draft state from desktop sidebar and mobile conversation selector in 100% of healthy UI states when no assistant response is streaming.
- **SC-044-002**: A user can switch from the recent conversation list to an existing conversation and see only that conversation's recent messages in healthy storage scenarios.
- **SC-044-003**: In tests with at least two conversations, messages, summary, and pinnedDecisions from one conversation appear zero times in the other conversation's hydration payload or model-visible context.
- **SC-044-004**: Completed assistant turns are written only to the persisted conversation captured for that turn, including draft-promotion scenarios, in 100% of tested ordinary chat and final-turn memory flows.
- **SC-044-005**: During assistant response streaming, attempts to create-and-switch or switch conversations succeed zero times.
- **SC-044-006**: Hydration responses expose zero raw checkpoint, raw browser session id, provider response, GraphState, RuntimeArtifact, workflow progress, raw tool transcript, API key, cookie value, or provider config fields.
- **SC-044-007**: Desktop sidebar and mobile drawer display no more than 10 recent conversation entries.
- **SC-044-008**: Current browser session registry retains no more than 10 persisted conversation entries after promoting more than 10 draft conversations.
- **SC-044-009**: After conversation activity changes, the recent list orders conversations by last active time, with the most recently active conversation first.
- **SC-044-010**: Long conversation titles remain visually contained in desktop sidebar and mobile drawer.
- **SC-044-011**: Existing v0.4.2 focused memory tests and v0.4.3 final-turn memory focused tests continue to pass.
- **SC-044-012**: Existing Tasklist checkpoint/resume, Delivery run-local, stream protocol, and frontend reducer compatibility checks continue to pass without breaking consumer changes.
- **SC-044-013**: When no persisted conversation exists, page initialization enters or restores a usable blank draft state without exposing internal error details or creating a ghost recent entry.
- **SC-044-014**: In-scope v0.4.4 conversation UI surfaces with an approved local `shadcn/ui` primitive equivalent are implemented on local `components/ui` primitives rather than bespoke presentation-only shells.

## Assumptions

- 当前仍以 browser session 作为 owner，不引入登录账号体系。
- 一个 browser session 可以拥有多个 conversations，但最多保留 10 个 conversation entries。
- 最近会话按 last active time 排序；发送消息和收到 completed assistant turn 会更新活跃时间，单纯切换 conversation 不触发 recent 重排。
- Conversation Registry 是当前 browser session 的会话清单，不是全系统所有会话总表。
- 每个 conversation 对应一个 chat memory thread。
- ThreadState 仍然 text-only。
- v0.4.4 不改变 ChatThreadMessage 的 text-only 决策。
- v0.4.4 不改变 ThreadHydrationDTO 的核心安全边界。
- 聊天页初始化且当前 session 无 persisted conversation 时，页面进入 blank draft state，而不是创建 persisted default conversation。
- selected conversation 以服务端可验证状态为事实源；客户端持久化只作为 hint。
- blank draft 可以通过 client-local sentinel 恢复其空白 UI，但不得因此写入 server registry 或创建 ghost conversation。
- conversation sidebar 是最小功能，不追求完整 ChatGPT sidebar。
- streaming 中禁止切换会话是 MVP 的明确交互策略。
- blank draft 初始 title 为“新会话”，首条用户消息提交后转正为正式 conversation，并可用该首条消息截断更新标题。
- 多会话 UI 优先复用当前 webapp 的 `shadcn/ui` / `radix-vega` 组件基线，而不是单独创建一套平行组件语言。
- MCP 与 remote registry 不作为本版 UI 组件来源；如缺少通用 primitive，应在 webapp 本地基线内补齐。
- `shadcn` MCP 可以作为本版 UI 审查、对标和脚手架参考来源，但交付物必须仍然落在本地 `apps/webapp/components/ui/`。
- 多会话 UI 视觉语言优先继承当前 `instant-mind` 聊天页的品牌壳层、`background/foreground/sidebar` tokens 与现有聊天页面节奏，而不是 landing 页视觉。
- 对于 sidebar、recent list、hydration skeleton、错误提示等 in-scope UI 面，凡是存在合适的本地 `shadcn/ui` primitive，应优先重构到该 primitive，而不是继续扩散 bespoke presentational markup。
- 本版本不做长期记忆。
- 本版本不做 ChatMessage 业务历史表。
- 本版本不做搜索、分页、编辑、删除、归档。
- 移动端进入 v0.4.4 MVP，但使用比桌面更简化的 selector + drawer。
- v0.4.4 可以不兼容 legacy `chat:${sessionHash}`，也不提供旧单线程记忆迁移策略。
- 超出 registry 上限的 conversation 不承诺可找回；这符合“短期记忆容器”而不是“完整聊天历史系统”的产品定位。

## Spec Boundary Summary

v0.4.4 引入最小 Conversation Registry、blank draft state 和最小 ChatGPT-like 会话入口，让一个 browser session 可以拥有最多 10 个相互隔离的 persisted chat conversations。点击“新聊天”只进入空白 draft，不立即创建正式 conversation；首条 user message 提交时才创建 conversation 并绑定自己的 text-only ThreadState。最近会话按 last active time 排序和淘汰；发送消息和 completed assistant turn 会刷新排序，单纯切换会话不会立刻重排。桌面端提供可折叠 sidebar，移动端提供顶部 selector 和 drawer；streaming 中禁止新建后切换或切换会话。本版本只把 v0.4.2/v0.4.3 的短期记忆能力从 single thread 扩展为 multi-thread chat sessions，不做长期记忆、不做完整聊天历史、不做 ChatMessage 表、不做搜索分页、不兼容 legacy single-thread id、不改 stream protocol、不改 frontend reducer public shape。
