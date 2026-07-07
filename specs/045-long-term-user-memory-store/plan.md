# Implementation Plan: AI Mind v0.4.5 Long-term User Memory Store Baseline

**Branch**: `[045-long-term-user-memory-store]` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/045-long-term-user-memory-store/spec.md`

**Note**: 本文遵循 Spec Kit 的 planning workflow。骨架保留英文 section，正文说明使用中文。

## Summary

v0.4.5 在 v0.4.4 多会话短期 `ThreadState` 基础上，引入 browser-session scoped `UserMemory Store`。长期记忆使用 LangGraph Store abstraction；生产持久化 provider 必须是 `PostgresStore`，本地开发和测试可以使用 `InMemoryStore` fallback。`UserMemory` 与 conversation-scoped `ThreadState`、Conversation Registry、hydration payload、stream-core chunk union 和 frontend reducer public shape 全部分离。

本版只接入 ordinary text chat 和 tool-assisted ordinary chat 的 context assembly：先读取 selected conversation 的短期 ThreadState，再按 latest user input 从当前 browser session 的 UserMemory Store 中召回最多 3 条相关长期记忆，作为独立 supplemental system context 注入。Tasklist / Delivery 不读取 UserMemory，只保留既有 checkpoint/resume、run-local 和 final-turn memory non-regression。

写入侧采用 service-first 的后台异步 UserMemory extraction pipeline：每个 eligible completed ordinary text chat 或 tool-assisted ordinary chat turn 完成后必须 enqueue 一个 in-process best-effort extraction job。主 assistant 不获得直接 memory-write tool；explicit memory intent 是 extraction 的强信号但不是唯一触发；没有长期记忆价值时 job 输出 0 条 candidate。模型用结构化 schema 输出带 `stability` 和 structured `identity` 的 `0..N` candidates；程序基于 `identity.subject / facet / polarity` 做 deterministic stable key normalization。deterministic validation、stable key / dedupe、安全过滤和 conflict/update suppression 才能决定是否写入。`stability=temporary/speculative` 的 candidate 由程序直接拒绝，不靠关键词 deny-list 猜测。compaction 后新增/变化 pinnedDecision promotion 继续作为 SHOULD 写入来源，并复用同一 validation/write path。自然语言 forget 或明确否定旧偏好时，本版不做物理删除，而是持久标记旧 UserMemory 为 inactive/suppressed，使其不再参与 retrieval。Store read/write failure 必须静默降级为 no-long-term-memory mode，不影响普通聊天、streaming、final-turn memory 或 selected conversation ThreadState。

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Next.js 16.1, Node.js runtime

**Primary Dependencies**: `@langchain/langgraph` 1.3.6 (`BaseStore`, `InMemoryStore`), `@langchain/langgraph-checkpoint-postgres` 1.0.3 (`PostgresStore` from `@langchain/langgraph-checkpoint-postgres/store`), `@langchain/core`, `zod`, `@ai-mind/stream-core`, Vitest

**Storage**: 新增独立 LangGraph Store schema，例如 `langgraph_user_memory`。它不同于 v0.4.4 的 `langgraph_chat_memory` checkpoint schema，也不同于 Tasklist Agent checkpoint schema、Prisma business tables 和 Conversation Registry。开发/测试可使用 process-level `InMemoryStore`。生产或持久化验证使用 `PostgresStore` 并提供独立 setup script。

**Testing**: 以 `apps/webapp/tests/lib/ai/runtime/user-memory-*` focused tests 为主，补充 structured extraction schema tests、background extraction job tests、`chat-orchestrator` ordinary/tool-assisted context injection tests、chat-memory compaction promotion tests、route/draft promotion tests、Store failure degradation tests，以及既有 v0.4.3/v0.4.4 memory non-regression tests。最后执行 `pnpm typecheck` 与 `pnpm lint:webapp`。

**Target Platform**: AI Mind webapp，本地开发、Vitest、容器化生产部署

**Project Type**: Next.js web application with backend runtime routes, LangGraph runtime memory, stream protocol package, and local React frontend

**Performance Goals**:

- UserMemory retrieval 每次 eligible chat request 最多选择 3 条。
- 每条注入文本最多 300 中文字符，总注入最多 900 中文字符。
- candidate confidence 必须 `>= 0.7` 才可写入或参与 retrieval。
- retrieval 不做 embedding / pgvector，不触发全量 transcript scan。
- extraction / Store read/write failure 不阻塞主回答；失败时直接降级为 0 条 UserMemory 注入或跳过写入。

**Constraints**:

- `UserMemory` 不进入 `ThreadState.messages`、summary、pinnedDecisions、hydration payload、Conversation Registry、stream-core chunk、frontend reducer public state 或 ChatMessage business history。
- 不修改 `@ai-mind/stream-core` chunk union。
- 不新增 `contextEntries`、`reasoning_summary`、`execution_summary` 或 `agent_run_summary`。
- 不新增独立“已记住”UI、stream chunk 或 reducer state；assistant 可以在普通回答文本中自然确认。
- 不把 memory-write capability 暴露为主 assistant tool；v0.4.5 只提供内部 service / background pipeline。
- UserMemory extraction job 是 in-process best-effort 后处理；v0.4.5 不引入 durable job queue、worker system 或 retry scheduler。
- latest user message 优先于 UserMemory；UserMemory 只作为 supplemental context。
- Tasklist / Delivery 不接入 retrieval，也不 enqueue UserMemory extraction job；不得改变 Tasklist Agent authority、GraphState、interrupt/review node、checkpoint/resume 或 Delivery run-local semantics。
- Store namespace/key 和 source metadata 不得暴露 raw browser session id、raw checkpoint id、API key、cookie、provider config、raw provider response 或 runtime internals。
- PostgresStore setup 独立于 checkpoint setup；Prisma schema 不管理 LangGraph Store tables。

**Scale/Scope**:

- 作用域为当前 browser session，不是 account-level 或 cross-device memory。
- MVP 规则召回使用 type / structured tags / normalized text overlap / confidence / active status 等信号，不维护代码内的 food / clothing / activity 二级领域词表。
- Store 中可以存在多个 UserMemory documents，但单次注入最多 3 条。
- 本版不做 Memory Inspector、memory edit/delete UI、history search、message pagination、embedding retrieval 或 pgvector。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Controlled Agent First**: PASS。v0.4.5 不新增 Agent，不把 UserMemory 写入做成主 assistant tool，不扩大 Tasklist / Delivery authority，且明确 Tasklist / Delivery 不接入 UserMemory retrieval 或 extraction。

**GraphState Is Runtime Source of Truth**: PASS。Tasklist GraphState 不读取、不保存、不暴露 UserMemory；UserMemory Store 不保存 GraphState、checkpoint、interrupt payload 或 workflow progress。

**Review Node Must Be Side-effect Free**: PASS。本版不修改 HITL review node，也不在 review node 中引入 Store read/write。

**Business State and Checkpoint Must Stay Separate**: PASS。UserMemory Store 使用 LangGraph Store / PostgresStore 独立 schema，不进入 Prisma business tables，也不复用 chat ThreadState checkpoint。

**Stream Compatibility Is a Hard Constraint**: PASS。方案不新增或修改 stream-core chunk union，不新增 remembered-status stream chunk。

**Public DTO Must Be Strict and Safe**: PASS with guardrail。UserMemory 不进入 hydration/registry payload；如果未来需要 debug summary，必须使用 allowlist public DTO，本版不新增。

**Minimal Abstraction**: PASS with guardrail。新增 `user-memory` runtime 边界只承载 Store provider、schema/validation、structured candidate extraction、background extraction pipeline、retrieval 和 context builder，不抽成通用 memory platform。

**Tests Before Broad Integration**: PASS。计划先写 Store/schema/validation/retrieval focused tests，再接 ChatOrchestrator 和 compaction promotion，最后做 route/non-regression。

**Spec Drift Must Be Blocked**: PASS。若实现改动 Store provider、env、setup script、context order、安全过滤、retrieval path 或 public behavior，必须同步 spec / plan / contracts / quickstart。

**Official Spec Kit Skills Are Tooling Entry**: PASS。本文和产物位于 `specs/045-long-term-user-memory-store/`，不修改 official skill baseline。

**Spec Kit Language Policy**: PASS。文件名和 section heading 保持英文；正文中文；技术名词、类型名、路径和命令保持英文。

## Project Structure

### Documentation (this feature)

```text
specs/045-long-term-user-memory-store/
|- spec.md
|- plan.md
|- research.md
|- data-model.md
|- quickstart.md
|- acceptance.md
|- decisions.md
|- contracts/
|  |- user-memory-store.md
|  |- chat-context-integration.md
|  `- setup-and-runtime-config.md
`- tasks.md
```

### Source Code (repository root)

```text
apps/webapp/
|- app/api/chat/
|  |- route.ts
|  |- thread/route.ts
|  `- conversations/route.ts
|- lib/ai/runtime/
|  |- chat-orchestrator.ts
|  |- chat-memory/
|  |  |- chat-memory-service.ts
|  |  |- compaction.ts
|  |  |- context-builder.ts
|  |  |- conversation-registry.ts
|  |  |- eligibility.ts
|  |  |- runtime-config.ts
|  |  `- state-schema.ts
|  `- user-memory/
|     |- candidate-extractor.ts
|     |- context-builder.ts
|     |- extraction-pipeline.ts
|     |- index.ts
|     |- provider.ts
|     |- retrieval.ts
|     |- runtime-config.ts
|     |- state-schema.ts
|     |- user-memory-service.ts
|     `- validation.ts
|- scripts/
|  |- setup-chat-memory-checkpointer.mjs
|  `- setup-user-memory-store.mjs
`- tests/
   |- app/api/chat/
   `- lib/ai/runtime/
      |- user-memory-service.test.ts
      |- user-memory-validation.test.ts
      |- user-memory-extraction-pipeline.test.ts
      |- user-memory-retrieval.test.ts
      |- user-memory-context-builder.test.ts
      |- user-memory-provider.test.ts
      |- chat-orchestrator-user-memory.test.ts
      `- chat-memory-pinned-decision-promotion.test.ts

