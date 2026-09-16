# Contract: General ReAct Runtime

## Purpose

定义 `routeType=chat` 从 `ChatOrchestrator` 进入 LangChain `createAgent`、完成多轮行动并返回最终轮次的稳定边界。本文是内部模块 contract，不新增 public API endpoint。

## Entry Contract

### Preconditions

- request 已通过现有 chat API schema、身份、ownership、rate limit 和 resumable stream 装配；
- route 已被解析为 `chat`，且未被 Tasklist Agent、Delivery Chain、Image Agent 接管；
- model selection 同时满足 chat 与 tool-calling capability；
- effective tools 已由独立 `GeneralToolPolicy` 按固定候选、availability、scope 与 execution policy 解析并 fail-closed；Skill 不影响该集合；
- Composer 显式 command/`@resource` 与 Memory 已完成确定性准备，但尚未生成最终回答；Skill 不会触发 Capability/Prompt preparation；
- stream writer、transport 状态与 run-scoped AbortSignal 只作为 runtime dependency，不进入 Agent state；transport disconnect 不等于 Run cancellation。

### Runner Input

```ts
interface GeneralReActRunInput {
    request: ChatRequest
    context: ResolvedChatExecutionContext
    session: GeneralReActChatSession
    preparedContext: PreparedGeneralChatContext
    runSignal: AbortSignal
    publishChunk: (chunk: ChatStreamChunk) => Promise<void>
    isTransportClosed: () => boolean
}
```

约束：上述接口名为计划目标；实现时由产生模块拥有并从模块公开入口导出。`preparedContext` 只包含消息、非消息 observation 和初始用户授权 URL，不包含 raw request/session secret。`runSignal` 只合并显式 cancel、hard deadline 和 Run 级 terminal signal；`publishChunk` 必须 await durable projection/backpressure，`isTransportClosed` 只控制当前 SSE writer，不能取消 Agent 或阻止 event store projection。process permit 由包住 preparation → runner → terminal projection/drain 的外层 General ReAct execution scope 持有，不进入 Agent state 或 Runner Input。

### Runner Output

```ts
interface PublicSourceRecord {
    sourceId: string
    title: string
    url: string
    originTool: 'web-search' | 'read-url'
    status: 'discovered' | 'read' | 'unavailable'
    snippet?: string
}

interface GeneralReActRunResult {
    assistantText: string
    source: 'chat' | 'tool'
    stopReason: StopReason
    finalizationMode: 'normal' | 'constrained' | 'deterministic_fallback'
    modelCallCount: number
    modelRetryCount: number
    toolRequestCount: number
    toolCallCount: number
    executedToolCallCount: number
    toolRetryCount: number
    sources: PublicSourceRecord[]
}
```

`source` 只按 `executedToolCallCount > 0` 判断。取消、failed terminal、Answer Tool contract violation 或部分 Answer 后的 provider error 均不得作为 completed turn 写入 Memory。

## Agent Composition Contract

唯一 composition root 必须等价于：

```ts
createAgent({
    model: unboundModel,
    tools: effectiveTools,
    version: 'v2',
    stateSchema: generalReActAgentStateSchema,
    contextSchema: generalReActRunContextSchema,
    middleware: [generalReActRunPolicyMiddleware, generalReActToolRuntimeMiddleware, configuredModelRetryMiddleware],
    // checkpointer/store intentionally omitted
})
```

实际 API 形状以选定 LangChain stable 版本为准，但必须保持以下不变量：

- `createAgent` 是唯一 model/tool loop；
- model 来自 AI Mind Provider Registry，并且未预绑定 tools；
- effective tools 作为单独参数传入；
- 不配置 checkpointer/store；
- 不再创建通用 `StateGraph`、外层 Agent Graph 或手写 while-loop；
- runner invocation 设置 `maxConcurrency=3`、`recursionLimit=16` 和 run-scoped signal；当前 HTTP/SSE transport signal 不得合并进该 signal；
- LangChain raw result/state/event 不越过 runner 边界。

