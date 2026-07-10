# Acceptance 046: UserMemory Semantic Retrieval Baseline

**Status**: Accepted  
**Version**: v0.4.6  
**Date**: 2026-07-09

## Release Gate

- [x] Browser-session scoped `UserMemory` vector semantic retrieval is implemented on top of LangGraph Store / `PostgresStore`
- [x] v0.4.6 only uses `PostgresStore` vector semantic search as the formal retrieval candidate source
- [x] `PostgresStore` hybrid/text search is not used as the v0.4.6 semantic path
- [x] local development / integration / preview / staging / production runtime default to `PostgresStore`
- [x] Formal runtime path no longer depends on rule-based / lexical retrieval, rule fallback, or semantic + lexical merge
- [x] Semantic retrieval works for ordinary text chat
- [x] Semantic retrieval works for eligible tool-assisted ordinary chat without changing tool authority boundaries
- [x] Tasklist / Delivery / HITL / hydration / sidebar loading / conversation switching remain excluded from UserMemory semantic retrieval
- [x] Semantic index content is limited to validated `UserMemory.text` and `UserMemory.tags`; `UserMemory.type` remains metadata only
- [x] Semantic retrieval is enabled by default in v0.4.6 and does not require a feature flag to enter formal acceptance scope
- [x] latest user input is used directly as the retrieval query with deterministic normalization only, without LLM query rewrite
- [x] Semantic retrieval failure, embedding failure, score anomaly, or Store timeout degrades safely to 0 UserMemory injection without breaking ordinary chat
- [x] UserMemory semantic internals, embedding vectors, and raw provider/store errors do not enter `ThreadState`, hydration payload, Conversation Registry, stream-core chunks, or frontend reducer public state
- [x] v0.4.5 write boundary semantics and v0.4.3 / v0.4.4 / v0.4.5 non-regression constraints remain compatible

## Functional Acceptance

### Semantic Recall Acceptance

- [x] 在同一 browser session 的 conversation A 保存“以后解释技术问题时，先用大白话，再补充专业说明”，conversation B 提问“LangGraph Store 是什么？别讲太抽象”时，可语义召回该长期偏好
- [x] 保存“记住我不吃香菜”后，用户问“今天适合吃什么清淡点？”时，可语义召回该饮食偏好
- [x] 不相关问题不会注入不相关长期记忆，例如技术问题不会带出饮食偏好
- [x] suppressed 或 inactive 的旧 UserMemory 即使命中 semantic search，也不会进入最终注入
- [x] 当前用户输入与长期记忆冲突时，当前用户输入优先
- [x] 多条长期记忆冲突时，active 优先；仍冲突时 updatedAt 更新更晚者优先；无法安全判断时注入 0 条

### Query And Index Acceptance

- [x] Retrieval query 直接来自 latest user input，不做 LLM query rewrite、query transformation、HyDE 或 query expansion
- [x] Retrieval query 只做确定性处理：`trim`、空白折叠、最多 800 字符；超过上限时保留前 400 字符和后 400 字符
- [x] Semantic vector index content 只来自干净、校验后的 `UserMemory.text` 和 `UserMemory.tags`
- [x] `UserMemory.type` 只用于 filtering、ranking 或 display metadata，不作为 standalone vector field
- [x] `Semantic Index Metadata` 写入 `UserMemory` internal document metadata，而不是 runtime-only 临时状态
- [x] 不索引完整 UserMemory document JSON，不索引 raw user message、raw assistant final text、完整 transcript、`ThreadState`、raw tool result、MCP raw resource content、GraphState、RuntimeArtifact、workflow progress 或 provider/runtime internals
- [x] latest user input 只临时作为 retrieval query 使用，不被持久化为长期索引内容、长期记忆内容、hydration payload、stream payload 或持久化 debug 数据
- [x] 本版本不要求兼容旧 UserMemory 数据；旧数据没有 semantic index 时，不提供 migration、补建或 rule-based / lexical fallback 承诺

### Provider, Store And Failure Acceptance

- [x] UserMemory semantic retrieval 使用独立 embedding provider runtime config，不跟随当前聊天模型选择器自动切换
- [x] 第一版真实 embedding provider 路线固定为火山引擎 Ark OpenAI-compatible path，model id 为 `doubao-embedding-vision`
- [x] 真实 semantic retrieval 只承诺 `PostgresStore`
- [x] focused tests 使用测试侧 fake / mocked store/search 或显式 test doubles；正式 runtime 仍只保留 `PostgresStore` vector path
- [x] Default retrieval timeout 为 1500ms，超时后 fail open，注入 0 条 UserMemory
- [x] semantic score 缺失、`NaN`、异常或不稳定时，按不可安全注入处理，宁可注入 0 条
- [x] embedding provider unavailable、Store timeout、semantic search throw、score 异常都不会破坏 ordinary chat、streaming、selected conversation ThreadState、final-turn memory 或 UserMemory Store
- [x] logs 不持久化 raw query text、raw UserMemory text、embedding vector、provider response 或 raw provider/store error payload

### Runtime Boundary Acceptance

