# Contract: Chat Context Integration

## Purpose

定义 v0.4.5 UserMemory 与 `ChatOrchestrator` 的集成边界。

## Eligibility

### Retrieval eligible

```text
ordinary text chat
tool-assisted ordinary chat
```

### Retrieval ineligible

```text
Tasklist Agent
Delivery Chain
hydration
sidebar / conversation registry loading
conversation switching
```

## Context Order

Model-visible context 的概念顺序：

```text
system / skill / output policy prompts
+ selected UserMemory supplemental context
+ selected conversation summary
+ selected conversation pinnedDecisions
+ selected conversation recent messages
+ latest user message
```

Implementation note:

- 现有 `withChatMemoryContextMessages()` 会把 memory context 插入第一条 non-system message 前。
- v0.4.5 应保持 UserMemory 与 short-term memory 分开构建，但最终都作为 system/human/ai messages 参与 LangChain message array。
- UserMemory context 必须以单独 `SystemMessage` 或可测试的 system block 表达，文本中说明“长期用户记忆是补充上下文，latest user message 优先”。

## Retrieval Timing

```text
POST /api/chat
  -> validate / promote draft if needed
  -> ChatOrchestrator.createChatSession
  -> read selected UserMemory for eligible ordinary chat path
  -> read selected conversation ThreadState
  -> assemble context
  -> model stream
```

## Write Timing

```text
assistant final turn completed
  -> existing final-turn ThreadState append
  -> if eligible ordinary completed turn, enqueue one in-process best-effort UserMemory extraction job
  -> structured candidate extraction returns 0..N candidates
  -> validation / stable key / dedupe / suppression
  -> Store put/update/suppress
```

Store write failure does not affect:

- completed user-facing answer
- stream finish
- selected conversation ThreadState
- Conversation Registry touch

The main assistant does not receive a direct memory-write tool in v0.4.5. UserMemory write capability is exposed only through internal runtime service / background pipeline boundaries.
v0.4.5 does not introduce a durable queue, worker system, or retry scheduler for this pipeline.

## Draft First Message Rule

For `createConversation: true`:

```text
route creates persisted conversation
  -> sets validatedConversationId
  -> ChatOrchestrator receives normalized request.conversationId
  -> assistant final turn completed
  -> UserMemory extraction job may use sourceConversationId
```

If route rejects/cancels/fails before persisted conversation exists, UserMemory write MUST NOT happen.

## Tool-assisted Ordinary Chat

Tool-assisted ordinary chat uses selected UserMemory in:

- planning stage messages
- final-answer stage messages
- authoritative answer path background extraction after final answer completion, when assistant text exists

It MUST NOT:

- change tool authorization
- inject UserMemory into raw tool input
- expose memory-write tool to the main assistant
- modify MCP/resource authority
- change Tasklist / Delivery routing

## No Public Payload Change

The following must remain unchanged:

- stream-core chunk union
- frontend reducer public shape
- `/api/chat/thread` hydration response
- `/api/chat/conversations` response

No dedicated remembered-status event exists in v0.4.5.