## Middleware Contract

## Prompt Decision Contract

- Action Prompt 是 Tool policy 的决策说明，不是新的 Runtime router。它必须明确区分：需要公开网络证据的任务、需要网页正文的任务，以及无需外部资料的稳定解释、写作或对用户已给内容的处理。
- 用户明确要求搜索、查找公开文章/链接/教程、核对外部资料或从网页中选择材料时，Action Prompt 必须指示 `web-search` 优先于基于模型知识直接作答。
- 用户给出当前消息中的合法 URL 且要求阅读、摘录或总结时，Action Prompt 可指示 `read-url`；未给 URL 的选文、阅读、摘录或总结网页任务必须指示先 `web-search`，再只读取本 Run 搜索结果已授权的 URL。
- 用户要求的站点、语言、主题或材料类型是搜索结果筛选约束；没有符合条件的结果时，不得把不符合条件的页面伪装成满足请求的替代品。
- Action Prompt 必须同时明确：稳定概念解释、写作/改写、用户已提供内容的总结或没有外部资料要求的建议，不应为了展示能力而联网。
- Answer Prompt 只可根据当前 Run 的成功 observation 表述搜索、读取、来源数量、授权失败或网页结论。没有对应 observation 时不得虚构“已搜索”“工具返回”“未获授权”“找到若干来源”、链接、摘要或正文结论。
- 上述规则不改变 effective Tool 集、Tool schema、Tool Runtime、Provider、URL authorization、retry、预算、stream、Memory 或 public DTO，也不把模型的概率性 Tool 选择表述为确定性 Runtime 保证。
- Action Prompt 可使用下列不与产品推荐/Tool 测试题重合的短决策样板，作为语义边界而非关键词规则或模拟对话：近期公告/利率查询→搜索；未给 URL 的 PostgreSQL 慢查询教程选文→先搜索后读取一篇；用户提供公开链接并要求提炼风险→直接读取；限定政府网站办事材料→按来源筛选且无匹配不替代；订单扣库存中的乐观/悲观锁解释→不联网；用户粘贴周报并要求管理层摘要→不联网。

### GeneralReActRunPolicyMiddleware

| Hook                            | Responsibility                                                                                                | Required state update                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `beforeAgent`                   | 初始化 started/action/hard deadlines 和 counters                                                              | initial private policy state                  |
| `beforeModel` / `wrapModelCall` | 检查 abort、Action model limit、剩余 Action time；设置本次 model timeout                                      | Action logical model count、stop state        |
| `afterModel`                    | 判断 Action terminal decision/Tool-bearing round；按 ordinal 创建 batch admission，预占 Tool/observation 配额 | action round、logical reservations、admission |
| batch join / `beforeModel`      | 汇合 task delta/union，按固定优先级计算 no-progress/stop，规范化下一轮消息投影                                | counters、stop state                          |
| `afterAgent`                    | 固定 Action outcome；runner 负责后续唯一 Answer Phase                                                         | Action summary                                |

### GeneralReActToolRuntimeMiddleware

每个 tool call 必须按以下顺序处理；步骤 1 先消费 Run Policy 已生成的 admission，之后才允许进入普通 Tool Runtime：

1. 按 call ID 读取 `CallAdmission`；未接纳时直接返回配对 `budget_blocked`；
2. ensure call ID 与 ordinal 一致；
3. tool name allowlist/runtime scope；
4. `normalizeArgs`；
5. strict schema parse；
6. Web Tool 执行 Outbound Secret Guard；未通过时不得构建 fingerprint、public input preview 或 provider request；
7. canonical fingerprint/duplicate；
8. tool-specific authorization（包括 URL scope）；
9. 解析 `standard-tool/agent-tool` execution policy、observation admission allowance 与 remaining deadline；
10. 委派唯一 Tool Runtime executor；普通 Tool 在这里执行有效 timeout、attempt 和受控退避；
11. 按 admission 的 observation allowance 构建 internal observation 与 public summary；
12. 返回恰好一个 ToolMessage 或包含该 ToolMessage 的 state delta `Command`。

