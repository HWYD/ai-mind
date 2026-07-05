# Acceptance 044: Minimal Multi-thread Chat Sessions

**Status**: Draft-first implementation aligned; real browser manual smoke still pending  
**Version**: v0.4.4  
**Date**: 2026-07-05

## Release Gate

- [x] Conversation registry is browser-session scoped and capped at 10 entries
- [x] New chat enters blank draft state, and first-message promotion creates the persisted conversation on server and client
- [x] Recent conversation switch restores only the selected conversation
- [x] Short-term memory, hydration, compaction, and final-turn writes are isolated per conversation
- [x] Streaming guard prevents create/switch during active output and preserves stream-start ownership
- [x] Desktop sidebar and mobile selector are integrated on the existing InstantMind UI baseline
- [x] v0.4.2 / v0.4.3 memory and runtime non-regression suites still pass
- [ ] Desktop / mobile manual smoke in a real browser

## Implemented Scope

### Functional acceptance

- [x] First load enters or restores one usable blank draft when the current browser session has no persisted conversation
- [x] New chat enters a blank draft titled `新会话` without overwriting older persisted conversations or creating a ghost recent entry
- [x] The first accepted user message from draft promotes it into one persisted selected conversation
- [x] Existing conversations can be re-selected from the recent list
- [x] Refresh restores only the server-validated selected conversation
- [x] Refreshing an unsent draft restores a safe blank draft surface without hydrating the wrong conversation or creating a ghost recent entry
- [x] Stale client restore hints for persisted conversations fall back safely instead of hydrating the wrong conversation

### Registry acceptance

- [x] Registry remains scoped to the current browser session, not account history
- [x] Registry, desktop sidebar, and mobile selector all cap at 10 persisted recent conversations
- [x] Legacy empty registry entries are normalized away and do not consume persisted recent capacity
- [x] Ordering uses `lastActiveAt` descending
- [x] Blank drafts never become empty persisted registry entries, so empty-conversation pruning is no longer needed

### Isolation and safety acceptance

- [x] Hydration requires an explicit `conversationId`
- [x] Missing or invalid `conversationId` does not silently fall back to legacy single-thread memory
- [x] Hydration payload remains safe text-only completed user/assistant messages
- [x] Hydration payload excludes raw checkpoint, session, provider, GraphState, runtime artifact, workflow progress, tool transcript, API key, and internal prompt fields
- [x] Storage failure returns sanitized empty hydration instead of leaking internal errors
- [x] Persisted `ThreadState` remains text-only and does not gain business-history semantics

### Streaming guard acceptance

- [x] Sidebar and drawer create/switch actions are disabled during streaming / pending review
- [x] Active request ownership is captured at request start and not changed by later prop updates
- [x] Final-turn writes continue to target the stream-start conversation on the server side
- [x] Same-conversation status transitions no longer trigger unwanted re-hydration wipes after stream end or abort
- [x] Real conversation switches clear the previous `thread-memory-status` hint instead of leaking it into another conversation UI

### UI baseline acceptance

- [x] Desktop sidebar is collapsible and highlights the selected conversation
- [x] Mobile uses a compact top trigger plus drawer-style selector
- [x] Shared list items truncate long titles without introducing full history-management controls
- [x] Implementation reuses local `apps/webapp/components/ui/` primitives and a local `sheet` primitive
- [x] Visual shell stays on the existing `instant-mind` / `globals.css` theme baseline instead of landing-page styling

## Required Focused Tests

- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-thread-id.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] `apps/webapp/tests/lib/ai/chat-service.test.ts`
- [x] `apps/webapp/tests/app/api/chat/conversations/route.test.ts`
- [x] `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] `apps/webapp/tests/app/api/chat/route.test.ts`
- [x] `apps/webapp/tests/app/api/chat/tasklist-route-length.test.ts`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx`
- [x] `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] `apps/webapp/tests/app/instant-mind/page.test.ts`
- [x] `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

## Validation Commands

> Note: The command list below remains the release target. In this consistency pass, focused suites plus lint / typecheck / build were re-run with direct local binaries because `pnpm` is currently blocked by ignored-build approval requirements in this environment.

- [x] `pnpm --dir apps/webapp exec vitest run tests/app/api/chat/conversations/route.test.ts tests/app/api/chat/thread/route.test.ts tests/app/api/chat/route.test.ts tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts tests/lib/ai/runtime/delivery-chain.test.ts tests/lib/ai/chat-service.test.ts tests/components/instamind/use-chat-stream.test.tsx tests/components/instamind/use-chat-stream-hydration.test.tsx tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx tests/components/instamind/conversation-session.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts tests/app/instant-mind/page.test.ts`
- [x] `pnpm --dir apps/webapp test`
- [x] `pnpm --filter @ai-mind/stream-core test`
- [x] `pnpm typecheck`
- [x] `pnpm lint:webapp`
- [x] `git diff --check`

## Execution Evidence

- Draft-first focused suite: `16 passed` test files, `136 passed` tests
- Targeted TypeScript check: `apps/webapp/node_modules/.bin/tsc.cmd --noEmit` passed
- Targeted ESLint scan: `node_modules/.bin/eslint.cmd apps/webapp` passed with existing `react-refresh/only-export-components` warnings in shared UI/layout files only
- Production build: `apps/webapp/node_modules/.bin/next.cmd build` passed

## Manual Scope Guardrail

- [x] 不把 registry 扩展成完整聊天历史系统
- [x] 不承诺找回超出 10-entry registry limit 的 conversations
- [x] 不让 raw runtime state 进入 hydration、ThreadState 或 model-visible context
- [x] 不让 Tasklist GraphState / HITL payload 进入 chat memory
- [x] 不让 Delivery RuntimeArtifact / workflow progress / subagent raw result 进入 chat memory
- [x] 不修改 stream-core chunk union、frontend reducer public shape、Prisma schema / DB migration
- [x] 优先复用本地 `shadcn/ui` / `radix-vega` 基线，不依赖 MCP 或 remote UI registry
- [ ] 真实浏览器 desktop / mobile manual smoke 尚未在本终端环境完成
