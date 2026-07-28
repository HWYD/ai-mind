# Stream Resume Contract

## Fixed protocol

Every successful initial, recovery, and HITL-resume stream response uses the same versioned NDJSON event envelope. There is no raw `ChatStreamChunk` success mode.

The client sends:

```http
POST /api/chat
Idempotency-Key: <stable-client-request-id>
Accept: application/x-ndjson; profile="ai-mind-resumable-v1"
```

`Idempotency-Key` is mandatory for every initial `POST /api/chat`; a missing or blank key is a public request error. The server returns `X-Run-Id`, `X-Stream-Protocol: ai-mind-resumable-v1`, and NDJSON event envelopes. The `payload` is an unchanged, schema-validated `ChatStreamChunk`. The server does not choose a raw fallback based on `Accept`.

```json
{
    "protocolVersion": 1,
    "eventId": "evt_01J...",
    "runId": "run_01J...",
    "sequence": 42,
    "eventKind": "chunk",
    "payload": {
        "type": "text-delta",
        "partId": "answer",
        "delta": "hello"
    }
}
```

The server MAY send blank heartbeat lines between events. They have no `sequence` and are never replayed. The client must not advance its cursor for a heartbeat.

Streaming responses MUST keep the existing anti-buffering contract: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Content-Type: application/x-ndjson`, and blank heartbeat cadence no slower than the current 15 second interval while the subscription is open. Proxies and caches must not buffer replayed events or heartbeats.

Default retry policy for resumable clients is bounded: initial delay 500ms, multiplier 2, maximum single wait 8s, 20% jitter, and stop at the earlier of 8 attempts or 120s total retry budget. Permanent errors in the table below stop automatic retry immediately.

Default retention bounds for v0.4.10 are: an active run keeps a rolling window containing at least the most recent 10 minutes of recoverable events, maximum 20,000 retained recoverable events per run, and maximum 256 KiB persisted payload per event after public DTO validation. Event expiry is relative to event creation; the run boundary must cover the latest retained event. A run that reaches a retention or payload boundary must return a safe recovery-unavailable/final-state guidance result instead of silently dropping events or writing unbounded data.

## Initial POST behavior

- A new valid `Idempotency-Key` creates exactly one `StreamRequest` and one `StreamRun` before execution begins.
- The first request returns `200` with the envelope NDJSON stream and `X-Run-Id`.
- Repeating the key with the same request fingerprint returns `200 application/json`, never starts a second execution, and returns this replay descriptor:

    ```json
    {
        "kind": "stream-replay",
        "replayed": true,
        "runId": "run_01J...",
        "status": "running",
        "lastSequence": 42,
        "streamUrl": "/api/chat/runs/run_01J.../stream"
    }
    ```

    `status` is the current public run status; `lastSequence` is informational and the client must start recovery from its own last acknowledged cursor. If the original execution is still active, the client follows `streamUrl` with `Last-Event-ID`; if it is terminal, the same endpoint replays retained events or returns the documented cursor-expiry result.

- Repeating the key with a different fingerprint returns `409` with public code `IDEMPOTENCY_CONFLICT`.
- This is a pre-release protocol cutover. A browser tab, manual request, or internal script that expects raw chunk lines is unsupported after the deployment and must be refreshed or updated.

The client must branch on `Content-Type` after the POST response: `application/x-ndjson` means initial stream consumption; `application/json` with `kind: stream-replay` means follow the recovery URL. This avoids treating the duplicate descriptor as a malformed NDJSON chunk.

## Recovery GET

```http
GET /api/chat/runs/{runId}/stream
Last-Event-ID: 42
Accept: application/x-ndjson; profile="ai-mind-resumable-v1"
```

Equivalent fallback:

```http
GET /api/chat/runs/{runId}/stream?after=42
```

If both cursor forms are present they must match. The route authenticates the browser session before reading any event payload.

The response replays every retained event with `sequence > after`, then waits for newly appended events until a terminal event, explicit cancel, retention expiry or connection close. Events are delivered in ascending sequence order. Multiple subscriptions are read-only and do not create execution.

## Cursor and error semantics

| Condition                                | HTTP/public result              | Retry                                          |
| ---------------------------------------- | ------------------------------- | ---------------------------------------------- |
| Valid cursor                             | `200` NDJSON stream             | Continue until terminal                        |
| Missing/invalid run or ownership failure | `404/403`, safe public error    | No                                             |
| Cursor greater than server progress      | `409 CURSOR_AHEAD`              | No automatic retry; refresh run state          |
| Cursor before retained window            | `410 CURSOR_EXPIRED`            | No; retrieve final state or restart explicitly |
| Version mismatch                         | `409 VERSION_MISMATCH`          | No                                             |
| Temporary store/service failure          | `503` or retryable stream error | Bounded backoff with jitter                    |
| Transport disconnect while run is active | Connection ends                 | Yes, from last acknowledged cursor             |

`CURSOR_EXPIRED` must not cancel an active run or silently skip to the earliest retained event. The response should contain only safe fields such as `code`, `runId`, `runStatus`, `canRetrieveFinalState`, and `canRestart`; it must not reveal another run’s existence or content.

`CURSOR_EXPIRED` responses include `recoveryUnavailable: true` and may include `earliestRetainedSequence` when the retained event boundary caused the gap. This explicitly tells the client that the requested cursor can no longer be replayed and that it must retrieve final state or restart explicitly.

All initial request, recovery, cancel, and Agent resume errors use the same safe diagnostics shape. The public response may expose a human-readable `error` or `message`, but diagnostics contain only a generated diagnostic id, run/status/cursor identity, a bounded public error code, and retryability; raw provider errors, checkpoints, prompts, and secrets are never included.

## Terminal semantics

Terminal envelope metadata includes:

```json
{
    "terminal": true,
    "terminalState": "completed|failed|cancelled|rejected|version_mismatch"
}
```

Terminal mapping is fixed:

| Existing/lifecycle event       | Envelope state                                      | StreamRun status   |
| ------------------------------ | --------------------------------------------------- | ------------------ |
| `finish`                       | `terminal: true`, `terminalState: completed`        | `completed`        |
| run-level `error`              | `terminal: true`, `terminalState: failed`           | `failed`           |
| `agent-interrupt`              | `terminal: false`, `runStatus: paused`              | `paused`           |
| `agent-resume`                 | `terminal: false`, `runStatus: running`             | `running`          |
| `run-status: cancelled`        | `terminal: true`, `terminalState: cancelled`        | `cancelled`        |
| `run-status: rejected`         | `terminal: true`, `terminalState: rejected`         | `rejected`         |
| `run-status: version_mismatch` | `terminal: true`, `terminalState: version_mismatch` | `version_mismatch` |

`paused` is a recoverable Agent state. The client stops the current subscription while waiting for the explicit Agent resume operation, then the existing `POST /api/agent-runs/{runId}/resume` continues the same `StreamRun` and event sequence. It must not allocate another stream-run id.

The client stops automatic reconnection after a terminal event, permanent error, explicit user cancel or expired cursor. A network disconnect alone never produces a terminal business state.

## Cancel contract

```http
POST /api/chat/runs/{runId}/cancel
Content-Type: application/json
```

The route requires current-session ownership and an explicit user action. It is separate from stream disconnect and idempotent for the same run. The server records durable cancel intent and signals the run-scoped execution controller. The client may stop its local stream and retry loop optimistically; the execution/projector path appends the safe terminal cancellation event when the run has actually reached its cancellation outcome.

Page refresh or close is not a recovery subscription trigger in v0.4.10. A later page load may read an already-persisted final business result through normal conversation hydration, but it does not rejoin an active stream.

## Deployment boundary

The v0.4.10 executor must run in a long-lived Node.js process. Shared PostgreSQL allows a recovery GET on another instance to replay persisted events, but this version does not promise execution takeover after process crash or cross-instance executor coordination. The implementation must not start a second execution merely because a recovery request lands on another instance.
