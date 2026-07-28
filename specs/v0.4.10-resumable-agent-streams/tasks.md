# Tasks: Resumable Agent Streams

**Input**: Design documents from `specs/v0.4.10-resumable-agent-streams/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [stream-resume-contract.md](./contracts/stream-resume-contract.md)

**Tests**: 本任务清单包含 contract、unit、integration、route、reducer 和 smoke tasks，因为本 feature 的 Success Criteria 要求验证协议、持久化、路由和三类 NDJSON 流的行为。

**Organization**: 任务按 spec 中的 User Story 分组，并在 User Story 之前完成共享 protocol、persistence 和 execution foundation。

## Phase 1: Setup（共享协议入口）

**Purpose**: 建立 v0.4.10 resumable stream 的公共类型、schema 和测试入口。

- [x] T001 [P] 在 `packages/stream-core/src/protocol/stream-event.ts` 定义 `StreamEventEnvelope`、`StreamLifecyclePayload`、`StreamRunStatus`、`StreamTerminalState` 和 protocol version，并从 `packages/stream-core/src/protocol/index.ts` 导出。
- [x] T002 [P] 在 `apps/webapp/lib/ai/stream-recovery/contracts.ts` 定义 public API、cursor、retry/error、replay descriptor、ownership DTO schema 和 safe diagnostics 字段（`diagnosticId`、`runId`、`requestId`、`eventId`/`sequence`、`status`、`errorCode`、`retryable`），并与 `specs/v0.4.10-resumable-agent-streams/contracts/stream-resume-contract.md` 对齐。
- [x] T003 [P] 为公共 envelope、lifecycle payload、terminal metadata、safe diagnostics 和 legacy/envelope mode 建立基础 contract fixtures，分别放入 `packages/stream-core/tests/protocol/stream-event.test.ts` 和 `apps/webapp/tests/lib/ai/stream-recovery/contracts.test.ts`。

---

## Phase 2: Foundational（阻塞所有 User Story 的基础能力）

**Purpose**: 完成事件持久化、幂等 lookup、事件投影和执行生命周期解耦；本阶段完成前不得开始 User Story 实现。

### Persistence and ownership

- [x] T004 [P] 在 `packages/database/prisma/schema.prisma` 增加 `StreamRequest`、`StreamRun`、`StreamEvent` 模型、owner/request uniqueness、`(runId, sequence)` uniqueness、retention indexes、`executionOwnerId`、`cancelRequestedAt` 和支持 per-run event/payload boundary 的字段，并生成 Prisma migration；migration 目录以 Prisma 实际生成结果为准，命名应体现 `resumable_streams`。
- [x] T005 在 `apps/webapp/lib/ai/stream-recovery/stream-event-store.ts` 实现 Postgres event-store adapter 和测试侧 in-memory adapter，支持 atomic append、ordered read-after-cursor、earliest retained sequence、terminal lookup、bounded cleanup、默认 20,000 retained events/run 和 256 KiB persisted payload/event 上限。
- [x] T006 在 `apps/webapp/lib/ai/stream-recovery/stream-run-service.ts` 实现 StreamRequest/StreamRun 的 create-or-reuse、request fingerprint、duplicate replay descriptor、cursor validation、ownership 校验、idempotency expiry 和 safe final-state retrieval。
- [x] T007 [P] 在 `apps/webapp/tests/lib/ai/stream-recovery/stream-event-store.test.ts` 覆盖 append ordering、并发 sequence、retention expiry、future cursor、cursor expired 和跨 session ownership；在 `apps/webapp/tests/lib/ai/stream-recovery/stream-run-service.test.ts` 覆盖幂等冲突和 replay descriptor。

### Protocol and runtime boundaries

- [x] T008 [P] 更新 `packages/stream-core/src/adapters/web/chunk-writer.ts`，支持 legacy raw chunk、negotiated event envelope 和不占 sequence 的 blank heartbeat，并在 `packages/stream-core/tests/adapters/web/chunk-writer.test.ts` 增加兼容性断言。
- [x] T009 [P] 更新 `apps/webapp/lib/ai/stream-chunk-schema.ts`，校验 envelope payload、`StreamLifecyclePayload`、terminal metadata 和 legacy chunk，并在 `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts` 增加 strict public DTO 场景。
- [x] T010 在 `apps/webapp/lib/ai/stream-recovery/stream-event-projector.ts` 实现 sanitized `ChatStreamChunk` 到 persisted `StreamEvent` 的边界，拒绝 raw GraphState、checkpoint、provider error、cookie、prompt 和 secret data。
- [x] T011 在 `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts` 实现 run-scoped execution controller、`request.signal` 解耦、`executionOwnerId` 记录、durable cancel intent polling 和“不因 recovery request 启动第二个 executor”的边界。
- [x] T012 [P] 在 `apps/webapp/tests/lib/ai/stream-recovery/stream-event-projector.test.ts` 和 `apps/webapp/tests/lib/ai/stream-recovery/stream-execution-coordinator.test.ts` 覆盖 public DTO 安全、断线继续执行、显式 cancel、终态关闭和 process-crash takeover 不支持的边界。

**Checkpoint**: Foundation ready；协议 schema、event store、ownership、幂等和 execution lifetime 已具备，User Story 可以按依赖关系开始。

---

## Phase 3: User Story 1 — 普通聊天和 Delivery Chain 断线恢复（Priority: P1）MVP

**Goal**: 用户在普通聊天或 Delivery Chain 输出期间断线后，可以通过同一 `runId` 补齐事件并继续展示，不重复执行原请求。

**Independent Test**: 在普通聊天和 Delivery Chain 的中途切断 fetch reader，保存最后 acknowledged sequence，恢复 GET subscription；要求事件有序补齐、UI 无重复文本/工具/Artifact/Workflow Progress，最终状态与不中断执行一致。

### Tests for User Story 1

- [x] T013 [P] [US1] 在 `apps/webapp/tests/app/api/chat/stream-resume-contract.test.ts` 覆盖 resumable initial POST、`X-Run-Id`、envelope negotiation、legacy fallback、recovery GET 和 safe error response。
- [x] T014 [P] [US1] 在 `apps/webapp/tests/app/api/chat/runs-stream-route.test.ts` 覆盖按 cursor replay、ordered new events、blank heartbeat、terminal close、cursor expired 和 ownership boundary。
- [x] T015 [P] [US1] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-reader-resume.test.ts` 和 `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer-resume.test.ts` 覆盖 envelope parsing、blank heartbeat、duplicate sequence、gap、terminal metadata 和 legacy chunk consumption。

