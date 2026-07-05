# Quickstart: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Feature**: [spec.md](./spec.md)  
**Date**: 2026-07-05

## Purpose

验证当前 browser session 最多可持有 10 个彼此隔离的 chat conversations；每个 conversation 都有自己的 text-only `ThreadState`；同时 existing memory、Tasklist、Delivery、stream-core 和 frontend reducer 行为不回退。

## Prerequisites

- 已安装 `pnpm`
- 本地验证默认使用 `AI_MIND_CHAT_MEMORY_CHECKPOINT=memory`
- 若要验证 durable checkpoint，可额外准备 PostgreSQL checkpoint 环境

## Recommended Validation Order

### 1. Focused v0.4.4 regression suite

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/app/api/chat/conversations/route.test.ts `
  tests/app/api/chat/thread/route.test.ts `
  tests/app/api/chat/route.test.ts `
  tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts `
  tests/lib/ai/runtime/chat-orchestrator.test.ts `
  tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts `
  tests/lib/ai/runtime/delivery-chain.test.ts `
  tests/lib/ai/chat-service.test.ts `
  tests/components/instamind/use-chat-stream.test.tsx `
  tests/components/instamind/use-chat-stream-hydration.test.tsx `
  tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx `
  tests/components/instamind/conversation-session.test.tsx `
  tests/components/instamind/chat-stream/stream-message-reducer.test.ts `
  tests/app/instant-mind/page.test.ts
```

Expected result:

- `14 passed` test files
- `129 passed` tests

### 2. Full webapp suite

```powershell
pnpm --dir apps/webapp test
```

Expected result:

- `100 passed | 6 skipped` test files
- `596 passed | 20 skipped` tests

### 3. Stream-core non-regression

```powershell
pnpm --filter @ai-mind/stream-core test
```

Expected result:

- `5 passed` test files
- `22 passed` tests

### 4. Workspace validation

```powershell
pnpm typecheck
pnpm lint:webapp
git diff --check
```

Expected result:

- Typecheck passes
- Lint passes with only existing `react-refresh/only-export-components` warnings in shared UI/layout files
- `git diff --check` passes

## Manual Validation Scenarios

### Scenario 1: First load enters a usable blank draft when no persisted conversation exists

1. Open the chat page in a fresh browser session.
2. Expect a blank draft surface titled `新会话`.
3. Expect recent list / registry to remain empty until the first user message is sent.
4. If storage is empty or hydration fails, no raw internal error should surface.

### Scenario 2: Start a blank draft without overwriting older persisted conversations

1. Ensure there is already one existing conversation.
2. Click `新聊天` while not streaming.
3. Expect a newly selected blank draft, but no additional recent-list item yet.
4. Older persisted conversations remain visible unless the 10-entry retention limit later prunes one after draft promotion.

### Scenario 3: Draft promotion and switch / restore isolation

1. Start from a blank draft and send a topic A message to create conversation A.
2. Start another blank draft and send a topic B message to create conversation B.
3. Switch back to conversation A.
4. Expect only A messages to restore.
5. Continue chatting in A and verify B content does not enter context or hydration.

### Scenario 4: Registry limit and last-active ordering

1. Promote more than 10 drafts into persisted conversations.
2. Before creating the last one, send a new message in an older conversation.
3. Expect that conversation to move to the top of the recent list.
4. Expect only 10 persisted conversations to remain in registry and UI.
5. Expect the least recently active persisted entry to be pruned.

### Scenario 5: Streaming guard

1. Send a message that produces streaming output.
2. While streaming, try `新建会话` and switching to another recent conversation.
3. Expect both actions to remain disabled and selected conversation not to change.
4. After stream end or safe abort, create/switch becomes available again.

### Scenario 6: Refresh restores the selected conversation

1. Select a persisted conversation with messages.
2. Refresh the page.
3. Expect the same selected conversation to restore.
4. Start a fresh blank draft and refresh before sending any message.
5. Expect a safe blank draft surface or equivalent local draft sentinel, but no ghost recent entry.
6. If the client restore hint is stale or invalid, expect safe fallback rather than cross-conversation hydration.

### Scenario 7: Final-turn memory still works

1. Complete ordinary chat, tool-assisted chat, Tasklist final answer, and Delivery final report scenarios.
2. Refresh the selected conversation.
3. Expect only user text and final assistant text to restore.
4. Expect no raw tool transcript, GraphState, RuntimeArtifact, workflow progress, provider response, or internal prompt leakage.

### Scenario 8: Mobile conversation selector

1. Open the chat page in a mobile viewport.
2. Use the top selected-conversation trigger to open the drawer.
3. Create and switch conversations from the drawer while not streaming.
4. Expect long titles to truncate cleanly and no search / project / file / delete / rename / archive controls to appear.

### Scenario 9: UI baseline continuity

1. Open the chat page in both desktop and mobile viewports.
2. Verify sidebar / drawer continue the existing `instant-mind` shell, AI Mind brand area, and `background/foreground/sidebar` theme tokens.
3. Verify controls stay on the local `shadcn/ui` / `radix-vega` baseline.
4. Verify the feature does not depend on MCP or a remote UI registry to render.

## Current Evidence

- Automated validation for Scenarios 1-7 and 9 was re-run on 2026-07-05 via the focused draft-first suite (`16 passed` test files, `136 passed` tests), plus direct `tsc --noEmit`, `eslint apps/webapp`, and `next build`.
- Scenario 8 mobile selector behavior is covered by `conversation-session.test.tsx` and `page.test.ts`.
- Real browser manual smoke for desktop/mobile is still pending in this terminal-only environment.