unknown、invalid、outbound security denied、permission denied、duplicate、budget blocked、timeout、cancelled 和 execution error 都必须配对，不得让框架生成第二条竞争错误消息。安全拒绝只能返回稳定分类，不能回显命中的 query、URL、凭据值或检测规则。

### Retry Ownership

- 通用 ReAct model 与 `standard-tool` provider/client/transport 构造时 `maxRetries=0` 或关闭隐藏 retry；`agent-tool` 内部继续服从专用 Agent Runtime。
- General ReAct 的 MCP Tool adapter 必须显式关闭 MCP client session recovery；`AbortSignal` 和有效 attempt timeout 继续传入 SDK 请求，任何 retry 只由 Tool Runtime 在 permit/deadline 检查后启动。
- `modelRetryMiddleware` 对每个逻辑 model call 最多 retry 1 次；policy 额外限制每个 Run 最多 1 次 model retry。
- 不叠加 LangChain `toolRetryMiddleware`。`GeneralReActToolRuntimeMiddleware` 是普通 Tool retry 的唯一所有者：`remote-readonly` 且 `retrySafe=true` 时，每个逻辑 Tool call 最多 retry 2 次，每个 Run 最多 4 次 Tool retries；`local-deterministic` 和 `agent-tool` 外层 retry 为 0。
- retry 不在 batch 中预分配。每次 retry-safe remote execution failure 完成退避并重新通过取消/deadline 检查后，Tool Runtime 必须紧接着调用 run-local `RetryPermitPool.tryAcquire({ callId, retryOrdinal })`；成功 grant 后立即开始并计入 retry attempt，失败则不重试。Pool 同步原子限制单 call 2 次、Run 总计 4 次，未失败 Tool 不占额度。
- 通过 allowlist、scope、schema、security、authorization、duplicate 和 budget 等前置校验后，`remote-readonly` 且 `retrySafe=true` 的 Tool 对网络异常、HTTP 4xx/5xx、provider typed error、解析异常及其他执行异常统一允许重试；provider/client/transport 不得在 Tool Runtime 之外隐藏重试。
- 前置校验拒绝、显式 cancellation/abort、deadline 已耗尽和未获得 retry permit 不重试；这些情况不会启动新的底层 attempt。
- logical call counter 每个 model/tool decision 只增加一次；retry attempt 使用独立 counter。
- Tool retry 优先遵循 1～10 秒合法 `Retry-After`；否则第一次等待随机 1～2 秒、第二次等待随机 2～4 秒。等待和 retry 前重新检查 abort、剩余 phase/hard deadline 与 Run retry budget；时间不足时不得开始。
- retry 中间失败不产生第二个 public terminal error 或 ToolMessage。

## Message Trajectory Invariants

1. Agent state 内保留 provider 返回的完整 `AIMessage`，包括后续 tool turn 协议所需但不可公开的 metadata。
2. 每个 assistant `tool_call_id` 后必须有且仅有一个对应 `ToolMessage`。
3. 同轮 `standard-tool` 最多 3 个底层调用重叠；完成顺序可以不同，但下一轮 model request 的 ToolMessage 投影必须按 assistant tool call ordinal 排序并保持 ID 一一对应。
4. 校验失败、权限拒绝、unknown tool、duplicate、budget blocked、timeout 和取消也形成配对 ToolMessage。
5. retry attempts 不产生额外 ToolMessage；只有最终逻辑调用结果进入 messages。
6. Action 结束后 Answer Phase 使用同一 resolved selection 的 unbound model，任何新 Tool Call 都视为 `agent_contract_violation`，不得执行。
7. public stream 和 Memory 不消费 raw message trajectory。

