# Implementation Plan: AI Mind v0.4.6 UserMemory Semantic Retrieval Baseline

**Branch**: `[046-usermemory-semantic-retrieval]` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/046-usermemory-semantic-retrieval/spec.md`

**Note**: 本文遵循 Spec Kit 的 planning workflow。英文 section 骨架保持兼容，正文以中文说明为主。

## Summary

v0.4.6 在 v0.4.5 `UserMemory Store` 基础上，为当前 browser session scope 内的长期 `UserMemory` 增加语义召回基线。本版确定只做 `PostgresStore` vector semantic search 作为正式召回路径，让“换一种说法”的用户请求也能召回相关长期记忆。现有 v0.4.5 规则召回能力不再收敛为本版 candidate source，只能作为 legacy implementation detail 暂存，不新增、不强化、不作为 fallback 或验收路径。

技术路线保持在现有 `apps/webapp` runtime 的 `user-memory` 边界内：继续使用 LangGraph `BaseStore` / `PostgresStore`，对干净、校验后的 `UserMemory.text/tags` 建立 semantic vector index，`UserMemory.type` 只作为过滤、排序和展示元信息；latest user input 只作为临时 query；召回结果必须经过 browser-session namespace、active/confidence/suppression、topK 和 context budget 过滤后，才能作为 supplemental context 注入 ordinary text chat 和 tool-assisted ordinary chat。

本计划不引入知识库 RAG、聊天历史向量索引、主 assistant 可调用的 memory search tool、Memory UI、Tasklist / Delivery 默认接入、stream-core 协议变更或 frontend reducer public shape 变更。本版也不承诺兼容旧 UserMemory 数据，不做旧数据 migration / semantic reindex。

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Next.js 16.1, Node.js runtime

**Primary Dependencies**: `@langchain/langgraph` 1.3.6 (`BaseStore`, `InMemoryStore`), `@langchain/langgraph-checkpoint-postgres` 1.0.3 (`PostgresStore` semantic search types), `@langchain/core`, `@langchain/openai` existing dependency for 火山引擎 Ark OpenAI-compatible embedding integration style, `zod`, `@ai-mind/stream-core`, Vitest

**Storage**: 继续使用 v0.4.5 独立 `langgraph_user_memory` LangGraph Store schema。生产或真实语义验证使用 `PostgresStore` semantic vector search 配置。`PostgresStore` 的本地类型显示 semantic index 底层需要 vector search support；这属于 LangGraph Store provider 的存储能力要求，不把 `PGVectorStore`、独立 pgvector store 或外部向量库作为 AI Mind v0.4.6 产品路线。真实 semantic retrieval 只承诺在 `PostgresStore` 下工作；`InMemoryStore` 只用于普通本地/单测，单测通过 deterministic semantic behavior 验证语义逻辑。

**Testing**: 以 `apps/webapp/tests/lib/ai/runtime/user-memory-*` focused tests 为主，补充 semantic retrieval filtering/budget tests、semantic index content allowlist tests、embedding provider failure tests、no-query-rewrite tests、orchestrator eligibility tests、tool-assisted ordinary chat tests、Tasklist / Delivery non-regression tests，以及 release-closing no-rule-runtime-path verification。最后执行 `pnpm --dir apps/webapp test`、`pnpm typecheck` 和 `pnpm lint:webapp`。

**Target Platform**: AI Mind webapp，本地开发、Vitest、容器化生产部署

**Project Type**: Next.js web application with backend runtime routes, LangGraph runtime memory, stream protocol package, and local React frontend

**Performance Goals**:

- 每次 eligible ordinary chat request 最多注入 3 条 UserMemory。
- 每条 UserMemory 最多 300 中文字符，总注入最多 900 中文字符。
- candidate confidence 仍需 `>= 0.7` 才能参与最终注入。
- semantic score 默认以 `>= 0.70` 作为最终注入阈值；score 缺失或异常时保守降权或不注入。
- semantic search 初始只取 `topK = 8` 候选，再执行 semantic candidate 去重、排序和预算过滤。
- semantic retrieval 和 embedding query 必须有短 timeout；第一版 runtime budget 为 1500ms，超时直接降级为 0 条 UserMemory 注入。
- retrieval query 只做确定性轻量规范化：`trim`、空白折叠、最多 800 字符；超过上限时保留前 400 字符和后 400 字符。
- semantic retrieval 不能阻塞 streaming 的错误收口，失败不暴露 raw provider/store/database error。

**Constraints**:

- `UserMemory` 不进入 `ThreadState.messages`、summary、pinnedDecisions、hydration payload、Conversation Registry、stream-core chunk、frontend reducer public state、ChatMessage business history、GraphState 或 RuntimeArtifact。
- semantic vector index content 只能来自 `UserMemory.text` 和 `UserMemory.tags` 的显式 allowlist。`UserMemory.type` 不单独向量化，只能作为 filtering / ranking / display metadata。
- 不索引完整 UserMemory document JSON，不索引 raw user message、raw assistant final text、ThreadState、raw tool result、MCP raw resource content、GraphState、RuntimeArtifact、workflow progress、provider response、raw prompt、API key、cookie、provider config、debug metadata、sourceConversationId 或 suppression reason。
- latest user input 只能临时作为 semantic query，不进入长期索引、hydration、stream payload 或持久化 debug log。
- v0.4.6 MUST NOT 引入 LLM query rewrite、query transformation、HyDE、query expansion 或其他生成式 retrieval preprocessing。retrieval query 直接使用 latest user input，只允许做确定性的轻量规范化。
- v0.4.6 不新增 UserMemory 写入来源，不扩大 extraction pipeline，不做每轮 assistant turn 自动长期记忆抽取。
- semantic retrieval 必须在执行 embedding query 或 Store semantic search 之前先判断 runtime path eligibility。Tasklist、Delivery、HITL checkpoint/resume、workflow progress、MCP raw resource path、hydration、sidebar list 和 conversation switching 不得触发 semantic query。
- 如果 runtime 无法明确判断某次 tool-assisted 请求仍处于 ordinary chat boundary，则必须按不 eligible 处理，不触发 semantic retrieval。
- 主 assistant 不获得 semantic-memory-search tool。UserMemory retrieval 仍由 runtime 控制。
- 不引入 feature flag；v0.4.6 落地后在本版范围内默认启用。
- 不兼容旧数据；旧 UserMemory 没有 semantic index 时不做 migration、不补建、不承诺 rule-based / lexical fallback 召回。
- semantic retrieval 的 Store path MUST use vector search only。v0.4.6 不使用 `PostgresStore` hybrid/text search 作为 semantic path；当前本地 `PostgresStore` hybrid keyword 部分会对完整 `store.value` JSON 做 text search，可能绕过 semantic index allowlist。
- semantic retrieval 的正式过滤顺序固定为：eligibility 判断 → query 轻量规范化与长度裁剪 → browser-session namespace → vector semantic search → active/inactive/suppression 过滤 → semantic score 阈值过滤 → `stableKey` 去重 → conflict handling → context budget selection。
- retrieval pipeline MUST NOT pre-implement lexical / metadata candidate source in v0.4.6。后续如果要做 keyword / hybrid search，应在下一版作为字段白名单 keyword signal 单独设计，不能复用 v0.4.5 手写规则召回，也不能搜索完整 UserMemory document JSON 或 raw `store.value::text`。
- v0.4.6 release closing 前，legacy rule-based / lexical runtime wiring 必须从正式代码链路、正式验收测试依赖和正式 config path 中清除。
- embedding provider 必须是 UserMemory semantic retrieval 的独立配置，不跟随当前聊天模型选择器；默认走火山引擎 Ark OpenAI-compatible 路线，固定 `embedding model id = doubao-embedding-vision`，并复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源。若底层 Store 配置需要 dimensions，应由该固定模型的官方规格决定，但不把 dimensions 写成产品级 spec 固定值。
- embedding vectors 不进入 frontend、hydration、stream payload、public reducer state 或持久化 debug log。
- Tasklist / Delivery 的 GraphState、checkpoint/resume、run-local RuntimeArtifact 和 workflow progress 语义不变。

**Scale/Scope**:

- 作用域为当前 browser session，不是 account-level memory、cross-device memory 或 global user profile。
- 单次请求只处理当前 latest user input 对 UserMemory Store 的语义召回，不做聊天历史语义搜索。
- 单次请求不做 LLM query rewrite；query 直接来自 latest user input。
- semantic index 的数据规模按 MVP UserMemory 数量设计，不做大规模 batch re-embedding 管理后台。
- automated tests 使用 deterministic semantic behavior，不依赖外部 API、网络、费用或非确定语义结果。
- integration / acceptance 在具备 `DATABASE_URL`、Store setup、embedding provider key 和网络条件时可验证真实 semantic recall。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Controlled Agent First**: PASS。v0.4.6 不新增 Agent，不给主 assistant semantic-memory-search tool，不改变 Tasklist / Delivery authority。UserMemory retrieval 仍由 runtime 在 eligible ordinary chat path 内控制。

**GraphState Is Runtime Source of Truth**: PASS。Tasklist GraphState 不读取、不保存、不暴露 UserMemory、embedding vector 或 semantic retrieval internals。

**Review Node Must Be Side-effect Free**: PASS。本版不修改 HITL review node，不在 review node 内做 Store search、embedding query 或 semantic retrieval。

**Business State and Checkpoint Must Stay Separate**: PASS。UserMemory Store 继续独立于 Prisma business tables、Tasklist checkpoint、chat ThreadState checkpoint 和 Conversation Registry。

**Stream Compatibility Is a Hard Constraint**: PASS。不新增或修改 stream-core chunk union，不把 selected memories、scores、vectors 或 semantic debug 信息通过 stream 暴露。

**Public DTO Must Be Strict and Safe**: PASS。UserMemory、embedding vectors、semantic scores 和 raw provider/store errors 不进入 hydration、registry、stream 或 reducer public state。

**Minimal Abstraction**: PASS with guardrail。新增能力应落在现有 `user-memory` runtime 边界内，只增加有明确职责的 semantic retrieval、embedding provider 和 ranking/merge 逻辑，不抽成通用 RAG platform。

**Tests Before Broad Integration**: PASS。计划先覆盖 semantic retrieval / index allowlist / failure degradation focused tests，再接 orchestrator ordinary/tool-assisted chat，最后做 Tasklist / Delivery / stream non-regression。

**Spec Drift Must Be Blocked**: PASS。若实现改变 retrieval order、Store config、embedding provider、timeout、context injection、public payload 或 Tasklist/Delivery 边界，必须同步 spec / plan / contracts / quickstart。

**Official Spec Kit Skills Are Tooling Entry**: PASS。产物位于 `specs/046-usermemory-semantic-retrieval/`，不修改 official skill baseline。

**Spec Kit Language Policy**: PASS。文件名和 section heading 保持英文，正文中文，技术标识符保持英文。

## Project Structure

### Documentation (this feature)

```text
specs/046-usermemory-semantic-retrieval/
|- spec.md
|- plan.md
|- research.md
|- data-model.md
|- quickstart.md
`- contracts/
   |- semantic-retrieval.md
   |- semantic-index.md
   `- runtime-integration.md