### Implementation for User Story 1

- [x] T016 [US1] 更新 `apps/webapp/app/api/chat/route.ts`，在进入执行前创建或复用 StreamRun，处理 resumable negotiation、`Idempotency-Key`、`X-Run-Id` 和 duplicate POST JSON descriptor，同时保留 legacy response。
- [x] T017 [US1] 更新 `apps/webapp/lib/ai/chat-service.ts`，将 ordinary chat 和 Delivery Chain 的 public chunk 统一交给 `stream-event-projector.ts`，并移除 request disconnect 对 execution lifetime 的直接取消。
- [x] T018 [US1] 创建 `apps/webapp/app/api/chat/runs/[runId]/stream/route.ts`，实现 `Last-Event-ID`/`after` cursor 解析、ownership、retained replay、new event polling、heartbeat 和 terminal close。
- [x] T019 [US1] 更新 `apps/webapp/components/instamind/chat-stream/stream-reader.ts`，兼容 legacy raw chunk 与 resumable envelope，识别 heartbeat，并在 schema 通过后推进 acknowledged cursor。
- [x] T020 [US1] 创建 `apps/webapp/components/instamind/chat-stream/stream-reconnect.ts`，实现默认 500ms 初始延迟、2x exponential backoff、8s 单次等待上限、20% jitter、最多 8 次或 120s 总预算的 retry policy、retryable/permanent error 分类和 cursor 传递。
- [x] T021 [US1] 更新 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 和 `apps/webapp/components/instamind/use-chat-stream.ts`，保存 run/cursor、执行 client dedup，并区分 connected、disconnected、reconnecting、terminal 和 recovery unavailable。
- [x] T022 [US1] 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 与 `apps/webapp/lib/ai/runtime/delivery-chain/manager/index.ts` 对齐 `delivery_chain` StreamRun kind、Workflow Progress event 投影和 terminal mapping，确保 Delivery Chain 使用同一恢复协议。
- [x] T023 [US1] 在 `apps/webapp/tests/lib/ai/stream-recovery/chat-and-delivery-chain.integration.test.ts` 增加普通聊天和 Delivery Chain 的 controlled disconnect/reconnect 场景，并覆盖 SC-050-001、SC-050-003、SC-050-004 和 SC-050-007。

**Checkpoint**: US1 可独立交付；普通聊天和 Delivery Chain 已支持断线恢复，legacy one-shot consumer 未被破坏。

---

