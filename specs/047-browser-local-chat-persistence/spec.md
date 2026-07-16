# Feature Specification: AI Mind v0.4.7 Browser-local Chat Session Persistence

**Feature Branch**: `[047-browser-local-chat-persistence]`

**Created**: 2026-07-14

**Status**: Implemented

**Input**: User description: "在不引入 PG 聊天历史存储、不引入账号体系、不做跨设备同步的前提下，为 AI Mind 增加浏览器本地聊天会话持久化能力。浏览器本地保存最近聊天会话和会话中的用户可见消息，页面刷新后恢复最近会话列表和当前会话展示，提升 AI Mind Demo 的产品完整度和真实使用体验。"

## Clarifications

### Session 2026-07-14

- Q: 本地快照如何响应已完成会话中的消息删除和重新生成？ → A: 任何稳定的 UI 状态变化都要更新本地快照，包括新一轮回答完成、删除问答和重新生成完成。
- Q: 同一 message ID 的本地快照与服务端 ThreadState 内容冲突时如何处理？ → A: 本地快照是完整 UI 聊天记录的唯一来源；服务端 ThreadState 只作为 AI 运行时上下文来源，不覆盖、删除或补写本地完整 UI 历史，也不进行静默的完整历史合并。
- Q: 浏览器重启后是否仍然恢复本地快照？ → A: 同一浏览器用户环境中跨浏览器重启保留并恢复本地快照；如果重启后服务端会话无法校验，则最多只读展示，不能恢复为可交互会话。
- Q: 本地完整 UI 历史与服务端 ThreadState 不一致时是否允许继续发送？ → A: 只要服务端会话归属和 ThreadState 可用，就允许继续发送；AI 使用服务端 ThreadState，本地快照继续作为 UI 展示历史，不要求两者先完成完整对账。
- Q: 多个浏览器标签页同时更新同一会话时如何处理？ → A: 使用带版本号的最新稳定快照覆盖旧快照，不做消息级合并；v0.4.7 不承诺跨标签页实时同步。
- Q: 多个浏览器标签页同时更新不同会话时如何处理？ → A: 不同 `conversationId` 的快照独立写入；共享最近会话索引按会话 ID 合并元数据，`selectedConversationId` 与 draft hint 只作为当前浏览器 UI hint，按索引 revision 保留最后一次稳定写入，不影响各会话消息快照。
- Q: 本地快照超过浏览器本地容量边界时如何处理？ → A: 按完整消息从旧到新裁剪，保留较新的可恢复内容，不影响服务端聊天。
- Q: 请求失败、中止或只生成半段 assistant 内容时是否提交本地快照？ → A: 不提交当前失败、中止或半成品回合，保留上一份成功稳定快照。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Restore Recent Conversations After Refresh (Priority: P1)

用户在浏览器中已经使用过多个聊天会话，刷新页面后可以看到最近会话列表，并恢复刷新前正在查看的会话展示内容。

**Why this priority**: 页面刷新后仍能回到原来的使用状态，是本版本本地持久化能力的核心价值，也是 Demo 从一次性页面走向真实聊天体验的最小闭环。

**Independent Test**: 创建并完成多个会话后刷新页面，确认最近会话列表、当前会话标题和当前会话中的稳定用户可见消息能够恢复。

**Acceptance Scenarios**:

1. **Given** 当前浏览器会话中存在多个最近聊天会话，**When** 用户刷新聊天页面，**Then** 页面恢复最近会话列表，并选中刷新前正在查看的会话或安全的有效 fallback。
2. **Given** 当前选中的会话有已经完成的用户可见消息，**When** 页面刷新完成，**Then** 页面展示该会话对应的消息，不显示其他会话的消息。
3. **Given** 用户曾经点击“新聊天”但尚未发送首条消息，**When** 页面刷新，**Then** 页面可以恢复空白 draft 展示，但不得创建空 conversation 或占用最近会话名额。

