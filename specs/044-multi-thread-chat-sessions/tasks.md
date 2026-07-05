# Tasks: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Input**: `specs/044-multi-thread-chat-sessions/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

> 2026-07-05 addendum: T001-T069 反映的是“空会话可先落为 persisted conversation”的旧实现路线。当前规格已改为“纯 draft state，首条消息才创建正式会话”，因此需要以下补充任务完成语义收敛。

## Phase 1: Setup

- [x] T001 在 `apps/webapp/tests/app/api/chat/conversations/route.test.ts` 创建 registry route test anchors
- [x] T002 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 创建 conversation registry runtime test anchors
- [x] T003 [P] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 创建 conversation session UI test anchors
- [x] T004 [P] 在 `apps/webapp/tests/lib/ai/chat-schema.test.ts` 补充必须携带 `conversationId` 的 chat schema tests

## Phase 2: Foundational

### Tests First

- [x] T005 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-thread-id.test.ts` 补充 conversation-scoped thread id tests
- [x] T006 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 补充 create / select / sort / prune tests
- [x] T007 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts` 补充 selected-conversation hydration DTO tests
- [x] T008 [P] 在 `apps/webapp/tests/app/api/chat/route.test.ts` 补充缺失或无效 `conversationId` 的 route contract tests

### Implementation

- [x] T009 在 `apps/webapp/lib/ai/runtime/chat-memory/thread-id.ts` 实现 conversation-scoped chat memory thread id helpers
- [x] T010 在 `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts` 实现 session-scoped Conversation Registry
- [x] T011 在 `apps/webapp/lib/ai/runtime/chat-memory/index.ts` 导出 Conversation Registry 和 thread-id APIs
- [x] T012 在 `apps/webapp/lib/ai/runtime/chat-memory/state-schema.ts` 更新 selected conversation 相关 safe hydration DTO schemas
- [x] T013 在 `apps/webapp/lib/ai/runtime/chat-memory/hydration-dto.ts` 更新 conversation payload DTO builder 和 forbidden-field guard
- [x] T014 在 `apps/webapp/lib/ai/chat-schema.ts` 收紧 send request 校验，要求使用 server-validated `conversationId`

## Phase 3: User Story 1 - Create Blank Conversation

### Tests

- [x] T015 [P] [US1] 在 `apps/webapp/tests/app/api/chat/conversations/route.test.ts` 补充默认会话初始化 tests
- [x] T016 [P] [US1] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 补充 create blank conversation retention tests
- [x] T017 [P] [US1] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 补充旧 empty conversations 不长期占用 recent capacity 的 tests
- [x] T018 [P] [US1] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 frontend new chat state tests

### Implementation

- [x] T019 [US1] 在 `apps/webapp/app/api/chat/conversations/route.ts` 实现最小 GET/POST conversation registry route
- [x] T020 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts` 实现默认空会话创建和 `新会话` 标题行为
- [x] T021 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts` 实现旧 empty conversations 容量治理
- [x] T022 [US1] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` 实现 conversation session client state hook
- [x] T023 [US1] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 接入 selected conversation 初始化逻辑

## Phase 4: User Story 2 - Switch Recent Conversations

### Tests

- [x] T024 [P] [US2] 在 `apps/webapp/tests/app/api/chat/conversations/route.test.ts` 补充 select existing conversation route tests
- [x] T025 [P] [US2] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 补充 selected-conversation hydration route tests
- [x] T026 [P] [US2] 在 `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx` 补充 switch-and-restore hydration tests
- [x] T027 [P] [US2] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 stale client selected-conversation hint tests
- [x] T028 [P] [US2] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 补充 `selectedConversationId` 无效时按 `updatedAt` 安全 fallback tests

### Implementation

- [x] T029 [US2] 在 `apps/webapp/app/api/chat/conversations/route.ts` 实现 select-conversation 行为
- [x] T030 [US2] 在 `apps/webapp/app/api/chat/thread/route.ts` 更新 chat thread hydration route，要求并校验 selected `conversationId`
- [x] T031 [US2] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 调整 hydration 流程，只请求当前 selected conversation
- [x] T032 [US2] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` 确保 frontend persistence 只是 restore hint
- [x] T033 [US2] 在 `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts` 实现基于 `updatedAt` 的 server-side safe fallback selection

## Phase 5: User Story 3 - Isolated Short-term Memory

### Tests