## Phase 4: User Story 2 — Tasklist Agent 长任务和 HITL resume（Priority: P1）

**Goal**: Tasklist Agent 断线后继续执行；进入 paused/HITL 后，用户 resume/reject/version mismatch 都沿用原 AgentRun/StreamRun，不产生第二次执行。

**Independent Test**: 启动包含多个 Agent step 的 Tasklist Agent，中途断开订阅并等待新 step；随后恢复同一 run；在 paused 状态分别验证 resume、reject 和 version mismatch 的事件顺序、终态和 ownership。

### Tests for User Story 2

- [x] T024 [P] [US2] 在 `apps/webapp/tests/app/api/agent-runs/resume-route.test.ts` 覆盖现有 resume route 使用同一 `runId`、同一 StreamRun、same event sequence 以及 reject/version mismatch public response。
- [x] T025 [P] [US2] 在 `apps/webapp/tests/lib/ai/agent-runs/stream-recovery.integration.test.ts` 覆盖 Agent interrupt、paused、resume continuation、terminal finish、failure 和 no-second-executor。

### Implementation for User Story 2

- [x] T026 [US2] 更新 `apps/webapp/lib/ai/agent-runs/agent-run-service.ts` 与 `apps/webapp/lib/ai/agent-runs/agent-run-repository.ts`，建立 `AgentRun.id` 与 Tasklist `StreamRun.id` 的一一对应，并保持现有 AgentRun/AgentInterrupt business state transition。
- [x] T027 [US2] 更新 `apps/webapp/app/api/agent-runs/[runId]/resume/route.ts`，把 resume/reject/version mismatch 的 stream output 接入同一个 `stream-event-projector.ts`，不得创建第二个 StreamRequest 或 StreamRun。
- [x] T028 [US2] 更新 `apps/webapp/lib/ai/chat-service.ts` 的 `resumeAgentRun`/`rejectAgentRun` 分支，为 `agent-interrupt`、`agent-resume`、continuation chunks 和 terminal lifecycle payload 生成正确 sequence。
- [x] T029 [US2] 更新 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 及其 `stream/` 相关模块，使 GraphState、AgentInterrupt 和 public event projection 保持职责分离。
- [x] T030 [US2] 更新 `apps/webapp/components/instamind/use-chat-stream.ts` 的 HITL resume 状态，区分 paused subscription、resume request、reconnecting、rejected、version mismatch 和 terminal state。
- [x] T031 [US2] 在 `apps/webapp/tests/components/instamind/use-chat-stream-agent-resume.test.tsx` 增加 paused → resume/reject/version mismatch 的 reducer/UI contract coverage，并覆盖 SC-050-007。

**Checkpoint**: US1 与 US2 均可用；普通流和 Tasklist Agent 共用事件恢复基础设施，Agent business state 与 checkpoint 仍然分离。

---

## Phase 5: User Story 3 — 幂等提交和安全重试（Priority: P1）

**Goal**: 相同 client request identity 的重复提交只对应一个 execution、一个 StreamRun 和一套 event sequence；输入 fingerprint 冲突时明确拒绝。

**Independent Test**: 对同一 `Idempotency-Key` 并发提交三次相同请求，再提交一次不同 fingerprint 请求；要求只创建一个执行实体，重复请求返回 replay descriptor，冲突请求停止自动 retry 且不泄露原始请求。

### Tests for User Story 3

- [x] T032 [P] [US3] 在 `apps/webapp/tests/app/api/chat/idempotency-route.test.ts` 覆盖并发相同 POST、duplicate JSON descriptor、different fingerprint `409 IDEMPOTENCY_CONFLICT` 和 legacy request compatibility。
- [x] T033 [P] [US3] 在 `apps/webapp/tests/lib/ai/stream-recovery/idempotency-concurrency.integration.test.ts` 覆盖 database uniqueness、transaction race、active key expiry、terminal retention 和同一 key 跨三类 stream kind 的隔离。

### Implementation for User Story 3

- [x] T034 [US3] 在 `apps/webapp/lib/ai/stream-recovery/stream-run-service.ts` 完善 request fingerprint canonicalization、atomic create-or-reuse、active run 不过期和 terminal 后 bounded idempotency scope。
- [x] T035 [US3] 在 `apps/webapp/app/api/chat/route.ts` 完善 duplicate POST 的 `Content-Type` 分支、replay descriptor 字段和 conflict safe error DTO，确保 client 不把 JSON descriptor 当作 NDJSON chunk。
- [x] T036 [US3] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 接入 duplicate replay descriptor，改为跟随 `streamUrl` 恢复已有 run，不重新提交原始 model/Agent 请求。
- [x] T037 [US3] 在 `apps/webapp/tests/lib/ai/stream-recovery/three-stream-idempotency.test.ts` 覆盖 ordinary chat、Tasklist Agent 和 Delivery Chain 的 request identity、run identity 和 event sequence 不重复。