---

### User Story 2 - Preserve Rich User-visible Conversation Content (Priority: P1)

用户刷新或重新进入最近会话后，可以看到之前已经完成的稳定 UI 展示内容，而不只看到最后一对纯文本消息。

**Why this priority**: AI Mind 的 Demo 包含 tool、resource、workflow、Agent trace 和 artifact 等可见展示内容；只恢复文本会让复杂能力在刷新后显得不完整。

**Independent Test**: 在普通聊天、tool-assisted chat、reader-skill 或 Delivery 展示场景中产生稳定的可见部件，刷新或切换会话后确认这些部件仍按原会话展示。

**Acceptance Scenarios**:

1. **Given** 某个会话已经完成并包含文本、reasoning、tool/resource/skill/prompt、workflow、Agent trace 或 artifact 展示内容，**When** 用户刷新或切回该会话，**Then** 对应的稳定展示内容能够恢复。
2. **Given** 本地快照中的富展示内容多于服务端为模型上下文保留的 bounded recent messages，**When** 服务端会话仍然有效，**Then** 页面保留本地的富展示内容，不因为服务端返回较短的文本 hydration 而清空 UI 历史。
3. **Given** 某条消息仍处于 streaming、resuming、failed、aborted 或其他未完成状态，**When** 页面刷新，**Then** 系统不恢复该当前回合，只恢复之前已经成功稳定完成的消息。
4. **Given** 用户删除问答或完成重新生成，**When** 页面回到稳定状态后刷新，**Then** 本地恢复内容与最新 UI 一致，不恢复已删除的问答或被替换的旧助手回答。

---

### User Story 3 - Keep Server-authoritative Chat Semantics (Priority: P1)

用户可以继续使用现有聊天、会话隔离和短期记忆能力；浏览器本地快照只改善展示恢复，不改变服务端对会话归属和模型上下文的判断。

**Why this priority**: 本版本不是第二套聊天运行时，也不是绕过现有 Conversation Registry 和 ThreadState 的本地聊天系统。保持这条边界可以避免会话串线和模型上下文不一致。

**Independent Test**: 为两个会话保存不同内容，刷新并切换它们，验证本地展示、服务端会话校验、发送目标和短期记忆仍按 conversationId 隔离。

**Acceptance Scenarios**:

1. **Given** 本地缓存中存在会话 A 和会话 B，**When** 用户选中会话 A，**Then** 页面只展示会话 A 的内容，后续发送仍归属于经过服务端确认的会话 A。
2. **Given** 本地保存的会话标识已经被服务端判定为无效或不属于当前浏览器会话，**When** 页面恢复，**Then** 系统不得使用该缓存发送消息、恢复其他会话内容或静默切换到不相关会话。
3. **Given** 本地快照比服务端 bounded hydration 包含更多展示信息，**When** 服务端会话归属和 ThreadState 可用且用户继续聊天，**Then** 允许发送；页面继续展示本地完整历史，AI 继续遵循服务端 ThreadState 的上下文规则。

---

### User Story 4 - Degrade Safely When Local or Server Persistence Is Unavailable (Priority: P1)

当浏览器本地存储或服务端会话恢复暂时不可用时，用户仍能得到清晰、可恢复的页面状态，不会因为本地持久化失败而破坏正常聊天。

**Why this priority**: 浏览器存储可能被清理、禁用或达到配额，网络和服务端也可能暂时失败。本地持久化必须是增强体验，而不是聊天主链的单点故障。

**Independent Test**: 分别模拟本地存储不可用、服务端 registry/thread 请求失败和会话失效，验证页面提示、只读缓存和现有错误状态符合预期。

**Acceptance Scenarios**:

