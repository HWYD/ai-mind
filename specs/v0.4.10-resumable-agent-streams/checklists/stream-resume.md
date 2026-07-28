# Stream Resume Requirements Checklist: Resumable Agent Streams

**Purpose**: 评审 v0.4.10 可恢复 NDJSON 流需求的完整性、清晰度、一致性和可验收性。
**Created**: 2026-07-21
**Feature**: [spec.md](../spec.md)
**Context**: [plan.md](../plan.md), [stream-resume-contract.md](../contracts/stream-resume-contract.md)

## Requirement Completeness

- [x] CHK001 - 是否明确区分初始 `POST + NDJSON`、恢复 `GET` 和显式取消三类操作的职责与边界？ [Completeness, Spec §FR-050-006, Spec §FR-050-010, Spec §FR-050-018]
- [x] CHK002 - 是否为普通聊天、Tasklist Agent 和 Delivery Chain 三类当前 NDJSON 流分别定义了相同的恢复语义？ [Completeness, Spec §Goals, Spec §FR-050-018]
- [x] CHK003 - 是否同时定义了 client request identity、run identity、event identity 和 recovery cursor 的生命周期？ [Completeness, Spec §FR-050-001–004]
- [x] CHK004 - 是否定义了首次请求尚未拿到 `runId`、重复提交、原始连接断开和恢复订阅断开的需求路径？ [Coverage, Spec §User Story 1, Spec §User Story 3, Spec §Edge Cases]
- [x] CHK005 - 是否明确规定了 Tasklist Agent 进入 paused、用户 resume、reject 和 version mismatch 时原 run 身份是否保持不变？ [Completeness, Spec §FR-050-011, Spec §FR-050-018]
- [x] CHK006 - 是否为 terminal states 和 paused/HITL lifecycle state 分别定义了可被客户端理解的结果？ [Completeness, Spec §FR-050-011]
- [x] CHK007 - 是否定义了幂等键过期后再次使用的语义，以及它与事件 retention window 的关系？ [Completeness, Spec §Assumptions, Data Model §StreamRequest]
- [x] CHK008 - 是否定义了事件保留、清理、活动 run 延长保留和终态查询之间的责任边界？ [Completeness, Spec §FR-050-012, Spec §FR-050-016]

## Requirement Clarity

- [x] CHK009 - 是否明确规定了重复 POST 在相同 fingerprint 下的 HTTP status、`Content-Type`、JSON 字段和客户端后续动作？ [Clarity, Plan §Phase 1, Contract §Initial POST behavior]
- [x] CHK010 - 是否明确规定了相同幂等键但不同 fingerprint 的冲突响应，且不会泄露原始请求内容？ [Clarity, Spec §User Story 3, Contract §Initial POST behavior]
- [x] CHK011 - 是否明确规定了 `runId`、`eventId`、`sequence` 和 `Last-Event-ID` 之间的对应关系？ [Clarity, Spec §FR-050-002–004, Contract §Recovery GET]
- [x] CHK012 - 是否明确规定了客户端何时推进 cursor，以及重复事件、sequence gap、future cursor 和 event-id 不一致分别意味着什么？ [Clarity, Spec §FR-050-005, Spec §Edge Cases]
- [x] CHK013 - 是否明确规定了 heartbeat 是否占用 sequence、是否进入 retention log、以及客户端如何将其与业务事件区分？ [Clarity, Spec §FR-050-003, Spec §FR-050-007]
- [x] CHK014 - 是否明确规定了 `finish`、run-level `error`、`agent-interrupt`、`agent-resume` 和 `run-status` payload 的终态或非终态属性？ [Clarity, Contract §Terminal semantics]
- [x] CHK015 - 是否明确规定了 `terminalState`、`runStatus` 和持久化 run status 不一致时的处理原则？ [Clarity, Plan §Post-Design Constitution Check]
- [x] CHK016 - 是否量化了重连最大次数、总时间预算、退避上限、jitter 范围和不同错误类别的 retry decision？ [Measurability, Spec §FR-050-008–009, Contract §Retry policy]
- [x] CHK017 - 是否明确规定了 `CURSOR_EXPIRED` 返回后 active run、final-state retrieval 和 restart guidance 的可用组合？ [Clarity, Spec §FR-050-012, Spec §FR-050-019]

## Consistency and Compatibility

- [x] CHK018 - 是否保证恢复协议增加的 metadata 不改变既有 `ChatStreamChunk` 的业务含义和字段语义？ [Consistency, Spec §FR-050-014, ADR-0003]
- [x] CHK019 - 是否明确 raw one-shot consumer 在没有幂等键或 envelope 识别能力时会在本次预发布 cutover 失效，且不存在静默 fallback？ [Compatibility, Spec §FR-050-017]
- [x] CHK020 - 是否保证网络断开只改变 subscription state，而不会被解释为 business cancellation？ [Consistency, Spec §FR-050-006, Spec §FR-050-010]
- [x] CHK021 - 是否保证恢复订阅、重复 POST 和 Agent resume 都不会创建第二个执行实体或第二套事件序列？ [Consistency, Spec §FR-050-001, Spec §FR-050-018]
- [x] CHK022 - 是否保证 `StreamRun`/`StreamEvent` 的职责与 `AgentRun`/`AgentInterrupt`、GraphState 和 LangGraph checkpoint 的职责没有重叠？ [Consistency, Spec §Assumptions, ADR-0002]
- [x] CHK023 - 是否保证所有三类流都采用相同的 ownership、cursor expiry、terminal 和 retry 分类，而不因流类型产生未说明的例外？ [Consistency, Spec §FR-050-009, Spec §FR-050-013]

