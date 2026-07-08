# Contract: Runtime Integration

## Purpose

定义 v0.4.6 UserMemory semantic retrieval 如何接入 chat runtime，并明确不影响 Tasklist、Delivery、stream protocol 和 frontend public state。

## Eligible Paths

MUST run UserMemory semantic retrieval for:

- ordinary text chat
- tool-assisted ordinary chat within ordinary chat context boundary

MUST NOT run UserMemory semantic retrieval for:

- Tasklist Agent
- Delivery Chain / Delivery Manager
- HITL checkpoint / resume path
- workflow progress path
- MCP raw resource path
- frontend hydration
- sidebar conversation list
- conversation switching

## Context Order

Context assembly SHOULD preserve this conceptual order:

```text
system / skill / output policy prompts
+ selected UserMemories
+ selected conversation summary
+ selected conversation pinnedDecisions
+ selected conversation recent messages
+ latest user message
```

`UserMemory` remains supplemental context. `ThreadState` remains selected conversation short-term source of truth.

## Non-regression Contract

v0.4.6 MUST NOT change:

- stream-core chunk union
- frontend reducer public shape
- hydration payload shape
- Conversation Registry payload shape
- per-conversation ThreadState isolation
- v0.4.3 final-turn memory behavior
- Tasklist checkpoint/resume semantics
- Delivery run-local RuntimeArtifact semantics
- Tool / MCP authority boundaries

## Tool-assisted Ordinary Chat

When the request remains tool-assisted ordinary chat:

- UserMemory MAY influence final natural language answer context.
- UserMemory MUST NOT change tool authority.
- UserMemory MUST NOT be copied into raw tool input.
- UserMemory MUST NOT be exposed to MCP raw resource path.
- UserMemory MUST NOT alter Tasklist / Delivery routing.

## Failure Contract

If semantic retrieval fails:

- ordinary chat continues
- streaming continues
- ThreadState remains unchanged
- final-turn memory remains unchanged
- UserMemory Store remains valid
- selected UserMemory may be `[]`
- raw internal errors stay server-side and sanitized

Semantic retrieval timeout defaults to 1500ms. Timeout is handled as semantic retrieval failure and must fail open.
