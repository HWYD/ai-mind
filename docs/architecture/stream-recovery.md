# Stream Recovery Architecture

## Summary

v0.4.10 为 AI Mind 的三类当前 NDJSON 流增加 resumable recovery：

- ordinary chat；
- Tasklist Agent；
- Delivery Chain。

核心设计是：初始执行仍由 `POST + NDJSON` 发起；断线恢复走 `GET /api/chat/runs/{runId}/stream`；服务端只持久化 public stream envelope；客户端用 cursor 去重、补齐和继续展示。

## Protocol Shape

初始请求：

```text
POST /api/chat
Accept: application/x-ndjson; profile="ai-mind-resumable-v1"
Idempotency-Key: <stable client request id>
```

成功创建新运行时，响应仍是 NDJSON stream，并带：

- `X-Run-Id`
- `X-Stream-Protocol: ai-mind-resumable-v1`
- `Content-Type: application/x-ndjson; profile="ai-mind-resumable-v1"`

`POST /api/chat` 的成功响应固定为上述 envelope stream。`Idempotency-Key` 对所有初始请求都是必填项；`Accept` profile 用于客户端声明，不用于回退到 raw chunk 模式。v0.4.10 仍处于预发布产品分享阶段，因此部署完整 webapp 镜像后，未刷新的旧页面和裸 chunk 客户端不受兼容性保证。

duplicate POST 不返回 NDJSON，而是返回 JSON descriptor：

```json
{
    "kind": "stream-replay",
    "replayed": true,
    "runId": "run_...",
    "status": "running",
    "lastSequence": 42,
    "streamUrl": "/api/chat/runs/run_.../stream"
}
```

客户端必须识别该 descriptor，并改用 `streamUrl` + `Last-Event-ID` 恢复已有 run，不能把 JSON descriptor 当作普通 NDJSON chunk 消费。

恢复请求：

```text
GET /api/chat/runs/{runId}/stream
Last-Event-ID: <last applied sequence>
```

也支持 `?after=<sequence>`，但如果 header 和 query 同时存在，二者必须一致。

## Envelope and Cursor

resumable stream 使用 `StreamEventEnvelope`：

- `protocolVersion`
- `eventId`
- `runId`
- `sequence`
- `eventKind`
- `payload`
- optional `runStatus`
- optional terminal metadata

cursor 使用已经成功应用到 UI 的最后一个 `sequence`。客户端规则：

- blank line 是 heartbeat，不推进 cursor；
- duplicate sequence 跳过；
- gap 视为恢复失败，进入 recovery GET；
- terminal envelope 停止后续 retry。

## Persistence Model

数据库中有三类记录：

- `StreamRequest`：owner session + idempotency key + request fingerprint -> run；
- `StreamRun`：run kind、owner、status、lastSequence、terminalSequence、retention、executionOwnerId、cancelRequestedAt；
- `StreamEvent`：runId + sequence + public envelope payload。

默认 retention boundary：

- `maxRetainedEvents`: 20,000 / run；
- `maxEventPayloadBytes`: 256 KiB / event；
- retained log gap 返回 `CURSOR_EXPIRED`；
- cursor ahead 返回 `CURSOR_AHEAD`。

## Ownership

Stream recovery 使用 browser session 派生的 owner session hash。GET recovery、cancel 和 final-state retrieval 都必须通过 owner 校验。

跨 session 访问不能暴露 event 内容。公开响应只返回 safe error code、safe message、是否可 restart / retrieve final state 等信息。

## Execution Lifetime

resumable mode 下，request disconnect 不再直接取消后端执行。执行由 `StreamExecutionCoordinator` 管理 run-scoped controller：

- `request.signal` 只代表初始 HTTP 连接；
- `executionOwnerId` 防止同一 run 启动第二个 active executor；
- `cancelRequestedAt` 是 durable cancel intent；
- active executor polling cancel intent 并触发 run-scoped abort。

v0.4.10 不承诺 process crash takeover。Node.js process 崩溃后，正在内存中执行的 runtime 不会自动恢复；客户端只能根据已持久化 events 获取 final-state/restart guidance。

## AgentRun and Checkpoint Boundary

Tasklist Agent 的 `AgentRun` / `AgentInterrupt` / LangGraph checkpoint 仍是 Agent business state 的事实源。

Stream recovery 不保存 raw GraphState，不保存 checkpoint，不改变 Agent business transition。Tasklist resumable stream 只保证 public event sequence、paused/resume/reject/version mismatch 的 stream projection 和同一个 `runId` 的恢复订阅。

## Client State

前端区分以下恢复状态：

- `idle`
- `connected`
- `disconnected`
- `reconnecting`
- `paused`
- `terminal`
- `recovery_unavailable`

cancel 优先于下一轮 retry。用户显式停止时，客户端 abort 当前 reader，并向 `/api/chat/runs/{runId}/cancel` 发送 cancel intent。

## Initial POST Response-Loss Recovery

Before a client receives `X-Run-Id` or a replay descriptor, it cannot use the recovery GET endpoint. In the same page lifetime only, the client keeps the original request payload and `Idempotency-Key` and retries the initial `POST /api/chat` for transport failures, a missing stream body, and HTTP `408`, `502`, `503`, or `504`.

This initial-request policy is separate from GET recovery: it uses at most three retries within 20 seconds with the existing exponential backoff and jitter. A duplicate POST is expected to return `stream-replay`, after which the client enters the normal cursor-based GET recovery path. Validation, authorization, conflict responses, cancellation, unmount, and any request that has obtained a `runId` do not retry the POST. When the budget is exhausted, the UI reports that the initial submission is unconfirmed rather than claiming the server did not accept it.

## Related Documents

## Initial POST and EOF Closure

初始 POST 的 20 秒预算现在同时约束退避等待和在途 request：每个 attempt 仅使用剩余预算，预算到期时只 abort 该 attempt；用户取消和页面卸载仍沿用原 controller 的取消语义。拿到 response 后会清除预算 timer，但保留取消信号与 response body 的连接。

已知 run 的 reader 只有在收到 terminal 或 `paused` lifecycle 后才能把 EOF 当作正常完成。否则 EOF 会按当前 cursor 转为 GET recovery。`stream-replay` descriptor 的首次 direct GET 也遵循这一规则，临时失败会进入已有 GET retry，而不会重发 POST。

对于 draft conversation，若 StreamRun 已创建但会话注册失败，route 会投影固定、安全的 `failed` lifecycle。这样 replay/final-state 查询不会无限等待不存在的 executor，且原始内部异常不会进入 public stream DTO。

- [ADR-0015](../adr/0015-resumable-agent-stream-recovery.md)
- [v0.4.10 version doc](../versions/v0.4.10-resumable-agent-streams.md)
- [v0.4.10 spec](../../specs/v0.4.10-resumable-agent-streams/)

## Convergence Clarifications

- Event retention is rolling per event (`appendTime + 10 minutes`); active runs extend their run boundary on every new append. Replay filters expired events and returns explicit `CURSOR_EXPIRED` guidance when a cursor is behind the retained boundary or count limit.
- `StreamRun.agentRunId` is nullable for generic streams, but Tasklist associations use a foreign key and unique index. The association is written explicitly after `AgentRun` creation and is never inferred from an arbitrary event.
- Cancel is a durable intent. The route does not project a terminal status before the executor stops; the existing optimistic client aborts local reading/retry immediately without a visible cancelling state.
- Same-page reconnect is supported. Refresh/close does not reattach an active subscription; persisted final conversation results remain readable through normal hydration.
