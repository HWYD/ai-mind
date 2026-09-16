# Data Model: v0.6.0 General ReAct Agent MVP

## Scope

本版本的数据模型描述一次 `routeType=chat` 触发的 LangChain `createAgent` run-local state、runtime context 与边界 DTO，不是数据库 schema。General ReAct Run 可短暂独立于某一次 SSE transport，但不超过 180 秒且不支持 Agent state checkpoint/resume；Run 结束后内部中间状态整体释放。服务端只保留既有 StreamRun/StreamEvent 投影和 Chat Memory/UserMemory 允许的最终 user/assistant turn；浏览器现有 IndexedDB `conversation-snapshots` 可额外保存已完成 assistant message 的 public-safe Trace UI 投影与最终回答。

Action/Answer 的 prompt projection 是 `ChatSession` 与 runner 输入构造时的纯服务端配置，不是 Agent state、public DTO、StreamEvent、Memory 或 snapshot 数据。Answer projection 只承载面向用户的回答策略与可信上下文边界；Action-only Tool 指令和不可信资料中的嵌入指令都不得作为 Answer policy 数据。

## Entity: GeneralReActAgentState

`createAgent` 的 LangGraph state 是通用 ReAct Run 的唯一内部事实源，不再建立 project-owned mirror GraphState。built-in `messages` reducer 管理精确消息轨迹；AI Mind middleware 只通过 `stateSchema` 和显式 state update/`Command` 更新扩展字段。

仅供内部策略使用的字段在实现中采用 private state 语义，runner 只投影 `FinalTurnResult`，不向调用方返回整个 Agent state。

| Field                    | Shape                                                                  | Reducer / update rule                 | Constraints                                                                               |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `messages`               | `BaseMessage[]`                                                        | createAgent built-in messages reducer | 包含精确 `AIMessage` 与配对 `ToolMessage`；不得直接写入 public stream 或 memory。         |
| `_runPhase`              | `preparing \| acting \| answering \| completed \| failed \| cancelled` | replace                               | 只允许按状态机前进；不复制 LangGraph node identity。                                      |
| `_actionRoundCount`      | non-negative integer                                                   | afterModel increment                  | 最大 6；仅一次 model response 产生 Tool Calls 时增加一轮。                                |
| `_toolRequestCount`      | non-negative integer                                                   | afterModel increment                  | 模型声明的 Tool Call 数；可因最后一个超额 batch 大于 9，仅用于审计。                      |
| `_toolCallCount`         | non-negative integer                                                   | afterModel batch reservation          | 被 admission 接纳并占用逻辑 call budget 的数量，含后续拒绝/失败；最大 9。                 |
| `_currentActionBatch`    | `ActionBatchAdmission \| null`                                         | replace once per afterModel           | v2 派发前生成；并行 task 只读，批次汇合后替换或清除。                                     |
| `_executedToolCallCount` | non-negative integer                                                   | sum execution delta                   | 实际进入底层工具执行的逻辑调用数；用于最终 Memory source 分类。                           |
| `_actionModelCallCount`  | non-negative integer                                                   | afterModel increment                  | 仅 Action `createAgent` 逻辑 model turns；最大 7。                                        |
| `_modelRetryCount`       | non-negative integer                                                   | replace/increment                     | 每个逻辑 model call 最多一次 transient retry；单独观测。                                  |
| `_toolRetryCount`        | non-negative integer                                                   | replace from permit snapshot at join  | `RetryPermitPool` 的已发放 grant 数；实际普通 Tool retry 消费总计最多 4 次。              |
| `_observationChars`      | non-negative integer                                                   | sum bounded-observation delta         | 每个 task 受 admission allowance 限制；累计最多 32,000。                                  |
| `_authorizedUrls`        | `AuthorizedUrl[]`                                                      | canonical URL union                   | 仅由当前用户显式 URL 与本轮 search result 扩展。                                          |
| `_sources`               | `SourceRecord[]`                                                       | source identity union                 | 按 canonical URL 去重；不保存网页全文。                                                   |
| `_callFingerprints`      | `string[]`                                                             | unique append                         | 由 tool name + canonical args 生成；不得包含 secret。                                     |
| `_noProgressRounds`      | non-negative integer                                                   | replace after batch join              | 有新来源、不同成功观察或完成进展时清零；连续 2 轮停止。                                   |
| `_stopReason`            | `StopReason \| null`                                                   | coordinator replace once              | 并行 task 不写 Run stop；批次汇合后按固定优先级写入且不得改写。                           |
| `_finalizationMode`      | `normal \| constrained \| deterministic_fallback \| null`              | replace                               | 记录 Answer 结果模式，不包含模型推理；Action natural completion 不再是最终文本来源。      |
| `_startedAtMs`           | epoch milliseconds                                                     | set once by outer coordinator         | 在 deterministic preparation 前生成，再注入 Agent 初始 state；不得由 `beforeAgent` 重置。 |
| `_actionDeadlineAtMs`    | epoch milliseconds                                                     | set once                              | 等于开始时间 + 145 秒；达到后禁止新行动。                                                 |
| `_hardDeadlineAtMs`      | epoch milliseconds                                                     | set once                              | 等于开始时间 + 180 秒；不持久化。                                                         |