1. **Given** 本地快照存在但服务端 registry 或 selected thread 暂时不可用，**When** 用户刷新页面，**Then** 页面可以只读展示本地缓存，并明确提示当前不是已确认的在线会话；发送和会话切换保持禁用。
2. **Given** 本地存储不可用、数据损坏或写入失败，**When** 用户正常聊天，**Then** 聊天请求和服务端会话能力继续工作，页面不会因为本地持久化异常而中断主流程。
3. **Given** 服务端恢复可用，**When** 用户重新加载或重试会话恢复，**Then** 页面回到服务端确认的可交互状态，并同步清理已失效或已被淘汰的本地快照。

---

### User Story 5 - Keep Browser-local Scope Explicit (Priority: P2)

用户可以在同一浏览器设备上获得本地恢复体验，但系统不把这些数据理解为账号历史、云端历史或跨设备数据。

**Why this priority**: 明确本地范围可以在不引入账号体系、跨设备同步和新的服务端历史存储的前提下提升 Demo 完整度，同时避免错误的产品承诺。

**Independent Test**: 在同一浏览器刷新页面验证恢复；清除站点数据或更换浏览器后验证系统不承诺恢复原有本地快照。

**Acceptance Scenarios**:

1. **Given** 用户在同一浏览器中刷新页面或重启浏览器，**When** 本地数据仍然存在且服务端会话有效，**Then** 系统恢复最近会话和当前会话展示。
2. **Given** 用户清除了站点数据、使用了新的浏览器环境或浏览器没有原有本地数据，**When** 用户打开聊天页面，**Then** 系统按没有本地快照的安全路径处理，不承诺找回旧的浏览器本地聊天展示。
3. **Given** 用户在一个浏览器标签页中产生了更新，**When** 用户在另一个标签页继续使用，**Then** v0.4.7 不承诺实时跨标签页同步，且不能因此破坏服务端会话隔离。
4. **Given** 多个标签页先后为同一会话产生稳定更新，**When** 本地快照发生并发写入，**Then** 版本号较新的稳定快照覆盖旧快照，不对两个快照做消息级合并。

### Session 2026-07-15

- Q: No-account browser sessions can change when the browser cookie changes. Which source is authoritative after a successful server conversation-list response? → A: The valid server registry response is authoritative for the local conversation index. The client may show the local index first, then replace it with the server list and hard-delete local snapshots whose conversation IDs are absent from that valid server list. This cleanup applies only after a valid server response; request failure, timeout, invalid payload, or unavailable service MUST preserve local data.
- Q: Does server reconciliation compare or overwrite complete chat history? → A: No. The local conversation snapshot remains the sole source for the complete user-visible message history. A matching server conversation ID may update local list metadata, but MUST NOT delete, reconstruct, merge, or overwrite that conversation's local snapshot.
- Q: How should concurrent tabs be handled while server reconciliation is in flight? → A: Ordinary local index writes continue to merge by `conversationId`. Authoritative reconciliation MUST use the pre-request local index as its cleanup baseline and preserve conversation entries created by another tab after that baseline, so a server response cannot erase a concurrent write that was not part of the request's observed state.
- Q: Does deleting a conversation only hide it locally, or also remove server state? → A: It MUST delete the conversation from the current browser session's server Conversation Registry and delete the corresponding server ThreadState/checkpoint. After server success, the client MUST delete the local index entry and local UI snapshot. This remains a single-conversation delete action and does not introduce a server-side full chat-history business table.
- Q: How should delete confirmation work on desktop and mobile? → A: Both surfaces MUST expose the same three-dot action with only a Delete entry. Selecting Delete MUST open a destructive confirmation dialog; Cancel leaves all state unchanged, while the confirmed action performs the server deletion. On mobile, where hover is unavailable, the three-dot trigger MUST remain directly accessible in the conversation row.

### Edge Cases

