# Research: AI Mind v0.4.7 浏览器本地聊天会话持久化

## 研究范围

本阶段只解决 v0.4.7 的设计未知项：浏览器本地存储形式、恢复与服务端 hydration 的关系、稳定消息快照的生成边界、并发写入和服务端失败信号。研究依据当前仓库的实现、测试和 constitution，不引入 PG 聊天历史表或新的账号体系。

## Decision 1：使用原生 IndexedDB 保存本地快照

### Decision

使用浏览器原生 IndexedDB 保存本地会话索引和按 `conversationId` 分离的消息快照；不新增运行时存储依赖。现有 `localStorage` 的 selected/draft hint 可继续作为兼容性 hint，但不再作为完整聊天展示历史的来源。

### Rationale

- 富 UI 快照可能包含 tool output、resource preview、workflow、Agent trace 和 artifact，容量和结构都明显超过简单字符串 hint。
- IndexedDB 异步、可存储结构化对象，适合在不阻塞流式聊天主链的前提下写入快照。
- 原生 API 不增加新的生产依赖；严格 schema 校验可以在存取边界保护版本兼容性。
- 浏览器重启后 IndexedDB 仍可保留，符合本版本对同一浏览器用户环境的恢复承诺。

### Alternatives considered

- `localStorage`：实现简单，但同步 API 和容量限制不适合富 UI 快照；保留给小型兼容 hint，不作为主存储。
- 新增 IndexedDB wrapper 依赖：可以减少少量样板代码，但会增加 v0.4.7 的运行时依赖和升级面，当前没有必要。
- 服务端新增完整历史表：与本版本 Non-goals 和当前 checkpoint / business state 边界冲突，排除。

## Decision 2：本地快照优先展示，服务端 hydration 只负责运行时确认和降级

### Decision

选中会话恢复时，前端先读取该 `conversationId` 的本地完整 UI 快照并恢复展示；随后通过现有 Registry/Thread hydration 入口确认会话归属和 ThreadState 可用性。

- 服务端确认成功：保留本地完整 UI 展示，不把 bounded hydration 合并进本地历史。
- 本地快照不存在：允许使用 bounded hydration 作为有限降级展示，但不得标记为完整聊天历史。
- Registry 或 ThreadState 不可用：保留本地展示并进入明确的只读缓存状态。
- Registry 判定会话无效或越权：不得发送；清理该本地快照并回退到有效会话或 draft。

### Rationale

当前 `apps/webapp/app/api/chat/thread/route.ts` 返回的是受限 `ThreadHydrationDTO`，而 `chat-memory-service.ts` 只保留 bounded recent messages、summary 和 pinned decisions。它不能恢复富 UI 历史，因此不能继续作为完整展示事实源。

### Alternatives considered

- 服务端 hydration 覆盖本地 UI：会丢失富 UI 展示，并与当前服务端不保存完整 transcript 的事实冲突。
- 把本地完整历史发送给服务端作为模型上下文：会改变现有 server-authoritative context 语义，并把 UI 历史错误升级为 runtime contract。

## Decision 3：只在稳定 UI 状态提交快照

### Decision

本地持久化只提交已经稳定完成的消息树。流式中、失败、中止、pending `AgentInterrupt`、transient `thread-memory-status` 和其他请求控制状态不进入可恢复快照。普通回答完成、删除问答和重新生成完成后，提交新的完整快照。

### Rationale

`useChatStream` 当前把所有流式 chunk 归约为 `MindMessage[]`，并在 `ready`、删除和重新生成路径上形成稳定状态。持久化入口应位于这些稳定边界之后，而不是每个 token 或结构性 chunk 到达时写入。

### Alternatives considered

- 每个流式 chunk 都写入：写放大明显，容易保存半成品，且刷新后可能恢复不可继续的控制状态。
- 只保存纯文本：无法满足 tool、resource、workflow、Agent trace 和 artifact 的产品目标。

## Decision 4：按会话隔离存储，并区分不同会话与同一会话并发

### Decision