packages/stream-core/
`- tests/
```

**Structure Decision**: v0.4.5 仍主要落在 `apps/webapp` runtime 层，因为它扩展的是 webapp chat runtime 的 memory assembly 和 final-turn 后处理。`packages/stream-core` 只做 non-regression 验证，不应新增 protocol。`packages/database` 不新增 Prisma schema，因为 LangGraph Store / PostgresStore 自己管理 store tables。

## Phase 0 Research Summary

详细决策记录见 [research.md](./research.md)。

本阶段确认的关键结论：

- 使用 LangGraph `BaseStore` abstraction；生产持久化使用 `PostgresStore`，本地/测试使用 `InMemoryStore`。
- `PostgresStore` 从 `@langchain/langgraph-checkpoint-postgres/store` 导入，独立 schema 建议为 `langgraph_user_memory`。
- 新增 `AI_MIND_USER_MEMORY_STORE=memory|postgres` runtime config；开发/测试默认 memory，生产默认 postgres。
- 新增 `db:user-memory:setup`，独立调用 `PostgresStore.setup()`；将其纳入 runtime setup 组合，但不复用 checkpoint setup。
- UserMemory document 使用 deterministic schema 和 stable key；inactive/suppressed memory 保留但不参与 retrieval。
- retrieval 使用 Store search/filter + 本地规则 rerank，不使用 embedding / pgvector。
- UserMemory extraction pipeline 在每个 eligible completed ordinary turn 后台异步执行；它是 in-process best-effort job，不做 durable queue/worker/retry；explicit intent 是强信号但不是唯一入口；写入失败只记录安全日志，不影响回答。
- pinnedDecision promotion 挂在 compaction 成功后的 diff 上，只评估新增/变化的 pinnedDecisions，不扫描完整 transcript。