### State Ownership Invariants

- middleware 只能返回当前职责拥有的字段 patch，不复制完整 state。
- `messages` 由 `createAgent` 的标准 reducer 维护；下一轮 model request 和公开展示按 ActionBatchAdmission ordinal 投影，不建立第二套消息事实源。
- logical request/admission counters 只在 `afterModel` 对整批更新一次；并行 task 只提交 execution/retry/observation delta，不能各自执行 check-then-increment。
- URL/source/fingerprint 使用 associative、commutative、idempotent 的 keyed union；不得用并行 task 基于旧数组返回整份替换值，也不把 `Set`、`Map`、client 或 function 放入 state。
- Run 级 no-progress/stop 只在 action batch 全部 settled 后计算；Tool task 只返回自身 typed observation。
- 不配置 checkpointer 时 state 仅存在于当前 Run；private 字段仍按敏感内部数据处理。

## Entity: GeneralReActRunContext

run-local typed context 供 Agent tools/middleware 使用，不进入 state，也不持久化。普通依赖保持不可变；`RetryPermitPool` 是唯一允许内部单调变更的并发同步原语，其引用在 Run 内不可替换。

| Field                 | Shape                                     | Constraints                                                                                |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `executionContext`    | `ResolvedChatExecutionContext`            | 提供 server-authoritative session/owner；不得被 tool 修改。                                |
| `runSignal`           | `AbortSignal`                             | 仅表示显式取消、hard deadline 或 Run 级终止；贯穿 Action/Answer model 与 Tool。            |
| `toolDefinitionMap`   | `ReadonlyMap<string, ChatToolDefinition>` | 当前 Run allowlist 的唯一映射。                                                            |
| `publishChunk`        | `(chunk) => Promise<void>`                | 只能接收 public-safe chunk；支持微批量/背压，先投影到 event store，再 best-effort 写 SSE。 |
| `isTransportClosed`   | `() => boolean`                           | 只控制当前 SSE writer；不得阻止后端 Run、Tool 或 event projection。                        |
| `clock`               | monotonic clock abstraction               | 生产使用真实 clock；测试替身只在测试装配层。                                               |
| `normalizeModelError` | provider-owned normalizer                 | 只返回标准化分类，不输出 raw error。                                                       |
| `createPhaseModel`    | run-scoped model factory                  | 继续调用现有 Provider Registry；只调整 timeout/maxRetries 等策略参数。                     |
| `retryPermitPool`     | `RetryPermitPool`                         | 只做普通 Tool retry 的同步原子准入；不保存 observation/stop/messages。                     |

实现必须使用 `contextSchema` 承载这些依赖；middleware closure 只允许保存不可变 server policy 配置，不得复制 Run 依赖、计数、URL 或 stop state。

## Entity: GeneralToolPolicy

`GeneralToolPolicy` 是 General ReAct Action Phase 的 server-owned allowlist 解析规则，不是 Skill metadata、请求参数或持久化实体。它从已登记的固定候选 `calculator`、`datetime`、`text-transform`、`unit-convert`、`read-url`、`web-search`、`city-weather` 按 availability、`general-react-agent` scope 和 `standard-tool` execution policy 解析本轮只读 Tool map。

- 同一请求中有无 Skill、或选中任何现有 Skill，均产生相同的 Tool map；Skill 只影响 `skillSystemPrompt` 和输出风格 prompt。
- remote MCP `tools/list`、Skill capability selector、Resource、Prompt、脚本包与请求中未登记的 capability 均不是输入，不能扩大 Tool map。
- 解析在 Action Phase 前完成并冻结到 `GeneralReActRunContext.toolDefinitionMap`；Answer Phase 继续没有任何 Tool map。

## Runtime Primitive: GeneralReActExecutionGate

进程级容量门只保存 permit 数量，不是 Agent state、request store 或持久化实体。它可以作为刻意设计的 process singleton 存在，但不得保存或索引任何 user/session/request payload。

```ts
interface GeneralReActExecutionPermit {
    release(): void
}

interface GeneralReActExecutionGate {
    tryAcquire(): GeneralReActExecutionPermit | null
    activeCount(): number
}
```

约束：

- 每进程最多 8 个 active permit；`tryAcquire()` 同步、无等待队列。
- admission 位于确定性上下文和 provider/Tool 调用之前；无 permit 时返回标准化可重试 busy 结果。
- `release()` 幂等，但生命周期 owner 必须在 terminal projection、drain 和 cleanup 后的 `finally` 恰好调用一次。
- transport disconnect 不释放 permit；三条专用 Agent 不申请该 permit。
- 多实例不共享计数；v0.6.0 不用 Redis 或数据库行模拟分布式 semaphore。