- [x] T034 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts` 补充 context isolation tests
- [x] T035 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts` 补充 compaction isolation tests
- [x] T036 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` 补充 selected-conversation final-turn write tests
- [x] T037 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts` 补充 per-conversation read/write isolation tests

### Implementation

- [x] T038 [US3] 在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` 更新 context read 和 final-turn append，使用 request `conversationId`
- [x] T039 [US3] 在 `apps/webapp/lib/ai/chat-service.ts` 更新 orchestration 入口，传递并校验 selected conversation ownership
- [x] T040 [US3] 在 `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` 更新 conversation thread read/write helpers
- [x] T041 [US3] 在 `apps/webapp/lib/ai/runtime/chat-memory/message-adapter.ts` 保持 persisted ThreadState text-only，同时切换到 conversation-scoped ownership

## Phase 6: User Story 4 - Streaming Guard Blocks Conversation Changes

### Tests

- [x] T042 [P] [US4] 在 `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx` 补充 streaming guard hook tests
- [x] T043 [P] [US4] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 sidebar / drawer disabled action tests
- [x] T044 [P] [US4] 在 `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` 补充 active-stream conversation ownership tests

### Implementation

- [x] T045 [US4] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 捕获 active stream 的 conversation ownership
- [x] T046 [US4] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` 和页面 wiring 中禁用 streaming 期间 create/switch
- [x] T047 [US4] 在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` 增加 active stream final-turn write guard

## Phase 7: User Story 5 - Minimal Sidebar And Mobile Selector

### Tests

- [x] T048 [P] [US5] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 desktop sidebar rendering tests
- [x] T049 [P] [US5] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 mobile drawer rendering tests
- [x] T050 [P] [US5] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 补充 page layout integration tests

### Implementation

- [x] T051 [US5] 在 `apps/webapp/components/instamind/conversation-session/conversation-sidebar.tsx` 实现 desktop conversation sidebar
- [x] T052 [US5] 在 `apps/webapp/components/instamind/conversation-session/conversation-mobile-selector.tsx` 实现 mobile conversation selector / drawer
- [x] T053 [US5] 在 `apps/webapp/components/instamind/conversation-session/conversation-list-item.tsx` 实现共享 list item 和 title truncation
- [x] T054 [US5] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 集成 sidebar、collapse control 和 mobile selector

## Phase 8: User Story 6 - Existing Memory And Runtime Paths Do Not Regress

### Tests

- [x] T055 [P] [US6] 在 `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts` 更新 Tasklist final-turn memory non-regression tests
- [x] T056 [P] [US6] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 更新 Delivery final-turn memory non-regression tests
- [x] T057 [P] [US6] 在 `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` 更新 stream protocol non-regression tests
- [x] T058 [P] [US6] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 更新 frontend reducer non-regression tests
- [x] T059 [P] [US6] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 补充 route-level forbidden-field regression coverage

### Implementation

- [x] T060 [US6] 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 调整 Tasklist final-turn memory append target，写入 selected conversation 且保持 GraphState thread identity 不变
- [x] T061 [US6] 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 调整 Delivery final-turn memory append target，写入 selected conversation 且保持 run-local semantics 不变
- [x] T062 [US6] 在 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 保持 frontend reducer public shape 不变

## Phase 9: Polish & Cross-Cutting Validation

- [x] T063 [P] 在 `specs/044-multi-thread-chat-sessions/acceptance.md` 回填实现证据
- [x] T064 [P] 在 `specs/044-multi-thread-chat-sessions/decisions.md` 更新最终落地决策
- [x] T065 [P] 在 `specs/044-multi-thread-chat-sessions/quickstart.md` 同步实现偏差后的验证场景
- [x] T066 按 `specs/044-multi-thread-chat-sessions/quickstart.md` 跑 focused chat-memory、route、hydration、UI、Tasklist 和 Delivery tests
- [x] T067 从 `packages/stream-core/package.json` 锚点运行 `pnpm --filter @ai-mind/stream-core test`
- [x] T068 从 workspace scripts 锚点运行 `pnpm typecheck` 和 `pnpm lint:webapp`
- [x] T069 按 `specs/044-multi-thread-chat-sessions/quickstart.md` 执行 desktop / mobile manual smoke

## Phase 10: Draft-first Conversation Realignment

### Tests

- [x] T070 [P] 在 `apps/webapp/tests/app/api/chat/conversations/route.test.ts` 补充“空 registry 返回 blank draft，而不是创建 default conversation” tests
- [x] T071 [P] 在 `apps/webapp/tests/app/api/chat/route.test.ts` 补充 draft promotion send contract tests，覆盖显式 create path 和冲突参数失败
- [x] T072 [P] 在 `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx` 补充 blank draft 不触发 persisted hydration 的 tests
- [x] T073 [P] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 补充 blank draft 不进入 recent list / registry 的 UI tests
- [x] T074 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts` 删除 empty-conversation pruning 假设并补充 persisted-only registry retention tests

