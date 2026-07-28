# Feature Specification: Resumable Agent Streams

**Feature Branch**: `[v0.4.10-resumable-agent-streams]`

**Version**: `v0.4.10`

**Created**: 2026-07-20

**Status**: Ready for planning

**Input**: User description: "v0.4.10 实现 fetch POST + NDJSON 流的断线重连、事件恢复和幂等机制，参考主流 Agent 产品的 SSE 机制，但保留本项目现有流式协议的演进空间。"

## Summary

AI Mind 当前的聊天和 Agent 输出依赖一次性 HTTP 流连接。网络切换、浏览器挂起、代理超时或页面短暂失去焦点时，客户端会失去后续输出；如果直接重新发送 POST，又可能重复执行模型、Tool 或 Agent。

本版本为现有流式能力增加可恢复的执行语义：一次用户请求对应一个可识别的 run，流事件具有稳定顺序和恢复位置，客户端断线后可以重新订阅并补齐缺失事件；同一请求的重复提交不会创建重复执行。用户主动取消仍然是明确的业务操作，不会被网络断线误判为取消。

本版本借鉴 SSE 的事件编号、游标、心跳、重试和终态语义，但不要求浏览器直接使用 `EventSource`，也不要求把现有 NDJSON 响应整体替换为 SSE。

## Clarifications

### Session 2026-07-20

- Q: What is the v0.4.10 resumable-stream scope? → A: All current NDJSON streams, including ordinary chat, Tasklist Agent, and Delivery Chain.
- Q: What is the initial-versus-recovery connection shape? → A: Keep the existing POST + NDJSON initial stream, and add a separate subscription path for reconnecting and replaying an existing run.
- Q: How should an expired recovery cursor be handled? → A: Keep the run executing, explicitly report that complete recovery is unavailable, and provide final-state retrieval or restart guidance; do not silently skip events or automatically cancel the run.

### Session 2026-07-23

- Q: What is required after a page refresh or close? → A: v0.4.10 only guarantees reconnect within the same page lifecycle. After refresh or close, do not rejoin an active stream; if a final business result has already been persisted, normal conversation hydration may return it. The stale local-snapshot precedence issue is deferred.
- Q: What is the supported production execution boundary? → A: Use the current single long-lived Node.js webapp process in Docker Compose. Process-crash takeover, worker queues and cross-instance execution ownership remain out of scope.
- Q: What retention semantics should be used? → A: Use a rolling recent-event window for active runs, with bounded event count and payload size; terminal business state remains owned by existing business persistence.
- Q: What should cancel look like in the client? → A: Keep the existing optimistic stop UI. The client stops local streaming/retry immediately; the server records cancel intent and eventually projects the actual terminal outcome without adding a visible cancelling phase.
- Q: What is the v0.4.10 Tool idempotency boundary? → A: Do not promise generic external side-effect exactly-once execution. Reserve stable invocation identity for later Tool-level idempotency, but defer a durable side-effect ledger to a later version.

### Session 2026-07-27

- Q: Should v0.4.10 retain the pre-resumable one-shot stream protocol? → A: No. AI Mind is still in its pre-release product-sharing stage. `POST /api/chat` becomes a single resumable-envelope contract; old browser tabs, ad-hoc curl calls and internal scripts that consume raw chunk lines may fail at the deployment cutover.

## Goals

- 让普通聊天在短暂网络中断后能够继续显示同一次回答。
- 让所有当前 NDJSON 流，包括普通聊天、Tasklist Agent 和 Delivery Chain，都具备一致的断线恢复与终态收口语义。
- 让长时间运行的 Agent 在客户端断开后继续执行，并允许客户端重新连接查看进度。
- 防止客户端重试造成重复的用户回合、重复的 AgentRun 或重复的流事件展示。
- 明确区分网络故障、用户取消、可重试业务错误和不可重试终态。
- 在不改变既有 chunk 业务含义的前提下，将所有当前流统一为固定 envelope 交付协议。
- 为未来多实例部署和更长时间的 Agent 执行保留事件持久化边界。

## Non-goals

