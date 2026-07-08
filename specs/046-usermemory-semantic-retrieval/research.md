# Research: AI Mind v0.4.6 UserMemory Semantic Retrieval Baseline

## Decision: 使用 LangGraph PostgresStore vector search 作为第一版真实语义召回路径

**Rationale**: 当前项目已经在 v0.4.5 使用 LangGraph Store abstraction，并通过 `PostgresStore` 提供生产取向持久化。v0.4.6 继续沿用这一边界，可以最小化数据层变化。本地已安装 `@langchain/langgraph-checkpoint-postgres` 的 `PostgresStore` 类型支持 `index` 配置、`search({ query, mode })`、`similarityThreshold` 和 result `score`，满足 Store-level semantic retrieval 的计划前提。v0.4.6 只采用 vector search mode；不采用 hybrid/text search，因为本地实现调研显示 hybrid keyword 部分使用 PostgreSQL text search 处理完整 `store.value` JSON，可能绕过 semantic index allowlist。

**Alternatives considered**: 独立 `PGVectorStore`、直接引入 `pgvector` client、Milvus、Qdrant、Pinecone。全部拒绝，因为本版本不是 RAG / vector DB 版本，也不需要把 AI Mind 的 UserMemory 产品语义改成知识库检索系统。

## Decision: pgvector 只作为 PostgresStore semantic search 的底层存储能力要求

**Rationale**: `PostgresStoreConfig.index` 的类型说明明确将 vector search support 作为 semantic search 能力的一部分。计划中接受这一底层要求，但把它限定为 LangGraph Store provider 的实现细节，不把 `pgvector` 暴露为 AI Mind 产品路线、主依赖叙事或独立 Store 抽象。

**Alternatives considered**: 在 spec/plan 中完全禁止任何 pgvector 相关内容。拒绝，因为这会与当前 `PostgresStore` semantic search 的实际底层要求冲突，导致计划不可实现。

## Decision: 第一版真实 embedding provider 采用独立 UserMemory runtime config，并固定使用 `doubao-embedding-vision`

**Rationale**: 项目已有 Doubao provider，且底层走 OpenAI-compatible provider shape。用户已明确要求第一版真实 embedding provider 固定使用火山引擎 Ark 路线的 `doubao-embedding-vision`，并复用项目现有 Doubao provider 同一条 `baseUrl` / `api key` 来源；该选择以用户提供的火山引擎官方文档为准。这样可以减少新增 provider 接线，保证聊天模型配置体系和 embedding 配置体系在接入风格上保持一致，但 embedding provider 仍然必须是 UserMemory semantic retrieval 的独立 runtime config，不能跟随当前聊天模型选择器自动切换。该决策同时满足本版 `PostgresStore` vector semantic search 对固定 embedding 模型的一致性要求。

**Alternatives considered**: 默认使用 Ollama embeddings。保留为后续可选方向，但第一版不作为默认真实 provider，因为本项目现有云 provider 配置和 acceptance 更适合复用 Ark OpenAI-compatible shape。继续把 model id 留成开放项。拒绝，因为这会把本轮已经拍板的 provider 默认线路继续留成实现期分歧点。

## Decision: automated tests 使用 deterministic semantic behavior

**Rationale**: 语义召回测试如果直接依赖真实 embedding provider，会受 API key、网络、费用、模型更新和语义漂移影响。v0.4.6 的单元测试应使用 deterministic embedding provider 或 deterministic semantic store adapter，让“回答风格偏好”“不吃香菜”“不相关问题不召回”等行为可重复验证。

**Alternatives considered**: 所有测试都使用真实 provider。拒绝，因为 CI 和本地单测会不稳定。完全不测语义行为。拒绝，因为这会让本版本核心价值没有可回归保障。

## Decision: semantic vector index content 使用显式 allowlist

**Rationale**: UserMemory 的价值在于“干净、校验后的长期用户记忆”，不是 raw conversation 或 runtime state。向量索引字段限定为 `UserMemory.text` 和 `UserMemory.tags`，可以避免把 source conversation、debug 信息、suppression reason、raw prompt、provider response 或工具结果带入 embedding provider。`UserMemory.type` 只作为 filtering / ranking / display metadata，不单独向量化，避免 `user_preference` 这类粗粒度类型制造无关相似度。