- 当前浏览器会话没有任何 persisted conversation：页面进入空白 draft，不生成 ghost conversation。
- 本地缓存的 selected conversation 已被 server registry prune：删除该快照，并回退到服务端有效会话或空白 draft。
- 本地缓存存在但 server registry 请求失败：允许只读展示本地列表和当前快照，不允许发送或切换。
- server registry 有效但 thread hydration 暂时失败：可以展示对应本地快照，但在服务端恢复前保持只读，并提供可恢复重试入口。
- 服务端返回的 bounded hydration 文本不在本地快照中：不得将其静默补入本地完整 UI 历史；在没有本地快照时最多作为有限的降级展示，不得宣称已恢复完整聊天记录。
- 同一 message ID 的本地 UI 快照与服务端 ThreadState 内容不一致：本地继续作为 UI 展示来源，服务端继续作为 AI 运行时上下文来源；两者不得静默覆盖、删除或合并为一份完整聊天记录。
- 本地完整 UI 历史与服务端 ThreadState 不一致但服务端会话和 ThreadState 可用：允许继续发送，不要求先完成完整历史对账；生成结果仍按现有服务端上下文规则处理。
- 同一会话的本地快照多次写入：较旧的快照不得覆盖较新的稳定快照。
- 多个标签页同时更新同一会话：按快照版本号保留较新的稳定写入，不尝试合并删除、重新生成或其他相互冲突的消息状态。
- 页面在 assistant streaming 或 pending 人工审核期间刷新：不恢复半成品 stream、pending `AgentInterrupt` 或可继续 resume 的审核状态。
- 当前请求失败或被用户中止：当前失败、错误或半成品内容不得替换上一份成功稳定的本地快照。
- 本地快照包含不再被当前 UI 支持的旧字段或未知部件：安全忽略无法校验的部分，不阻塞其他可恢复消息。
- 浏览器本地存储被禁用、清除、损坏或达到配额：降级到现有服务端恢复能力，不影响正常聊天请求。
- 本地快照包含 tool output、resource preview、Agent trace 或 artifact 等较大内容：本地持久化失败时不影响服务端聊天；系统不承诺无限本地历史容量。
- 本地快照超过容量边界：从最旧的完整消息开始裁剪，不能写入半条消息；服务端会话和模型上下文不受影响。
- 用户在两个会话中发送相同文本：仍按 conversationId 分离，不跨会话去重、合并或复用展示内容。
- 浏览器 session cookie 变化后，本地快照仍然存在：只有重新通过当前服务端会话校验后才能恢复为可交互会话，否则最多只读展示或清理。
- 浏览器重启后本地快照仍然存在：在同一浏览器用户环境中恢复本地列表和展示；如果服务端会话校验失败，则保持只读，不允许发送或切换。

## Requirements _(mandatory)_

### Functional Requirements

#### Local Conversation Scope

- **FR-047-000A**: Local conversation snapshots MUST be the sole complete source for restoring the browser's user-visible conversation history, including rich UI presentation parts.
- **FR-047-000B**: Server Conversation Registry MUST remain authoritative for conversation identity, ownership, recent-conversation retention and interactive-session validation, but MUST NOT be treated as a source of complete chat history.
- **FR-047-000C**: Server ThreadState MUST remain authoritative for the AI runtime's short-term context, summary, pinned decisions and bounded recent text, but MUST NOT be treated as a source of complete user-visible conversation history.

- **FR-047-001**: System MUST provide browser-local persistence for the recent chat conversations already visible in the current browser session.
- **FR-047-002**: Local persistence MUST retain at most the current server registry's 10 recent persisted conversations and MUST NOT create a second local-only archive beyond that boundary.
- **FR-047-003**: Local persistence MUST retain conversation identity, title and selected-state recovery information only as a client-side cache; server-validated conversation ownership remains authoritative.
- **FR-047-004**: Blank draft state MUST remain distinct from persisted conversations and MUST NOT consume recent conversation capacity.
- **FR-047-005**: Local persistence MUST NOT require an account, introduce cross-device synchronization or promise recovery after site data is cleared.
- **FR-047-005A**: Local snapshots MUST remain available after a browser process restart within the same browser user environment when site data remains available; server validation still determines whether the restored conversation is interactive.