## Entity: ActionBatchAdmission

每个包含 Tool Call 的 `AIMessage` 在 v2 Send task 派发前形成一个不可变、JSON-serializable admission。它是预算分配结果，不是第二套 scheduler。

| Field                      | Shape                           | Constraints                                                                    |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `batchId`                  | string                          | 当前 Run 唯一；不得包含 prompt、args 或 secret。                               |
| `actionRound`              | positive integer                | 对应产生本批次的 Agent action round。                                          |
| `orderedCallIds`           | non-empty `string[]`            | 与 assistant tool call ordinal 完全一致，用于下一轮 model 投影和 UI 稳定槽位。 |
| `admissions`               | `Record<callId, CallAdmission>` | 每个请求恰好一项；并行 task 只读取自己的记录。                                 |
| `reservedToolCallCount`    | non-negative integer            | 本批接纳数量；与既有 `_toolCallCount` 之和不得超过 9。                         |
| `reservedObservationChars` | non-negative integer            | 本批各 call observation allowance 之和；不得超过累计 observation 剩余额度。    |

```ts
interface CallAdmission {
    ordinal: number
    admitted: boolean
    blockedReason: 'tool_call_limit' | 'observation_limit' | null
    observationCharAllowance: number
}
```

### Admission Rules

- 先按 ordinal 接纳 9 次上限内的 remaining logical-call slots；未接纳的 call 仍进入 adapter，但只能生成配对的 `budget_blocked` observation，provider invocation 为 0。
- observation allowance 必须确定性分配，单 call 不超过 12,000 chars、总和不超过 Run 剩余 32,000 chars；额度不足以形成安全观察的 call 直接 `observation_limit` blocked。
- retry 不属于 ActionBatchAdmission；只有 observation allowance 在运行中的 sibling task 间不动态转借，批次汇合后未使用的累计额度可供后续 action batch 使用。
- `agent-tool` 在 effective tool resolution 阶段已经 fail-closed，不得出现在 admission。

## Entity: RetryPermitPool

`RetryPermitPool` 是每个 General ReAct Run 创建一次的并发同步原语，只负责实际普通 Tool retry attempt 的原子准入。它作为 typed runtime context dependency 传入，不持久化，也不保存 ToolObservation、URL、Source、stop reason 或消息轨迹。

```ts
interface RetryPermitRequest {
    callId: string
    retryOrdinal: 1 | 2
}

interface RetryPermitGrant extends RetryPermitRequest {
    permitId: number
}

interface RetryPermitPool {
    tryAcquire(request: RetryPermitRequest): RetryPermitGrant | null
    snapshot(): readonly RetryPermitGrant[]
}
```

### Retry Permit Invariants

- `tryAcquire()` 是同步、无 `await` 的原子临界区；同一时刻只有一个申请能获得最后一个 permit。
- Pool 总计最多发放 4 个 grant，同一 `callId` 最多 2 个，重复的 `(callId, retryOrdinal)` 不得重复发放。
- Tool 必须先确认错误可重试、单调用次数未超限并完成取消感知退避，再重新检查 request/action/hard deadline；只有 retry attempt 可以立即开始时才申请 permit。
- grant 一经发放即视为一次实际 retry attempt 并不可返还；未获得 permit 的 Tool 立即停止 retry，并用已有失败形成本逻辑调用唯一 ToolObservation。
- 初始 attempt 不申请 permit；未失败或无需 retry 的 sibling 从不占用额度，因此剩余额度可被同批或后续批次真正需要 retry 的 Tool 获取。
- Pool 是执行准入器而非第二份 Agent state；`snapshot()` 只能在 batch join/terminal 用于把已发放数量和 call 归属回写/核对 Graph state 与 ToolObservation。

## Entity: ToolExecutionPolicy

这是 `ChatToolDefinition` 产生模块拥有的 server-side 判别式配置，不属于模型可见的 Tool input schema，也不能由 chat request 提交。

```ts
type ToolExecutionPolicy =
    | {
          kind: 'standard-tool'
          profile: 'local-deterministic' | 'remote-readonly'
          attemptTimeoutMs?: number
          retrySafe: boolean
      }
    | {
          kind: 'agent-tool'
          profile: 'delegated-agent'
      }
```

### Standard Tool Rules

- `local-deterministic`: Profile attempt 上限 5,000ms，自动 retry 为 0；`calculator`、`datetime` 声明更短的 1,000ms Tool 自身上限。
- `remote-readonly`: Profile attempt 上限 20,000ms；`retrySafe=true` 且已通过前置校验的执行异常（网络、HTTP 4xx/5xx、provider typed error、解析或其他异常）每个逻辑调用最多 2 次 retry；前置拒绝和取消不进入 attempt。
- `attemptTimeoutMs` 省略时使用 Profile 上限；填写时只能缩短。有效值由 Tool Runtime 计算：

```text
effectiveAttemptTimeoutMs = min(
  profile.maxAttemptTimeoutMs,
  tool.attemptTimeoutMs ?? profile.maxAttemptTimeoutMs,
  actionDeadlineAtMs - now,
  hardDeadlineAtMs - now
)
```

