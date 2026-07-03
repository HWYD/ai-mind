# Data Model: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Feature**: [spec.md](./spec.md)
**Date**: 2026-07-02

## AiMindThreadState

Represents the recoverable state for the current browser chat thread.

### Fields

- `messages: ChatThreadMessage[]`
    - Recent text-only user-visible messages.
    - Maximum: 8 messages after compaction.
- `summary: string`
    - Bounded summary of older conversation turns.
    - Maximum target: about 2500 Chinese characters.
- `pinnedDecisions: string[]`
    - Important user decisions, architecture boundaries, or explicit conclusions.
    - Maximum: 20 entries.
- `lastCompactedAt?: string`
    - ISO timestamp or equivalent metadata indicating the last successful compaction.

### Validation Rules

- Must not contain raw checkpoint, raw prompt, provider response, stack trace, API key, cookie value, provider config, Tasklist GraphState, HITL state, Delivery Chain RuntimeArtifact, or subagent raw invocation/result.
- `messages` may contain only text-only `user` and `assistant` messages for v0.4.2.
- `summary` must be a plain safe text field, not a serialized raw runtime object.
- `pinnedDecisions` entries must be bounded and trimmed.

## ChatThreadMessage

Represents one recent recoverable message.

### Fields

- `id: string`
    - Stable message id for hydration into the frontend message list.
- `role: "user" | "assistant"`
    - Message role. `system` is not persisted for v0.4.2 hydration.
- `text: string`
    - Markdown-capable text visible to the user.
- `createdAt: string`
    - ISO timestamp used for frontend ordering/display.

### Validation Rules

- `text` must be non-empty after trimming.
- Messages created from tool/resource/agent/workflow/artifact parts must be excluded.
- Cancelled or incomplete assistant placeholders must be excluded.

## ThreadHydrationDTO

Safe public DTO returned to the frontend.

### Fields

- `threadId: string`
    - Public derived id such as `chat:${sessionHash}`.
- `messages: HydratedMindMessage[]`
    - Frontend-compatible recent text messages.
- `summaryPreview?: string`
    - Optional bounded preview of `summary`.
- `pinnedDecisions: string[]`
    - Bounded decisions safe to return.
- `restored: boolean`
    - `true` when a prior thread state was found and restored.

### Validation Rules

- Must be strict and reject unknown raw runtime fields.
- Must not include raw checkpoint or internal runtime state.
- Must not expose raw browser session id.

## ChatMemoryContext

Model-visible context assembled from ThreadState.

### Fields

- `summaryMessage?: string`
    - System-level memory summary instruction/text built from `summary`.
- `pinnedDecisionsMessage?: string`
    - System-level memory text built from `pinnedDecisions`.
- `recentMessages: ChatThreadMessage[]`
    - Recent text messages converted into model messages.
- `currentUserMessage: ChatThreadMessage | equivalent user input`
    - Latest eligible user message from the current frontend request.

### Validation Rules

- Must not include all historical messages after compaction.
- Must not treat frontend-sent historical `messages` as model-visible history for eligible server-authoritative memory paths.
- Must not include structured command internals or tool transcripts.
- Must be included only in eligible text chat paths.

## CompactionResult

Validated result of a compaction run.

### Fields

- `summary: string`
- `pinnedDecisions: string[]`

### Validation Rules

- `summary` must stay within the target bound.
- `pinnedDecisions` must stay within the count and per-entry bounds.
- Invalid output must be discarded without overwriting the previous ThreadState.

## LocalCompactionDerivation

Values derived locally after a successful model compaction.

### Fields

- `recentMessages: ChatThreadMessage[]`
    - Retained locally from the latest eligible messages.
    - Maximum after compaction: half of `CHAT_MEMORY_RECENT_MESSAGE_LIMIT`.
- `compactedAt: string`
    - Local ISO timestamp written by the server after a successful compaction.

### Validation Rules

- `recentMessages` must be derived from the latest eligible messages, not copied from model output.
- `compactedAt` must be generated locally, not copied from model output.
- `recentMessages` must stay within the reduced post-compaction retention window.

## State Lifecycle

```text
No checkpoint
  -> initialized empty AiMindThreadState
  -> completed eligible assistant turn appends user + assistant messages
  -> if messages <= threshold: checkpoint updated
  -> if messages > threshold: compaction attempted
      -> success: summary/pins validated from model, recent messages/timestamp derived locally, checkpoint updated
      -> failure: previous valid state preserved or append-only state retained without corrupting old memory
  -> hydration reads latest safe state and returns DTO
```

## Relationships

- `AiMindThreadState` is addressed by one chat runtime thread id.
- `ThreadHydrationDTO` is derived from `AiMindThreadState`; it is not the raw checkpoint.
- `ChatMemoryContext` is derived from `AiMindThreadState`; it is not public DTO.
- Tasklist Agent `GraphState` and Delivery Chain `RuntimeArtifact` have no relationship to `AiMindThreadState` in v0.4.2.
