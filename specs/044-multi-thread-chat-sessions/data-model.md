# Data Model: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Feature**: [spec.md](./spec.md)  
**Date**: 2026-07-04

## ConversationRegistry

当前 browser session 作用域下的 persisted conversation 列表。

### Fields

- `selectedConversationId?: string | null`
  当前由服务端确认的 selected persisted conversation；如果当前 browser session 还没有任何 persisted conversation，则可以为 `null`
- `conversations: ChatConversation[]`
  最多 10 条，按 `lastActiveAt` 倒序排列
- `updatedAt: string`
  registry 最近一次更新时间

### Validation Rules

- registry 只属于 current browser session
- 它不是全局会话表，也不是 account-level history
- `conversations.length` 必须小于等于 10
- registry 只收纳已由首条 user message 正式创建的 persisted conversations
- 如果 chat page 初始化时 registry 为空，系统进入 blank draft state，而不是创建 persisted default conversation
- 如果 `selectedConversationId` 缺失、无效或已被 prune，系统必须回退到一个安全且有效的 persisted conversation，或在没有可用 persisted conversation 时进入 blank draft state

## ChatConversation

已经由首条 user message 正式创建、可被 recent registry 与 hydration 读取的 conversation 容器。

### Fields

- `id: string`
  当前 browser session 范围内的 opaque public conversation id
- `title: string`
  在 draft promotion 完成后生成；可临时显示为 `新会话`，随后通过首条 user message 的确定性截断更新
- `createdAt: string`
  persisted conversation 真正创建时间；不是用户点击“新聊天”的时间
- `lastActiveAt: string`
  draft promotion 的首条 user message、后续用户发送消息或收到 completed assistant turn 时更新；单纯切换到该会话不会刷新该值
- `hasMessages: boolean`
  表示该 persisted conversation 是否已有完成持久化的消息或 recent messages 可恢复；对于 recent registry entries，该值应稳定为 `true`

### Validation Rules

- `id` 不能暴露 raw browser session id 或 raw checkpoint id
- `title` 必须非空，且在 desktop / mobile UI 中可以安全截断
- draft conversation 不属于这个实体，也不得以 empty persisted conversation 的形式出现在 recent list 中
- 当 registry 超过 10 条时，least recently active persisted entry 会被裁剪

## DraftConversationState

用户点击“新聊天”后进入的 client-local blank state。

### Fields

- `draftKey?: string`
  可选的 client-local sentinel，用于在刷新时恢复 blank draft UI；它不是 server-side conversation id
- `displayTitle: string`
  固定显示为 `新会话`
- `hasMessages: false`
  在首条 user message 被接受之前，draft 不拥有 persisted messages

### Validation Rules

- draft state 只能存在于 client-local UI / client persistence 边界
- draft state 不得进入 server-side Conversation Registry
- draft state 不得映射到 persisted ThreadState 或 recent list item
- 首条 user message 被接受时，draft 必须一次性转正为一个新的 persisted `ChatConversation`

## ChatConversationThread

`ChatConversation` 与 chat memory checkpoint state 之间的内部映射。

### Fields

- `conversationId: string`
  当前 persisted conversation identity
- `threadId: string`
  该 conversation 对应的内部 chat memory checkpoint thread id
- `state: AiMindThreadState`
  现有 text-only short-term memory state

### Validation Rules

- 不复用 legacy `chat:${sessionHash}` 作为 v0.4.4 的 conversation identity
- 只有在服务端完成 browser session ownership 与 registry membership 校验后，才能派生 thread id
- 它必须与 Tasklist Agent checkpoint thread ids、Delivery run-local state 保持分离

## AiMindThreadState

由一个 `ChatConversationThread` 独占拥有的现有 short-term chat memory state。

### Fields

- `messages: ChatThreadMessage[]`
  recent text-only user / assistant messages
- `summary: string`
  更早历史的 bounded summary
- `pinnedDecisions: string[]`
  重要稳定结论与上下文
- `lastCompactedAt?: string`
  最近一次 compaction 成功时间

### Validation Rules

- 必须继续保持 text-only
- 不能混入 conversation registry fields
- 不能包含 source metadata、raw tool transcript、GraphState、RuntimeArtifact、workflow progress、raw provider response、API key、cookie value、provider config 或 raw checkpoint
- compaction 与 pinned decisions 必须按 conversation 隔离

## ChatThreadMessage

某个 conversation ThreadState 内部持久化的一条 text-only message。

### Fields

- `id: string`
- `role: "user" | "assistant"`
- `text: string`
- `createdAt: string`

### Validation Rules

- `text` trim 之后必须非空
- 只保存 completed user-visible text
- 不持久化 `conversationId`；conversation ownership 由 selected thread 决定

## ThreadHydrationPayload

刷新页面或切换 persisted conversation 后，用于恢复 selected persisted conversation 的安全 public payload。

### Fields

- `conversationId: string`
- `threadId?: string`
  只有在兼容性需要时才返回 opaque / internal-safe identifier，不能暴露 raw session id
- `messages: MindMessage[]`
- `summaryPreview?: string`
- `pinnedDecisions: string[]`
- `restored: boolean`

### Validation Rules

- 只能 hydrate selected persisted conversation
- 失败时不能偷偷替换成另一个 conversation 的数据
- 只能包含 completed text user / assistant messages
- 必须通过 forbidden-field checks，确保不返回 raw runtime state

## ConversationRegistryPayload

用于初始化 sidebar / mobile selector 的安全 public payload。

### Fields

- `selectedConversationId?: string | null`
- `conversations: ConversationListItem[]`
- `limit: 10`

### Validation Rules

- `conversations.length` 必须小于等于 10
- payload 只返回 persisted conversations，不返回 blank drafts
- items 必须按 `lastActiveAt` 倒序排列
- 不能包含 raw browser session id、raw checkpoint id 或 internal storage details

## ConversationListItem

sidebar 与 mobile drawer 中展示的一条 conversation 项。

### Fields

- `id: string`
- `title: string`
- `createdAt: string`
- `lastActiveAt: string`
- `selected: boolean`
- `hasMessages: boolean`
  对 registry 中的 persisted entries 应稳定为 `true`

### Validation Rules

- title 必须可安全截断
- 同一时间只能有一个 selected item
- blank draft 不得作为 `ConversationListItem` 出现在 recent list 中

## Lifecycle

```text
Chat page loads
  -> read session-scoped ConversationRegistry
  -> if persisted conversation exists, hydrate selected persisted conversation ThreadState
  -> otherwise enter blank draft state
  -> user starts a new blank draft or selects a persisted conversation when not streaming
  -> if user sends first message from draft:
       create persisted conversation + derive thread ownership + write first turn
       update registry selectedConversationId and lastActiveAt
  -> if user only switches selected conversation:
       update registry selectedConversationId without reordering recent items
  -> if user sends message to persisted conversation:
       runtime reads selected conversation ThreadState for context
  -> assistant final turn completes
  -> runtime appends text-only final turn to the captured persisted conversation ThreadState
  -> registry updates lastActiveAt and prunes beyond 10 persisted entries
```

## Relationships

- 一个 browser session 拥有一个 `ConversationRegistry`
- 一个 `ConversationRegistry` 最多包含 10 个 `ChatConversation`
- 一个 `ChatConversation` 映射到一个 `ChatConversationThread`
- 一个 `ChatConversationThread` 拥有一个 `AiMindThreadState`
- Tasklist Agent GraphState 与 Delivery RuntimeArtifact 始终位于这些实体之外