- 每个会话快照以 `conversationId` 为独立记录；不同会话的消息写入互不覆盖。
- 共享的本地会话索引更新使用按 `conversationId` 合并的事务式读改写，不能因为一个标签页更新会话 A 而丢失会话 B 的元数据。
- 同一会话的并发稳定写入使用快照版本进行新旧判断，旧版本不得覆盖新版本，不做消息级合并。
- 不承诺跨标签页实时同步；另一个标签页需要刷新或重新进入后才看到新的本地快照。

### Rationale

用户已明确不同浏览器标签页更新不同会话时不应发生消息快照冲突；真正需要版本保护的是同一 `conversationId`。把索引和消息记录分离，可以同时满足会话隔离和最近会话列表恢复。

## Decision 5：用显式 API 错误表达 ThreadState 不可用

### Decision

当 `/api/chat/thread` 已通过 Registry ownership 校验，但读取 ThreadState 失败时，route 返回标准化的 5xx 错误码，例如 `CHAT_THREAD_HYDRATION_UNAVAILABLE`，不再把失败伪装成 `restored: false` 的成功响应。该错误只包含安全 public DTO 字段，不输出 raw checkpoint 或 raw error。

### Rationale

当前 route 在 ThreadState 读取异常时返回空 DTO，前端无法区分“没有 bounded state”和“服务端 ThreadState 暂不可用”。v0.4.7 的只读降级要求这两种情况可区分。

### Alternatives considered

- 继续使用 `restored: false`：无法准确进入只读状态，可能允许用户在服务端上下文不可用时继续发送。
- 新增独立验证 API：会重复 Registry/ThreadState ownership 逻辑，增加接口和维护面；复用现有 thread route 更小。

## Decision 6：有效 server registry 是本地会话索引的权威

有效且成功的 server conversation registry 响应负责确认 conversation ID、ownership 和最近保留范围。该职责与本地 conversation snapshot 分离：registry 不包含完整的用户可见聊天记录，客户端不得从 registry 或 `ThreadState` 比对、重建或覆盖完整 UI 历史。

刷新流程仍采用 local-first，以保证页面能够立即恢复上一次本地展示。客户端在请求 registry 前记录本地索引基线；请求成功且响应有效时，用服务端列表替换该基线索引，硬删除基线中服务端不存在的会话索引和快照；服务端仍保留的同 ID 会话只更新列表元数据，不触碰本地快照。有效空列表会清理本次基线中的本地会话。请求失败、超时或响应无效时保留本地数据，并按既有规则进入只读缓存态。

普通本地写入继续按 `conversationId` 合并；服务端 reconciliation 使用独立的 store 操作，避免权威响应错误保留基线旧行，同时保留请求发起后由其他标签页创建的不同会话。

## Decision 7：删除操作同时清理 Registry、ThreadState 和本地快照

本次删除不是只隐藏前端列表。服务端先验证当前 browser session 对 `conversationId` 的 ownership，然后在一个删除服务流程中移除 Conversation Registry 条目并调用 chat-memory checkpointer 的 thread deletion 能力删除对应 ThreadState/checkpoint；只有两个服务端步骤都成功后，客户端才通过权威返回结果清理本地索引和 IndexedDB UI snapshot。

当前 PostgresSaver 已提供按 `threadId` 删除 checkpoint 的能力，ThreadState thread ID 继续复用现有 `buildChatConversationThreadId(sessionId, conversationId)` 规则。内存模式和 Postgres 模式通过同一 chat-memory service contract 暴露删除能力，route 不直接操作数据库。

删除当前会话时由服务端返回 fallback selected conversation 或空白 draft；删除非当前会话时保持当前选择。删除失败时保留本地数据，避免用户在服务端删除未完成时丢失本地可恢复内容。

## Resolved Unknowns

- 本地存储：原生 IndexedDB，保留现有 localStorage hint 兼容性。
- 完整 UI 展示来源：本地快照唯一来源。
- AI 上下文来源：服务端 ThreadState 唯一来源；本地快照与其不要求完整一致。
- 浏览器生命周期：同一浏览器用户环境跨浏览器重启保留；站点数据清除后不承诺恢复。
- 并发写入：不同会话独立写入；同一会话版本保护，不做消息级合并。
- 流协议：不新增 stream chunk，不改变 `@ai-mind/stream-core`。
- 服务端存储：不新增 PG 完整聊天历史业务表。
