# Implementation Plan: AI Mind v0.4.2 LangGraph Single Thread Memory Baseline

**Branch**: `[042-langgraph-thread-memory]` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: 来自 `specs/042-langgraph-thread-memory/spec.md` 的功能规格。

**Note**: 本计划遵循 Spec Kit planning workflow，用于记录 v0.4.2 的实现设计；本文件不直接实现生产代码。

## Summary

v0.4.2 为当前浏览器会话引入可恢复的单线程 chat memory baseline。发布目标是为 chat memory 提供 durable LangGraph checkpoint storage；开发和测试环境允许使用非 durable 的 memory checkpoint。设计上，chat memory 必须和 Tasklist Agent checkpoint/resume、Delivery Chain run-local artifacts 保持隔离；刷新后只恢复安全的 recent text messages，并通过 bounded recent messages、summary compaction 和 pinned decisions 控制模型上下文大小。

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16, Node.js runtime.

**Primary Dependencies**: `@langchain/core`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `zod`, `@ai-mind/stream-core`, `@ai-mind/database`.

**Storage**: PostgreSQL 用于 durable LangGraph checkpoint storage。Prisma 仍只管理业务表，不管理 checkpoint tables。

**Testing**: `apps/webapp/tests` 下的 Vitest suites，`packages/stream-core` 的 package tests，以及 `packages/database` 的 Prisma/database validation。

**Target Platform**: AI Mind webapp，本地开发和容器化生产部署。

**Project Type**: Web application，包含 frontend state、server API routes、AI runtime、stream protocol package 和 shared database package。

**Performance Goals**:

- 在本地和生产 healthy storage 场景下，hydration 能足够快地返回 current-thread recent messages，支撑页面初始化。
- Chat memory 每个 completed assistant turn 最多写入一次，不按 streaming chunk 写入。
- 长对话后，模型上下文以后端 ThreadState 为历史事实源，通过 recent messages + compacted summary + pinned decisions 保持有界；前端 payload 中的历史消息只作为兼容/UI 输入，不作为普通 chat memory 路径的模型历史来源。

**Constraints**:

- Public DTO 不得包含 raw checkpoint、raw prompt、raw provider response、stack trace、cookie value、API key、Tasklist GraphState 或 Delivery Chain RuntimeArtifact。
- Chat memory 不得改变 Tasklist Agent HITL/checkpoint/resume 语义。
- Chat memory 不得改变 Delivery Chain ControlledDeliveryManager、RuntimeArtifact run-local boundary 或 ToolRuntimeScope transcript suppression。
- `@ai-mind/stream-core` chunk union 保持向后兼容；本版本允许新增可选的 `thread-memory-status` chunk，但不得破坏既有消费者。
- Frontend message reducer public shape 继续兼容当前 `MindMessage[]`。
- Checkpoint setup 继续在 Prisma migrations 之外管理。

**Scale/Scope**:

- 只支持当前浏览器的单个 chat session。
- 不做 multi-session history list、pagination、search、edit/delete persistence、long-term memory、vector memory 或 memory inspector。
- Recent chat memory 在 compaction 前最多保留 8 条 text messages。
- Recent chat memory 在成功 compaction 后只保留最近 4 条 text messages，避免下一轮立即再次触发压缩。
- Conversation summary 约束在约 2500 中文字符。
- Pinned decisions 最多 20 条。
- Eligible ordinary chat memory paths use server-authoritative context assembly: `summary + pinnedDecisions + ThreadState recent messages + latest frontend user message`.
- Frontend `messages` may still contain local historical UI context during v0.4.2, but backend runtime must not duplicate or trust that history as model-visible chat history for eligible memory paths.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Controlled Agent First**: PASS. v0.4.2 不新增 Agent，不扩大 Tasklist Agent 权限，并明确不做 chat memory 的 HITL / checkpoint resume 产品 UI。

**GraphState Is Runtime Source of Truth**: PASS. Tasklist Agent GraphState 不改动。Chat memory 定义自己的 ThreadState，不写入 Tasklist GraphState。

**Review Node Must Be Side-effect Free**: PASS. 本版本不计划修改 Tasklist HITL review node。

**Business State and Checkpoint Must Stay Separate**: PASS with guardrail. Chat memory 使用 LangGraph checkpoint storage 作为 runtime memory state，不新增 Prisma 业务历史表。Checkpoint tables 继续由 setup 管理，不由 migration 管理。

**Stream Compatibility Is a Hard Constraint**: PASS. Hydration 使用 JSON DTO route，不新增或修改 stream chunks。

**Public DTO Must Be Strict and Safe**: PASS with guardrail. Hydration response 是 strict safe DTO，必须排除 runtime internals。