- Tool/provider adapter 可以把有效 attempt 再拆成 connect/request/parse 等更短子超时，但必须复用派生的 `AbortSignal`，不得延长 deadline 或隐藏 retry。
- 同步 CPU Tool 不能仅依赖 timer 抢占；必须同时限制输入长度、允许语法和计算复杂度。若未来出现不可安全界定的重计算，需放入可终止 Worker，不能用 `Promise.race()` 假装已取消。

### Agent Tool Rules

- `agent-tool` 表示 Tool 内部委派完整 Agent/worker run，而不是一次原子操作；该分支不接受普通 Tool 的 `attemptTimeoutMs` 或 `retrySafe`。
- 外层只执行 scope/allowlist/schema/admission、父级取消与截止传播、一次逻辑委派和一次最终配对结果；不对整个 Agent Tool 做自动 retry。是否生成 public transcript 继续服从专用 Agent Runtime 的既有展示契约。
- 内部 model、stage、tool、timeout 和 retry 由专用 Agent Runtime 管理。当前已知实例是 Delivery Chain 的 `*-subagent` Tool；它们继续使用 `delivery-chain-manager` scope 和既有预算。
- `validate_tasklist_structure` 是本地确定性标准 Tool，不因为由 Tasklist Agent 使用而成为 Agent Tool。Tasklist Agent 和 Image Agent 是专用 route，不在本版本包装成 Tool。
- v0.6.0 的通用 ReAct effective tools 禁止包含 `agent-tool`；未来接入需要另行设计父子预算、幂等和持久化语义。

## Entity: ActionRequest

由 `AIMessage.tool_calls` 产生，并由 Tool Runtime middleware 标准化。

| Field           | Shape               | Constraints                                                                                 |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `callId`        | non-empty string    | 在本 Run 内唯一；用于 ToolMessage 配对。                                                    |
| `toolName`      | non-empty string    | 必须存在于当前 allowlist。                                                                  |
| `rawArgs`       | unknown             | 仅用于 normalize/strict parse/安全校验；不得直接交给 executor、fingerprint、stream 或 log。 |
| `validatedArgs` | JSON object or null | schema 校验成功后才存在。                                                                   |
| `fingerprint`   | string or null      | 仅在 Outbound Secret Guard 通过后，基于 tool name + canonical validated args 生成。         |
| `ordinal`       | positive integer    | 保留模型声明顺序；执行/完成可乱序，但模型投影和 UI 槽位以此稳定排序。                       |

## Runtime-Only: Resolved Web Provider

`resolveGeneralToolBinding()` 在每个 General ReAct Run 建立时，把当前 server-only Web Provider 配置解析为一个内部 adapter，并分别闭包绑定给本 Run 的 `web-search` 与 `read-url` Definition。它不是 GraphState、`ToolObservation`、`SourceRecord`、public DTO、Memory 或 snapshot 字段；同一逻辑 Tool 调用及其 retry 只使用这一个已解析 adapter。

## Entity: ToolObservation

每个 ActionRequest 必须产生一个对应观察，即使未真正执行工具。

| Field           | Shape                                                                                                                               | Constraints                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `callId`        | string                                                                                                                              | 与 ActionRequest 一致。                                                                                 |
| `toolName`      | string                                                                                                                              | 与 ActionRequest 一致。                                                                                 |
| `ordinal`       | positive integer                                                                                                                    | 来自 ActionBatchAdmission；用于乱序完成后的稳定归并。                                                   |
| `status`        | `success \| validation_error \| denied \| duplicate \| timeout \| cancelled \| provider_error \| execution_error \| budget_blocked` | 严格枚举。                                                                                              |
| `modelContent`  | string                                                                                                                              | 写入 ToolMessage 的内部安全观察；最多 12,000 chars。                                                    |
| `publicSummary` | string                                                                                                                              | 给 stream/UI 的短摘要；不得包含网页全文、raw error、被拒绝参数、secret 或不可证明的 redirect/安全细节。 |
| `sourceIds`     | `string[]`                                                                                                                          | 指向本次新增/使用的 SourceRecord。                                                                      |
| `truncated`     | boolean                                                                                                                             | 任一内容因预算截断时必须为 true。                                                                       |
| `retryCount`    | `0 \| 1 \| 2`                                                                                                                       | retry-safe 远端普通 Tool 最多两次受控 execution retry；本地确定性与 Agent Tool 必须为 0。               |
| `durationMs`    | non-negative integer                                                                                                                | 用于 observability；不暴露内部 timing trace 细节。                                                      |

### Pairing Invariant

对每一个 assistant message 声明的 `callId`，Agent `messages` 中必须追加恰好一个对应 `ToolMessage`。未知工具、非法参数、权限拒绝、duplicate、budget blocked、timeout 和取消也不能省略配对结果。retry attempts 不新增 ToolMessage，只由最终逻辑调用结果配对一次。并行完成顺序不构成消息顺序；下一轮 model request 必须按 admission 的 `orderedCallIds` 投影本批 ToolMessage。

