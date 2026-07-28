# Implementation Plan: Resumable Agent Streams

**Branch**: `[v0.4.10-resumable-agent-streams]` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/v0.4.10-resumable-agent-streams/spec.md`

## Summary

为当前所有 NDJSON 流（普通聊天、Tasklist Agent、Delivery Chain）增加可恢复的 run、事件序号、幂等请求、断线重连和有限事件重放能力。初始连接继续使用现有 `POST + application/x-ndjson`；同一页面生命周期内断线后通过独立的 `GET /api/chat/runs/{runId}/stream` 订阅入口恢复，不重新执行原请求。页面刷新或关闭后的活动 run 不要求重新订阅，已持久化的最终业务结果仍由普通会话 hydration 查询。

实现采用 PostgreSQL 持久化 `StreamRun`、幂等请求和 bounded `StreamEvent`，以支持当前部署下的重连及未来多实例路由；运行时执行状态仍与 LangGraph checkpoint、`AgentRun` 业务状态分离。恢复模式使用协商后的 NDJSON event envelope，保留原有 `ChatStreamChunk` 作为 envelope payload；旧的一次性消费者继续消费原始 chunk 行。客户端保存 `runId` 与最后确认的事件序号，使用有限次数、指数退避和 jitter 重连，并对事件做幂等去重。

## Technical Context

**Language/Version**: TypeScript, Node.js, Next.js 16, Prisma

**Primary Dependencies**: `@ai-mind/stream-core`, `@ai-mind/database`, Zod, Vitest, PostgreSQL

**Storage**: 使用 PostgreSQL 保存 stream request/run/event 记录；in-memory adapter 仅用于单元测试和明确选择的本地开发场景。LangGraph PostgresSaver 继续负责 checkpoint storage，不作为 stream event log。

**Testing**: 先执行 Vitest contract/unit tests、webapp route 和 stream integration tests、Prisma migration validation，再执行 `pnpm typecheck`、针对性 lint/build 和 smoke verification。

**Target Platform**: 浏览器 fetch client 和长生命周期 Node.js/Next.js server runtime；以同源 browser session 作为 ownership 边界。

**Project Type**: 包含共享 stream protocol package 和 Prisma database package 的 monorepo web application。

**Performance Goals**: 95% 的受控断线场景在 10 秒内恢复事件交付；事件顺序和去重结果保持确定性；heartbeat 继续按现有 15 秒节奏发送；取消确认在 5 秒内对用户可见。

**Constraints**: 不引入 native `EventSource`、SSE migration、WebSocket 或新的 queue service。client disconnect 不得被解释为 business cancellation。事件保留必须采用 active run 最近至少 10 分钟的滚动事件窗口；默认 per-run retained event 上限为 20,000，单个 persisted event payload 上限为 256 KiB，达到上限时必须返回 safe recovery-unavailable/final-state guidance，而不是无限写入。用户点击取消时沿用现有 optimistic stop UI，客户端立即停止本地流和重试，服务端异步收口实际 run 状态。public payload 必须通过 strict schema，且不得暴露 checkpoint、provider、cookie、prompt 或 secret data。Streaming response 必须继续使用 `Cache-Control: no-cache, no-transform`、`X-Accel-Buffering: no` 和不超过 15 秒的 blank heartbeat，代理/缓存层不得缓冲 NDJSON replay 或 heartbeat。

**Scale/Scope**: 由 ordinary chat、Tasklist Agent 和 Delivery Chain 共享一个 generic stream-run abstraction；允许一个 initial subscription 和多个只读 recovery subscriptions。执行器要求运行在当前生产拓扑中的单个长生命周期 Node.js webapp process 中。基于 PostgreSQL 的 recovery read 可以由其他 instance 提供，但 v0.4.10 不提供 process-crash takeover 或 cross-instance execution coordination。本版不提供 permanent history 或 arbitrary replay；页面刷新/关闭后的活动 run 重接也不在范围内。

## Constitution Check

_Gate: Must pass before Phase 0 research and re-check after Phase 1 design._

| Principle                               | Status                  | Evidence / design constraint                                                                                                                  |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlled Agent First                  | PASS                    | Recovery 和 cancel 都是显式且经过认证的 API operation；stream subscription 不授予 execution control，也不允许跨 session 访问。                |
| GraphState Is Runtime Source of Truth   | PASS                    | Stream event 只包含经过清理的 public chunk；不持久化 GraphState adapter 或 raw runtime state。                                                |
| Review Node Must Be Side-effect Free    | PASS                    | Event append 和 business status transition 保留在 runner/coordinator/service 边界内，不放入 graph review node。                               |
| Business State and Checkpoint Separate  | PASS                    | `StreamRun`/`StreamEvent` 只是 transport recovery records；`AgentRun` 继续表示 business state，PostgresSaver 继续表示 checkpoint state。      |
| Stream Compatibility Is Hard Constraint | PASS                    | 保留现有 POST/NDJSON 和 chunk payload 语义；新 envelope 通过协商启用，并同步更新 stream-core、writer、schema、reducer、UI 和 contract tests。 |
| Public DTO Strict and Safe              | PASS                    | Envelope schema 只允许规定的 run metadata，并包装已校验的 public chunk；diagnostics 只使用 opaque identifier 和 safe error code。             |
| Minimal Abstraction                     | PASS with bounded scope | 因为 ordinary chat、Agent、Delivery Chain 共用恢复能力，引入一个 event-store port 有明确业务价值；不引入 generic message-bus abstraction。    |
| Tests Before Broad Integration          | PASS                    | 按 contract/schema → persistence → runtime/route → client reducer/UI → typecheck/lint/build/smoke 的顺序推进。                                |
| Spec Drift Blocked                      | PASS                    | Prisma schema、stream protocol、API contract、ADR/architecture notes 和 public docs 都被列为显式输出。                                        |

## Project Structure

### Documentation (this feature)

```text
specs/v0.4.10-resumable-agent-streams/
├── plan.md                    # 当前 implementation plan
├── research.md                # Phase 0 决策和外部 protocol reference
├── data-model.md              # Stream request/run/event 和 cursor model
├── quickstart.md              # 本地 setup 和 recovery verification flow
├── contracts/
│   └── stream-resume-contract.md  # HTTP 和 NDJSON recovery contract
├── checklists/                # 当前 feature 的 checklist
├── acceptance.md              # smoke verification 和 release closing evidence
└── tasks.md                   # 后续由 speckit-tasks 创建
```

### Source Code (repository root)

```text
packages/stream-core/src/
├── protocol/
│   ├── chat-stream-chunk.ts       # 保持现有 business chunk types 稳定
│   └── stream-event.ts            # Public resumable envelope、lifecycle payload 和 metadata schema/types
├── adapters/web/
│   └── chunk-writer.ts             # Fixed envelope NDJSON writer
└── ...

