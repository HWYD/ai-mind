# ADR-0014: UserMemory Semantic Retrieval Baseline

状态：Accepted

日期：2026-07-10

## 背景

v0.4.5 已建立 browser-session scoped `UserMemory Store`，能够在不同 conversation 间复用经过校验的长期偏好与稳定约束；但原有召回依赖规则与文本重合，无法可靠处理“换一种说法”的相关请求。

本版需要增加真实语义召回，同时继续保持以下长期边界：

- `ThreadState` 是 selected conversation 的短期上下文事实源。
- `UserMemory` 只是在当前 browser session 中可复用的长期补充上下文。
- Tasklist、Delivery、HITL、GraphState、RuntimeArtifact、stream protocol 与 frontend public state 不被 UserMemory retrieval 改变。

## 决策

### 以 PostgresStore vector search 作为唯一正式 candidate source

v0.4.6 的真实 semantic retrieval 只使用 LangGraph `PostgresStore` 的 vector search。正式路径不采用 rule-based、lexical、metadata、hybrid/text search 或完整 Store JSON text search 作为候选来源或 fallback。

测试可以在测试侧使用 fake、mocked store/search 或显式 test double 固定语义结果；生产 runtime 不保留测试专用 store mode、provider kind 或 retrieval 分支。

### 使用独立的 UserMemory embedding 配置

embedding 固定使用火山引擎 Ark OpenAI-compatible 路线和 `doubao-embedding-vision`，复用现有 Doubao 的服务端 `baseUrl` / API key 来源，但不跟随当前聊天模型选择器。

embedding dimensions 由运行时配置按该模型的当前官方规格提供，不写成产品级固定常量。local development、integration、preview、staging 与 production 都使用 `PostgresStore` 的真实 runtime 路径。

### 只索引显式 allowlist 字段

semantic index payload 只包含经过 validation 的 `UserMemory.text` 和 `UserMemory.tags`。`type` 只能用于 filtering、ranking 和 display metadata，不能作为单独的 vector field。

`Semantic Index Metadata` 写入 UserMemory 的内部 document metadata；raw embedding vector、raw query、provider response/error、sourceConversationId、suppression reason、API key、cookie 和 provider config 都不持久化为 index metadata，也不进入公开 DTO。

### 在 runtime 内受控注入并安全降级

runtime 在 embedding query 与 Store search 之前确认请求仍在 ordinary chat boundary 内。eligible ordinary text chat、tool-assisted ordinary chat，以及仍在同一边界内的 capability-context final answer 可以使用 semantic retrieval；Tasklist、Delivery、HITL 与 Tool/MCP 原始输入路径必须被排除。

检索 query 只来自 latest user input，并只做 trim、空白折叠和最多 800 字符的确定性裁剪。检索结果依次经过 active/confidence/suppression、semantic score、`stableKey`、conflict 和 context budget 过滤；最多注入 3 条、每条最多 300 字符、总计最多 900 字符。任何 provider、Store、timeout、score 或边界异常都降级为 0 条注入。

## 影响

正向影响：

- 同一 browser session 内可按语义关联长期 UserMemory，不要求查询与已保存记忆完全复述。
- `UserMemory`、`ThreadState`、Agent state 和公开 stream/DTO 的职责保持分离。
- 失败不会成为 ordinary chat 或 streaming 的单点故障。

代价：

- 真实 semantic retrieval 需要 `DATABASE_URL`、`PostgresStore` vector search 支持，以及服务端 embedding 配置。
- 不做历史数据 migration 或 reindex；没有 semantic index 的旧 UserMemory 不属于本版验收主路径。
- 未来如需 keyword / hybrid retrieval，必须单独设计字段白名单 candidate model，不能回退到完整 document JSON 搜索。

## 备选方案

继续沿用 v0.4.5 的 rule-based retrieval：实现成本低，但无法覆盖跨措辞的语义关联，也不符合本版的 vector semantic retrieval 目标。

使用 `PostgresStore` hybrid/text search：会对完整 Store document JSON 产生 text search 风险，绕开 `text` / `tags` allowlist，因此不作为本版语义路径。

引入独立 `PGVectorStore`、pgvector 服务或外部向量数据库：会扩张为独立数据产品和运维边界，超出本版在 LangGraph Store 内演进的范围。

## 后续事项

- 模型、embedding dimensions 或 score 分布发生变化时，需要重新校准配置与 semantic score 阈值。
- keyword / hybrid、历史数据 reindex、Memory Inspector、账号级或跨设备 memory 均需要新的 spec 和独立边界评估。