### Implementation

- [x] T075 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/conversation-registry.ts` 去掉默认空会话创建与 empty-conversation pruning 逻辑，改为 persisted-only registry
- [x] T076 [US1] 在 `apps/webapp/app/api/chat/conversations/route.ts` 调整 registry contract：空 session 返回空 registry，不再支持 create-blank conversation mutation
- [x] T077 [US1] 在 `apps/webapp/lib/ai/chat-schema.ts` 与 `apps/webapp/app/api/chat/route.ts` 引入显式 draft promotion send path
- [x] T078 [US1] 在 `apps/webapp/components/instamind/conversation-session/use-conversation-sessions.ts` 增加 client-local blank draft sentinel，并让 refresh / restore 与 persisted selection 分离
- [x] T079 [US1] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 把首条 draft send 改成“先 promotion 再绑定 active stream ownership”
- [x] T080 [US1] 在 `apps/webapp/components/instamind/conversation-session/conversation-sidebar.tsx`、`conversation-mobile-selector.tsx` 和 `instantmind-page.tsx` 保证 blank draft 不进入 recent list，但仍可作为当前空白工作面显示

## Phase 11: Draft-first Docs & Evidence Refresh

- [x] T081 [P] 在 `specs/044-multi-thread-chat-sessions/acceptance.md` 重新采集 draft-first 语义的实现证据
- [x] T082 [P] 在 `specs/044-multi-thread-chat-sessions/quickstart.md` 按 draft promotion 路径重跑 focused suites 与手动 smoke

## Phase 12: Shadcn UI Convergence

### Tests

- [x] T083 [P] [US5] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 与 `tests/app/instant-mind/page.test.ts` 补充 shadcn-converged sidebar / scroll-area / skeleton / alert rendering anchors
- [x] T084 [P] [US5] 在 `apps/webapp/tests/components/instamind/conversation-session.test.tsx` 与 `tests/app/instant-mind/page.test.ts` 补充会话壳层保持 current brand、collapse、draft-first 和 streaming guard 语义不变的 UI regression coverage

### Implementation

- [x] T085 [US5] 在 `apps/webapp/components/ui/` 引入并本地化 `sidebar.tsx`、`scroll-area.tsx`、`skeleton.tsx` 等缺失的 `shadcn/ui` primitives，保持当前 `radix-vega` 基线与 theme tokens
- [x] T086 [US5] 在 `apps/webapp/components/instamind/conversation-session/conversation-sidebar.tsx` 以本地 `ui/sidebar` primitives 重构 desktop conversation sidebar，同时保留 AI Mind 品牌区、最近列表、折叠/展开和 disabled guard 语义
- [x] T087 [US5] 在 `apps/webapp/components/instamind/conversation-session/conversation-mobile-selector.tsx`、`human-review/human-review-composer-panel.tsx` 等长列表/长内容区域引入本地 `ui/scroll-area`，并保持移动端 `Sheet` 交互模型不变
- [x] T088 [US5] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 将 hydration loading skeleton 收敛到本地 `ui/skeleton` primitives，同时保留当前消息形态占位结构和宽度对齐关系
- [x] T089 [US5] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 与相关错误提示区域按信息层级引入本地 `ui/alert`，统一 hydration failure / lightweight error presentation
- [x] T090 [US5] 对 `instantmind-page.tsx`、`thread-memory-status-hint.tsx`、`human-review-composer-panel.tsx`、`chat-composer.tsx` 做一次 presentational shell audit：凡是已有等价本地 `shadcn/ui` primitive 的区域，优先去掉一次性展示壳

### Validation

- [x] T091 [P] 按 shadcn 收敛后的实现重跑 focused `instant-mind` page / conversation session / chat UI suites，并执行 `pnpm typecheck`、`pnpm lint:webapp` 与 `git diff --check`

## Release Note

- 自动化实现与验证已完成，T001-T068 与 T070-T081 已收口。
- T069 与 T082 仍需真实浏览器人工 smoke；当前终端环境未提供浏览器交互工具，因此保留未勾选。
- T083-T091 记录的是基于本轮 `shadcn` MCP review 的 UI primitive convergence 策略，当前尚未实施。