packages/database/prisma/
├── schema.prisma                   # StreamRequest、StreamRun、StreamEvent tables
└── migrations/                     # Bounded retention indexes 和 uniqueness constraints

apps/webapp/lib/ai/
├── stream-recovery/
│   ├── contracts.ts                 # Public API/error/cursor schemas
│   ├── stream-event-store.ts        # Storage port 以及 Postgres/in-memory adapters
│   ├── stream-run-service.ts        # Ownership、idempotency、lifecycle 和 cursor rules
│   ├── stream-execution-coordinator.ts  # Run-scoped execution/cancel 分离
│   └── stream-event-projector.ts    # Sanitized chunk 到 persisted event 的边界
├── chat-service.ts                   # 在不绑定 request lifetime cancellation 的前提下持久化和投影事件
└── stream-chunk-schema.ts            # 固定 envelope 与 payload schema

apps/webapp/app/api/
├── chat/route.ts                    # Initial POST 兼容和 idempotency handoff
├── chat/runs/[runId]/stream/route.ts # Recovery GET subscription 和 replay
├── chat/runs/[runId]/cancel/route.ts # 用户显式 cancellation
└── agent-runs/[runId]/resume/route.ts # 现有 HITL resume，接入同一个 StreamRun

apps/webapp/components/instamind/
├── chat-stream/stream-reader.ts     # Fixed envelope NDJSON parsing/dedup
├── chat-stream/stream-reconnect.ts  # Backoff、jitter、retry classification 和 cursor
└── use-chat-stream.ts                # Run/subscription state 和 user-visible status
```

**Structure Decision**: protocol definition 放在 `packages/stream-core`，持久化访问封装在 app-local `stream-recovery` boundary，API route 保持薄层。generic `StreamRun` 有意与 `AgentRun` 分离；Tasklist Agent 可以同时关联两者，而 ordinary chat 和 Delivery Chain 不需要伪造 Agent business record。

## Delivery Phases

### Phase 0 — Research and decisions

1. 调研 SSE/EventSource、OpenAI/Anthropic typed streaming、Vercel resumable streams 以及 LangGraph `Last-Event-ID` replay patterns。
2. 记录为什么 fetch POST + 独立 GET subscription 最适合当前 repository，为什么选择 PostgreSQL 而不是引入 Redis，以及 external Tool side effect 在 “at-least-once transport + client dedup” 下的语义。
3. 在 `research.md` 和 `contracts/` 中锁定 negotiated envelope、cursor semantics、retry classification、retention 和 ownership rules。

### Phase 1 — Contract, persistence and runtime design

1. 向 `stream-core` 增加 additive stream event types 和 schemas，包含 event id、monotonic sequence、run id、protocol version、terminal metadata 以及 heartbeat distinction。
2. 增加 idempotent client request、generic stream run 和 bounded stream event 对应的 Prisma models 与 migration；在数据库中保证 owner/request uniqueness 和 `(runId, sequence)` uniqueness，并定义 retention cleanup 与 idempotency expiry behavior。
3. 实现 event-store 和 run-service boundary：按 idempotency key create-or-reuse；为 duplicate POST 返回已定义的 replay descriptor；原子 append；支持 read-after-cursor；识别 expired/future cursor；提供安全的 final-state retrieval；执行 browser-session ownership 校验。
4. 重构 execution lifetime，使 disconnected reader 不会 abort run；只有 explicit cancel 或 execution failure 才能改变 business state。现有 `AgentRunService.beginResume` 和 `chatService.resumeAgentRun` 必须把 continuation event append 到同一个 Tasklist `StreamRun`，不得创建第二个 stream run。AgentRun 和 checkpoint transition 仍由现有 owner 负责。
5. 保留 `/api/chat` 作为 initial POST stream；增加 recovery GET 和 explicit cancel route，并让现有 `agent-runs/[runId]/resume` route 使用同一个 event projector。Recovery 必须 replay retained event、poll 新 append event、发送不占 sequence 的 blank heartbeat，并在 terminal event 后关闭；客户端只在同一页面生命周期内自动重连。
6. 定义并校验 lifecycle/terminal envelope：`finish` 映射为 `completed`，run-level `error` 映射为 `failed`，`agent-interrupt` 映射为 non-terminal `paused`，explicit reject/cancel/version mismatch 映射为对应 terminal state；同时保证 terminal metadata 与 `StreamRun.status` 一致。
7. 更新 webapp reader/reducer/UI：保存 run id 和 last applied sequence；识别 duplicate-POST JSON descriptor；忽略 duplicate envelope；安全处理 gap/future cursor；执行 retryable/permanent error policy；区分 disconnected、recovering、running、paused、cancelled 和 terminal state。取消按钮沿用现有乐观终止交互，不新增可见的 cancelling 中间态；本地快照与服务端最终结果优先级问题延后。
8. 根据 protocol、database、deployment boundary 和 user-visible behavior 的变化，同步更新 ADR/architecture 和 public version documentation。

### Phase 2 — Verification and release closing

1. 先运行 contract/schema 和 stream-core writer tests。
2. 再运行 persistence concurrency/retention/ownership tests，然后运行 runtime、route 和 subscription tests。
3. 运行 ordinary chat、Tasklist Agent 和 Delivery Chain 的 frontend reducer/UI tests。
4. 最后运行 typecheck、lint、build 和 controlled disconnect/reconnect smoke tests；版本收口前执行 `speckit-converge`。

## Post-Design Constitution Check

_Result after Phase 1 artifacts: PASS._

- generic stream persistence model 只表示 transport recovery state，不接管 `AgentRun`、`AgentInterrupt`、GraphState 或 LangGraph checkpoint 的职责。
- negotiated envelope 保留现有 business chunk，并明确 compatibility boundary；contract 要求在 rollout 前同步完成 stream-core、schema、writer、reducer 和 route tests。
- ownership、safe public DTO、cursor expiry 和 explicit cancel 都属于 route contract，而不是隐含在 client behavior 中。
- 唯一新增的 cross-cutting abstraction 是 event-store port；它服务三个当前 NDJSON stream family，并封装在 `apps/webapp/lib/ai/stream-recovery/` 内。
- no worker-based crash recovery 作为 v0.4.10 的边界被明确记录，不被描述为系统保证。
- duplicate POST 已定义 JSON descriptor path；Tasklist HITL continuation 保持原 run identity；terminal/lifecycle mapping 作为 public contract invariant 校验。

## Protocol Cutover Addendum (2026-07-27)

### Decision

v0.4.10 is still in the product-sharing pre-release window. `POST /api/chat` therefore moves from negotiated resumability to one fixed `ai-mind-resumable-v1` envelope contract. A valid, non-empty `Idempotency-Key` is required for every initial request. `Accept: application/x-ndjson; profile="ai-mind-resumable-v1"` remains the documented client assertion, but server behavior no longer branches on it.

This addendum supersedes earlier references in this historical plan to negotiated rollout, legacy one-shot consumers, raw writer/parser support, and compatibility fallback. Those earlier references describe the already-completed first implementation pass; they are not v0.4.10's final protocol contract.

### Required implementation changes

1. Remove the raw one-shot branch from the route, chat service and `@ai-mind/stream-core` web writer. Every successful line emitted by these paths is a validated `StreamEventEnvelope`; blank heartbeats remain transport-only.
2. Remove the frontend legacy parser branch. The reader validates event identity, protocol version, run id and sequence for all successful stream lines before applying `payload`.
3. Keep the existing replay-descriptor JSON response for duplicate idempotent POSTs, recovery GET and same-run HITL resume semantics. These are already part of the envelope protocol and are not legacy compatibility paths.
4. Update the maintained cloud-model smoke client, contract tests, route tests and public documentation to consume envelopes. A raw parser is intentionally unsupported after deployment.
5. Deploy the complete webapp image atomically. Old open browser tabs, ad-hoc curl calls and private scripts may fail until refreshed or migrated; no mixed-version fallback is provided.

### Protocol-version semantics

`protocolVersion: 1` remains valid: the envelope shape, cursor semantics and terminal metadata do not change. The removed raw mode was an alternate transport route, not a second version of the envelope schema. Any future incompatible change to the envelope itself must increment the protocol version.

### Verification additions

- Initial POST without an `Accept` profile still returns an envelope stream when the idempotency key is valid.
- Initial POST without `Idempotency-Key` fails safely and never emits raw chunks.
- Reader and writer reject raw chunk lines.
- Ordinary chat, Tasklist HITL resume and Delivery Chain still complete through the fixed envelope path.
- The maintained smoke script extracts `envelope.payload` and accepts no raw lines.

## Complexity Tracking

## Initial POST and Review-Fix Addendum (2026-07-28)

本 addendum 合并原先误拆出的 follow-up 需求，仍属于 v0.4.10 的同一 delivery。初始 POST 使用同一页面内的 stable `Idempotency-Key`，最多 3 次重试、20 秒总预算；该预算同时覆盖退避和每个在途 POST。已知 run 的 non-terminal EOF 与 replay descriptor 的首次 GET 失败均回到既有 GET recovery，不会再发 POST。若 draft conversation 注册在 StreamRun 创建后失败，route 复用 `StreamEventProjector.projectLifecycle()` 写入固定、安全的 `failed` 状态，保证 run/event/replay 一致。

不新增路由、表、migration、stream envelope 或跨页面恢复；页面关闭后旧本地快照优先级保持既有行为。

| Addition                                    | Why needed                                                                                               | Simpler alternative rejected because                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic `StreamRun` + `StreamEvent` records | 一个 recovery contract 必须同时覆盖 chat、Tasklist Agent 和 Delivery Chain，且不能与 AgentRun 耦合。     | 复用 `AgentRun` 会排除 ordinary chat/Delivery Chain，并混淆 business state 与 checkpoint boundary。                                             |
| PostgreSQL event-store port                 | Recovery 需要跨 request disconnect 保留事件，并为未来 multi-instance read 保留当前基础设施上的扩展空间。 | In-memory map 无法跨 process 保留事件，也不支持 multi-instance routing；Redis 会为 v0.4.10 引入新的 deployment dependency。                     |
| Fixed NDJSON envelope                       | 每个 event 都需要 cursor metadata，并且预发布阶段可以一次性收口 raw one-shot consumer。                  | 把 metadata 展平到所有现有 strict chunk 会造成大范围 shape 变更；保留双 writer/parser 会持续制造契约分叉，迁移到 SSE/WebSocket 又超出本版范围。 |
| Run-scoped execution coordinator            | 当前 `request.signal` 将 transport lifetime 与 model execution 绑定；断线后必须继续执行 run。            | 保留 request signal 会使 recovery 失效；迁移到 worker 是更大的 production-runtime 变化，留给后续版本。                                          |