## Phase 1 Design Summary

详细模型与 contracts 见以下文档：

- [data-model.md](./data-model.md)
- [contracts/user-memory-store.md](./contracts/user-memory-store.md)
- [contracts/chat-context-integration.md](./contracts/chat-context-integration.md)
- [contracts/setup-and-runtime-config.md](./contracts/setup-and-runtime-config.md)
- [quickstart.md](./quickstart.md)

设计要点：

- `user-memory` 模块对外只暴露 service、context builder、structured extraction pipeline 和 candidate/promotion 边界；candidate schema 显式包含 `stability=stable|temporary|speculative` 和 structured `identity`，由模型输出、程序消费；eligible path 判断在 `ChatOrchestrator` 与 extraction pipeline 接入点内完成，不单独抽成通用 eligibility 模块。
- `ChatOrchestrator` 在 `createChatSession` 后、主链路开始前读取 selected UserMemory context，并与现有 short-term memory context 分开组装。
- direct-answer、tool planning、tool final-answer 路径都使用同一 selected UserMemory context；Tasklist / Delivery 分支进入前不读取 UserMemory。
- final-turn 完成后先保持现有 `appendCompletedChatMemoryTurn` 语义，再为每个 eligible completed ordinary turn 异步 enqueue 一个 in-process best-effort UserMemory extraction job；失败不影响 finish。
- compaction 成功时通过旧/新 pinnedDecisions diff 生成 promotion candidates，并经过同一 validation/store write。