**Checkpoint**: US3 可独立证明重复提交不会造成重复执行；可重试边界与永久冲突边界明确。

---

## Phase 6: User Story 4 — 连接状态、取消和不可恢复错误（Priority: P2）

**Goal**: 用户可以区分 recovering、后台执行、paused、cancelled 和 recovery unavailable，并能显式停止执行；永久错误不会进入无限重连。

**Independent Test**: 分别模拟网络断线、temporary service failure、explicit cancel、cursor expired、forbidden、cursor ahead 和 terminal completion，要求每种场景都有唯一状态、后续动作和 retry policy。

### Tests for User Story 4

- [x] T038 [P] [US4] 在 `apps/webapp/tests/app/api/chat/runs-cancel-route.test.ts` 覆盖 ownership、重复 cancel、cancelRequestedAt、terminal cancellation 和 safe public response。
- [x] T039 [P] [US4] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-reconnect-policy.test.ts` 覆盖 500ms 初始延迟、2x exponential backoff、8s 单次等待上限、20% jitter、最多 8 次或 120s 总预算、retryable/permanent classification 和 cancel 优先级。
- [x] T040 [P] [US4] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-terminal-state.test.ts` 覆盖 completed、failed、cancelled、rejected、version mismatch 和 cursor expired 的 terminal 收口，并验证 paused/HITL waiting 是可恢复的 non-terminal lifecycle state。

### Implementation for User Story 4

- [x] T041 [US4] 创建 `apps/webapp/app/api/chat/runs/[runId]/cancel/route.ts`，实现同 session ownership、explicit user action、idempotent cancel 和 safe run status response。
- [x] T042 [US4] 更新 `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts`，让 active executor 观察 `cancelRequestedAt`、停止后续 event append，并在 5 秒目标内产出 cancellation outcome。
- [x] T043 [US4] 更新 `apps/webapp/lib/ai/stream-recovery/stream-run-service.ts` 与 `apps/webapp/app/api/chat/runs/[runId]/stream/route.ts`，完善 `CURSOR_EXPIRED`、`CURSOR_AHEAD`、`VERSION_MISMATCH`、final-state retrieval 和 restart guidance。
- [x] T044 [US4] 更新 `apps/webapp/components/instamind/chat-stream/stream-reconnect.ts` 与 `apps/webapp/components/instamind/use-chat-stream.ts`，实现 cancel 优先于下一次 retry，并展示 recovering、后台执行、paused、recovery unavailable 和 terminal 状态。
- [x] T045 [US4] 在 `apps/webapp/tests/lib/ai/stream-recovery/all-streams-control-state.integration.test.ts` 覆盖三类 stream 的 cancel、cursor expired、permission failure、permanent error 和 no-infinite-retry。

**Checkpoint**: 四个 User Story 的核心需求均已实现；连接状态与 business state 明确分离，取消和不可恢复错误有明确收口。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 完成文档同步、release closing 和全链路验证。

