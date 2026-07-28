# Data Model: Resumable Agent Streams

This model describes transport recovery state. It does not replace `AgentRun`, `AgentInterrupt`, GraphState or LangGraph checkpoint storage.

## Entity: StreamRequest

Represents one client-intended initial operation and provides idempotency lookup.

| Field                     | Type        | Rules                                                                                       |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `id`                      | UUID/string | Internal identifier.                                                                        |
| `ownerSessionHash`        | string      | Hash of the current browser session; never expose the raw session cookie.                   |
| `idempotencyKey`          | string      | Client-stable key, normalized and length-limited. Unique with `ownerSessionHash`.           |
| `requestFingerprint`      | string      | Hash of the normalized operation kind and input; mismatch is a public idempotency conflict. |
| `runId`                   | UUID/string | Unique link to `StreamRun`.                                                                 |
| `createdAt` / `expiresAt` | timestamp   | Idempotency retention is bounded.                                                           |

An idempotency record cannot expire while its run is active. After the run is terminal, its expiry is no earlier than the stream retention boundary. Once both the idempotency record and retained events have expired, reusing the same client key starts a new bounded idempotency scope; the old run is not re-executed.

## Entity: StreamRun

Generic execution identity shared by ordinary chat, Tasklist Agent and Delivery Chain.

| Field                                     | Type                   | Rules                                                                                                                                    |
| ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                      | UUID/string            | Stable public `runId`; opaque and non-guessable.                                                                                         |
| `kind`                                    | enum                   | `chat`, `tasklist_agent`, `delivery_chain`.                                                                                              |
| `ownerSessionHash`                        | string                 | Every read/cancel query filters by this value.                                                                                           |
| `requestId`                               | UUID/string            | Unique link to `StreamRequest`.                                                                                                          |
| `agentRunId`                              | UUID/string nullable   | Optional link to existing Tasklist `AgentRun`; not a replacement for it.                                                                 |
| `status`                                  | enum                   | `running`, `paused`, `completed`, `failed`, `cancelled`, `rejected`, `version_mismatch`.                                                 |
| `lastSequence`                            | integer                | Highest persisted recoverable event sequence; updated atomically with append.                                                            |
| `terminalSequence`                        | integer nullable       | Set only when the run reaches a terminal stream state.                                                                                   |
| `retentionUntil`                          | timestamp              | Rolling recovery boundary for the active run; it must cover the latest retained event plus at least 10 minutes. Cleanup remains bounded. |
| `executionOwnerId`                        | opaque string nullable | Internal executor/instance identity; never exposed. v0.4.10 does not perform automatic takeover.                                         |
| `cancelRequestedAt`                       | timestamp nullable     | Durable explicit-cancel intent, separate from transport disconnect.                                                                      |
| `failureCode` / `publicFailureMessage`    | safe string nullable   | Public, sanitized error fields only.                                                                                                     |
| `createdAt` / `updatedAt` / `completedAt` | timestamp              | Lifecycle and diagnostics.                                                                                                               |

Invariants:

1. `id` never changes and is the only run identity used by recovery.
2. `lastSequence` is monotonic and agrees with the greatest persisted event sequence.
3. `terminalSequence` is immutable once set; terminal runs are never re-executed by a subscription.
4. `paused` is recoverable business state for HITL; it is not equivalent to cancelled.
5. The record contains no raw checkpoint or full GraphState.
6. For Tasklist Agent, `StreamRun.id` is the existing `AgentRun.id`; `agentRunId` points to that same business run so existing chunk `runId` fields remain stable. Ordinary chat and Delivery Chain allocate their own opaque stream-run ids.
7. `executionOwnerId` is an execution diagnostic/lease boundary, not a public routing contract. A process crash leaves the run recoverable for final-state lookup but does not trigger a second executor.
8. Every persisted public event is delivered as a `StreamEventEnvelope`. Raw `ChatStreamChunk` lines are an unsupported pre-cutover transport form; the unchanged chunk remains the envelope `payload`.

## Entity: StreamEvent

One replayable public event in a run’s bounded log.