## Entity: AuthorizedUrl

| Field            | Shape                | Constraints                                                                       |
| ---------------- | -------------------- | --------------------------------------------------------------------------------- |
| `canonicalUrl`   | string               | URL normalize 后的 HTTP(S) URL；无 username/password/hash，且不含已识别签名参数。 |
| `grantedBy`      | `user \| web-search` | 只允许两类来源。                                                                  |
| `grantCallId`    | string or null       | 搜索产生授权时关联 callId；用户输入为 null。                                      |
| `host`           | string               | canonical lowercase hostname。                                                    |
| `grantedAtRound` | non-negative integer | 便于限定为当前 Run。                                                              |

### URL Validation Rules

- scheme 仅 `http:`、`https:`；
- username/password 必须为空；
- URL fragment 在进入 provider payload 前移除；常见签名 URL 和包含可识别凭据值的 URL 不得授权；
- hostname 不得是 localhost、本机别名、loopback、link-local、multicast 或 private network；IPv4-mapped/compatible IPv6 必须先恢复为 IPv4 后再作同一判断；
- `read-url` 请求 URL 必须已存在于 `_authorizedUrls`；
- 已选 Web provider 的 Reader/Extract 只保证 initial requested URL 已校验，不声称可见 redirect chain；provider 明确返回的 URL 只有重新通过本规则后才能公开或授权；
- URL grant 不跨 Run、不写入 memory。

## Entity: SourceRecord

| Field        | Shape                               | Constraints                                                                        |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `sourceId`   | string                              | 当前 Run 唯一。                                                                    |
| `title`      | string                              | 规范化并限长。                                                                     |
| `url`        | canonical requested URL             | 与 AuthorizedUrl 同安全规则；不把 provider-reported URL 当作未经证明的 final URL。 |
| `originTool` | `web-search \| read-url`            | 明确来源。                                                                         |
| `status`     | `discovered \| read \| unavailable` | 生命周期只允许向右前进。                                                           |
| `snippet`    | short string or null                | public-safe、限长；不保存完整正文。                                                |

### Public UI Projection

- `web-search` 的“已搜索到 N 个来源”按该逻辑调用中通过 Outbound Secret Guard、URL policy 并按 canonical URL 去重后的 public results 计数；provider 原始数量、被拒绝结果和 retry attempt 不计入。
- “已读取 N 个页面”是当前 Run 中 `status='read'` 的唯一 canonical URL 数量；同一 URL 的多次调用或 retry 只计一次。`unavailable` 可形成失败状态，但不得进入成功读取数量。
- “已读取来源”是条件展示的派生视图，只包含 `status='read'` 的记录，按 canonical URL 去重并最多显示 5 项 `title + url`；没有成功读取记录时整个区域隐藏。
- `SourceRecord` 不包含 `isOfficial`。Runtime 不得根据 hostname、provider title 或模型自由文本推断“官方页面”；来源自身标题中的合法文本可以原样规范化展示，但不升级为系统背书。
- 这些数量和列表不进入 Chat Memory/UserMemory 或新的服务端实体；Run 正常完成后，它们的 public-safe Trace Part 可随 assistant message 进入现有浏览器本地会话快照。

## Derived View: GeneralAgentTraceView

这是 `routeType=chat` 的前端派生视图，不是 Agent state 或独立持久化实体；它由 `AgentRunPart(type='agent-run')` 和同一 assistant message 的 public-safe Tool/Skill/Resource/Prompt parts 派生，正常完成后可按下文投影为现有 `LocalConversationSnapshot` 中的安全 message parts。UI 实现位于 `components/chat/message-list/parts/general-agent/`；服务端 runtime 仍位于 `runtime/general-react-agent/`。

| Field          | Shape                                                | Constraints                                                                                                                   |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `displayState` | `active \| completed \| stopped \| failed`           | `active` 覆盖 Tool action 已结束但 final `text-start` 尚未到达的间隙。                                                        |
| `title`        | `正在思考 \| 已完成思考 \| 已停止思考 \| 处理未完成` | 固定本地化映射；不得使用模型自由文本或 raw stop reason。                                                                      |
| `shimmer`      | boolean                                              | 仅 `displayState='active'` 为 true；只作用于标题文字，`prefers-reduced-motion` 下静态展示。                                   |
| `expanded`     | boolean                                              | active 默认展开；用户主动收起后新事件不得强制展开；首个 final `text-start` 自动置 false 一次，之后服从用户 disclosure state。 |
| `rows`         | ordered `GeneralAgentTraceRow[]`                     | 统一承载 Agent Step、Tool、Skill、Resource、Prompt；按 assistant ordinal/稳定 phase 顺序，不按完成顺序重排。                  |
| `readSources`  | up to 5 `PublicSourceRecord(status='read')`          | canonical URL 去重；标题链接到安全 URL并显示 hostname；无记录时整个来源区隐藏。                                               |