## Context Preparation Contract

- Composer command、Capability、Prompt、MCP Resource/Prompt、Chat Memory、UserMemory 仍由现有 adapter 执行校验与读取。
- 成功结果必须转成 `BaseMessage[]` 或受控 context observation 交给 Agent。
- Context adapter 可以 fail-closed 或产生安全失败 observation，但正常成功后不得直接生成最终 assistant answer 绕开 Agent。
- 非消息 payload 继续参与 token-aware preflight；不得把原始 provider/client 对象放入 Agent state。
- preparation 的耗时计入 180 秒 Run deadline，但不计入 model/tool/action round。

## Process Admission Contract

- `GeneralReActExecutionGate` 是每 Node.js 进程一个的纯计数 singleton，最多发放 8 个 active General ReAct Run permit；不得保存 user、session、prompt、message、Tool data 或其他 request-scoped state。
- admission 必须发生在 deterministic preparation 和任何 provider/Tool 调用之前。没有 permit 时复用 `STREAM_SERVICE_UNAVAILABLE`、`retryable=true` 和固定“服务繁忙，请稍后重试。”，不进入内存等待队列，模型/Tool 调用数为 0，也不公开内部容量数字。
- permit 在 terminal projection、projection drain 和资源 cleanup 后由 runner `finally` 恰好释放一次。SSE transport disconnect 不释放 permit；显式 cancel、hard deadline 和 projection failure 只在实际 lifecycle 清理后释放。
- Tasklist、Delivery Chain、Image Agent 不使用该 gate。该 gate 是 per-process，不通过 Redis/PostgreSQL 扩展为分布式 semaphore。

## Transport And Run Lifecycle Contract

- `startedAt` 在 deterministic preparation 前记录；180 秒预算止于 terminal event 完成既有 event store projection，不包含 SSE network flush、客户端接收或重连等待。
- 现有 `StreamExecutionCoordinator` 是 run-scoped execution owner；普通 SSE disconnect 只关闭当前 writer，后端 Agent 继续使用同一 execution owner 和 state，不能创建第二 executor。
- public-safe chunk 必须继续投影到既有 event store；仅当 transport 仍打开时才 best-effort 写入当前 response。授权客户端沿用既有 cursor/replay contract 获取已投影事件。
- General ReAct 只发 `agent-run-start/end` 并在客户端生成 `AgentRunPart(type='agent-run')`；不得发 `agent-graph-*` 或依赖 `agentName` 路由。Tasklist 等专用 LangGraph Agent 继续生成 `AgentGraphPart(type='agent-graph')`。旧 `agent-step` 不再被 schema 或快照读取。
- 显式 cancel 通过既有 cancel path 进入 `runSignal`；hard deadline 和 Run 级 terminal signal 同样传播到 Action/Answer model 与 Tool。transport abort 不得进入 `runSignal`。
- 本契约不序列化或恢复 `createAgent` state，不新增 checkpointer、AgentRun 或长期任务队列。
- public event 投影必须通过可等待的 durable sink；高水位背压可以暂停继续拉取 createAgent stream，但等待仍受 runSignal/action/hard deadline 约束。

## Budget Contract

Runtime config 使用服务端固定默认值：

```text
maxToolBearingActionRounds = 6
maxToolCalls = 9
maxActionModelCalls = 7
reservedAnswerModelCalls = 1
maxModelCalls = 8
maxRunDurationMs = 180000
actionDeadlineMs = 145000
maxAnswerPhaseMs = 30000
terminalReserveMs = 5000
localDeterministicMaxAttemptTimeoutMs = 5000
remoteReadonlyMaxAttemptTimeoutMs = 20000
calculatorAttemptTimeoutMs = 1000
datetimeAttemptTimeoutMs = 1000
maxRemoteReadonlyToolRetries = 2
maxModelRetries = 1
maxTotalToolRetries = 4
maxTotalModelRetries = 1
maxObservationChars = 12000
maxCumulativeObservationChars = 32000
maxNoProgressRounds = 2
recursionLimit = 16
maxConcurrency = 3
```