#### User-visible Message Snapshot

- **FR-047-006**: System MUST persist stable user-visible messages for each locally retained conversation so that the current conversation display can be restored after refresh, and MUST update the snapshot after every stable UI state change that affects those messages, including completed turns, deleted question-answer pairs and completed regenerations.
- **FR-047-006A**: A failed, aborted or incomplete current turn MUST NOT replace the last successful stable local snapshot.
- **FR-047-006B**: Each local snapshot write MUST carry a monotonic version, and a stable write with an older version MUST NOT overwrite a newer stable snapshot; concurrent snapshots MUST NOT be merged at message level.
- **FR-047-006C**: Local index writes MUST merge conversation metadata by `conversationId` so one conversation update does not remove another conversation's metadata; shared `selectedConversationId` and draft hints are client-side UI hints and MUST use the latest valid index revision rather than message-level merging.
- **FR-047-006D**: FR-047-006C applies to ordinary local index writes. Server-authoritative registry reconciliation MUST replace the observed local index with the valid server registry metadata, while preserving only entries created after the reconciliation baseline by another tab; it MUST NOT use ordinary merge behavior to retain baseline local-only conversations.
- **FR-047-007**: Recoverable message content MUST include the stable UI presentation of text, reasoning, tool/resource/skill/prompt activity, workflow progress, Agent trace and text artifacts when those elements are part of the completed user-visible conversation.
- **FR-047-008**: User message presentation data required to render visible commands or resource references MUST be retained together with the corresponding message.
- **FR-047-009**: System MUST NOT persist streaming, failed, aborted or otherwise incomplete message state as a recoverable completed turn.
- **FR-047-010**: System MUST NOT promise refresh recovery for pending human review, resumable `AgentInterrupt`, transient thread-memory status or other request-local control state.
- **FR-047-011**: Local snapshots MUST be versioned and strictly validated before use; invalid, incompatible or partially unreadable snapshot data MUST NOT block recovery of other valid conversations, and snapshots that exceed the local capacity boundary MUST be reduced by removing the oldest complete messages before writing.
- **FR-047-012**: Local snapshots MUST NOT contain API keys, session cookie values, provider configuration, raw checkpoints, raw GraphState, raw runtime errors or other server-internal fields.

#### Refresh and Reconciliation