## Scenario and Edge Case Coverage

- [x] CHK024 - 是否覆盖了服务端已发送事件但客户端尚未持久化 cursor 后断线的恢复语义？ [Recovery, Spec §Edge Cases]
- [x] CHK025 - 是否覆盖了两个客户端同时订阅同一 run、相同 cursor 和相邻 cursor 的并发语义？ [Coverage, Spec §User Story 3]
- [x] CHK026 - 是否覆盖了 cursor 早于 retention window、等于当前 sequence、大于当前 sequence 和 run 已终态四类边界？ [Edge Case, Spec §Edge Cases, Contract §Cursor and error semantics]
- [x] CHK027 - 是否覆盖了恢复前 run 已完成、失败、取消、拒绝、版本不匹配或进入 paused/HITL lifecycle state 的结果？ [Coverage, Spec §User Story 2, Spec §FR-050-011]
- [x] CHK028 - 是否覆盖了用户在自动重连等待期发起 cancel，以及 cancel 与下一次重连同时发生的优先级？ [Edge Case, Spec §User Story 4, Spec §Edge Cases]
- [x] CHK029 - 是否覆盖了 provider、Tool、Resource、MCP 和 runtime 错误在“可重试业务错误”和“不可重试终态”之间的分类？ [Coverage, Spec §FR-050-008–009, Spec §FR-050-015]
- [x] CHK030 - 是否覆盖了恢复请求缺少 session ownership、run 不存在或 run 属于其他会话时的统一安全语义？ [Security, Spec §FR-050-013, Spec §SC-050-008]
- [x] CHK031 - 是否覆盖了 webapp 进程崩溃、另一个实例接收恢复请求和执行接管不支持时的明确降级边界？ [Assumption, Plan §Scale/Scope, Research §Decision 7]

## Non-Functional and Security Requirements

- [x] CHK032 - 是否为恢复成功率、恢复时延、取消确认时延和“无重复执行”分别定义了可量化的验收口径？ [Measurability, Spec §SC-050-001–005]
- [x] CHK033 - 是否定义了事件日志的容量、payload 大小、retention 清理和高频 text-delta 对存储压力的边界？ [Completeness, Spec §FR-050-016, Plan §Technical Context]
- [x] CHK034 - 是否明确规定了 public DTO 不得包含 raw GraphState、checkpoint、provider error、API key、session cookie、internal prompt 或 sensitive env？ [Security, Spec §FR-050-015, Constitution §6]
- [x] CHK035 - 是否明确规定了所有恢复、重复请求和取消错误的安全响应，避免通过错误码推断其他会话的 run 是否存在？ [Security, Spec §Edge Cases, Spec §FR-050-013]
- [x] CHK036 - 是否明确规定了多实例共享 PostgreSQL 时的事务顺序、sequence 唯一性和并发 append 一致性要求？ [Clarity, Spec §Assumptions, Plan §Data Model]
- [x] CHK037 - 是否明确规定了 heartbeat、事件 replay 和长连接在代理/缓存层的 buffering 与 timeout 约束？ [Completeness, Spec §FR-050-007, Plan §Technical Context]

## Dependencies, Assumptions, and Traceability

- [x] CHK038 - 是否明确标注了 PostgreSQL 是 v0.4.10 的正式持久化依赖，而 in-memory store 仅属于开发/测试边界？ [Dependency, Spec §Assumptions, Plan §Storage]
- [x] CHK039 - 是否明确标注了长生命周期 Node.js executor 是本版前提，并避免把 PostgreSQL event log 误解为进程崩溃恢复能力？ [Assumption, Plan §Scale/Scope, Research §Decision 7]
- [x] CHK040 - 是否为 protocol、API、Prisma schema、AgentRun 状态、部署约束和用户可见行为的变更定义了同步更新要求？ [Traceability, Constitution §9, Plan §Phase 1]
- [x] CHK041 - 是否能从每个核心 Success Criteria 追溯到至少一个用户故事、功能需求和可客观判断的验收表达？ [Traceability, Spec §User Scenarios, Spec §Functional Requirements, Spec §Success Criteria]
- [x] CHK042 - 是否明确列出本版不提供 native `EventSource`、SSE 全量迁移、WebSocket、永久历史、任意 replay、通用 exactly-once side effect 和 worker takeover？ [Scope, Spec §Non-goals, Plan §Constraints]

## Ambiguities and Conflicts

- [x] CHK043 - “恢复成功”是否明确指事件完整补齐、最终业务状态一致，还是仅重新建立连接？ [Clarity, Spec §SC-050-001, Spec §SC-050-004]
- [x] CHK044 - “run-level error”是否已明确区别于仍可自动重连的 transport failure 和 retryable provider/tool error？ [Clarity, Spec §FR-050-008–011, Contract §Terminal semantics]
- [x] CHK045 - `lastSequence`、客户端 acknowledged cursor 和服务端 retained earliest sequence 的命名与语义是否在 spec、data model 和 contract 中完全一致？ [Consistency, Spec §FR-050-003–005, Data Model §RecoveryCursor]
- [x] CHK046 - 是否已明确恢复订阅关闭后，paused Agent 等待 resume 与普通 active run 继续执行之间的连接状态差异？ [Clarity, Spec §User Story 2, Contract §Terminal semantics]