- 本版本不要求将 NDJSON 全量迁移为 `text/event-stream`，也不要求使用浏览器原生 `EventSource`。
- 本版本不引入 WebSocket、双向实时通道或通用消息队列产品。
- 本版本不提供跨用户、跨浏览器会话的 run 转移；run 仍归属于创建它的会话所有者。
- 本版本不要求页面刷新或关闭后重新订阅仍在执行的 run；重新进入只在已有最终业务结果时通过普通会话 hydration 返回结果。浏览器本地半截快照与服务端最终结果的优先级合并延后处理。
- 本版本不承诺所有外部副作用都具备通用的 exactly-once 执行语义；有副作用的 Tool 仍需遵守其自身的幂等约束。
- 本版本不把流事件永久作为聊天历史或完整 Agent 审计日志；事件恢复只覆盖规定的活动窗口，最终业务状态仍由现有业务数据承载。
- 本版本不提前实现任意 run 的 replay、分支执行、编辑历史输入或多 Agent 协同恢复。
- 本版本不再保留未协商 resumable profile 时的 raw one-shot NDJSON 输出；该协议切换仅适用于本次预发布发布窗口。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Recover a Chat Response After a Network Drop (Priority: P1)

用户发送一条普通消息后，浏览器在回答生成过程中发生短暂断网、网络切换或连接被代理关闭。用户重新获得网络后，希望继续看到原来的回答，而不是看到重复的 assistant 消息或被迫重新生成一份可能不同的回答。

**Why this priority**: 普通聊天是当前产品最常用的流式入口。即使 Agent 持久化尚未覆盖全部场景，只要普通问答能安全恢复，用户就能直接感知本版本的核心价值。

**Independent Test**: 使用可控的流量故障在回答中途切断客户端连接，再恢复连接；验证用户界面最终只呈现一次完整 assistant 回答，且断点前后的文本、结构化事件和终态顺序正确。

**Acceptance Scenarios**:

1. **Given** 一次聊天请求已经开始输出并产生了连续事件，**When** 客户端在两个事件之间断开并在恢复后重新订阅，**Then** 服务端从客户端最后确认的位置补发缺失事件，客户端不重复应用已确认事件。
2. **Given** 客户端在服务端返回请求标识之前就失去连接，**When** 客户端使用本次请求的客户端生成标识发起恢复，**Then** 服务端能够定位原请求或明确返回该请求不存在，而不会创建第二次执行。
3. **Given** 服务端已经发送终态事件后客户端才断开，**When** 客户端重新订阅，**Then** 客户端可以收到或确认同一个终态，并将本轮状态收口为完成、失败或取消中的正确一种。

---

### User Story 2 - Continue a Long-running Agent Run After Subscription Drop (Priority: P1)

用户启动一个需要较长时间运行的 Agent。当前页面的流订阅因网络故障、代理关闭或暂时失去焦点而断开后，Agent 继续执行；在同一页面生命周期内恢复连接时，可以看到没有遗漏的步骤进度、工具结果、人工审核状态和最终结果。页面刷新或关闭后的活动 run 重新订阅不属于本版本保证。

**Why this priority**: Agent 的执行时间和事件数量都高于普通问答，单纯依赖一次 HTTP 连接无法支撑可靠的产品体验；断开连接不应等同于停止 Agent。

**Independent Test**: 启动一个包含多个步骤的 Agent，在同一页面中途受控关闭流连接但不发送取消操作，随后恢复订阅，验证历史缺失事件被补齐、后续事件持续到达，且 Agent 只执行一次；页面刷新或关闭后的活动 run 不纳入本测试。

**Acceptance Scenarios**:

1. **Given** Agent run 处于执行中，**When** 当前流订阅断开且用户没有点击取消，**Then** Agent run 保持可恢复状态并继续执行，不因订阅者离开而自动转为取消。
2. **Given** Agent run 已产生部分步骤事件，**When** 用户使用合法的 run 标识和恢复位置重新连接，**Then** 用户可以按原顺序接收缺失的步骤、工具、资源、人工审核和结果事件。
3. **Given** Agent run 在用户重新连接前已经完成、失败或进入 paused/HITL waiting，**When** 用户重新订阅，**Then** 服务端对终态 run 返回可用历史尾部和 terminal state，对 paused run 返回可用历史尾部和可恢复 lifecycle state，且不会重新启动已经结束或暂停中的执行。

---

### User Story 3 - Retry Safely Without Duplicate Execution (Priority: P1)

用户或客户端库因为请求超时、浏览器重试或页面恢复而再次提交相同请求。系统应识别这是同一次用户操作，返回已有 run 的状态或已有流，而不是重复创建对话消息、AgentRun 或具有副作用的 Tool 调用。

**Why this priority**: 自动重连如果没有幂等边界，会把网络可靠性问题变成重复扣费、重复写入或重复 Agent 执行问题，风险高于“不自动重连”。