- **FR-047-013**: On page refresh, System MUST attempt to restore the recent conversation list and selected conversation display from the browser-local cache.
- **FR-047-014**: When the server confirms the registry and selected conversation, System MUST keep server validation authoritative while continuing to use the local snapshot as the complete source for the restored user-visible conversation display.
- **FR-047-015**: Server hydration MUST be treated as bounded runtime context rather than a complete display transcript. System MUST NOT silently merge server hydration messages into the local snapshot or use them to overwrite, delete or reconstruct the local complete UI history. When no local snapshot is available, bounded server hydration MAY be shown only as a degraded fallback and MUST NOT be presented as complete chat history.
- **FR-047-016**: When the server rejects a cached conversation as invalid or not owned by the current browser session, System MUST NOT hydrate or send using that cached conversation.
- **FR-047-017**: A successfully restored server registry MUST synchronize local conversation metadata and remove local snapshots for conversations that are no longer retained by the server registry.
- **FR-047-017A**: After a valid successful server registry response, local-only conversation IDs from the reconciliation baseline MUST be removed from the local index and their local snapshots MUST be hard-deleted. A server request failure, timeout, invalid payload or unavailable response MUST NOT trigger this deletion. For a conversation ID retained by the server, metadata MAY be updated but its local snapshot MUST remain untouched.
- **FR-047-017B**: Each recent conversation row on desktop and mobile MUST expose a three-dot action entry whose only operation is Delete; the action MUST be available through mouse, keyboard focus and touch, and MUST NOT require hover on mobile.
- **FR-047-017C**: The conversation row MUST retain its normal selection behavior while showing an active background on hover/focus; activating the three-dot trigger MUST NOT select the conversation row or submit a chat action.
- **FR-047-017D**: Selecting Delete MUST open a destructive confirmation dialog that identifies the conversation title and explains that the conversation and its saved server state will be deleted. Cancel or dismiss MUST leave the server registry, ThreadState and local snapshot unchanged.
- **FR-047-017E**: A confirmed delete MUST be authorized against the current browser session's Conversation Registry and MUST delete the selected conversation's registry entry and corresponding server ThreadState/checkpoint before reporting success. An unknown or non-owned conversation MUST return a safe failure and MUST NOT delete another conversation.
- **FR-047-017F**: After successful server deletion, the server MUST return the updated conversation registry with a valid fallback selected conversation or a blank draft state. The client MUST treat that response as authoritative, remove the deleted conversation from the local index and hard-delete its local UI snapshot, and preserve all other conversation snapshots.
- **FR-047-017G**: When the deleted conversation is currently selected, the client MUST switch to the server-selected fallback conversation or blank draft only after delete success. When another conversation is deleted, the current selected conversation MUST remain selected.
- **FR-047-017H**: If delete authorization, Registry mutation, ThreadState deletion or network delivery fails, the client MUST keep the conversation row and local snapshot, MUST NOT perform local cleanup, and MUST show a recoverable error state.
- **FR-047-017I**: Delete actions MUST be disabled while the page is loading, in read-only cache mode, or while another conversation mutation is in progress; the confirmation dialog MUST expose accessible title, description, cancel and destructive confirm controls.
- **FR-047-018**: Restoring a local snapshot MUST NOT change the existing server-side short-term memory, final-turn memory, UserMemory scope, Tasklist checkpoint/resume semantics or Delivery run-local semantics.
- **FR-047-019**: Local UI history MUST NOT become a new server-side full transcript or a new model-context contract; existing server-authoritative chat context rules remain unchanged.
- **FR-047-019A**: When server conversation ownership and ThreadState are available, System MUST allow sending even if the local snapshot contains richer or different display history; the request MUST continue to follow the existing server-side ThreadState context rules.

#### Failure and Read-only Fallback

- **FR-047-020**: Local persistence failures MUST degrade silently to the existing server-backed chat and hydration behavior.
- **FR-047-021**: If a valid local snapshot exists but server registry or selected-thread recovery is unavailable, System MUST show the cached conversation list and display in an explicit read-only cache state.
- **FR-047-022**: In read-only cache state, System MUST disable sending, new conversation creation and conversation switching until server validation succeeds.
- **FR-047-023**: Read-only cache state MUST clearly communicate that the displayed content is local and not currently confirmed by the server.
- **FR-047-023A**: Read-only cache notices, local-recovery errors and retry entries MUST use user-understandable copy and accessible UI semantics consistent with existing AI Mind controls. The page MUST expose at least one explicit retry action that re-attempts server validation without discarding the current local snapshot, so disabled actions and recovery options remain perceivable and operable.
- **FR-047-024**: When server recovery succeeds after a read-only fallback, System MUST return the selected conversation to the normal interactive state without silently switching to unrelated conversation data.
- **FR-047-025**: If no valid local cache is available during server failure, System MUST preserve the existing safe loading, empty or error state rather than fabricate a conversation.

#### Compatibility and Product Boundaries