## Post-Design Constitution Re-check

**Controlled Agent First**: PASS。Tasklist / Delivery 明确不读取 UserMemory、不 enqueue extraction job；Tool-assisted ordinary chat 只在 ordinary chat context boundary 内使用 supplemental memory。主 assistant 不获得 memory-write tool。

**GraphState Is Runtime Source of Truth**: PASS。UserMemory 不进入 GraphState、checkpoint、interrupt payload 或 AgentRun。

**Review Node Must Be Side-effect Free**: PASS。没有 review node side effect。

**Business State and Checkpoint Must Stay Separate**: PASS。UserMemory Store 使用 LangGraph Store schema；Prisma schema 不管理 store tables；PostgresStore 不承担 business run 查询。

**Stream Compatibility Is a Hard Constraint**: PASS。没有新增 stream chunk；“已记住”不通过 stream/reducer 独立表达。

**Public DTO Must Be Strict and Safe**: PASS。contracts 明确 UserMemory 不进入 public hydration/registry/reducer payload。

**Minimal Abstraction**: PASS。新增模块是有边界价值的 runtime service 和后台 pipeline，不是通用画像平台，也不是主 assistant tool 平台。

**Tests Before Broad Integration**: PASS。quickstart 和后续 tasks 应先覆盖 Store/schema/validation/retrieval，再接 orchestrator。

**Spec Drift Must Be Blocked**: PASS。plan、data-model、contracts 与 clarified spec 对齐。

**Official Spec Kit Skills Are Tooling Entry**: PASS。未修改 official skills。

**Spec Kit Language Policy**: PASS。文档结构符合英文骨架 + 中文正文策略。

## Implementation Notes

- `apps/webapp/scripts/setup-user-memory-store.mjs` 最终保持为 thin entry，核心 setup / sanitize 逻辑下沉到 `apps/webapp/scripts/setup-user-memory-store-lib.mjs`，便于单测覆盖 `PostgresStore.fromConnString()`、`store.setup()`、`store.stop()` 和错误脱敏。
- `UserMemoryService.putCandidate()` 在 stable key 命中且 `status/type/text/tags` 完全相同时直接返回 `rejected/duplicate`，避免重复写同一条长期记忆。
- 模型结构化抽取必须显式输出 `stability`；validation 只消费该结构字段来拒绝 `temporary/speculative` candidate。
- stable key 通过 structured `identity` 生成：`user_preference` 依赖 `identity.subject + polarity`，其余类型依赖 `identity.subject + optional facet`；程序只做 normalization，不引入句子语义解析 helper。
- retrieval 最终采用 structured-overlap rule scoring：最小分数阈值为 `1.5`；优先依赖模型生成的结构化 tags、structured identity 与规范化 text overlap 做相关性判断，不使用代码维护的 food / clothing / activity 这类二级领域关键词分类。`stable_user_context`、`project_context`、`risk_preference` 仍要求明确的受控词面或 identity overlap；其中 `stable_user_context` 允许对职业/工作背景问题使用有限短语匹配与 identity 命中，例如 `工作 / 工作经验 / 前端工程师 / Windows / PowerShell`。其余类型也应主要依赖结构化 tags 提供可直接重叠的检索锚点，例如 `桃子 / 水果 / 吃`、`卫衣 / 衣服 / 穿`、`解释 / 大白话`、`Windows / PowerShell`。
- `buildUserMemoryContextMessages()` 先收集实际可注入的 memory lines；当 selected memory 为空，或所有候选在 clip/bound 后都不可用时，返回空数组，不构造 header-only SystemMessage。

## Complexity Tracking

当前没有需要单独记录的 constitution violation。