- [x] semantic retrieval eligibility 判断发生在 embedding query 或 Store semantic search 之前
- [x] tool-assisted ordinary chat 在 ordinary chat context boundary 内可以使用 UserMemory semantic retrieval
- [x] `reader-skill` 的 runtime-controlled capability-context final answer stage 不视为默认排除的 MCP raw fetch/input path；是否复用 UserMemory 仍受 ordinary chat boundary 约束
- [x] 当 runtime 无法明确证明当前请求仍处于 ordinary chat boundary 内时，默认按 retrieval ineligible 处理
- [x] semantic retrieval 不会流入 raw tool input、MCP raw fetch/input path、Tasklist GraphState、Delivery RuntimeArtifact 或 workflow progress
- [x] 主 assistant 不获得 semantic-memory-search tool；retrieval 保持为 runtime-controlled capability

### Context Injection Acceptance

- [x] 最终 injected UserMemory 最多 3 条
- [x] 每条 injected UserMemory 文本最多 300 个中文字符
- [x] 所有 injected UserMemory 文本总计最多 900 个中文字符
- [x] injected UserMemory 仍需满足 confidence `>= 0.7`
- [x] semantic score 默认以 `>= 0.32` 作为可接受注入阈值
- [x] Semantic retrieval 初始 candidate `topK = 8`
- [x] selected conversation `ThreadState` 仍然是当前短期上下文事实源
- [x] latest user message 始终高于 selected UserMemory
- [x] UserMemory 只作为 supplemental context，不替代 selected conversation summary、pinnedDecisions 或 recent messages

## Non-regression Acceptance

- [x] v0.4.5 `explicit memory intent` strong-signal 语义保持兼容
- [x] v0.4.5 eligible ordinary turn extraction 边界保持兼容
- [x] v0.4.5 `pinnedDecision promotion` 语义保持兼容
- [x] v0.4.5 deterministic validation、stable key / dedupe、suppression / conflict handling 保持兼容
- [x] v0.4.6 不新增 UserMemory 写入来源
- [x] v0.4.6 不因为启用 semantic retrieval 而引入每轮 assistant turn 自动长期记忆抽取
- [x] v0.4.4 Conversation Registry 行为保持不变
- [x] per-conversation `ThreadState` isolation 保持不变
- [x] v0.4.3 final-turn memory 行为保持兼容
- [x] Tasklist checkpoint / resume semantics 保持不变
- [x] Delivery run-local semantics 保持不变
- [x] `@ai-mind/stream-core` chunk union 保持不变
- [x] frontend reducer public shape 保持不变
- [x] 不新增 `UserMemory`、embedding vector、semantic score、semantic metadata、raw error 或 debug internals 到公开 DTO

## Required Focused Tests

- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-provider.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-validation.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-service.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-retrieval.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/user-memory-context-builder.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `apps/webapp/tests/app/api/chat/conversations/route.test.ts`
- [x] `apps/webapp/tests/app/api/agent-runs/route.test.ts`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-runner.integration.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

## Validation Commands

- [x] `pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/user-memory-retrieval.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`
- [x] `pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-provider.test.ts tests/lib/ai/runtime/user-memory-validation.test.ts tests/lib/ai/runtime/user-memory-service.test.ts tests/lib/ai/runtime/user-memory-candidate-extractor.test.ts tests/lib/ai/runtime/user-memory-extraction-pipeline.test.ts`
- [x] `pnpm --dir apps/webapp test -- tests/lib/ai/runtime/user-memory-retrieval.test.ts tests/lib/ai/runtime/user-memory-context-builder.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `pnpm --dir apps/webapp test -- tests/app/api/chat/conversations/route.test.ts tests/app/api/agent-runs/route.test.ts tests/components/instamind/use-chat-stream-hydration.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-runner.integration.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `pnpm --filter @ai-mind/stream-core test`
- [x] `pnpm --dir apps/webapp test`
- [x] `pnpm typecheck`
- [x] `pnpm lint:webapp`
- [x] `git diff --check`

## Execution Evidence

- [x] Focused provider / validation / service / extraction suite result recorded
- [x] Focused retrieval / context-builder / orchestrator suite result recorded
- [x] Focused runtime retrieval suite (`user-memory-provider` / `user-memory-service` / `user-memory-retrieval` / `chat-memory-pinned-decision-promotion`) result recorded
- [x] Route / reducer / hydration / Tasklist / Delivery non-regression suite result recorded
- [x] `@ai-mind/stream-core` protocol suite result recorded
- [x] `pnpm --dir apps/webapp test` result recorded
- [x] `pnpm typecheck` result recorded
- [x] `pnpm lint:webapp` result recorded
- [x] `git diff --check` result recorded

## Manual Scope Guardrail

- [x] 不把 UserMemory semantic retrieval 扩展成完整 RAG 知识库
- [x] 不做文档上传、document chunk、citation、reranker、query rewrite agent
- [x] 不做聊天历史语义搜索
- [x] 不向量化完整 transcript、conversation messages、完整 `ThreadState`、raw user message、raw assistant final text、raw tool result、MCP raw resource content、GraphState 或 RuntimeArtifact
- [x] 不把 `PGVectorStore`、`pgvector`、Milvus、Qdrant、Pinecone 或独立向量库作为 v0.4.6 产品主路线
- [x] 不做账号级长期记忆、跨设备同步或用户全局画像
- [x] 不做 Memory Inspector、memory edit UI、memory delete UI、向量搜索结果 UI 面板或 batch re-embedding 管理后台
- [x] 不默认接入 Tasklist / Delivery
- [x] 不修改 stream-core chunk union、frontend reducer public shape、Prisma schema 或业务数据库迁移路线