- **FR-047-026**: The feature MUST preserve the existing maximum of 10 recent server conversations and the existing draft-first conversation lifecycle.
- **FR-047-027**: The feature MUST preserve per-conversation isolation for display restoration, message sending and server short-term memory.
- **FR-047-028**: The feature MUST NOT introduce a server-side full chat-history business table, account system, cross-device sync, conversation search, pagination, sharing, export or general history-management UI; the single-conversation Delete action defined by FR-047-017B through FR-047-017I is explicitly in scope.
- **FR-047-029**: The feature MUST NOT modify the shared stream protocol or require new public stream fields for local persistence internals.
- **FR-047-030**: The feature MUST keep ordinary chat, tool-assisted ordinary chat, Tasklist and Delivery behavior compatible with their existing authority and persistence boundaries.

### Key Entities _(include if feature involves data)_

- **Local Conversation Cache**: 当前浏览器范围内用于恢复最近会话列表、selected conversation hint 和只读 fallback 展示的客户端缓存；不具备服务端会话授权能力。
- **Local Conversation Snapshot**: 某个 persisted conversation 在稳定完成状态下的完整用户可见 UI 展示快照，是浏览器刷新后恢复该会话展示历史的唯一完整来源；包含会话标识、标题、快照时间和可恢复消息内容。
- **Recoverable Visible Message**: 已完成、经过校验、可以在刷新后安全重新展示的消息及其 UI parts；不包括 streaming 半成品、pending 人工审核和请求临时状态。
- **Server Conversation Registry**: 当前 browser session 的服务端会话登记和 ownership 事实源，最多保留 10 个最近 persisted conversations。
- **Server ThreadState**: selected conversation 的服务端短期运行时上下文事实源；它与本地 UI 快照相互独立，继续承担模型上下文、bounded recent text、summary、pinned decisions 和 final-turn memory 语义，但不承担完整聊天展示历史。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-047-001**: `acceptance.md` 的固定最近会话 fixture 矩阵中，每个预置且仍被服务端保留的 conversation ID 都必须在 reconciliation 完成后出现在本地索引中，并保持服务端顺序；基线中的本地旧 ID 不得出现。
- **SC-047-002**: `acceptance.md` 的固定当前会话 fixture 矩阵中，每个预置 selected conversation 刷新前后的本地快照必须返回相同的稳定消息 ID 与内容，且结果中不得出现其他 conversation 的消息。
- **SC-047-003**: `acceptance.md` 的固定 rich UI fixture 矩阵中，每个 fixture 声明的 rich part 类型和稳定展示内容刷新后必须保持；该标准只覆盖声明的 fixture，不推断任意 UI 部件。
- **SC-047-004**: 本地存储不可用、损坏或写入失败时，普通聊天完成率不因本地持久化能力下降而降低；本地持久化失败不得导致聊天主请求失败。
- **SC-047-005**: 服务端 registry 或 selected thread 不可用时，本地缓存不得允许未经服务端确认的发送、创建或会话切换操作发生。
- **SC-047-006**: 已被服务端判定为无效、越权或 prune 的本地会话不得恢复为可交互会话，发生次数为 0。
- **SC-047-007**: v0.4.7 不新增账号、跨设备同步、服务端完整聊天历史、stream protocol 字段或 Tasklist / Delivery 持久化语义；相关回归次数为 0。
- **SC-047-008**: `acceptance.md` 的固定刷新与重启 fixture 矩阵中，每个案例都必须记录 recent list、selected conversation ID、title 和稳定用户可见消息恢复成功，且无需手动重新选择或输入。
- **SC-047-009**: 本版本不设置本地 IndexedDB 读写的毫秒级性能阈值；验收只要求本地读写、裁剪、校验或写入失败不得阻断 `/api/chat` 主请求、stream chunk 消费或已存在的服务端聊天路径。
- **SC-047-010**: 在有效 server registry 返回后，验收必须观察到：服务端列表中的会话全部保留对应本地索引条目；reconciliation 基线中不在服务端列表的会话索引与快照均不存在；同 ID 会话的本地完整消息快照仍可读取；请求失败或响应无效时，本地索引与快照均保持不变。该标准按固定场景逐项通过，不使用无边界的“100%”表述。
- **SC-047-011**: 在桌面端和移动端的固定交互 fixture 中，鼠标悬浮、键盘聚焦或触摸均可打开仅包含 Delete 的会话菜单；取消确认时服务端和本地状态零变化，确认后删除结果可被用户观察到。
- **SC-047-012**: 对每个固定删除 fixture，服务端成功响应必须同时满足 Registry 不再返回该 ID、对应 ThreadState 不可再读取、本地索引不再包含该 ID、本地快照不可读取；其他会话的索引与快照仍可读取。删除失败 fixture 必须保留全部本地数据。
- **SC-047-013**: 删除当前会话、删除非当前会话、删除最后一个会话三类 fixture 均必须记录正确的 fallback selected conversation 或 blank draft 状态，且不得发生跨会话消息展示。

