# Research: AI Mind v0.4.5 Long-term User Memory Store Baseline

## Final Research Conclusions

### Use LangGraph Store with PostgresStore and InMemoryStore fallback

v0.4.5 的 UserMemory Store 使用 LangGraph `Store` abstraction。`PostgresStore` 是生产持久化基线，`InMemoryStore` 只作为本地开发和测试 fallback。这样可以让长期记忆使用 Store document 模型，而不是复用 `ThreadState` checkpoint。

### Use an independent `langgraph_user_memory` schema

UserMemory Store 使用独立的 `langgraph_user_memory` schema。它与 chat memory checkpoint schema、Tasklist Agent runtime checkpoint schema、Prisma business tables 和 Conversation Registry 保持分离，便于部署、清理和边界验证。

### Add `AI_MIND_USER_MEMORY_STORE=memory|postgres`

UserMemory provider 由 `AI_MIND_USER_MEMORY_STORE=memory|postgres` 控制。开发和测试默认 `memory`，production 默认 `postgres`。当 durable provider 不可用时，读取和写入路径必须安全降级为 no-long-term-memory mode。

### Setup UserMemory Store with a separate script

UserMemory Store 的 Postgres setup 使用独立脚本 `apps/webapp/scripts/setup-user-memory-store.mjs`，并提供 `pnpm --dir apps/webapp db:user-memory:setup` 与根命令 `pnpm db:user-memory:setup`。LangGraph Store tables 不由 Prisma migration 管理，也不与 checkpoint setup 复用脚本。

### Store document shape uses deterministic fields and safe source metadata

UserMemory document 需要包含支持 validation、dedupe、retrieval、suppression 和 source trace 的确定性字段，例如 `type`、`text`、`tags`、`confidence`、`status`、`sourceConversationId`、timestamps、`stableKey` 和 structured `identity`。namespace 使用 session scope hash，而不是 raw browser session id。

### Retrieval uses bounded rule-based selection

v0.4.5 的 retrieval 使用 bounded rule-based selection，不做 embedding / pgvector。召回依赖 type、structured tags、normalized text overlap、confidence、status 和 scope 等信号；最终由 deterministic rules 做 rerank 和裁剪：最多 3 条、每条最多 300 中文字符、总注入最多 900 中文字符、confidence `>= 0.7`。

### Use a background extract-then-validate pipeline after eligible completed turns

每个 eligible completed ordinary text chat 或 tool-assisted ordinary chat turn 完成后，系统都会 enqueue 一个 in-process best-effort UserMemory extraction job。该 job 使用模型结构化输出 `0..N` candidates，再由程序执行 deterministic validation、stable key、dedupe、suppression 和 Store write。explicit memory intent 是强信号，但不是唯一触发条件。

### Use structured model output for UserMemory candidates

UserMemory candidate 通过结构化模型输出生成。模型负责提取长期记忆价值、类型、干净文本、tags、confidence、`stability`、structured `identity` 和 conflict/update 信号；程序负责决定 namespace、stable key、status、source trace 和最终 write/no-write。

### PinnedDecision promotion is compaction-diff driven

PinnedDecision promotion 只在 compaction 成功后执行，并且只评估新增或变化的 pinnedDecisions。summary 不直接写入 UserMemory，完整 transcript 也不参与 promotion。

### Conflict/forget uses persistent suppression, not physical delete

当用户自然语言 forget 或明确否定旧偏好时，系统把旧 UserMemory 标记为 `inactive` 或 `suppressed`，使其不再参与 retrieval。本版不通过该自然语言流程做物理删除，也不引入完整 memory 管理 UI。

### Retrieval applies to ordinary text chat and tool-assisted ordinary chat only

UserMemory retrieval 只接入 ordinary text chat 和 tool-assisted ordinary chat。Tasklist / Delivery 不读取 UserMemory，也不依赖它改变 authority、checkpoint/resume 或 run-local 语义。