进程/stream performance defaults 不属于单 Run 行动预算，但同样是服务端固定策略：`maxActiveGeneralReActRunsPerProcess=8`、server text flush `40ms | 256 chars`、projection high-water `64 items | 256KiB`、low-water `32 items | 128KiB`、browser text flush 默认 `20ms + rAF`（仅已评估模型可在 allowlist 覆盖 timer）、PrismaPg pool `max=10`。完整约束见 [runtime-performance.md](./runtime-performance.md)。

- 客户端不得通过 chat request 放宽这些值。
- 网络投递、客户端接收和重连等待不得计入、延长或缩短 `maxRunDurationMs`。
- 每次 model/tool/retry 前必须同时检查 abort、phase deadline 和对应 admission/count。
- `afterModel` 必须在 v2 Send task 派发前为整个 batch 生成唯一 admission：按 ordinal 接纳剩余 `maxToolCalls=9`，并确定性分配累计 observation allowance。超额/无 observation 配额的 call 不执行 provider，但仍返回配对 `budget_blocked` ToolMessage；retry 不在这里预占。
- 并行 task 只提交执行数、实际 retry 数、实际 observation chars 的 delta，以及 Authorized URL/Source/fingerprint keyed union；不能基于旧 state 返回完整集合或写 Run 级 stop/no-progress。批次汇合后由 Run Policy 单点结算。
- action model timeout 必须取配置上限与 action remaining time 的较小值。
- `standard-tool` 单次有效 timeout 必须取 `Profile 上限`、`Tool Definition 自身 attemptTimeoutMs 或 Profile 默认值`、`action remaining`、`hard remaining` 中的最小值。Tool timeout/retry 配置不得进入模型 Tool schema。
- Tool/provider adapter 只允许在有效 attempt 内定义更短的 connect/request/parse 子超时，并必须传播派生的 `AbortSignal`；同步 CPU Tool 还必须用输入/复杂度边界保证可终止。
- `agent-tool` 不适用普通 Tool 的 1/5/20 秒 attempt 和自动 retry；专用 Agent Runtime 管内部预算，外层只传播父级取消/截止并收取一次结果。通用 ReAct effective tools 在 v0.6.0 不允许包含 `agent-tool`。
- Action 最多使用 7 次逻辑 model call；第 7 次若没有 Tool Call 即形成 terminal decision，若仍请求 Tool 则不得 admission 并改由 constrained Answer 收口。最多 6 个 Tool-bearing Action rounds。
- 非取消、非 hard deadline 的 Action outcome 必须进入一次 Answer；无 Tool terminal decision 使用 normal mode，达到 action deadline、调用上限、无进展或可恢复失败使用 constrained mode。
- hard deadline 到达后不再启动任何工作；terminal reserve 只用于 stream/error/lifecycle 收口。
- recursion limit 是最后一道框架保护，不替代业务 counters/deadlines。

## Parallel Batch Contract