`AgentRunPart` 只包含 `id`、`runId`、`status` 与 `type='agent-run'`；没有 `agentName`、Graph nodes、routes 或 debug summary。`AgentGraphPart(type='agent-graph')` 继续归专用 LangGraph Agent 所有，`agentName` 仅作为其 metadata。旧 `AgentStepPart(type='agent-step')` 不属于 v0.6.0 数据模型。`GeneralAgentTraceRow` 保留底层 `partId/toolCallId`、kind、ordinal、status、可信图标类型和 public-safe label。retry 只更新同一 row；相同 Tool 类型允许派生汇总文案，但不得丢失底层 identity 或 ordinal。Skill label 只能来自已授权 capability catalog/selection 的可信名称，固定文案为 `加载了{skill.name} Skill`；Resource/Prompt 只使用固定安全 formatter。

对通用聊天，`GeneralAgentTraceView` 是过程展示的唯一消费方：已归并的 Tool、Skill、Resource、Prompt Part 不再由 assistant message renderer 在 Trace 外生成旧面板。该展示所有权不改变 Part 的 stream schema，也不影响 Tasklist、Delivery Chain、Image Agent 的专用 renderer。

## Derived Local Projection: CompletedGeneralReActMessageSnapshot

该名称描述现有 `LocalConversationSnapshot.messages[]` 中完成态 assistant message 的投影规则，不新增 TypeScript 顶层实体、IndexedDB object store 或数据库表。

| Field/Concern       | Constraint                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility         | Run 为 `completed`、最终回答非空且 assistant message 已达到现有 stable commit 条件。                                                                            |
| Stored location     | 现有 `ai-mind-local-chat` / `conversation-snapshots`；沿用最近 50 会话、每快照最多 120 消息和现有清理语义。                                                     |
| Stored content      | assistant message identity、最终 `text` parts、`AgentRunPart(type='agent-run')` 与组成完整已完成 Trace 的 public-safe Tool/Skill/Resource/Prompt/Source parts。 |
| Forbidden content   | raw reasoning/provider metadata、raw Tool input/output/error、网页正文、内部 prompt、secret、Authorized URL、Agent state/context、fingerprint、deadline。       |
| Restore             | 沿用现有 local-first hydration；有效本地快照恢复 Trace 与答案，随后由 `GeneralAgentTraceView` 重新派生为默认收起的完成态，用户可手动展开。                      |
| Cancel/failure      | `cancelled`、`failed` 或只产生部分回答时不提交 stable snapshot；当前页面可暂留部分文本，取消标题为“已停止思考”。                                                |
| Deletion/regenerate | 沿用现有消息/会话 snapshot commit，删除旧 assistant message 时同步删除其 Trace parts，避免孤儿数据。                                                            |
| Degraded mode       | IndexedDB 不可用、超额、被清理或快照无效时，回退服务端最终问答；Trace 可缺失但不得阻塞聊天。                                                                    |

“完整 Trace”只指用户当时能够看到的完整 public-safe 执行过程，不等于 LangChain messages、原始 chain-of-thought 或 ToolObservation 全文。

`expanded` 不进入本地快照：它是当前页面 disclosure state，不是消息内容。刷新后的完成态统一从 `expanded=false` 开始。

## Runtime Primitive: DurableStreamProjectionBuffer

这是每个 Run 一个的 volatile public-event queue，不是新的数据库表或 Agent state。它只接收已经通过 public schema 和 secret boundary 的 event draft；数据库提交后返回带连续 sequence 的 envelope，再按序投递给当前 writer。

| Field/Limit               | Default | Constraint                                                                |
| ------------------------- | ------- | ------------------------------------------------------------------------- |
| `flushIntervalMs`         | 40      | 只用于首个最终回答 delta 之后、同一 part 的连续 text delta。              |
| `flushChars`              | 256     | JS string length 的提前 flush 阈值；不是 provider delta 的拆分上限。      |
| `highWaterItems`          | 64      | 尚未持久化 projection item 的最大数量。                                   |
| `highWaterBytes`          | 256KiB  | 尚未持久化的序列化 public payload 总量上限；不同于单 event payload 限制。 |
| `lowWaterItems`           | 32      | 高水位等待者恢复前的 item 阈值。                                          |
| `lowWaterBytes`           | 128KiB  | 高水位等待者恢复前的 byte 阈值。                                          |
| `firstTextDeltaImmediate` | true    | 每个最终回答 part 的首个 delta 立即 durable flush。                       |
| `persistBeforePublish`    | true    | transaction 成功前不得写给浏览器。                                        |

状态只允许：

```text
accepting
  → flushing(timer | chars | structural | terminal | explicit drain)
      ├─ committed → accepting | drained
      └─ failed → failed
  → backpressured(high water)
      ├─ below low water → accepting
      └─ cancel/deadline/failure → aborted | failed
```

不变量：