**Alternatives considered**: 索引完整 UserMemory document JSON。拒绝，因为默认 `["$"]` 可能把不该进入 embedding 的元数据一起索引。索引 raw user message。拒绝，因为 raw user message 是产生记忆的过程材料，不是最终长期记忆，可能包含临时表达、敏感内容或上下文噪音。单独向量化 `type`。拒绝，因为类型值语义过粗，容易把同类型但不相关的 UserMemory 拉近。

## Decision: v0.4.6 废弃 rule-based / lexical candidate source，只保留 vector semantic retrieval

**Rationale**: 用户已明确下一版会做混合搜索。为了避免 v0.4.6 先实现一套轻量 lexical / metadata candidate source，下一版再实现一套字段白名单 keyword signal，v0.4.6 只保留 `PostgresStore` vector semantic retrieval 作为正式召回路径。v0.4.5 的 rule-based retrieval 可以作为 legacy implementation detail 暂存，但不得新增、强化、作为 fallback 或作为验收成功条件；并且在 v0.4.6 release closing 前，正式 runtime wiring、正式验收依赖和正式 config path 应清除掉这条旧链路。这样下一版 hybrid 可以直接以 vector search + field-allowlisted keyword search + rank fusion 的方式扩展，不需要拆掉本版新写的规则召回。

**Alternatives considered**: 保留 semantic + lexical parallel merge。拒绝，因为它会和下一版 hybrid keyword path 重复。增强 v0.4.5 rule-based retrieval。拒绝，因为这会把临时规则做成长期搜索系统。为旧数据保留 rule / lexical fallback 承诺。拒绝，因为用户已明确不需要兼容旧数据，本版不做 migration / reindex。

## Decision: v0.4.6 不采用 LLM query rewrite，retrieval query 直接使用 latest user input

**Rationale**: LLM query rewrite 在更广义的 conversational RAG / retrieval 系统中是常见做法，但 AI Mind v0.4.6 的对象是短文本、强边界的长期用户记忆，不是大文档库。这里最重要的是避免误改写否定、本次例外条件、约束顺序和当前 turn 的新优先级。对 UserMemory 来说，“少召回一次”通常比“改写错一次导致误召回”更安全。v0.4.6 的目标是先把 vector semantic retrieval 做稳，再在下一版 hybrid 稳定后评估是否需要 constrained LLM query rewrite。

**Alternatives considered**: 在 v0.4.6 直接引入 LLM query rewrite。拒绝，因为它会额外引入 rewrite prompt、rewrite model、rewrite latency、rewrite 失败路径和语义漂移排障复杂度。对长 query 做 HyDE 或 query expansion。拒绝，因为这会进一步扩大不确定性，并把 v0.4.6 推向更完整的 retrieval optimization platform。

## Decision: 不直接采用 PostgresStore hybrid/text search，后续 hybrid 必须是字段白名单 keyword signal

**Rationale**: 主流检索系统中，hybrid search 通常通过 vector + keyword/full-text 两路召回提升稳定性，尤其适合 exact keyword、专有名词、产品名和短语匹配。但 AI Mind v0.4.6 的对象是长期 UserMemory，不是文档库 RAG；字段边界比召回覆盖面更重要。本地 `PostgresStore` hybrid 实现的 keyword 部分使用 `to_tsvector(..., s.value::text)` / `plainto_tsquery(...)`，会搜索完整 Store JSON，而不是只搜索 `UserMemory.text/tags`。这可能让 `sourceConversationId`、debug metadata、suppression reason 或未来新增内部字段参与检索，违反 UserMemory semantic index allowlist。

**Alternatives considered**: 直接启用 `PostgresStore` hybrid/text search。拒绝，因为它可能绕过字段白名单。完全禁止未来 hybrid。拒绝，因为下一版已计划混合搜索，字段白名单 keyword signal 仍有价值。引入独立 BM25 / reranker / query rewrite agent。拒绝，因为这会把 v0.4.6 推向通用搜索或 RAG 平台，超出本版目标。