## Assumptions

- 本次 Delete 的服务端语义包含从当前 browser session 的 Conversation Registry 删除会话，以及通过现有 chat-memory checkpointer 删除该会话对应的 ThreadState/checkpoint；不新增 PG full chat-history business table。
- 删除成功以服务端 Registry 和 ThreadState 删除都完成为准；任一服务端删除步骤失败，客户端不得清理本地索引或本地 UI 快照。
- 删除确认弹窗使用项目现有 shadcn/radix UI 组件风格，桌面端和移动端共享相同文案与 destructive action 语义。

- 本版本的“不引入 PG 聊天历史存储”解释为不新增完整聊天历史业务表、不扩展服务端 ThreadState 为完整 transcript；现有 bounded server Conversation Registry 和 ThreadState 继续存在。
- 本版本明确采用三层数据权威边界：本地快照负责完整 UI 聊天历史展示，Server Conversation Registry 负责会话身份与归属校验，Server ThreadState 负责 AI 运行时短期上下文；三者不合并为一份服务端完整聊天记录。
- 本地快照严格跟随服务端最近 10 个 persisted conversations，不保存已被服务端淘汰的旧会话作为本地历史库。
- 本地快照默认跨浏览器重启保留，但不跨浏览器用户环境、站点数据清理或本地存储被清除的场景承诺恢复。
- 本地存储采用适合富 UI 快照的浏览器本地持久化能力；本版本不提供本地数据加密、账号级安全、跨设备恢复或跨标签页实时同步承诺。
- 浏览器本地快照可以以本地明文形式存在；用户清除站点数据即可清理该数据，本版本不把它定义为安全敏感数据保险箱。
- 服务端不可用时，优先保证展示恢复体验，但本地缓存只能只读展示；继续聊天必须等待服务端完成会话验证和 ThreadState 恢复。
- 本地快照写入以稳定完成态为准，不承诺恢复刷新发生时正在生成的 assistant 半成品或 pending human review。
- 本地持久化是 UI 体验增强能力，不是新的 server authority、model context source、UserMemory source 或 cross-conversation memory mechanism。
- 本地快照与服务端 ThreadState 不要求完整一致；本地快照只决定恢复后的 UI 展示，继续发送时由服务端 ThreadState 决定 AI 上下文。
- 多标签页并发写入只按本地快照版本号解决覆盖顺序，不引入跨标签页实时同步或消息级冲突合并。
- 本地存储配额、浏览器策略、站点数据清理和浏览器 session cookie 变化属于可接受的本地数据丢失条件；系统应安全降级，不把这些情况报告为服务端聊天数据损坏。
- 本地容量边界的具体数值属于 Technical Plan 的实现安全参数；产品只承诺保留较新的完整本地消息，不承诺无限本地历史。
- v0.4.7 的性能验收以“不阻断聊天主链”为准，不把本地 IndexedDB 读写耗时定义为 release 硬阈值；如后续需要用户侧性能指标，应另行补充性能专项规格。
- v0.4.7 不新增消息搜索、分页、删除、重命名、分享、导出或历史管理操作；如后续需要完整聊天历史产品，应另立版本规格。