- 不同 `messageId/partId/type` 不合并；连续同 key text delta 可以合并为一个 public `text-delta` payload。
- 单个 provider delta 超过 256 chars 时整体立即 flush，不切片、不人为 pacing。
- structure/Tool/Trace/source/error/finish/cancel/terminal 必须先 flush 更早 text，并保留独立 envelope 与顺序。
- 一个 database batch 只锁定一次 run、分配连续 sequence、批量 insert、更新一次 run 并至多 trim 一次；terminal 只能位于最后。
- 高水位后 producer await，禁止 drop、overwrite、reorder 或无界 Promise chain。
- terminal、cancel、failure 和 `finally` 必须清理 timer、Abort listener、waiter 与 pending promise。

## Runtime Defaults: Database And Browser Stream

| Concern                           |                     Default | Constraint                                                                                             |
| --------------------------------- | --------------------------: | ------------------------------------------------------------------------------------------------------ |
| Prisma/PrismaPg clients           |                   1/process | 开发和生产均复用；不得 per-request disconnect。                                                        |
| PostgreSQL pool max               |                          10 | 多实例总连接数按实例数线性计算。                                                                       |
| PostgreSQL connection timeout     |                     5,000ms | pool admission 超时；不得突破 Run deadline。                                                           |
| PostgreSQL idle timeout           |                    30,000ms | 连接池空闲回收，不是 Run timeout。                                                                     |
| StreamEvent transaction max wait  | min(2,000ms, Run remaining) | 获取 transaction/connection 的上限。                                                                   |
| StreamEvent transaction timeout   | min(5,000ms, Run remaining) | durable batch transaction 上限；不是 Tool timeout。                                                    |
| Browser text buffer               |                  20ms + rAF | transient map/timer 使用 ref；terminal/abort/unmount flush 或 cleanup。                                |
| Local deterministic CPU p95       |                        ≤5ms | 通过输入/复杂度限制实现，不依赖异步 timeout 抢占 CPU。                                                 |
| Node event-loop delay p95         |                       ≤50ms | scripted reference load 验收目标。                                                                     |
| StreamEvent batch transaction p95 |                       ≤20ms | 仅预热后的 production-like PostgreSQL 环境 hard gate；记录 topology、数据库实例、并发、pool 与样本数。 |

## Entity: GeneralReActTimingMetric

进程级 observer 只保存内容无关的累计计数与有界延迟样本，不属于 Run state 或持久化数据。

| Field                 | Shape                          | Constraint                                                       |
| --------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `count` / `total`     | non-negative cumulative number | 进程启动后累计；不含文本、URL、Tool output 或 provider payload。 |
| `samples`             | fixed 1,024-slot ring buffer   | 仅保存最近的非负 duration；覆盖最旧样本，不得 `push` 无限增长。  |
| `p50` / `p95` / `max` | number                         | 每次 snapshot 从当前 ring window 计算；空窗口返回 `0`。          |

## Entity: RunBudget

这是 server-side runtime config，不由客户端自由提交。

| Limit                            |                                      Default | Enforcement point                                                 |
| -------------------------------- | -------------------------------------------: | ----------------------------------------------------------------- |
| Tool-bearing Action rounds       |                                            6 | policy afterModel Tool Call branch                                |
| Admitted logical tool calls      |                                            9 | policy afterModel batch admission                                 |
| Action model calls               |                                            7 | policy beforeModel；第 7 次只能作无 Tool terminal decision        |
| Reserved Answer model call       |                                            1 | runner；同一 resolved selection 的未绑定 Tool model               |
| Logical model calls              |                                            8 | Action 7 + Answer 1                                               |
| Whole backend Run                |                                  180 seconds | outer coordinator deadline + run-scoped AbortSignal；不含网络投递 |
| Action phase                     |                                  145 seconds | policy beforeModel/wrapToolCall                                   |
| Answer Phase                     |                           at most 30 seconds | runner unbound streaming answer                                   |
| Lifecycle reserve                |                           at least 5 seconds | runner hard-deadline calculation                                  |
| Local deterministic Tool attempt |                                5 seconds max | Tool Runtime；Tool 自身可进一步缩短                               |
| Calculator/datetime attempt      |                                1 second each | Tool Definition + Tool Runtime 最小值                             |
| Remote readonly Tool attempt     |                               20 seconds max | Tool Runtime；Tool/transport 子超时可进一步缩短                   |
| Standard Tool retry              | 2 per eligible logical call; 4 total per Run | `RetryPermitPool` actual-use atomic admission                     |
| Agent Tool outer retry           |                                            0 | 专用 Agent Runtime 管内部预算；外层不重跑整 Agent                 |
| Model retry                      |          1 per logical call; 1 total per Run | only marked transient failure                                     |
| Single observation               |                                 12,000 chars | ToolMessage 构建前                                                |
| Cumulative observations          |                                 32,000 chars | 每次 state update 前                                              |
| No-progress rounds               |                                2 consecutive | policy after tool batch                                           |
| Graph recursion                  |                                           16 | createAgent invocation config                                     |
| Tool concurrency                 |                                            3 | createAgent v2 invocation config                                  |

