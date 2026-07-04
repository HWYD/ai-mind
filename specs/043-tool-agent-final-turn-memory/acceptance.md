# Acceptance 043: Tool & Agent Final Turn Memory

状态: Implemented
版本: v0.4.3
日期: 2026-07-04

## Release Gate

v0.4.3 只有在以下条目全部满足后，才可进入 release close。

## Functional Acceptance

- [x] ordinary tool final answer 刷新后可恢复为普通 user/assistant text turn。
- [x] authoritative tool final text answer 刷新后可恢复为普通 user/assistant text turn。
- [x] reader / utility final text answer 刷新后可恢复为普通 user/assistant text turn。
- [x] docs summary final text answer 刷新后可恢复为普通 user/assistant text turn。
- [x] MCP / resource-assisted final text answer 刷新后可恢复为普通 user/assistant text turn。
- [x] Tasklist completed final answer text summary 刷新后可恢复。
- [x] Tasklist controlled blocked final answer text summary 刷新后可恢复。
- [x] Tasklist interrupted / paused / failed turn 不写入 completed memory。
- [x] Delivery completed final report 刷新后可恢复为普通 assistant text turn。
- [x] Delivery blocked final report 刷新后可恢复为普通 assistant text turn。
- [x] Delivery failed / exception / cancelled turn 不写入 completed memory。
- [x] 同一 completed final turn 最多写入一次。

## Text-Only Memory Acceptance

- [x] ThreadState persisted messages 仍然只包含 `id` / `role` / `text` / `createdAt`。
- [x] 不持久化 `source` / `turnId` / `displayKind`。
- [x] 不持久化 raw tool args / result / ToolMessage。
- [x] 不持久化 raw MCP envelope / resource content。
- [x] 不持久化 Tasklist artifact markdown。
- [x] 不持久化 Tasklist GraphState / checkpoint / interrupt payload / AgentRun internals。
- [x] 不持久化 Delivery RuntimeArtifact / workflow progress / subagent raw invocation/result。
- [x] 不持久化 raw prompt / raw provider response / stack / API key / cookie / provider config。

## Hydration Acceptance

- [x] `GET /api/chat/thread` response shape 与 v0.4.2 保持兼容。
- [x] hydrated messages 仍然是普通 completed user/assistant text messages。
- [x] hydration 不返回 tool / resource / agent-step / agent-interrupt / workflow / artifact parts。
- [x] hydration 不返回 `source` / `turnId` / `displayKind`。
- [x] hydration 不返回 raw checkpoint / GraphState / RuntimeArtifact / provider internals。
- [x] storage unavailable 时仍返回安全降级结果，不暴露内部错误细节。

## Context And Compaction Acceptance

- [x] ordinary chat model context 仍以后端 ThreadState 为历史事实源。
- [x] recent messages 可以包含 persisted tool / Tasklist / Delivery final turns。
- [x] model context 不包含 raw tool transcript / GraphState / RuntimeArtifact / workflow progress / subagent raw result。
- [x] write eligibility 与 context eligibility 分离，Tasklist / Delivery 只获得 final-turn write，不获得普通 chat resume/context 语义。
- [x] structured final turns 超出 recent window 后可被 compaction 压入 summary / pinned decisions。
- [x] compaction failure 不破坏已存在 ThreadState，也不影响已完成用户回答。
- [x] Delivery long final report 保存前按 8000 字符确定性截断，不引入 execution summary。

## Stream And Frontend Acceptance

- [x] 不新增 final-turn stream chunk。
- [x] 不修改 `@ai-mind/stream-core` chunk union。
- [x] 不修改 frontend reducer public shape。
- [x] 刷新恢复后的 tool / Tasklist / Delivery final turns 继续按普通 text message 渲染。

## Tasklist And Delivery Non-regression

- [x] Tasklist resume 继续使用自己的 thread id 和业务 run 状态。
- [x] Tasklist HITL review node 不新增副作用。
- [x] Tasklist Graph topology / checkpoint / interrupt / resume contract 不变。
- [x] Delivery Chain 继续 run-local，不新增 checkpoint / resume / artifact persistence。
- [x] Delivery workflow progress UI 非退化。
- [x] Delivery manager subagent transcript suppression 非退化。

## Explicit Non-goals Preserved

- [x] 不新增 ChatSession / ChatMessage 业务表。
- [x] 不新增 LangGraph Store / PostgresStore。
- [x] 不新增 long-term memory / multi-session history。
- [x] 不新增 contextEntries。
- [x] 不新增 reasoning summary / execution summary / tool observation summary / agent run summary。
- [x] 不新增 memory inspector / source badge / execution summary UI。

## Required Tests

- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-eligibility.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-state.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/assistant-stream.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-output.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner-resume-state.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`
- [x] `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

## Validation Commands

- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-memory-service.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/app/api/chat/thread/route.test.ts`
- [x] `pnpm --dir apps/webapp test -- --run tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] `pnpm --filter @ai-mind/stream-core test`
- [x] `pnpm typecheck`
- [x] `pnpm lint:webapp`
- [x] `pnpm build:pas`
- [x] `git diff --check`

## Execution Evidence

- 2026-07-04 已执行 focused webapp suites：18 files / 130 tests passed。
- 2026-07-04 已执行 `pnpm --filter @ai-mind/stream-core test`：5 files / 22 tests passed。
- 2026-07-04 已执行 `pnpm typecheck`：passed。
- 2026-07-04 已执行 `pnpm lint:webapp`：passed with 4 pre-existing `react-refresh/only-export-components` warnings in unrelated UI files。
- 2026-07-04 已执行 `pnpm build:pas`：passed。
- 2026-07-04 已执行 `git diff --check`：passed。
- 2026-07-04 已按 quickstart 执行 terminal-only smoke equivalent；浏览器交互 smoke 仍可在有 UI 环境时补做视觉确认。

## Manual Scope Guardrail

- [x] 不让 raw transcript、raw checkpoint、raw provider response 或 stack 进入 hydration。
- [x] 不让 Tasklist GraphState / HITL payload 进入 chat memory。
- [x] 不让 Delivery RuntimeArtifact / workflow progress / subagent raw result 进入 chat memory。
- [x] 不把 chat memory thread id 接到 Tasklist resume。
- [x] 不把 Delivery 变成带 checkpoint / resume 的 durable runtime。
- [x] 不修改 stream-core chunk union。
- [x] 不修改 frontend reducer public shape。
- [x] 不修改 Prisma schema / DB migration。
