# Research: Resumable Agent Streams

## Decision 1: Keep POST + NDJSON for creation, add GET for recovery

**Decision**: Keep the existing initial `POST /api/chat` response as `application/x-ndjson`. Add a separate read-only recovery subscription, `GET /api/chat/runs/{runId}/stream`, accepting the last confirmed cursor. The recovery request never re-creates or re-executes the run.

**Why**:

- The initial request carries a chat/Agent command body and therefore remains naturally modeled as `POST`.
- A reconnect is a read operation over an existing run and should not repeat model, Tool, resource or Agent execution.
- This matches the practical shape used by resumable agent products: Vercel AI SDK creates a stream with POST and exposes a separate GET stream endpoint for resume; LangGraph/LangSmith exposes a run/thread stream and replays after `Last-Event-ID`.
- Native browser `EventSource` is not a fit because it is GET-only and cannot carry the current POST body or the existing fetch authentication/abort behavior. The project can borrow SSE’s cursor and terminal semantics without changing media type to `text/event-stream`.

References: [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html), [Vercel AI SDK resume streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams), [LangGraph/LangSmith streaming](https://docs.langchain.com/langsmith/streaming).

## Decision 2: Use one fixed NDJSON event-envelope contract

**Decision**: Every successful stream response uses the versioned envelope. Each recoverable line contains transport metadata and the unchanged validated business chunk as `payload`; blank lines remain transport heartbeats. `Idempotency-Key` is required for every initial `POST /api/chat`. The `Accept` profile remains a client convention and response assertion, but the server does not select a raw fallback based on it.

```json
{
    "protocolVersion": 1,
    "eventId": "evt_...",
    "runId": "run_...",
    "sequence": 42,
    "payload": { "type": "text-delta", "partId": "answer", "delta": "hello" }
}
```

Heartbeats remain blank NDJSON lines, are not persisted and do not consume business sequence numbers. A terminal envelope carries terminal metadata and a final business chunk; the client stops retrying after it is accepted.

**Why**:

- OpenAI Responses exposes typed lifecycle events and `sequence_number`; Anthropic exposes typed lifecycle events, `ping` and explicit error events. The useful common denominator is a stable event identity/ordering field plus a terminal event, not the particular SSE framing.
- Wrapping the unchanged chunk avoids forcing every existing strict chunk schema to absorb transport fields and keeps the stream-core business protocol readable.
- A fixed envelope removes two parsers, two writer paths, and a class of partial-deployment bugs where the client and server disagree about whether a line carries cursor identity.
- This is an explicit pre-release cutover: old tabs, manual curl requests, and internal scripts that read raw chunks must be updated together with the webapp deployment.

References: [OpenAI Responses streaming](https://platform.openai.com/docs/api-reference/responses-streaming), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [stream-core compatibility ADR](../../docs/adr/0003-stream-core-backward-compatibility.md).

## Decision 3: `Last-Event-ID` semantics over fetch, with a query fallback

**Decision**: Recovery accepts `Last-Event-ID` as the preferred transport cursor, where the value is the last acknowledged event sequence for the requested `runId`. A numeric `after` query parameter is accepted as an explicit fetch-friendly fallback; if both are present they must agree or the request is rejected as invalid.

**Why**:

- `Last-Event-ID` is the established SSE reconnection vocabulary and is understandable to operators and future adapters even though this endpoint is NDJSON.
- A fetch client can set the header, unlike native EventSource’s inability to carry the project’s initial POST body.
- A cursor is only useful when the server has a bounded ordered event log; silent “continue from the nearest event” is unsafe because it hides data loss.

Reference: [WHATWG `Last-Event-ID` and reconnection](https://html.spec.whatwg.org/multipage/server-sent-events.html).

## Decision 4: PostgreSQL bounded event store for v0.4.10

**Decision**: Store idempotency records, generic stream-run metadata and recoverable public events in PostgreSQL through an app-local event-store port. Use an in-memory implementation only in unit tests and explicitly local development. Retain events for a bounded window with an indexable expiry timestamp and clean them up; keep terminal business state in the run record or existing business tables.

**Why**:

- PostgreSQL is already the project’s business persistence dependency and supports uniqueness, transactions, ownership filters and ordering guarantees needed here.
- A generic table is required because ordinary chat and Delivery Chain are not `AgentRun` records. It also respects the existing rule that LangGraph checkpoint tables are runtime state, not product event history.
- Redis Streams would offer a natural TTL/replay primitive, but adding Redis, deployment configuration, local setup and operational ownership is a larger scope than the v0.4.10 transport feature. The store port leaves that option open later.
- Persisting every heartbeat is unnecessary; it adds write load without improving recovery. Persist only public business chunks and lifecycle events.

References: [business state vs checkpoint ADR](../../docs/adr/0002-agent-run-business-state-vs-langgraph-checkpoint.md), [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

## Decision 5: At-least-once delivery plus client deduplication

**Decision**: The server provides ordered replay and stable `(runId, sequence, eventId)` identity. The client applies each event at most once to UI state by deduplicating sequence/event id and only advancing its acknowledged cursor after successful application. The guarantee is transport/event application exactly-once from the user’s perspective, not universal exactly-once for external Tool side effects.

**Why**:

- A disconnect can occur after the server sent bytes but before the browser persisted its cursor. Replaying from the last acknowledged event is therefore expected and must be safe.
- Retrying a whole POST would risk duplicate model calls, Agent runs and external side effects; recovery must only read the existing event log.
- Tools with side effects still need their own idempotency keys or business constraints; stream recovery cannot infer or undo them.

## Decision 6: Retry policy and expired cursors

**Decision**: Retry only transport failures, temporary service failures and explicitly retryable stream errors. Use bounded exponential backoff with jitter and a maximum attempt/time budget. Stop on invalid input, forbidden/not-found, idempotency conflict, version mismatch, expired cursor and non-retryable business/provider errors. If the cursor has expired, keep an active run running, return a safe `CURSOR_EXPIRED` result with final-state retrieval and restart guidance, and never silently skip events or cancel the run.

**Why**:

- SSE’s browser reconnect behavior is intentionally automatic, but agent products also need a permanent-error boundary and a user-visible stop state.
- The clarified v0.4.10 requirement explicitly rejects silent data loss and automatic cancellation on cursor expiry.

## Decision 7: Shared recovery storage, single active executor boundary

**Decision**: v0.4.10 persists run/event state in PostgreSQL and permits recovery reads from another webapp instance, but keeps one active execution in the long-lived Node.js process that created the run. A recovery request never becomes an executor. Explicit cancel is recorded as durable intent and observed by the active coordinator. Process-crash takeover, distributed execution leases and worker queues remain later-version work.

**Why**:

- This makes the feature’s real reliability guarantee explicit: client disconnect recovery is supported; server process failure recovery is not.
- It avoids the dangerous fallback of starting a second Agent/model execution when a different instance receives a recovery request.
- The persistence boundary remains useful for a future worker/coordinator implementation without pretending that a database event log alone can resume in-memory model execution.

## Open operational boundary carried into implementation

## Follow-up decisions (2026-07-28)

1. **Initial POST has a hard remaining-budget timeout**: 每次 initial POST 绑定监听页面取消信号的 attempt controller，并按 20 秒总预算的剩余时间 abort 在途 request；仅 timeout 进入未确认提交收口。
2. **Lifecycle owner decides whether EOF is recoverable**: `stream-reader` 保持协议读取职责；`use-chat-stream` 检查 terminal/paused 后决定是否 GET recovery。replay descriptor 的 direct GET 首次失败也走同一 recovery 入口。
3. **Created run setup failure projects a terminal event**: draft conversation 注册失败时，route 使用现有 projector 写入固定、安全的 `failed` lifecycle 后再抛出原始 route error。

The v0.4.10 coordinator keeps execution in the existing long-lived Node.js process and removes the request `AbortSignal` as the execution lifetime owner. PostgreSQL makes events and run metadata shareable, but this version does not promise execution recovery after a server process crash or introduce a worker queue. That boundary must be visible in the architecture docs and smoke checklist.