| Field                     | Type        | Rules                                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                      | UUID/string | Stable `eventId`, unique per event.                                                                                                              |
| `runId`                   | UUID/string | Foreign key to `StreamRun`.                                                                                                                      |
| `sequence`                | integer     | Starts at 1 per run; unique with `runId`; never reused.                                                                                          |
| `eventKind`               | enum        | `chunk`, `lifecycle`, `terminal`. Heartbeats are not rows.                                                                                       |
| `protocolVersion`         | integer     | Fixed public envelope version.                                                                                                                   |
| `payload`                 | JSON        | Strictly validated public `ChatStreamChunk` or bounded lifecycle payload.                                                                        |
| `createdAt` / `expiresAt` | timestamp   | Each event expires relative to its own creation time; cursor expiry is determined by the earliest retained sequence and the active run boundary. |

Append transaction:

1. Lock or atomically update the owning run’s `lastSequence`.
2. Allocate `lastSequence + 1`.
3. Validate and insert the public event with `(runId, sequence)` uniqueness.
4. Commit the event and run sequence together.

If a concurrent append loses the race, retry the append transaction; never generate a second sequence for the same logical event. Execution-level duplicate prevention remains the responsibility of the coordinator and idempotent Tool boundaries.

## Lifecycle and terminal payloads

The envelope contract allows either an existing `ChatStreamChunk` or a strict `StreamLifecyclePayload`:

- `agent-interrupt` chunk plus `runStatus: paused` is a non-terminal lifecycle event.
- `agent-resume` chunk plus `runStatus: running` is a non-terminal lifecycle event.
- `finish` chunk plus `terminalState: completed` is the successful terminal event.
- A run-level `error` chunk plus `terminalState: failed` is a failed terminal event.
- A strict `{ type: "run-status", status: "cancelled|rejected|version_mismatch" }` payload is used when no existing business chunk can express the terminal state.

`terminal: true` is required exactly when `terminalState` is present. `StreamRun.status`, envelope `runStatus`, and the terminal payload must agree; a mismatch is rejected before persistence or client application.

## Client-side entity: RecoveryCursor

Not a permanent server record. The client stores:

- `runId`
- `lastAcknowledgedSequence`
- `lastEventId` (optional consistency check)
- `protocolVersion`
- client retry attempt/deadline and terminal state

The client updates the cursor only after the event has passed schema validation and has been applied to reducer state. A repeated event is ignored; a gap, future cursor or mismatched event id is a protocol error requiring a fresh server read, not silent advancement.

## Client-side entity: StreamSubscription

Ephemeral connection state: `initial`, `connected`, `disconnected`, `reconnecting`, `paused`, `cancel_requested`, `terminal`, `recovery_unavailable`, `failed`. It controls fetch lifecycle and UI messaging only; it does not define `StreamRun.status`.

## State transitions

```text
initial request
    -> running
    -> paused              (Agent interrupt / review boundary)
    -> running             (explicit Agent resume)
    -> completed | failed | cancelled | rejected | version_mismatch

transport connection
    -> connected
    -> disconnected -> reconnecting -> connected
    -> recovery_unavailable (expired cursor / permanent recovery error)
```

Network disconnect changes only `StreamSubscription`; it must not change `StreamRun.status`.

The visible client cancel interaction is optimistic: it stops the local stream/retry immediately. `cancelRequestedAt` is durable server intent; only the execution/projector path may append the actual terminal cancellation outcome.

## Execution and deployment boundary

## Follow-up lifecycle invariants

- Initial submission budget 从第一次 POST 开始累计；每个 attempt 的 timeout 等于剩余预算，timeout 不得 abort 页面 controller。
- `StreamSubscription` 只有在已收到 terminal 或 paused lifecycle 后才能将 reader EOF 当作正常结束；其余 EOF 必须进入 GET recovery。
- replay descriptor 取得 `runId`、`streamUrl` 后属于 known-run subscription，后续只能 GET recovery。
- 已创建但无法完成 draft conversation 注册的 `StreamRun` 必须持久化为 `failed` 并有对应 public lifecycle event。

The initial POST starts one execution on the supported long-lived Node.js process. Recovery GET may read the shared PostgreSQL event log from another instance, but v0.4.10 does not transfer execution ownership after process failure. An explicit cancel writes `cancelRequestedAt`; the active coordinator observes it and signals its run-scoped controller. Worker queues, automatic takeover and cross-instance execution leases are later-version work.
Implementation note: `StreamRun.agentRunId` is enforced by a database foreign key and unique index. It remains nullable for ordinary chat and Delivery Chain. The event store never invents an AgentRun id; Tasklist projection supplies the already-created `AgentRun.id` explicitly and rejects mismatches before inserting the event.
