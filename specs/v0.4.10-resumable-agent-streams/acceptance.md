# Acceptance: Resumable Agent Streams

## Purpose

记录 v0.4.10 resumable stream 的 smoke verification、关键测试命令和 release closing 证据。本文档只保存验收事实，不扩展 `spec.md`、`plan.md` 或 `tasks.md` 的产品范围。

## Smoke Verification Notes

T049 使用 automated controlled smoke / targeted integration coverage 完成，不依赖真实生产模型调用。

- Ordinary chat controlled disconnect/reconnect: PASS。`chat-and-delivery-chain.integration.test.ts` 覆盖 ordinary chat 在 cursor 后 replay、dedup 和 terminal completed。
- Delivery Chain controlled disconnect/reconnect: PASS。`chat-and-delivery-chain.integration.test.ts` 覆盖 Delivery Chain workflow progress、same run replay 和 terminal completed。
- Tasklist Agent controlled disconnect/reconnect: PASS。`agent-runs/stream-recovery.integration.test.ts` 覆盖 Agent interrupt -> paused、resume continuation、terminal finish 和 failure boundary。
- Duplicate POST: PASS。`idempotency-route.test.ts` 覆盖 concurrent same POST、JSON replay descriptor、409 conflict、mandatory `Idempotency-Key` 和 fixed-envelope contract；PostgreSQL race 覆盖保留在 `idempotency-concurrency.integration.test.ts`。
- Explicit cancel: PASS。`runs-cancel-route.test.ts` 覆盖 cancel intent、idempotent terminal cancellation 和 safe public response；`all-streams-control-state.integration.test.ts` 覆盖三类 stream 的 terminal cancellation。
- Cursor expiry: PASS。`runs-stream-route.test.ts`、`stream-event-store.test.ts` 和 `all-streams-control-state.integration.test.ts` 覆盖 `CURSOR_EXPIRED`、safe final-state/restart guidance 和 no infinite retry。
- Fixed envelope cutover: PASS。无论是否携带 `Accept` profile，带有效 `Idempotency-Key` 的 `POST /api/chat` 都创建或复用 `StreamRun` 并只返回 envelope；缺失 key 安全失败，不存在 raw NDJSON fallback。

## Test Command Notes

- `@ai-mind/stream-core` tests: PASS。`pnpm --filter @ai-mind/stream-core test`，6 files / 29 tests passed。
- `@ai-mind/stream-core` typecheck: PASS。`pnpm --filter @ai-mind/stream-core typecheck`。
- Webapp targeted Vitest: PASS。
    - Stable: `pnpm --filter @ai-mind/webapp exec vitest run --config vitest.stable.config.ts`，128 files / 860 tests passed。
    - Integration: `pnpm --filter @ai-mind/webapp exec vitest run --config vitest.integration.config.ts`，9 files / 27 tests passed（本地 PostgreSQL）。
- Webapp typecheck: PASS。`pnpm --filter @ai-mind/webapp typecheck`。
- Webapp lint: PASS with existing warnings。`pnpm --filter @ai-mind/webapp lint`，0 errors / 5 existing Fast Refresh warnings。
- Build: PASS。`pnpm --filter @ai-mind/webapp build`，Next production build completed。

## Release Closing Notes

T051 / `speckit-converge` 已执行。Convergence 发现 FR-050-015 的 safe diagnostics response coverage 存在 partial gap，已追加并完成 T052。

- Remaining task gaps: PASS。T052–T091 已完成，tasks.md 无未勾选任务；safe diagnostics、initial POST recovery、EOF/replay recovery 和 orphan-run terminalization 均有对应测试。
- Documentation sync: PASS。ADR-0015、Stream Recovery Architecture、v0.4.10 version doc 和 release note 已同步 POST/NDJSON + GET recovery、bounded event store、AgentRun/checkpoint 分离、process-crash boundary、deployment/migration 前提和 non-goals。
- Known non-goals confirmed: PASS。v0.4.10 仍不承诺 process-crash active executor takeover、worker queue、native EventSource migration、无限历史或 external Tool side effect exactly-once。

## Convergence Status (2026-07-24)

**PASS**. The prior `NEEDS_CHANGES` convergence gaps are closed without expanding the v0.4.10 non-goals.