## Entity: StopReason

严格枚举：

- `natural_completion`
- `action_round_limit`
- `tool_call_limit`
- `model_call_limit`
- `action_deadline`
- `run_deadline`
- `observation_limit`
- `no_progress`
- `model_error`
- `tool_failure`
- `security_denied`
- `request_cancelled`
- `agent_contract_violation`

StopReason 用于安全 stream summary、metrics 和测试，不包含 provider 原始错误。

## Entity: FinalTurnResult

Runner 返回给现有 `ChatOrchestrator` 的最小结果。

| Field                   | Shape                                             | Constraints                                       |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `assistantText`         | string                                            | 最终用户可见文本。                                |
| `source`                | `chat \| tool`                                    | `executedToolCallCount > 0` 才为 `tool`。         |
| `stopReason`            | StopReason                                        | 必填。                                            |
| `finalizationMode`      | `normal \| constrained \| deterministic_fallback` | 可观测但不暴露推理。                              |
| `modelCallCount`        | integer                                           | Action 逻辑调用加恰好一次 Answer 尝试的安全统计。 |
| `modelRetryCount`       | integer                                           | 模型 retry attempt 统计。                         |
| `toolCallCount`         | integer                                           | admission 接纳并占用预算的逻辑 call 总数。        |
| `toolRequestCount`      | integer                                           | 模型声明的 Tool Call 总数，用于审计超额批次。     |
| `executedToolCallCount` | integer                                           | 实际工具执行总数。                                |
| `toolRetryCount`        | integer                                           | 工具 retry attempt 统计。                         |
| `sourceRecords`         | public-safe source array                          | 不含网页正文。                                    |

## State Transitions

```text
preparing
  → acting(createAgent model ↔ tools loop)
      ├─ no tool calls → answering(normal)
      ├─ policy limit/no-progress/recoverable failure → answering(constrained)
      └─ abort → cancelled
  → answering(one same-selection, unbound-Tool streaming model call)
      ├─ safe visible text → completed(normal | constrained)
      ├─ blank successful Answer with time → completed(deterministic fallback)
      ├─ provider error / Answer Tool contract violation / partial-stream error → failed
      └─ abort/hard deadline → cancelled | failed
```

| From         | Event                                | To                 | Required update                                                            |
| ------------ | ------------------------------------ | ------------------ | -------------------------------------------------------------------------- |
| `preparing`  | context ready                        | `acting`           | initial messages、authorized URLs、deadlines                               |
| `acting`     | model response without Tool Calls    | `answering`        | `natural_completion`、Action text remains internal                         |
| `acting`     | model tool calls                     | `acting`           | exact AIMessage、action count、batch admission                             |
| `acting`     | tool batch settled                   | `acting/answering` | paired ToolMessages、delta counts、union URLs/sources、batch stop decision |
| `acting`     | any policy limit                     | `answering`        | stop reason fixed、no new tools                                            |
| `answering`  | streamed answer                      | `completed`        | final text、normal/constrained mode                                        |
| `answering`  | blank successful response            | `completed/failed` | 有时间时使用 deterministic safe fallback；否则标准化失败                   |
| `answering`  | provider/tool-contract/partial error | `failed`           | 不追加 fallback；部分已见文本不进入 Memory 或稳定快照                      |
| non-terminal | SSE transport disconnected           | unchanged          | 停止当前 writer；继续后端 Run 和 event projection                          |
| non-terminal | explicit cancel                      | `cancelled`        | `request_cancelled`；停止在途工作；no Memory/stable local snapshot         |
| non-terminal | hard deadline/contract violation     | `failed`           | standardized stop reason；no raw Error                                     |

## Persistence Boundary

Allowed in server Chat Memory/UserMemory after `completed`:

- latest user text；
- `FinalTurnResult.assistantText`；
- existing assistant message ID；
- `source=chat|tool`；
- 既有 Memory pipeline 允许的安全短期上下文。

Allowed in the existing browser local conversation snapshot after `completed`:

- 上述最终 user/assistant turn；
- `CompletedGeneralReActMessageSnapshot` 定义的完整 public-safe Trace parts；
- 现有 snapshot metadata、容量和清理字段。

Never persisted in either boundary by this feature:

- createAgent state、完整 AI/Tool message trajectory；
- raw reasoning/provider metadata；
- raw Tool input/output/error、ToolObservation 全文、网页正文、AuthorizedUrl set；
- counters/fingerprints/deadlines/middleware context；
- Token、Cookie、API key、Authorization 值、签名 URL、prompt、raw errors。
- Answer provider error、Answer Tool contract violation 或已公开部分 Answer 的失败文本；这些 Run 不得伪装为 completed。

Public-safe Trace parts 只进入浏览器本地完成态快照，不进入服务端 Chat Memory/UserMemory，也不提供跨设备恢复。
