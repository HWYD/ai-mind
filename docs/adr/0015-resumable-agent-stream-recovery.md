# ADR-0015：Resumable Agent Stream Recovery

状态：Accepted
日期：2026-07-21

## 背景

v0.4.10 之前，浏览器端通过 `fetch POST + NDJSON` 消费普通聊天、Tasklist Agent 和 Delivery Chain 的流式输出。这个模式比浏览器原生 `EventSource` 更适合携带复杂 POST body、模型选择、Skill/Agent 请求和现有 NDJSON chunk 协议，但它没有内建 SSE 那种 `Last-Event-ID`、自动重连和 replay 语义。

本版本要补齐的是“客户端断线后还能接回同一个运行”的能力，而不是把整个 runtime 升级成分布式 exactly-once executor。AI Mind 仍然保持：

- `StreamRun` / `StreamEvent` 只保存 public stream DTO，不保存 raw GraphState、checkpoint、provider response、prompt、cookie 或 secret。
- Tasklist Agent 的业务状态和 LangGraph checkpoint 继续由 AgentRun / checkpoint 层负责。
- v0.4.10 支持 client disconnect recovery，不承诺 Node.js process crash 后自动接管仍在执行的 in-memory executor。

## 决策

### 初始请求继续使用 `POST + NDJSON`

初始请求仍走 `POST /api/chat`，并固定返回 `ai-mind-resumable-v1` envelope。`Accept: application/x-ndjson; profile="ai-mind-resumable-v1"` 是客户端声明与响应断言，不再决定服务端是否进入 envelope 模式。每个初始请求都要求 `Idempotency-Key` 并在执行前创建或复用 `StreamRun`。

这是产品分享阶段的一次预发布协议收口：不再提供 legacy raw one-shot 输出。旧标签页、手工 curl 或内部脚本若仍按裸 chunk 解析，必须与完整 webapp 镜像一起更新；不提供 mixed-version fallback。

### 恢复订阅使用 `GET /api/chat/runs/{runId}/stream`

恢复路径使用 GET，并支持：

- `Last-Event-ID` header；
- `after` query cursor；
- blank heartbeat；
- retained event replay；
- live polling；
- terminal event close。

这等价吸收了 SSE 的核心恢复语义，但保留 NDJSON envelope 和 `fetch` reader 的实现方式。

### 幂等提交由 `StreamRequest` 绑定 `Idempotency-Key`

resumable 初始 POST 必须带 `Idempotency-Key`。同一 owner session 下：

- 相同 key + 相同 canonical request fingerprint：返回已有 `StreamRun` 的 JSON replay descriptor；
- 相同 key + 不同 fingerprint：返回 `409 IDEMPOTENCY_CONFLICT`；
- active run 不因 idempotency scope 过期而被复用成新执行；
- terminal run 只有在 idempotency scope 和 retention window 都过期后才允许开启新的 bounded scope。

request fingerprint 包含 stream kind，避免不同流类型被错误 replay 到同一 run。

### Event store 只保存 public envelope

`StreamEventProjector` 是 runtime 到 persisted event 的边界。它只接受已经可以公开给前端的 `ChatStreamChunk` / lifecycle DTO，并拒绝 raw GraphState、checkpoint、provider error、secret-like content 和超大 payload。

默认边界：

- 每个 run 最多保留 20,000 events；
- 每个 event payload 最多 256 KiB；
- 每个 run 有 retention window；
- replay 发现 retained-log gap 时返回 `CURSOR_EXPIRED`。

### Cancel 是显式用户动作

`POST /api/chat/runs/{runId}/cancel` 只写入 durable `cancelRequestedAt`，active executor 通过 run-scoped `AbortSignal` 或 polling 观察取消，并在真正停止后投影 terminal `cancelled` lifecycle。取消优先级高于下一轮 reconnect retry；route 不提前伪造终态，前端保持 optimistic stop UI。

## 影响

正向影响：

- 普通聊天、Tasklist Agent 和 Delivery Chain 可以共享一套恢复协议。
- duplicate POST 不再启动第二个 model / Agent / workflow execution。
- 前端可以区分 reconnecting、paused、terminal、recovery unavailable 和 explicit cancel。
- stream-core 只输出和消费固定 envelope，业务 `ChatStreamChunk` 保持为 `payload`，不再维护 raw NDJSON writer/parser 分支。

代价：

- 需要数据库 migration 支撑 `StreamRequest`、`StreamRun` 和 `StreamEvent`。
- GET recovery 通过 polling 补齐 live events，不是完整 SSE server push。
- retention window 之外的 cursor 只能给 final-state/restart guidance，不能还原完整历史。
- 不处理 process crash takeover、worker queue、跨进程 executor lease takeover 或外部 Tool side effect exactly-once。

## 备选方案

使用浏览器原生 `EventSource`：自动重连体验好，但只能 GET，不适合当前复杂 POST request body、模型选择和 Agent 请求入口；改造成本高，而且会拆裂现有 NDJSON 协议。

改成 WebSocket：双向能力更强，但会引入连接状态、部署代理、心跳、鉴权和 backpressure 的新复杂度；本版本只需要断线恢复，不需要通用双向通道。

只在前端 retry 原始 POST：实现简单，但会重复启动 model/Agent/workflow，违反长任务幂等要求。

## 后续事项

- 如果未来要支持 process crash takeover，需要引入 durable executor lease、queue/worker 和 checkpoint-aware resume design。
- 如果未来要支持更长 retention，需要独立评估存储成本、cleanup 策略和 UI final-state retrieval。
- 如果未来把 recovery GET 改成真正 SSE，需要保持现有 envelope / cursor / ownership contract 兼容。

## v0.4.10 Convergence Clarifications

- Retention is rolling: each appended event uses `expiresAt = appendTime + 10 minutes`, and an active run extends `retentionUntil` when new events arrive. A count boundary is reported through `CURSOR_EXPIRED` and final-state/restart guidance.
- Cancel is intent-first. The cancel route writes `cancelRequestedAt` only; the active executor is the sole writer of the `cancelled` terminal event. The existing optimistic client stop remains unchanged and no visible cancelling phase is added.
- Automatic reconnect is limited to the same page lifecycle. After refresh/close, an active subscription is not reattached; already persisted final results may still be returned by normal conversation hydration.
- The executor runs in the current long-lived Node.js webapp process used by Docker Compose. PostgreSQL may serve recovery reads, but process-crash takeover and cross-instance executor leasing remain out of scope.
- `StreamRun.agentRunId` is a nullable foreign key with a unique constraint (PostgreSQL permits multiple nulls). Tasklist links are established explicitly after `AgentRun` creation; ordinary chat and Delivery Chain keep the link null.
