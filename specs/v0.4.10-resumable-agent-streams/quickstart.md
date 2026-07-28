# Quickstart: Resumable Agent Streams

## Prerequisites

1. Use the repository’s normal Node/pnpm environment.
2. Configure the existing PostgreSQL connection and run the database migration generated for v0.4.10.
3. Start the webapp with the normal development command.

Before starting the webapp, apply both the Prisma migration and the LangGraph runtime schemas, then restart any existing webapp process:

```powershell
pnpm --filter @ai-mind/database db:migrate:deploy
pnpm --dir apps/webapp db:runtime-checkpoints:setup
```

## Manual recovery flow

1. Start an ordinary chat, Tasklist Agent or Delivery Chain request with a stable, non-empty `Idempotency-Key`. The client may send the documented `Accept` profile, but every successful response is an envelope stream regardless of that header.
2. Save the returned `runId` and the last envelope `sequence` applied by the client.
3. Stop only the client reader or simulate a network drop; do not call cancel.
4. Reconnect with `GET /api/chat/runs/{runId}/stream` and `Last-Event-ID: {lastAcknowledgedSequence}`.
5. Verify that retained events are replayed in order, duplicates are ignored, new events continue, and the original execution is not started again.
6. Verify that a terminal event stops reconnect attempts and exposes the same final state as an uninterrupted stream.

## Error checks

- Repeat the initial POST with the same key and identical input: it must identify/reuse the original run rather than start a second execution.
- Omit `Idempotency-Key` from an initial POST: expect a safe request error; it must never fall back to a raw one-shot stream.
- Inspect the duplicate POST response: it must be `200 application/json` with `kind: stream-replay`, `runId` and `streamUrl`; the client must then resume through the GET endpoint.
- Repeat with the same key but different input: expect a public idempotency conflict.
- Use another browser session’s run id: expect a safe not-found/forbidden response without event content.
- Use a cursor older than retention: expect `CURSOR_EXPIRED`, continued execution for an active run, and final-state/restart guidance.
- Click cancel while reconnecting: the retry loop stops immediately and the run reaches an explicit cancellation outcome or an explicit cancellation failure.

## Verification order

```text
stream-core contract tests
  -> Prisma schema/migration and event-store concurrency tests
  -> route/recovery/cancel tests
  -> client reader/reducer/UI tests
  -> typecheck + lint + build
  -> controlled disconnect/reconnect smoke test
```

The smoke test must cover all three stream families: ordinary chat, Tasklist Agent and Delivery Chain.

Also run the maintained cloud-model smoke script and verify that it consumes `envelope.payload`; a raw-line parser is not a supported client after this pre-release cutover.

The smoke environment must use a long-lived Node.js webapp process. Do not treat a process crash or automatic executor takeover as a v0.4.10 acceptance scenario.

## Lifecycle scope

## Initial POST and EOF follow-up checks

1. 挂起 initial `POST /api/chat`，推进 20 秒预算；验证该 attempt 被 abort，界面显示未确认提交失败，且没有第二个 POST。
2. 让初始或 recovery 流在 non-terminal event 后正常 EOF；验证客户端用最后 cursor 发起 GET 并消费后续 terminal envelope。
3. 对 `stream-replay` descriptor 让首次 GET 失败、下一次成功；验证仅有一个 POST，后续为 GET recovery。
4. 模拟 draft conversation 注册失败；验证已创建 StreamRun 写入安全 `failed` lifecycle，而 route 仍返回既有安全错误。

Refresh or close the page during an active run. The next page load must not reattach an active subscription; if a final result was already persisted, normal conversation hydration may show it.

Click cancel while reconnecting: the local reader/retry stops immediately without a visible cancelling phase; the server first acknowledges cancel intent and the active executor later reaches an explicit cancellation outcome or an explicit cancellation failure.