**Independent Test**: 对同一个客户端请求标识并发提交多次初始请求，并在首次连接建立前后分别制造断线；验证最终只存在一个执行实体和一个业务结果。

**Acceptance Scenarios**:

1. **Given** 同一个客户端请求标识已经创建了 run，**When** 客户端重复提交相同请求，**Then** 服务端返回原 run 的可订阅结果，不创建新的执行。
2. **Given** 两个连接同时尝试恢复同一个 run，**When** 两个连接使用相同或相邻的恢复位置，**Then** 两个连接都只能读取该 run 的事件，事件不会因为订阅并发而重复生产。
3. **Given** 重复请求的业务内容与原请求不一致，**When** 客户端复用已经使用过的请求标识，**Then** 服务端拒绝该请求并给出可定位的幂等冲突结果。

---

### User Story 4 - Understand and Control Connection State (Priority: P2)

用户需要知道当前状态是“正在自动恢复”“Agent 仍在后台执行”“已被用户取消”还是“发生了不可恢复错误”，并且可以明确停止执行，而不是因为页面暂时断网导致状态含糊不清。

**Why this priority**: 可恢复机制会引入更多中间状态。如果不把连接状态和业务状态分开，用户容易重复点击、误以为任务失败，或无法判断是否需要重新操作。

**Independent Test**: 分别模拟网络断开、手动取消、可重试错误、不可重试错误、恢复位置过期和正常完成，验证每种情况都有唯一的用户可理解状态和后续动作。

**Acceptance Scenarios**:

1. **Given** 连接暂时不可用但 run 尚未结束，**When** 客户端进入重试周期，**Then** 用户看到的是恢复中状态，而不是新的 assistant 回答或已失败状态。
2. **Given** 用户明确点击停止，**When** 取消操作被服务端接受，**Then** 后续自动重连被停止，run 进入取消终态或明确的取消失败状态。
3. **Given** 服务端返回不可重试错误或恢复位置已失效，**When** 客户端处理该结果，**Then** 客户端停止无限重试，并提供明确的重新生成或刷新结果入口。

## Edge Cases