## Decision: semantic retrieval eligibility 前置到 provider 调用之前

**Rationale**: 当前 orchestrator 已有统一 memory context assembly。v0.4.6 如果只在结果使用阶段过滤 Tasklist / Delivery，会造成被排除路径仍触发 embedding query 或 semantic search。计划要求在任何 semantic query 前先判断 request path eligibility。

**Alternatives considered**: 先召回再丢弃。拒绝，因为会产生无意义 provider 调用、费用、延迟和泄露面。

## Decision: semantic retrieval timeout 第一版设为 1500ms

**Rationale**: UserMemory 是 supplemental context，不能成为 ordinary chat 主链路单点故障。1500ms 给云 embedding provider + PostgresStore vector query 留出更现实的 MVP 验证预算，同时仍然保持 fail open。实现期可通过 runtime config 调整，但默认行为应 fail open。

**Alternatives considered**: 无 timeout。拒绝，因为 provider 或 Store 卡住会污染主聊天体验。800ms。拒绝，因为第一版走云 embedding provider 时偏紧，可能让本地 acceptance 经常误降级。更长超时。拒绝，因为长期记忆召回不是当前输入本身，不应优先于 streaming 可靠性。

## Decision: baseline retrieval 默认值固定为 score 阈值 `0.70`、topK `8`、metadata 写入 document、长 query 做确定性裁剪

**Rationale**: `UserMemory` 是补充上下文，不是知识库全文搜索。第一版要先保守，宁可少召回，不要乱召回。把默认 semantic score 阈值定为 `0.70`，可以让“风格偏好”“饮食禁忌”这类真实长期记忆更容易保住相关性下限；把初始 candidate `topK` 定为 `8`，则可以给后续 active/suppression/conflict/budget 过滤留出足够余量，但不会像更大的候选集那样引入太多噪音。`Semantic Index Metadata` 写入 UserMemory 内部 document metadata，而不是 runtime-only 临时状态，是为了给后续 reindex、混合检索演进、失败恢复和可观察性留稳定锚点。长 query 只允许做确定性轻量规范化和 `800` 字符上限裁剪，且采用前 `400` + 后 `400`，是为了尽量保住用户在结尾追加的否定、本次例外和最终问题，而不引入 LLM 改写带来的语义漂移。

**Alternatives considered**: 更低阈值如 `0.60`-`0.65`。拒绝，因为第一版更容易把不相关 memory 拉进来。更高阈值如 `0.75` 以上。拒绝，因为在中文短句 UserMemory 下可能过度漏召回。`topK = 3`。拒绝，因为过滤后过于容易变成 0 条。`topK = 20`。拒绝，因为第一版噪音和延迟都更高。metadata 只放 runtime-only。拒绝，因为重启后丢状态，不利于后续扩展。对长 query 使用 LLM summarize / rewrite。拒绝，因为这会把本版推向生成式检索优化，而不是稳定的 semantic baseline。

## Decision: 真实 semantic retrieval 只承诺 PostgresStore，InMemoryStore 只做 deterministic tests

**Rationale**: 当前 `InMemoryStore` 不提供真实 vector semantic search。为了避免实现一套项目自维护的假向量库，v0.4.6 只承诺真实 semantic retrieval 在 `PostgresStore` 下工作。自动化单测通过 deterministic embedding provider 或 deterministic semantic store behavior 覆盖语义召回策略。

**Alternatives considered**: 为 `InMemoryStore` 实现真实向量检索。拒绝，因为这会引入额外抽象和维护成本，偏离 LangGraph Store semantic search 的版本目标。

## Decision: debug logging 仅记录 safe metadata，默认 development 更详细

**Rationale**: 语义召回涉及 raw query、memory text、embedding vectors 和 provider response。日志不能保存这些内容。允许记录事件名、provider kind、search mode、耗时、候选数量、失败类别和是否降级；development 可以更详细但仍不能记录 raw text / vector / provider payload。

**Alternatives considered**: 记录完整 query 和 candidates 方便调试。拒绝，因为这违反 UserMemory 隐私边界和 public DTO 安全原则。