- [x] T046 [P] 新增 `docs/adr/0015-resumable-agent-stream-recovery.md`，记录 POST/NDJSON + GET recovery、bounded event store、AgentRun/checkpoint 分离和 process-crash boundary。
- [x] T047 [P] 更新 `docs/architecture/stream-core.md` 或新增 `docs/architecture/stream-recovery.md`，同步 protocol envelope、cursor、retention、ownership 和 execution lifetime 事实。
- [x] T048 [P] 新增 `docs/versions/v0.4.10-resumable-agent-streams.md` 与 `docs/releases/v0.4.10.md`，同步用户可见能力、non-goals、迁移兼容和部署前提。
- [x] T049 [P] 按 `specs/v0.4.10-resumable-agent-streams/quickstart.md` 执行 ordinary chat、Tasklist Agent、Delivery Chain 的 controlled disconnect/reconnect、duplicate POST、cancel 和 cursor expiry smoke flow，并将结果记录到 `specs/v0.4.10-resumable-agent-streams/acceptance.md`。
- [x] T050 运行 `pnpm --filter @ai-mind/stream-core test`、`pnpm --filter @ai-mind/stream-core typecheck`、覆盖本 feature 新增/修改 route、`stream-recovery`、Instamind stream reader/reducer/UI 的 webapp targeted Vitest、`pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint` 和必要的 build，修复与本 feature 相关的回归。
- [x] T051 执行 `speckit-converge`，对照 `spec.md`、`plan.md`、`tasks.md`、acceptance/checklist 和实际 diff 补齐遗漏任务，并完成 v0.4.10 release closing。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：无前置依赖；T001–T003 可并行。
- **Foundational（Phase 2）**：依赖 Setup 完成，阻塞所有 User Story；T004–T012 应先完成 schema、event store、ownership、projection 和 execution lifetime。
- **US1（Phase 3）**：依赖 Foundational；是推荐 MVP，先打通 ordinary chat 和 Delivery Chain 的恢复闭环。
- **US2（Phase 4）**：依赖 Foundational，并依赖 US1 已提供的 event projector/recovery subscription；Tasklist Agent resume 不能绕开 US1 的事件边界。
- **US3（Phase 5）**：依赖 Foundational 和 US1 的 initial POST/recovery route；主要补强 duplicate POST 和 concurrency race。
- **US4（Phase 6）**：依赖 US1 的 reconnect client、US2 的 paused/resume 状态和 Foundational 的 execution coordinator。
- **Polish（Phase 7）**：依赖目标 User Story 完成；T046–T049 可并行，T050–T051 在代码和文档收口后执行。

### User Story Dependencies

- **US1（P1）**：Foundational 完成后可开始；普通聊天和 Delivery Chain 在本阶段独立可验收。
- **US2（P1）**：依赖 US1 的通用 event projector、recovery GET 和 client reader；不创建第二套恢复协议。
- **US3（P1）**：依赖 US1 的 initial POST，但可以与 US2 的 Agent runtime 工作并行，前提是避免同时修改同一个 route/service 文件。
- **US4（P2）**：依赖 US1/US2 已定义的 client state 和 terminal mapping，再补充 cancel、cursor expiry 和 permanent error 收口。

### Parallel Opportunities

- T001–T003 可并行：protocol types、webapp contract schema 和基础 fixtures 分属不同文件。
- T007–T009 可并行：event-store/run-service 以外的 writer/schema 测试和适配可独立推进。
- US1 的 T013–T015 可并行；完成后 T016–T018 负责 server path，T019–T021 负责 client path。
- US2 的 T024–T025 可并行；T026–T029 需要按 AgentRun linkage → route/service → runtime projector 顺序落地。
- US3 的 T032–T033 可并行；T034–T036 按 persistence → route → client 顺序执行。
- US4 的 T038–T040 可并行；T041–T044 按 cancel API → coordinator → service/route → client state 顺序执行。
- T046–T049 可并行；但 T050 必须在实现和测试合并后执行。

## Parallel Example: User Story 1

```text
并行 A：apps/webapp/tests/app/api/chat/stream-resume-contract.test.ts
并行 B：apps/webapp/tests/app/api/chat/runs-stream-route.test.ts
并行 C：apps/webapp/tests/components/instamind/chat-stream/stream-reader-resume.test.ts

完成 contract tests 后：
并行 A：apps/webapp/app/api/chat/route.ts
并行 B：apps/webapp/app/api/chat/runs/[runId]/stream/route.ts
并行 C：apps/webapp/components/instamind/chat-stream/stream-reconnect.ts
```

## Implementation Strategy

### MVP First（US1）

1. 完成 Phase 1 Setup 和 Phase 2 Foundational。
2. 完成 US1：ordinary chat + Delivery Chain 的 initial POST、event persistence、GET recovery、client cursor/dedup。
3. 执行 US1 独立测试和 quickstart smoke flow，确认 legacy one-shot consumer 不退化。
4. US1 稳定后再接入 Tasklist Agent HITL resume、幂等冲突和 cancel control。

### Incremental Delivery

1. Setup + Foundational → 获得稳定的 protocol/persistence/runtime foundation。
2. US1 → 交付普通聊天和 Delivery Chain 断线恢复 MVP。
3. US2 → 交付长时间 Tasklist Agent 和 HITL continuation recovery。
4. US3 → 交付 duplicate POST 防护和幂等 retry boundary。
5. US4 → 交付用户可理解的连接状态、显式 cancel 和不可恢复错误收口。
6. Polish → 完成 ADR、architecture、version docs、smoke、typecheck、lint、build 和 converge。

## Notes

