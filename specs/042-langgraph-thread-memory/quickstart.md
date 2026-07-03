# Quickstart: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Feature**: [spec.md](./spec.md)
**Date**: 2026-07-02

This guide describes how to validate v0.4.2 after implementation.

## Prerequisites

- Install workspace dependencies.
- Configure model provider credentials for ordinary chat.
- For durable validation, start PostgreSQL and set `DATABASE_URL`.
- Set a strong `AI_MIND_AGENT_RUN_SESSION_SECRET` so browser session-derived ids can be created safely.

## Environment Modes

Development memory mode:

```bash
AI_MIND_CHAT_MEMORY_CHECKPOINT=memory
```

Production-like durable mode:

```bash
AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres
DATABASE_URL=postgresql://...
```

Disabled mode:

```bash
AI_MIND_CHAT_MEMORY_CHECKPOINT=off
```

## Setup Validation

Run the database setup path after implementation:

```bash
pnpm db:setup:deploy
```

Expected outcome:

- Prisma business migrations are applied.
- Existing Tasklist Agent checkpoint schema remains available.
- New chat memory checkpoint schema `langgraph_chat_memory` is initialized.

For focused setup only:

```bash
pnpm db:chat-memory:setup
```

## Contract Validation

Run focused API/runtime tests after implementation:

```bash
pnpm --dir apps/webapp test -- chat-memory app/api/chat/thread
```

Expected contract outcomes:

- `GET /api/chat/thread` returns only safe hydration fields.
- Empty memory returns `messages: []` and `restored: false`.
- Existing memory returns recent text messages and `restored: true`.
- Hydration never returns raw checkpoint, raw prompt, provider response, stack, Tasklist GraphState, RuntimeArtifact, raw session id, cookie value, or provider config.

Recommended version-closing validation set:

```bash
pnpm --dir apps/webapp test -- chat-memory
pnpm --dir apps/webapp test -- app/api/chat
pnpm --dir apps/webapp test -- version-plan-tasklist-agent
pnpm --dir apps/webapp test -- delivery-chain
pnpm --filter @ai-mind/stream-core test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
pnpm --dir apps/webapp build
```

Focused compaction-status validation set:

```bash
pnpm --filter @ai-mind/stream-core test -- chat-stream-chunk
pnpm --dir apps/webapp test -- stream-chunk-schema use-chat-stream chat-memory chat-orchestrator
```

## Manual Smoke: Refresh Recovery

1. Start the webapp.
2. Open the chat page in a fresh browser session.
3. Send a normal text chat message and wait for the assistant answer to finish.
4. Refresh the page.
5. Confirm the recent user and assistant messages are restored.
6. Continue asking a follow-up question.

Expected outcome:

- The page does not reset to an empty chat after refresh.
- The follow-up can use recent restored context.
- No raw runtime/debug data is visible.

## Manual Smoke: Compaction

1. Send enough ordinary text turns to exceed the recent-message threshold.
2. Send one more turn and wait for completion.
3. Refresh the page.
4. Inspect the restored message count and any safe summary/pinned-decision indicators exposed by DTO or debug tooling.

Expected outcome:

- Recent messages are bounded.
- After a successful compaction, the restored recent-message window drops below the trigger threshold instead of staying at the full threshold.
- Older content is represented by summary/pinned decisions.
- Full historical messages are not injected into the next model request.
- During compaction, the frontend shows a subtle runtime hint such as `上下自动压缩中` and then updates it to `上下文已自动压缩` or `上下文自动压缩失败` after completion.

## Non-Regression Validation

Run or preserve focused suites for:

- Tasklist Agent graph state, HITL contract, checkpoint provider, initial run, and resume.
- Delivery Chain ControlledDeliveryManager, workflow progress, RuntimeArtifact run-local behavior, and ToolRuntimeScope transcript suppression.
- stream-core protocol schema.
- frontend stream message reducer and assistant message rendering.

Expected outcome:

- Tasklist Agent still uses its own thread id and AgentRun/AgentInterrupt business state.
- Delivery Chain still does not persist RuntimeArtifact or gain checkpoint/resume semantics.
- No stream chunk union changes are required for chat memory hydration.

## Current Closing Note

The automated validation portion of this quickstart is expected to be completed in CI or local terminal. Browser-level manual smoke still requires an operator with valid model credentials and, for durable mode, a healthy PostgreSQL instance.

## Disabled Mode Validation

1. Set `AI_MIND_CHAT_MEMORY_CHECKPOINT=off`.
2. Start the webapp.
3. Send a normal chat message and refresh.

Expected outcome:

- Ordinary chat still works.
- No memory recovery is promised.
- The user does not see raw checkpoint or database errors.