- 客户端在收到事件但尚未保存恢复位置前断线；重连可能收到重复事件，客户端必须安全去重。
- 服务端已持久化事件但尚未推送给当前连接；重连必须能够补发该事件。
- 客户端提交的恢复位置早于事件保留窗口；服务端必须明确返回位置过期，不能静默从中间位置继续。
- 客户端提交的恢复位置大于服务端当前进度；服务端必须拒绝无效位置或返回当前可用状态，不能伪造已发送事件。
- 浏览器同时打开多个页面订阅同一个 run；所有订阅只能读取同一执行，不能触发多次执行。
- run 已在重连前进入完成、失败、拒绝、取消或版本不匹配等 terminal state，或进入 paused/HITL waiting 等非终态 lifecycle state；恢复操作必须只读取可用尾部，并按当前状态返回 terminal state 或可恢复 lifecycle state。
- 连接持续收到 heartbeat 但长时间没有业务事件；客户端不能把 heartbeat 当作业务进度，也不能因 heartbeat 重置 run 的终态判断。
- 服务端连接在没有终态事件的情况下异常结束；客户端必须将其识别为不完整流并按恢复策略处理。
- 用户在自动重连等待期间点击取消；取消优先级高于下一次重连，不能在取消后重新建立订阅。
- 恢复请求缺少会话所有权、run 不属于当前会话或请求标识冲突；服务端必须拒绝并避免泄露 run 是否存在之外的敏感信息。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-050-001**: 系统 MUST 为每次初始用户操作接受一个由客户端生成的稳定请求标识，并在该标识的有效期内将重复提交识别为同一次操作。
- **FR-050-002**: 系统 MUST 为每次实际执行分配稳定的 run 标识，并将普通聊天、Delivery Chain、Tool/Resource 事件和 Agent 进度事件关联到该 run。
- **FR-050-003**: 系统 MUST 为同一 run 的每个可恢复事件提供单调递增且不重复的顺序标识；heartbeat 可以不占用业务事件序号。
- **FR-050-004**: 系统 MUST 允许客户端提交最后确认的事件位置，并返回该位置之后的缺失事件以及之后产生的新事件。
- **FR-050-005**: 系统 MUST 保证恢复事件按照原始顺序交付；客户端重复收到同一事件时，最终可见结果 MUST 与只收到一次时一致。
- **FR-050-006**: 系统 MUST 在客户端断开但未明确取消时保持可恢复 run 的执行状态；流订阅的生命周期不得直接决定业务执行的生命周期。
- **FR-050-007**: 系统 MUST 为流提供保持连接活跃的 heartbeat，并使客户端能够区分 heartbeat、业务事件和终态事件。
- **FR-050-008**: 系统 MUST 对网络断开、临时服务不可用和可重试业务错误提供有限次数、带递增等待和抖动的自动重连策略；默认策略 MUST 以 500ms 初始延迟、2x exponential backoff、8s 单次等待上限、20% jitter、最多 8 次或 120s 总预算中先到者为上限；不得无限快速重试。
- **FR-050-009**: 系统 MUST 对参数错误、权限错误、幂等冲突、恢复位置过期、版本不匹配和不可重试业务错误停止自动重连，并提供可定位的错误状态。
- **FR-050-010**: 系统 MUST 将用户主动取消建模为独立操作；取消后客户端不得继续自动恢复，服务端不得把普通网络断开自动记录为用户取消。
- **FR-050-011**: 系统 MUST 为每个 run 提供明确的 lifecycle state 和 terminal state；`paused`/HITL waiting 属于可恢复的非终态 lifecycle state，真正 terminal state 至少能够区分完成、失败、拒绝、取消和版本不匹配；客户端只有在收到 terminal state 后 MUST 停止自动重连。
- **FR-050-012**: 系统 MUST 在恢复位置超出保留窗口时返回明确的“无法从该位置恢复”结果，并提供重新获取最终业务状态或重新开始操作的路径。
- **FR-050-013**: 系统 MUST 校验恢复和取消操作的会话所有权；未授权请求不得读取事件内容、提交取消或探测其他会话的详细 run 信息。
- **FR-050-014**: 系统 MUST 保持现有 NDJSON chunk 的业务类型、字段含义和前端展示语义；每个成功流响应 MUST 以包含请求标识、run 标识、事件顺序和终态信息的 versioned envelope 交付 chunk payload。
- **FR-050-015**: 系统 MUST 在请求创建、事件恢复、重复提交、并发订阅、用户取消和终态收口场景中提供可验证的 safe diagnostics；诊断字段 SHOULD 至少包含 opaque `diagnosticId`、`runId`、`requestId`、`eventId`/`sequence`、`status`、`errorCode` 和 `retryable`，且不得暴露 API Key、session cookie、原始 provider 错误、raw checkpoint、raw Prisma error、provider config、sensitive env 或内部提示词。
- **FR-050-016**: 系统 MUST 对事件恢复数据设置有限保留边界；活动 run MUST 按滚动窗口保留最近至少 10 分钟内的可恢复事件，并且 MUST 有可配置的 per-run event count 与 persisted payload byte 上限；v0.4.10 默认上限由 plan/contract 记录，已结束 run 的最终业务状态由现有业务数据继续负责查询。
- **FR-050-017**: 系统 MUST 拒绝缺少稳定 `Idempotency-Key` 的初始流请求；系统不得再返回 raw one-shot chunk line 作为成功流响应。
- **FR-050-018**: 系统 MUST 保持初始 POST + NDJSON 的单一 envelope 消费契约，并为同一页面生命周期内断线后的已有 run 提供独立的恢复订阅能力；恢复订阅不得重新创建或重新执行原 run。页面刷新或关闭后不要求恢复活动订阅。
- **FR-050-019**: 系统 MUST 在恢复位置过期时保持未终态 run 的执行状态，明确返回无法完整恢复的结果，并提供最终状态查询或重新开始操作的路径；恢复位置过期不得静默跳过事件或自动取消 run。
- **FR-050-020**: 系统 MUST 在同一页面生命周期内为尚未获得 `runId` 的初始 POST 保留稳定的 `Idempotency-Key` 和不可变请求内容；对网络失败、连接重置、无 body 及 `408/502/503/504` 使用同一 key 重试，且不得创建重复用户消息、会话或执行。
- **FR-050-021**: 系统 MUST 将初始 POST 自动恢复限制为最多 3 次重试和 20 秒端到端总预算；每次在途请求只能使用剩余预算，到期时必须中止该 attempt。用户取消或页面卸载必须保持为取消语义，不得被分类为 timeout/retry。
- **FR-050-022**: 系统 MUST 将已知 run 的流在未收到 terminal 或 `paused` lifecycle 时发生的 EOF 视为可恢复断连，并使用当前 cursor 走 recovery GET；`paused` 和 terminal EOF 不得触发无意义恢复。
- **FR-050-023**: 系统 MUST 在重复 initial POST 得到 `stream-replay` descriptor 后，将首次 GET 失败接入既有 known-run recovery policy，且不得重发 initial POST。
- **FR-050-024**: 系统 MUST 在新建 StreamRun 后 draft conversation 注册失败时向该 run 持久化安全的 `failed` lifecycle，避免不存在执行器的 run 长期保持 `running`；不得将原始 registry/database 错误写入 public DTO。