**Minimal Abstraction**: PASS with guardrail. 设计新增小范围 `chat-memory` runtime boundary，用于隔离 storage、DTO validation、context building 和 compaction side effects。Helper 只应出现在明确边界位置。

**Tests Before Broad Integration**: PASS. 计划顺序为 contract tests 优先，然后 runtime/state tests、route tests、frontend hydration tests、non-regression、typecheck/lint/build。

**Spec Drift Must Be Blocked**: PASS. 本计划记录 env、checkpoint setup、API contract、frontend behavior 和 security boundary 变化。任何实现偏离都必须同步更新 spec/plan/contracts。

**Official Spec Kit Skills Are Tooling Entry**: PASS. 本计划存放在 `specs/`，并遵循项目 Spec Kit workflow。

## Project Structure

### Documentation (this feature)

```text
specs/042-langgraph-thread-memory/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-memory-runtime.md
│   └── chat-thread-api.md
└── tasks.md              # 后续由 /speckit-tasks 创建
```

### Source Code (repository root)

```text
apps/webapp/
├── app/api/chat/
│   ├── route.ts
│   └── thread/route.ts
├── components/instamind/
│   ├── use-chat-stream.ts
│   └── chat-stream/
├── lib/ai/
│   ├── chat-schema.ts
│   ├── chat-service.ts
│   ├── langchain-message-adapter.ts
│   ├── rate-limit/
│   ├── runtime/
│   │   ├── chat-memory/
│   │   ├── chat-orchestrator.ts
│   │   ├── chat-session.ts
│   │   ├── stream-errors.ts
│   │   ├── version-plan-tasklist-agent/
│   │   └── delivery-chain/
│   └── types/
└── tests/
    ├── app/api/chat/
    ├── components/
    └── lib/ai/runtime/

packages/stream-core/
└── tests/protocol/

packages/database/
└── tests/

deploy/
├── compose.local.yml
├── env/
└── scripts/
```

**Structure Decision**: v0.4.2 在 `apps/webapp` 内实现，因为 chat memory 属于 webapp API/runtime/frontend 边界。除非 non-regression tests 需要更新，否则 `packages/stream-core` 保持不变。`packages/database` 的 Prisma schema 保持不变。部署文档/脚本可能需要初始化额外的 LangGraph checkpoint schema，但 Prisma migrations 仍然不进入本范围。

## Phase 0 Research Summary

详细决策见 [research.md](./research.md)。

关键结论：

- 使用 `AI_MIND_CHAT_MEMORY_CHECKPOINT=off|memory|postgres`；development 默认 `memory`，production 默认 `postgres`，显式 `off` 关闭 memory。
- 使用独立 checkpoint schema：`langgraph_chat_memory`。
- public chat thread id 使用 HMAC-derived browser session identity：`chat:${sessionHash}`。
- ThreadState 保持 text-only，v0.4.2 排除 structured command turns。
- Compaction 使用 LangChain model-level structured output，模型结果只包含 `summary` 与 `pinnedDecisions`；`recentMessages` 与 `compactedAt` 本地生成，失败时 no-op。
- Internal compaction model 固定使用 `deepseek/deepseek-v4-pro` model id，关闭 reasoning，使用 non-streaming 调用。
- Hydration 使用 `GET /api/chat/thread`。
- Eligible ordinary chat context is server-authoritative: backend reads ThreadState for recent history and uses only the latest frontend user message as the current turn input, avoiding duplicated frontend/backend history.

## Phase 1 Design Summary

详细模型和契约见：

- [data-model.md](./data-model.md)
- [contracts/chat-thread-api.md](./contracts/chat-thread-api.md)
- [contracts/chat-memory-runtime.md](./contracts/chat-memory-runtime.md)
- [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

**Controlled Agent First**: PASS. Chat memory 仍是 runtime support feature，不创建或扩展 Agent 行为。

**GraphState Is Runtime Source of Truth**: PASS. Tasklist GraphState 保持隔离；chat ThreadState 是独立 entity。

**Business State and Checkpoint Must Stay Separate**: PASS. 不计划新增 Prisma chat history table；checkpoint tables 由 setup 初始化。

**Stream Compatibility Is a Hard Constraint**: PASS. Hydration 仍是 non-stream JSON route；新增 `thread-memory-status` 只作为可选增量 chunk，不改变既有 message/reducer public shape。

**Public DTO Must Be Strict and Safe**: PASS. Contracts 定义 strict safe hydration response，并禁止 raw internals。

**Minimal Abstraction**: PASS. 新边界仅限 storage/checkpoint provider、state schema、context builder、compaction 和 hydration DTO。

**Tests Before Broad Integration**: PASS. 后续 tasks 应从 contracts 和 runtime tests 开始，再进入 frontend integration。

## Complexity Tracking

本计划不引入 constitution violations。