- Execution lifetime: resumable POST transport abort is isolated from the run-scoped executor; pre-start disconnect and explicit durable cancel are covered.
- Terminal semantics: local `tool` / `resource` / `prompt` errors continue the run, while request/runtime and unexpected executor failures persist a failed terminal event. Cancel records intent first and emits the final cancellation outcome only after execution observes it.
- Protocol safety: a response that declares `ai-mind-resumable-v1` must contain envelopes; cursor identity, sequence gaps and protocol version are validated before UI application.
- Persistence: active appends extend rolling retention; count cleanup uses bounded batches while preserving recovery-floor errors. The local PostgreSQL migration applied `resumable_streams` and `stream_agent_run_link`; FK `ON DELETE SET NULL` and unique nullable AgentRun linkage were verified.
- Idempotency: a real PostgreSQL concurrent request test produced one created StreamRun and replay descriptors for the other requests; the database unique constraint and P2002 recovery path were exercised.

## Final Verification Evidence

- Final `speckit-converge`: converged; no new actionable implementation gaps were found, so no Phase 12 tasks were appended.
- Webapp stable: `vitest run --config vitest.stable.config.ts` — 128 files / 860 tests passed.
- Webapp integration with local PostgreSQL: `vitest run --config vitest.integration.config.ts` — 9 files / 27 tests passed.
- Targeted real PostgreSQL StreamRun test: 2 tests passed, covering the unique-key race and AgentRun FK/unique/nullable behavior.
- Database Prisma integration: 1 file / 2 tests passed; migrations reported successfully applied.
- Stream core: 6 files / 29 tests passed; typecheck passed.
- Webapp typecheck and production build passed. Lint has 0 errors and 5 pre-existing Fast Refresh warnings.
- `git diff --check` passed.
- 2026-07-28 release-doc repair verification：Spec Kit prerequisites passed；人工等价 analyze/converge 检查确认 91 个任务全部完成、无新的可执行缺口，未追加新任务。

## Fixed Envelope Cutover Closing (2026-07-27)

- PASS。有效 `Idempotency-Key` 的初始 POST、recovery GET 和 HITL resume 统一使用 versioned envelope；raw one-shot fallback 已移除。

## Initial POST Recovery Evidence (2026-07-28)

- Same-page initial POST response-loss recovery: PASS。首次 transport failure、`408/502/503/504` 与成功但无 body 的 response 使用不变的 `Idempotency-Key` 和 payload 重试；replay descriptor 改走 existing GET recovery，不生成重复可见消息。
- Focused tests: `pnpm vitest run tests/components/instamind/use-chat-stream.test.tsx tests/components/instamind/chat-stream/stream-reconnect-policy.test.ts` PASS（31 tests）；`pnpm vitest run tests/app/api/chat/idempotency-route.test.ts` PASS（3 tests）；`pnpm typecheck` PASS。
- Follow-up closure: PASS。T085–T091 已完成，覆盖 hard in-flight timeout、non-terminal EOF、replay first-GET recovery 和 draft-registration orphan-run terminalization。

## Review Gap Closure Verification (2026-07-28)

- `pnpm vitest run tests/components/instamind/use-chat-stream.test.tsx`: PASS（1 file / 29 tests）。覆盖 initial POST budget abort、non-terminal EOF recovery、replay first-GET recovery，并回归 Tasklist pause/resume 与用户取消。
- `pnpm vitest run tests/app/api/chat/route.test.ts`: PASS（1 file / 18 tests）。覆盖 draft conversation 注册失败后向已创建 run 投影安全 `failed` lifecycle。
- `pnpm typecheck`: PASS。
- `pnpm eslint components/instamind/use-chat-stream.ts app/api/chat/route.ts tests/app/api/chat/route.test.ts`: PASS。
- `git diff --check`: PASS。
- 全文件 lint 未作为本次阻断项：`tests/components/instamind/use-chat-stream.test.tsx` 在本次之前已有大量 Prettier 错误，未自动格式化以避免改写无关的既有测试内容。

- `pnpm --filter @ai-mind/stream-core test`: PASS（6 files / 29 tests）。
- Webapp stable targeted fixed-envelope suite: PASS（6 files / 56 tests），覆盖 writer/schema、initial POST、duplicate POST、reader、useChatStream 和 HITL resume。
- Webapp controlled recovery integration: PASS（2 files / 4 tests），覆盖 ordinary/Delivery Chain 与 Tasklist Agent recovery。
- `pnpm --filter @ai-mind/stream-core typecheck` 与 `pnpm --filter @ai-mind/webapp typecheck`: PASS。
- `pnpm --filter @ai-mind/webapp lint`: PASS（无新增 lint error）。
- 额外回归：终态 `runtime` error 进入 `failed` envelope 后不再触发 recovery GET；暂停的 HITL run 与后续 resume 保持同一 `runId` 且 sequence 连续。