### Key Entities _(include if feature involves data)_

- **Client Request**: 用户一次初始操作的稳定身份，包含请求标识、输入一致性校验信息和创建结果关联。
- **Run**: 一次实际的聊天或 Agent 执行，包含 run 标识、所属会话、当前状态、终态和是否允许继续恢复。
- **Stream Event**: run 对外产生的可观察事件，包含事件序号、业务 payload、产生时间和终态标记。
- **Recovery Cursor**: 客户端已经确认消费到的位置，用于请求缺失事件和检测事件间隙。
- **Stream Subscription**: 客户端对 run 的一次实时或恢复性读取，不拥有 run，也不决定 run 是否继续执行。
- **Lifecycle State**: run 的可观察执行阶段，包含 running、recovering、paused/HITL waiting 和 terminal 等状态；`paused` 表示等待用户决策，仍可通过 resume/reject/version mismatch 继续收口。
- **Terminal State**: run 的不可继续执行状态，包含完成、失败、拒绝、取消和版本不匹配等业务结果。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-050-001**: 在受控网络断开并于 30 秒内恢复的测试场景中，100% 的可恢复 run 能够继续交付断点之后的事件，且最终终态与不中断执行时一致。
- **SC-050-002**: 在同一客户端请求标识被重复提交 3 次、包含并发提交的测试场景中，100% 只创建一个实际执行和一个业务结果。
- **SC-050-003**: 在事件重复投递、同一页面断线重连和并发只读订阅测试中，用户可见的文本、工具结果、Agent 步骤和 Artifact 不出现重复或乱序；测试结果达到 100% 通过。页面刷新后的活动 run 重接不属于本版本验收。
- **SC-050-004**: 95% 的普通网络断线恢复场景在网络恢复后 10 秒内重新进入事件接收状态；达到重试上限或明确不可恢复时除外。
- **SC-050-005**: 100% 的用户主动取消场景都能立即停止客户端后续自动重连并保留现有终止 UI；服务端取消请求在 5 秒内返回可验证的接受或失败结果，最终 run 状态由服务端收口。
- **SC-050-006**: 100% 的不可重试错误、无效恢复位置、幂等冲突和权限失败场景都能停止无限重试，并向用户提供可执行的后续动作。
- **SC-050-007**: 现有普通流消费和 Agent HITL resume 流程的既有协议测试、路由测试和前端 reducer 测试保持通过，且不改变原有业务 chunk 的展示含义。
- **SC-050-008**: 任意恢复或取消请求都不能读取其他会话的事件内容或改变其他会话的 run 状态；安全边界测试全部通过。
- **SC-050-009**: 100% 的成功初始流响应、HITL resume 响应和 recovery GET 响应均使用同一种 versioned envelope；raw chunk 响应不会被客户端静默接受。

## Assumptions

- v0.4.9 的 Monorepo、测试分层和 CI 治理已完成，本版本聚焦 Runtime stream、AgentRun 关联、恢复协议和前端消费行为。
- 当前 browser-session ownership 继续作为聊天和 AgentRun 的权限边界，不在本版本引入账号级共享或跨设备接管。
- 默认事件恢复窗口为活动 run 最近至少 10 分钟的滚动事件窗口；事件数量和 payload 大小必须有界，不能在窗口内静默丢失可恢复事件。
- 服务端可以为短期事件恢复提供共享存储或等价能力；单实例内存实现只能作为开发和验证方案，不能被视为多实例生产保证。
- 对外部 Tool 的副作用不由流恢复协议自动提供 exactly-once；需要幂等的 Tool 必须通过自身请求标识或业务约束保证安全。
- 客户端能够保存当前 run 标识和最后确认的恢复位置；自动恢复只覆盖同一页面生命周期内的连接断开。页面刷新或关闭后仅通过普通会话 hydration 查询已经持久化的最终业务结果。
- 当前生产部署以单个长生命周期 Node.js webapp process 为执行边界；进程崩溃后的执行接管属于后续版本。
- 本版本处于预发布产品分享阶段，允许以完整 webapp 镜像为单位取消 raw one-shot protocol；仍必须同步更新 schema、writer、reducer、测试和文档，且不得改变 chunk payload 的业务含义。