- 每个 task 都必须保留 `- [ ] Txxx` 格式；User Story task 必须带 `[USx]`，并在描述中包含明确文件路径。
- `[P]` 只表示可以在不同文件、无未完成依赖的情况下并行执行，不代表可以忽略 phase dependency。
- Tasklist Agent 的 `AgentRun`、`AgentInterrupt`、GraphState 和 checkpoint 仍遵守现有 boundary；stream recovery 不持久化 raw runtime state。
- v0.4.10 支持 client disconnect recovery，不承诺 process-crash takeover、worker queue 或通用 external Tool exactly-once side effect。
- 完成目标 User Story 后应在 checkpoint 停下，先运行对应的 targeted tests 和 quickstart 场景，再进入下一阶段。

## Phase 8: Convergence

- [x] T052 为 `POST /api/chat`、`GET /api/chat/runs/[runId]/stream` 和 `POST /api/chat/runs/[runId]/cancel` 的 resumable error/control responses 补齐 safe diagnostics DTO，并覆盖 idempotency conflict、cursor expired/ahead、ownership failure 和 cancel failure per FR-050-015 (partial)

## Phase 9: Convergence

- [x] T053 隔离 resumable initial POST 的 transport `request.signal` 与 run-scoped execution start/cancel，使执行启动前的客户端断线不阻止 run 执行，并补充 pre-start disconnect regression coverage per FR-050-006.
- [x] T054 在 Tasklist Agent 创建完成后持久化并校验 `StreamRun.agentRunId` 与同一 `AgentRun.id` 的一一对应，保持 ordinary chat/Delivery Chain 的 nullable link 语义 per plan T026 and data-model StreamRun invariant 6.
- [x] T055 为 Agent version mismatch 路径向同一 `StreamRun` 幂等投影 `version_mismatch` terminal event 和终态，保持 AgentRun 与 StreamRun 状态一致，并补 route/recovery/client coverage per FR-050-009, FR-050-011 and contract Terminal semantics.
- [x] T056 完善前端 explicit cancel 状态机，保留现有 optimistic stop UI：点击后立即停止本地 stream/retry，不新增可见 cancelling 中间态；消费 cancel API 的 `cancel_requested`、`cancelled` 和失败结果，保证取消优先于下一次重连 per FR-050-010 and SC-050-005.
- [x] T057 为 PostgreSQL `StreamRequest` unique-key race 增加安全重读与 replay descriptor 回退，确保并发相同 Idempotency-Key 不返回偶发 500，并用真实 unique-conflict transaction coverage 验证 per FR-050-001, SC-050-002 and T006/T033.
- [x] T058 统一 resumable POST、recovery GET、Agent resume 和 cancel control 的 safe diagnostics response DTO，覆盖 invalid cursor、缺失 Idempotency-Key、version mismatch、cancel result 等分支并通过 strict schema 验证 per FR-050-015 and Constitution VI.
- [x] T059 在恢复订阅与客户端 cursor reducer 中校验 `eventId`、`runId` 和 protocol version 的一致性，避免仅凭 sequence 接受错误事件并补充 duplicate/gap/event-identity tests per data-model RecoveryCursor and checklist CHK012.
- [x] T060 将 retained event count boundary 和 rolling 10-minute event retention 建模为显式 recovery-unavailable/final-state guidance 结果，避免 `trimRunEvents` 静默丢弃事件，并补充达到时间/数量边界后的 append、replay 和 diagnostics coverage per FR-050-016 and stream-resume-contract retention boundary.
- [x] T061 [P] 更新 `specs/v0.4.10-resumable-agent-streams/acceptance.md` 与 `quickstart.md`，将验收边界限定为同一页面生命周期内网络重连；增加页面刷新/关闭后仅查询已持久化最终结果、不恢复活动订阅的非目标说明。
- [x] T062 [P] 更新 `docs/adr/0015-resumable-agent-stream-recovery.md` 与 `docs/architecture/stream-recovery.md`，记录单个长生命周期 Node.js webapp 执行边界、Docker Compose 部署假设、rolling retention 和 optimistic cancel 语义。
- [x] T063 [P] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-reconnect-policy.test.ts`、`apps/webapp/tests/app/api/chat/runs-cancel-route.test.ts` 和相关集成测试中补齐“同页断线可恢复、刷新/关闭不重接、取消立即停止本地 retry、服务端最终终态收口”的覆盖。

## Phase 10: Convergence

- [x] T064 修复或隔离当前 stable lane 中既有 Delivery Chain / Tasklist Agent runtime 回归断言，并重新运行完整 webapp stable suite，确保本版 stream recovery 变更没有被未收口基线失败掩盖 per T050/T051.
- [x] T065 在代表性 PostgreSQL 环境执行 `resumable_streams` 与 `stream_agent_run_link` migrations，验证 orphan AgentRun link fail-closed、foreign key、唯一约束和 nullable ordinary/Delivery Chain link per T054 and data-model invariant 6.
- [x] T066 为真实 `P2002` StreamRequest unique-key race 增加 transaction-level integration coverage，验证并发相同 fingerprint 只返回一个 created run、其余返回 replay descriptor，且不重复计入 rate limit per T057/SC-050-002.
- [x] T067 增加 active executor 观察 durable cancel intent 后投影单一 `cancelled` terminal 的 integration coverage，并验证 completed/failed run 的重复 cancel 不会改写终态 per T041/T042/T056.
- [x] T068 完成 v0.4.10 release closing：更新 acceptance smoke evidence、运行最终 converge、确认 package manifests、migration、targeted/full verification 一致后再将 acceptance 标为 PASS per T051/T061-T063.

## Phase 11: Review Gap Closure

- [x] T069 [P1] 为 executor 启动失败、resumable 外层异常和重复启动补充 integration coverage，验证每个新建 StreamRun 最终进入明确 terminal 或安全的非 terminal coordinator 状态，不留下永久 running，也不由第二个 executor 覆盖既有状态；覆盖 `apps/webapp/lib/ai/chat-service.ts` 与 `apps/webapp/lib/ai/stream-recovery/stream-execution-coordinator.ts`。
- [x] T070 [P1] 收紧 resumable 协商后的客户端协议：当响应声明 `ai-mind-resumable-v1` 时，`stream-reader` 只接受带 `runId`、`eventId`、`sequence`、`protocolVersion` 的 envelope，raw legacy chunk 必须转为协议错误并进入 `recovery_unavailable`；补充 `stream-reader`、`use-chat-stream` 以及 cancel API 失败后的停止 retry/UI 错误测试，避免协商与消费语义不一致 per T044/T059/CHK012。
- [x] T071 [P1] 补充跨 ordinary chat、Capability/Resource、Tool 和 Delivery Chain 的 error-scope contract tests，证明 `scope=resource|prompt|tool` 的局部 error 不会结束 StreamRun，后续 `prompt-end`、正文和 `finish` 仍会持久化；只有 `scope=request|runtime` 或显式 terminal error 才能投影 failed，并验证 projection 失败不会向 resumable 客户端写 raw legacy error per FR-050-005/FR-050-007。
- [x] T072 [P2] 评估并优化 `stream-event-store` 的 append/trim 热路径，避免事件数达到上限后每个 token 都执行删除事务；在不破坏 `(runId, sequence)` 原子性、rolling retention 和 recovery floor 的前提下采用批量或阈值清理，并补充基准/边界测试 per T060/FR-050-016。

## Phase 12: Fixed Envelope Protocol Cutover

### Review-gap closure: Initial POST and stream recovery

- [x] T085 将同页 initial POST response-loss recovery 合并入 v0.4.10：复用稳定 `Idempotency-Key` 与 payload，处理网络/临时 HTTP/空 body，最多 3 次 retry、20 秒预算，并由 replay descriptor 切换至 GET recovery per FR-050-020/FR-050-021。
- [x] T086 [P1] 在 `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx` 补充 hanging initial POST、non-terminal EOF 和 replay 首次 GET 失败的回归覆盖 per FR-050-021/FR-050-022/FR-050-023。
- [x] T087 [P1] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 以剩余预算 abort initial POST attempt，并将 non-terminal EOF 与 replay direct-GET failure 转入 existing known-run recovery per FR-050-021/FR-050-022/FR-050-023。
- [x] T088 [P1] 在 `apps/webapp/tests/app/api/chat/route.test.ts` 覆盖 draft conversation 注册失败后的 StreamRun terminalization per FR-050-024。
- [x] T089 [P1] 在 `apps/webapp/app/api/chat/route.ts` 于 created StreamRun 的 draft conversation 注册失败后投影安全 `failed` lifecycle per FR-050-024。
- [x] T090 [P] 更新 `docs/architecture/stream-recovery.md`、`docs/versions/v0.4.10-resumable-agent-streams.md`、`docs/releases/v0.4.10.md` 及本目录 `acceptance.md`，记录 initial POST 预算、EOF/replay recovery 和 orphan-run 收口边界。
- [x] T091 执行上述 focused Vitest、webapp typecheck 与 Spec Kit converge，并将结果写入 `specs/v0.4.10-resumable-agent-streams/acceptance.md`。

**Goal**: 在预发布部署窗口内移除 raw one-shot NDJSON 成功路径，使 ordinary chat、Tasklist Agent 和 Delivery Chain 均使用同一 `StreamEventEnvelope` 契约，不再依赖 `Accept` negotiation。

**Independent Test**: 带有效 `Idempotency-Key` 的初始 `POST /api/chat`（无论是否携带 `Accept` profile）都只返回 envelope；无 key 安全失败；duplicate POST、recovery GET 和 HITL resume 保持既有 `runId`/cursor 语义；raw line 会被 writer 和 reader 拒绝。

### Contract and foundational changes

- [x] T073 [P] 更新 `packages/stream-core/src/adapters/web/chunk-writer.ts` 与 `packages/stream-core/tests/adapters/web/chunk-writer.test.ts`，移除 raw `writeChunk`/`toEnvelope` fallback，只允许写入 `StreamEventEnvelope` 和 transport heartbeat。
- [x] T074 [P] 更新 `apps/webapp/lib/ai/stream-chunk-schema.ts` 与 `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`，将公开 NDJSON line schema 收紧为固定 envelope，并保留 `ChatStreamChunk` 仅作为 `payload` schema。
- [x] T075 更新 `apps/webapp/lib/ai/chat-service.ts` 及其相关测试，要求 initial execution 总是带 `streamRecovery`/projector，并删除 raw writer 及 request-signal lifetime fallback。

### User Story 1: Ordinary chat and Delivery Chain fixed stream (Priority: P1)

- [x] T076 [US1] 更新 `apps/webapp/app/api/chat/route.ts` 与 `apps/webapp/tests/app/api/chat/stream-resume-contract.test.ts`，移除 `Accept`-driven legacy branch，对全部初始 POST 强制 `Idempotency-Key`、StreamRun 和 envelope response，同时保留 duplicate JSON replay descriptor。
- [x] T077 [P] [US1] 更新 `apps/webapp/scripts/smoke/cloud-model-provider-smoke.mjs`，以 `envelope.payload` 消费 cloud-model 输出，并为每次 initial POST 生成 `Idempotency-Key`。
- [x] T078 [US1] 更新 `apps/webapp/tests/app/api/chat/idempotency-route.test.ts`、`apps/webapp/tests/lib/ai/stream-recovery/chat-and-delivery-chain.integration.test.ts`，覆盖普通聊天与 Delivery Chain 的无 profile envelope、缺失 key 拒绝和同 key replay。

### User Story 2: Fixed-envelope frontend and HITL continuation (Priority: P1)

- [x] T079 [US2] 更新 `apps/webapp/components/instamind/chat-stream/stream-reader.ts` 与 `apps/webapp/tests/components/instamind/chat-stream/stream-reader.test.ts`，删除 `isEnvelope`/`requireEnvelope` legacy mode，所有非空成功行必须先通过 envelope identity validation。
- [x] T080 [US2] 更新 `apps/webapp/components/instamind/use-chat-stream.ts` 与 `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx`，去除响应 profile 探测，初始 POST、GET recovery 与 HITL resume 统一以 envelope 消费，并保留 duplicate descriptor 分支。
- [x] T081 [US2] 更新 `apps/webapp/tests/app/api/agent-runs/resume-route.test.ts` 与 Tasklist stream recovery integration tests，证明 HITL resume 继续同一 `runId`、只输出 envelope，且不会重新引入 raw 读取路径。

### Polish, release and convergence

- [x] T082 [P] 更新 `specs/v0.4.10-resumable-agent-streams/{spec.md,plan.md,research.md,data-model.md,quickstart.md,acceptance.md,contracts/stream-resume-contract.md,checklists/}`、`docs/adr/0015-resumable-agent-stream-recovery.md`、`docs/architecture/stream-recovery.md`、`docs/versions/v0.4.10-resumable-agent-streams.md` 和 `docs/releases/v0.4.10.md`，同步 fixed-envelope cutover、预发布部署边界和验证证据。
- [x] T083 运行 `pnpm --filter @ai-mind/stream-core test`、相关 webapp Vitest route/reader/use-chat-stream/stream-recovery suites、`pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint`，并执行 ordinary chat、Tasklist HITL、Delivery Chain 及 cloud-model smoke 的真实或受控场景。
- [x] T084 执行 `speckit-analyze`、修复其高优先级规格/任务一致性问题，然后执行 `speckit-converge`；将补充任务和最终验证结果回写 `specs/v0.4.10-resumable-agent-streams/tasks.md` 与 `acceptance.md`。