```

### Source Code (repository root)

```text
apps/webapp/
|- lib/ai/runtime/
|  |- chat-orchestrator.ts
|  `- user-memory/
|     |- context-builder.ts
|     |- provider.ts
|     |- retrieval.ts
|     |- runtime-config.ts
|     |- state-schema.ts
|     |- user-memory-service.ts
|     `- validation.ts
`- tests/
   `- lib/ai/runtime/
      |- user-memory-retrieval.test.ts
      |- user-memory-service.test.ts
      |- user-memory-provider.test.ts
      |- user-memory-context-builder.test.ts
      `- chat-orchestrator-user-memory.test.ts

packages/stream-core/
`- tests/
```

**Structure Decision**: v0.4.6 仍主要落在 `apps/webapp/lib/ai/runtime/user-memory/` 和 `chat-orchestrator.ts` 的 memory context assembly 边界内。`packages/stream-core` 只做 non-regression，不新增 protocol。`packages/database` 不新增 Prisma schema；LangGraph Store / PostgresStore 继续管理自己的 store tables。

## Phase 0 Research Summary

详细决策记录见 [research.md](./research.md)。

本阶段确认的关键结论：

- 当前本地 `@langchain/langgraph-checkpoint-postgres` 的 `PostgresStore` 类型支持 `index` 配置、`search({ query, mode: "vector" | "hybrid" })`、`similarityThreshold` 和 result `score`。v0.4.6 只采用 vector search 作为 semantic retrieval Store path，不采用 hybrid/text search。当前实现调研显示 hybrid keyword 部分会对完整 `store.value` JSON 做 text search，不符合本版本字段白名单边界。
- `PostgresStore` semantic search 底层依赖 vector search support；计划中将它作为 LangGraph Store provider 的底层要求处理，不把 AI Mind 产品路线改成独立 `PGVectorStore` / `pgvector` / 外部向量数据库。
- 第一版真实 embedding provider 采用火山引擎 Ark OpenAI-compatible provider style，并固定使用 `doubao-embedding-vision`。它复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源，但仍然是 UserMemory 独立 runtime config，不跟随当前聊天模型选择器。
- automated tests 使用 deterministic embedding / semantic store behavior，避免外部 API、网络、费用和语义漂移。
- semantic vector index content 采用显式 allowlist：`UserMemory.text` 和 `UserMemory.tags`。`UserMemory.type` 只参与 filtering / ranking / display，不单独向量化。不索引完整 document，也不索引 raw user message。
- retrieval policy 为 semantic vector only。候选只来自 `PostgresStore` vector search；本版不做 semantic + lexical merge、rank fusion、RRF、BM25、keyword index 或 rule fallback。
- semantic retrieval eligibility 必须前置到 embedding query / Store semantic search 之前，避免被排除路径产生无意义 provider 调用。
- baseline retrieval 默认值固定为：semantic score 阈值 `0.70`、candidate topK `8`、query 长度上限 `800` 字符且使用前 `400` + 后 `400` 的确定性裁剪。
- semantic index metadata 第一版写入 UserMemory 内部 document metadata，不采用 runtime-only 临时状态。

## Phase 1 Design Summary

详细模型与 contracts 见以下文档：

- [data-model.md](./data-model.md)
- [contracts/semantic-retrieval.md](./contracts/semantic-retrieval.md)
- [contracts/semantic-index.md](./contracts/semantic-index.md)
- [contracts/runtime-integration.md](./contracts/runtime-integration.md)
- [quickstart.md](./quickstart.md)

设计要点：

- `UserMemoryDocument` 保持 v0.4.5 主体结构，新增 semantic eligibility / index metadata 作为内部 document metadata 持久化存在，不进入 public DTO。
- `putCandidate` 写入 active validated memory 时，需要同时保证 Store item vector index 只使用 `text` 和 `tags`；suppressed / inactive memory 即使曾经 indexed，也不得参与最终注入。
- `retrieveRelevantMemories` 从 v0.4.5 规则召回演进为 semantic vector candidates pipeline。semantic search failure、embedding provider failure、Store timeout 均不能向主 chat path throw；失败时返回 0 条 UserMemory 注入。
- `ChatOrchestrator` 必须在 UserMemory retrieval 前确认当前请求属于 ordinary text chat 或 ordinary chat boundary 内的 tool-assisted ordinary chat；被排除路径不得触发 semantic query。
- context builder 继续只接收最终 selected UserMemory，并保持 v0.4.5 的 bounded supplemental system context。

## Post-Design Constitution Re-check

**Controlled Agent First**: PASS。semantic retrieval 是 runtime-controlled context assembly 能力，不是 Agent tool，也不扩大 Tasklist / Delivery authority。

**GraphState Is Runtime Source of Truth**: PASS。GraphState、RuntimeArtifact、workflow progress 和 HITL payload 仍与 UserMemory semantic retrieval 分离。

**Review Node Must Be Side-effect Free**: PASS。review node 不变。

**Business State and Checkpoint Must Stay Separate**: PASS。UserMemory Store 仍独立于 Prisma business state 和 checkpoint state。

**Stream Compatibility Is a Hard Constraint**: PASS。contracts 明确不改 stream-core chunk union。

**Public DTO Must Be Strict and Safe**: PASS。embedding vectors、semantic score、raw provider/store errors 不进入 public DTO。

**Minimal Abstraction**: PASS。计划围绕现有 user-memory runtime 模块演进，不新增通用 vector/RAG 平台。

**Tests Before Broad Integration**: PASS。quickstart 和后续 tasks 应先覆盖低层 semantic retrieval 与 failure behavior，再接 orchestrator。

**Spec Drift Must Be Blocked**: PASS。plan、research、data-model、contracts 与 clarified spec 对齐。

**Official Spec Kit Skills Are Tooling Entry**: PASS。未修改 official skills。

**Spec Kit Language Policy**: PASS。文档结构符合英文骨架 + 中文正文策略。

## Implementation Notes

- `PostgresStore.fromConnString()` 的 semantic `index` 配置应只抽取 `text` 和 `tags`，不能默认 `["$"]` 索引完整 document，也不能把 `type` 单独向量化。
- semantic Store query 必须显式使用 vector search mode；不要使用 hybrid/text search 作为 v0.4.6 semantic path。
- keyword / hybrid retrieval 如果后续进入版本，必须作为单独字段白名单 signal 设计，不能直接复用当前 `PostgresStore` full JSON text search，也不能继续扩展 v0.4.5 手写 rule-based retrieval。
- semantic retrieval query 只能使用 latest user input 的短暂内存值；进入 Store 前只允许做 trim、空白折叠和 800 字符上限的前 400 / 后 400 裁剪。日志只能记录安全事件、provider kind、失败类别、耗时和候选数量，不记录 raw query、raw UserMemory text、embedding vector 或 provider response。
- `SearchItem.score` 只能作为排序信号之一。若 score 缺失或异常，应保守处理，不应盲目注入。
- `SearchItem.score` 若缺失、`NaN`、异常或不稳定，应直接按不可安全注入处理，宁可返回 0 条。
- 第一版默认接受阈值为 `semantic score >= 0.70`，初始 candidate topK 为 `8`。
- semantic vector candidates 去重时以 `stableKey` 为主；本版本不实现 semantic + lexical candidate merge。
- suppressed / inactive status、confidence threshold、context budget 和 latest user input conflict rule 必须在最终注入前统一执行。
- 当前 `chat-orchestrator.ts` 已经有 `isUserMemoryContextEligibleRequest()`，但 v0.4.6 必须确保该判断足够区分 ordinary chat、tool-assisted ordinary chat 与 Tasklist / Delivery，且发生在任何 semantic provider 调用之前。
- 如果 `isUserMemoryContextEligibleRequest()` 无法明确证明请求仍在 ordinary chat boundary 内，应默认返回 not eligible，而不是尝试召回后再丢弃。
- 本版不做旧数据迁移；没有 semantic index 的旧 memory 不属于验收主路径。

## Complexity Tracking

当前没有需要单独记录的 constitution violation。