- v0.6.0 不引入 `parallelSafe` 字段；generic effective tools 是由 resolver 封闭控制的 `standard-tool/local-deterministic|remote-readonly` 集合，任何 `agent-tool` 或未来副作用 Tool 必须在绑定前 fail-closed。
- 同批调用不得消费兄弟调用产生的 Source/Authorized URL；`web-search → read-url` 必须经过下一轮 model decision。
- 单个 Tool 的失败只形成自己的 ToolObservation，不取消已接纳的兄弟调用；显式 Run cancellation、action/hard deadline 或 Run terminal signal 必须传播给全部在途和排队调用，SSE transport disconnect 不传播。
- `maxConcurrency=3` 只限制同时执行宽度，不改变 batch admission 数量；例如同批 4 个已接纳调用中前三个可开始，第四个等待，并在实际开始前重新检查 deadline。
- 普通 Tool 的 start lifecycle 是执行前契约：通过校验后必须 await start 的 durable publish，才可进入首个底层 invoke；成功、错误和带来源的 terminal lifecycle 只能在最后 attempt 结束后投影，且保持同一 `partId` 与 sequence 顺序。
- `RetryPermitPool` 是唯一并发 retry gate：申请顺序由实际 retry-ready 顺序决定，grant 操作内部不得 `await`；同一调度周期的调用由 JavaScript 任务调度顺序串行进入临界区，业务 contract 只保证单 call/Run 上限，不保证某个 ordinal 必然获得最后一个 permit。
- Run stop priority 固定为 `request_cancelled > run_deadline > agent_contract_violation > action_deadline > model_call_limit > action_round_limit > tool_call_limit > observation_limit > no_progress > model_error > tool_failure > security_denied`；其中 `request_cancelled` 仅表示显式 Run cancellation，不表示 SSE transport disconnect。`natural_completion` 仅在不存在停止原因时成立。

## Terminal Contract

## Final Text Projection Contract

- Action Phase 的 `messages` stream 文本、reasoning 和 metadata 只供内部模型轨迹/策略使用；无论该 turn 是否包含 Tool Call，均不得进入 public stream、durable event、Memory 或 snapshot，也不得为了回放而缓存为最终文本。
- 非取消、非 hard-deadline 的 Action outcome 后，runner 必须以同一 resolved model selection 创建一个未绑定 Tool 的 Answer model，直接消费其安全文本 stream。Answer 的第一个非空安全 delta 立即创建并 durable-project `text-start`/`text-delta`；之后按既有 40ms/256-char 规则投影。
- Answer 未经 `createAgent` 或 `.bindTools()`；若 provider 违反未绑定 Tool contract 返回 `tool_calls` 或 `tool_call_chunks`，该调用不得执行。该 Tool contract violation 固定以 failed 收口：不得追加 fallback，已公开的部分文本不写入 Memory 或稳定快照。

| Terminal cause                                                          | Runner behavior                                    | Memory                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Action terminal decision/no Tool Calls                                  | 一次 normal unbound streaming Answer               | Answer 成功才 eligible                            |
| Budget/no progress/action deadline                                      | 一次 constrained unbound streaming Answer          | Answer 成功才 eligible                            |
| Recoverable model/tool failure with reliable observations               | 一次 constrained unbound streaming Answer          | Answer 成功才 eligible                            |
| Blank successful Answer with remaining time                             | deterministic safe fallback                        | 非空 completed fallback 才 eligible               |
| Answer provider error, Tool contract violation, or partial-stream error | standardized failed terminal; no appended fallback | never                                             |
| Explicit Run cancellation                                               | 立即停止，不补 final                               | never                                             |
| SSE transport disconnect                                                | 后端继续，事件投影后可重连回放                     | completed 后按正常 eligibility                    |
| Hard deadline                                                           | 停止调用并完成最小安全 lifecycle/error             | never unless completed final 已在 deadline 前确定 |
| Agent contract violation                                                | standardized failure + safe log                    | never                                             |

Answer Phase 不是第二个 Agent，也不读取或绑定新工具。输入只包含用户问题、可靠 observation、安全来源和固定 stop reason；不得包含任何 Action assistant text、raw error、网页全文之外的受控 observation 上限、raw reasoning 或 middleware context。normal 与 constrained 仅改变受限提示和 `finalizationMode`，不形成两条执行链。

Answer 的 system prompt 必须独立于 Action 构建。优先级固定为：不可覆盖的系统安全与运行时约束 → server-owned Answer 基线表达策略 → 可信 Skill 的输出风格 → 用户直接的长度/格式要求 → Web、Tool observation、Resource/Prompt 中的不可信资料。普通问题默认结论优先并提供适中的必要解释；用户明确要求简短、详细、步骤、表格或特定格式时可覆盖该默认。Action-only 的 Tool 选择、调用、重试或后续行动指令不得进入 Answer messages；不可信资料中的指令不得改变表达策略、Tool allowlist、授权 URL、预算或数据访问范围。

