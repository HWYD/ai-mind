# Contract: Chat Memory Runtime

**Feature**: [spec.md](../spec.md)
**Date**: 2026-07-02

## Eligibility

Chat memory writes apply to:

- ordinary text chat
- reader/utility text answers
- docs summary style text-only turns

Chat memory writes do not apply to:

- `/tasklist`
- `/delivery-chain`
- ordinary tool-calling transcript
- MCP tool/resource transcript
- Tasklist Agent GraphState / HITL checkpoint / interrupt payload
- Delivery Chain RuntimeArtifact / workflow progress / subagent raw invocation or result

## Thread Identifier

```text
chat:${sessionHash}
```

Rules:

- `sessionHash` is derived server-side from the existing browser session id.
- Raw session id is never returned or persisted as public thread id.
- Chat thread ids must never be accepted as Tasklist Agent resume thread ids.

## Checkpoint Mode

Configuration:

```text
AI_MIND_CHAT_MEMORY_CHECKPOINT=off|memory|postgres
```

Defaults:

- development: `memory`
- production: `postgres`
- explicit invalid value: treated as `off` or fail closed according to implementation plan tasks

Storage:

- PostgreSQL schema: `langgraph_chat_memory`
- Setup: explicit setup script, not Prisma migration.

## Write Timing

```text
eligible request starts
  -> existing ThreadState read for context
  -> latest eligible frontend user message selected as current turn input
  -> assistant response streams to user
  -> stream finishes successfully
  -> append user + assistant text messages
  -> compact if over threshold
  -> write checkpoint once
```

Rules:

- No per-chunk checkpoint writes.
- No cancelled assistant message writes.
- No empty assistant message writes.
- Compaction failure must not fail the completed response.

## Compaction Status Stream Event

Optional stream event:

```text
type: 'thread-memory-status'
status: 'started' | 'succeeded' | 'failed'
message: string
summaryLength?: number
pinnedDecisionCount?: number
```

Rules:

- The event is emitted only for eligible ordinary chat memory paths that actually enter compaction.
- `started` is emitted when the backend begins compaction work for the completed turn.
- `succeeded` is emitted only after the compacted ThreadState write succeeds.
- `failed` is emitted when model generation, schema validation, or compacted-state write fails.
- The event is user-visible but must stay generic and safe: no raw checkpoint, prompt, provider response, stack trace, cookie, or internal state payload.
- Frontend consumes this event as a subtle status hint near the composer area; it must not be appended as ordinary assistant text or persisted into hydrated `MindMessage[]`.

## Context Builder

Model-visible context is assembled as:

1. Existing skill/output policy/system prompts.
2. Optional memory summary prompt built from `summary`.
3. Optional pinned decisions prompt built from `pinnedDecisions`.
4. Recent eligible text messages.
5. Latest eligible user message from the current request.

Rules:

- For eligible chat memory paths, server-side ThreadState is the authoritative model-visible history source.
- Frontend-sent historical `messages` are accepted for API compatibility and UI state but must not be injected as model-visible chat history.
- Must not inject full historical messages after compaction.
- Must not duplicate frontend history and ThreadState recent messages.
- Must not inject raw checkpoint.
- Must not inject Tasklist or Delivery internal state.

## Compaction Limits

- Recent messages before compaction: 8.
- Recent messages retained after compaction: 4.
- Summary target: about 2500 Chinese characters.
- Pinned decisions: 20 entries.
- Compaction output must be schema-validated before replacing state.
- Model output must contain only `summary` and `pinnedDecisions`.
- `recentMessages` and compaction timestamp are derived locally after schema validation.
- Compaction uses a fixed internal model id `deepseek/deepseek-v4-pro`, disables reasoning, and uses non-streaming invocation.

## Non-Regression Requirements

- Tasklist Agent uses its existing `tasklist-agent:${conversationId}:${runId}` thread id and checkpoint provider.
- Tasklist Agent AgentRun / AgentInterrupt business state remains unchanged.
- Delivery Chain remains run-local and does not gain checkpoint/resume semantics.
- `@ai-mind/stream-core` chunk union remains backward-compatible; the new optional `thread-memory-status` chunk is allowed for this version.
- Frontend reducer continues to consume `MindMessage[]` with current part union.