## Model Capability Contract

- `routeType=chat` 的 selection 必须声明 tool calling。
- Provider Registry 返回的 `BaseChatModel` 必须能被 `createAgent` 正常绑定 effective tools。
- 模型 ID 只能改变 provider/model，不改变 GeneralToolPolicy、Skill prompt、URL scope、middleware 或预算。
- 不满足条件时 fail-closed；不得自动切换模型或回到旧 direct answer。

## Error Contract

| Failure                            | Internal outcome                                                                        | Public outcome                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| General ReAct capacity unavailable | no permit；no preparation/model/tool invocation                                         | `STREAM_SERVICE_UNAVAILABLE`、retryable；固定“服务繁忙，请稍后重试。”且不回显内部计数 |
| Invalid/unknown tool               | paired failure observation                                                              | 安全工具失败摘要；Agent 可修正                                                        |
| Outbound security denial           | paired denied observation；never retry                                                  | 通用安全拒绝；不显示参数或命中规则                                                    |
| Tool execution failure             | `remote-readonly + retrySafe=true` 最多 2 次 retry，共最多 3 attempts；其他 Tool 不重试 | 不含 raw provider error                                                               |
| Model transient failure            | optional one Action retry, then policy stop                                             | constrained Answer 或现有安全错误                                                     |
| Budget/no progress                 | policy stop                                                                             | constrained Answer 明确说明信息/行动受限                                              |
| Explicit Run cancellation          | cancelled                                                                               | 停止调用；不补写 final turn                                                           |
| SSE transport disconnect           | Run state unchanged                                                                     | 当前连接停止；后端继续投影以供回放                                                    |
| Durable projection failure         | stop new Agent work；never publish uncommitted batch                                    | 标准化数据服务不可用；仅已提交事件可回放                                              |
| Contract violation                 | failed and logged safely                                                                | 通用运行失败，不泄露 state/event                                                      |

## Agent Tool Contract

- 实际委派完整 Agent/worker run 的 Tool 必须显式声明 `kind='agent-tool'`、`profile='delegated-agent'`，不得依赖名称或 runtime scope 推断。
- 现有 Delivery `*-subagent` Tool 是当前实例，继续仅由 `delivery-chain-manager` scope 使用；它们内部的 model/contract/stage timeout 与 retry 保持专用 Runtime 所有。
- 外层 Tool Runtime 仍负责 allowlist、strict schema、父级 abort/deadline、一次逻辑调用和最终配对，但不得启动普通 Tool attempt timer 或整 Agent retry；public presentation 继续服从专用 Agent Runtime 的既有契约。
- `validate_tasklist_structure` 是 `standard-tool/local-deterministic`；Tasklist Agent、Image Agent 是专用 route，不包装成 Agent Tool。
- 本 contract 只隔离已有类型，不授权通用 ReAct Agent 新增子 Agent。未来若需绑定，必须先补齐父子 Run budget、幂等、持久化和取消契约。

## Observability Contract

允许记录：run outcome、stop reason、finalization mode、route type、model catalog identity、logical model/tool calls、retry counts、工具名、工具状态分类、duration、truncation flag、Web provider availability，以及不含原值的 outbound security denial、active Run、capacity rejection、projection queue high-water、batch chars/events/wait、database transaction duration、event-loop delay 计数或直方图。process singleton 的 timing observer 只保留最近 1,024 个 duration 样本；`count`/`total` 为累计值，`p50`/`p95`/`max` 为当前滚动窗口值。

禁止记录：完整 query、网页正文、raw messages、reasoning content、internal prompt、被拒绝的 tool args、Token、Cookie、API key、Authorization 值、签名 URL、raw provider config/error、LangChain raw event/state。
