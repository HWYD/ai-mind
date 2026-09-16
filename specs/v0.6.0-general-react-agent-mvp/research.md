# Research: v0.6.0 General ReAct Agent MVP

**Date**: 2026-09-09

**Code baseline**: `main@a770a1819afa22bcadce1153e3c2738a21ab5c48`

## Research Method

本研究同时使用两类证据：

1. AI Mind 当前真实代码、tests、package versions、constitution、ADR/architecture 规则；
2. ReAct 论文及 OpenAI、LangChain/LangGraph、DeepSeek、火山引擎、Tavily 的官方资料。

“参考主流产品”用于归纳工程模式，不把不可验证的 ChatGPT、DeepSeek、豆包内部实现当作事实。可落地决策以公开 API/SDK contract 和 AI Mind 代码为准。

## Decision 1: ReAct Is The Default Chat Control Loop, Not Forced Tool Use

**Decision**: 所有 `routeType=chat` 使用同一 Agent loop；每轮可选择直接回答或调用零个/多个允许工具。Tasklist、Delivery Chain、Image 继续使用专用 Agent。

**Rationale**: ReAct 的关键是“推理/决策与行动观察交替”，不是每个问题都必须行动。OpenAI function-calling 的公开模式同样由应用维护 model → tool → result → model，直到模型产生最终答复。统一控制循环可以消除当前普通直答、单次 Tool Calling、Composer/Capability 提前返回之间的行为分叉。

**Alternatives considered**:

- 仅在模型第一次请求工具时启动 Agent：保留两套聊天控制流，Memory/Stream/错误语义继续漂移。
- 所有问题强制调用一个工具：增加成本和失败面，也不符合 ReAct。
- 把全部专用 Agent 合并：会破坏 Tasklist/HITL、Delivery 和 Image 的既有权限与协议，超出 MVP。

## Decision 2: LangChain `createAgent` Is The Primary ReAct Core

**Decision**: 使用 LangChain v1 `createAgent` 作为通用聊天唯一 ReAct loop，并通过 typed state/context、middleware、Tool Runtime adapter 和 stream adapter 接入 AI Mind。旧的 project-owned `prepareContext → decide → act` StateGraph 方案被本决策替代；不同时保留第二套通用 ReAct Graph，也不把循环继续写进 `ChatOrchestrator`。

**Rationale**: `createAgent` 是 LangChain v1 官方标准 Agent API，底层仍运行在 LangGraph 上；被 deprecated 的是旧 LangGraph `createReactAgent`，不是新 API。它已经提供标准 model/tool loop、state/context、middleware、streaming、tool error/retry 扩展和 run-local 配置。AI Mind 的差异化价值应集中在 capability 权限、Tool Runtime、Stream DTO、deadline 与 Memory 边界，而不是重复实现通用循环。

**Alternatives considered**:

- project-owned StateGraph：控制力最高，但会重复官方 Agent loop、ToolMessage routing、stream lifecycle 和 middleware 扩展，并扩大长期维护面；仅作为已评估的降级参考，不与 `createAgent` 并存。
- 手写 `while` loop：初期文件少，但会让 `ChatOrchestrator` 继续承担状态机、预算、重试和路由职责。
- 外层 StateGraph 包裹 `createAgent`：可以表达确定性前后处理，但形成双层 state/stream/termination；MVP 改为普通 runner + 一次未绑定 Tool 的 Answer Phase 即可，无需第二张 Graph。
- 无适配直接使用 `createAgent`：会绕过 AI Mind 现有 tool scope、stream/public DTO 和 Memory 约束，不可接受。

## Decision 3: Run-Local Agent State Without Checkpointer

**Decision**: General ReAct Agent state 只存在于同一个最长 180 秒的后端 Run；`createAgent` 不配置 checkpointer/store，也不新增 `AgentRun`、HITL、Agent state resume 或数据库表。后端 Run 与单次 SSE transport 生命周期分离：普通断线不取消 Run，现有 resumable stream coordinator 继续执行并投影事件，授权客户端可重连回放。180 秒从确定性上下文准备开始，止于终态事件完成持久化投影；网络投递、客户端接收和重连等待不计入该预算。

**Rationale**: 用户目标是稳定获得通用聊天结果，而不是长期工作流。把 transport disconnect 与 run cancellation 分离可承受瞬时断网并复用既有事件回放，同时 run-local state、180 秒 hard deadline 和显式取消仍提供严格上限，不会把业务 run 与 checkpoint 生命周期提前耦合。

**Alternatives considered**:

- 复用 Tasklist PostgresSaver：带入与普通聊天无关的 interrupt/resume 和业务状态复杂度。
- 新增 AgentRun history：属于后续生产化能力，当前没有用户价值和清理策略支持。
- SSE 断线立即取消 Run：生命周期简单，但瞬时断网、切换页面或浏览器背压会直接降低最终回答成功率，并与现有 resumable stream 语义冲突。
- 把网络投递计入 180 秒：客户端接收、背压和重连等待不受服务端执行器控制，无法形成稳定可测的 Agent budget。

## Decision 4: Minimal Base Tool Set Is Search, Read, Calculate, Time

**Decision**: 基础工具固定为 `web-search`、`read-url`、`calculator`、`datetime`。Skill 采用 additive overlay；`text-transform`、`unit-convert`、`city-weather` 和 MCP 能力继续按既有 Skill 授权，Tasklist validation 不进入通用集合。

**Rationale**: 这四项覆盖通用问答最常见的“当前事实、来源深读、确定性计算、当前时间”缺口，同时保持全部动作只读或纯计算。基础集合足以验证完整 ReAct loop，又不会引入文件、消息、购买、账号或代码执行风险。

**Alternatives considered**:

- 仅保留现有 calculator/datetime：无法验证主流聊天 Agent 的当前网页事实闭环。
- 增加浏览器、Shell、文件或写操作：授权、沙箱、确认、审计和回滚成本超出 MVP。
- 每个 Skill 替换整个工具集：无 Skill 的普通聊天仍无通用能力，也会制造权限不一致。

## Decision 5: Tavily HTTP Adapter First

**Decision**: 项目定义 provider-neutral Web provider interface，第一个 adapter 用原生 server-side `fetch` 对接 Tavily Search 与 Extract；不引入 Tavily SDK。Search 使用 basic 模式、最多 5 条，关闭 provider answer/raw content；Extract 单 URL、Markdown、内部结果最多 12,000 chars。Tavily Extract 属于 remote-provider fetch，interface 不承诺 redirect chain 或逐跳校验能力。

**Rationale**: Tavily 官方提供独立 Search/Extract endpoint，恰好映射 `web-search` 与 `read-url` 两个原子工具。原生 HTTP 降低依赖面，并为以后 Exa 或其他 provider 留出局部 adapter 边界。AI Mind 只直接连接固定 Tavily endpoint，无法观察 Tavily 对目标站点执行的每一跳 redirect；contract 只覆盖 initial requested URL 和 provider 明确返回且准备公开/授权的 URL。

**Alternatives considered**:

- provider hosted search：OpenAI/豆包/DeepSeek 的模型与托管工具能力不一致，会把工具权限绑定到模型选择。
- 只提供 search snippet、不提供 read：复杂事实无法核对来源正文。
- 引入 SDK：MVP 没有使用 SDK 高层能力的需求，增加 lockfile、升级与运行时表面积。
- 改成本地网页 fetch 以控制 redirect：需要 DNS/IP、DNS rebinding、响应体和内容解析等完整 SSRF 工程，超出演示版 MVP；若未来成为硬要求应单独设计。

## Decision 6: `createAgent` v2 Uses Bounded Native Parallelism With Batch Admission

**Decision**: 使用 `createAgent(version='v2')` 的 Send task 原生并行，在 invocation 的 LangGraph `RunnableConfig` 设置 `maxConcurrency=3`。每个 Action batch 在派发前按 assistant tool call ordinal 生成不可变 admission，只预占剩余逻辑 Tool Call 与累计 observation 配额；并行任务只能消费自身 admission，批次汇合后再统一计算 Run 级 stop/no-progress。D032 将旧 4 rounds/6 calls 预算替换为最多 6 个携带 Tool 的 Action rounds、7 次 Action logical model calls 与预留的 1 次同模型未绑定 Tool Answer（总计 8），仍保持 9 次接纳的 logical Tool Calls、180 秒总运行与 145 秒 Action cutoff。普通 Tool 由统一 Tool Runtime 按 `local-deterministic=5s`、`remote-readonly=20s` Profile 上限治理，并允许 Tool Definition 声明更短的 server-side attempt 上限；`retrySafe` 远端只读 Tool 在前置校验通过后对任意 execution failure 最多 2 次 retry、每个 Run 实际最多 4 次 tool retries。retry 不预分配：每次在退避和 deadline/cancellation 再检查后、底层 retry attempt 立即开始前，通过 Run 级原子 `RetryPermitPool` 竞争实际剩余额度。单 observation 12,000 chars、累计 32,000 chars、连续 2 轮无进展停止、recursion limit 16。通用 effective tools 只包含当前受控 `standard-tool`；`agent-tool` 不绑定、不并行。

**Rationale**: `createAgent` v2 会把每个工具调用作为独立 Send task，LangGraph runtime 的 `maxConcurrency` 可以在不重写 ToolNode 的前提下限制并行宽度。当前通用工具均为本地确定性或远端只读能力，同轮独立调用并行能缩短等待时间；并发 3 与总配额 9 允许三个完整宽度，同时仍由 Action/Run deadline 和 observation budget 收口。批次 admission 消除 logical-call/observation check-then-increment 竞态；retry 采用 actual-use permit，避免失败前固定分配造成闲置，同时通过单调用 2、Run 总计 4 的原子 gate 阻止穿透。sum/union reducer、`toolCallId` 配对和 ordinal 投影使完成顺序不再决定最终状态或展示顺序。

**Alternatives considered**:

- 严格串行 `maxConcurrency=1`：状态与顺序最简单，但两个独立的 20 秒远端调用会串联等待，降低 145 秒 Action 窗口内完成回答的概率。
- 完全采用框架默认并行且不设项目上限：改动最少，但单批最多 9 个调用可能同时开始，并发预算检查、外部限流和乱序 state update 风险不可接受。
- 按 batch 预分配 retry：无需原子 permit，但未失败或提前成功的 Tool 会在批内占住额度，其他真正需要 retry 的 Tool 无法使用，降低恢复概率，因此被 actual-use permit 取代。
- 为每个 Tool 新增 `parallelSafe`：适合未来混合读写 Tool 的大型 catalog；当前 MVP 的通用集合已通过 `standard-tool` 类型、只读/确定性 Profile 和 `agent-tool` 排除形成封闭集合，暂不增加重复元数据。
- 自定义顺序或并行 ToolNode：可完全控制执行，但会重新承担框架 ToolNode 的职责；只有 compatibility Spike 证明 v2 hook/reducer 无法满足 admission 与配对 contract 时才回到 Plan 评审。
- 只依赖 recursion limit：无法分别约束外部调用次数、模型成本、观察体积和 wall-clock。
- 无限重试：外部服务异常时放大延迟和成本。

## Decision 7: Preserve Internal Reasoning Metadata, Never Expose Raw Chain-Of-Thought

**Decision**: `createAgent` messages 内保留 provider 协议要求的 assistant metadata，但 public stream、UI、logs、Chat Memory 和 UserMemory 只接收安全步骤摘要与最终答案。`emitReasoning` 与 `preserveReasoningMetadata` 是两个独立概念。

**Rationale**: DeepSeek 官方 thinking-mode tool-call contract 要求后续请求回传此前 assistant 的 `reasoning_content`，否则请求可能失败；而产品可解释性只需要 action/tool/source/status，不需要原始思维链。当前 `assistant-stream.ts` 在 `emitReasoning=false` 时会剥离该 metadata，是实现时必须修正的兼容点。

**Alternatives considered**:

- 向用户流式输出 raw reasoning：泄露内部 prompt/推理并形成不稳定产品契约。
- 完全丢弃 reasoning metadata：可能破坏 DeepSeek 多轮 tool calling。
- 持久化完整轨迹便于调试：扩大隐私、存储和数据治理范围。

## Decision 8: Context Preparation Is A Graph Input, Not A Final-Answer Bypass

**Decision**: `/summary`、`/check`、`@resource`、Skill、MCP Resource/Prompt、Chat Memory 与 UserMemory 继续由现有 deterministic components 准备，但准备结果统一进入 `createAgent`。

**Rationale**: 当前 `ChatOrchestrator` 依次尝试 Composer Context、Capability Context、Prompt Context、Tool Calling 和 direct answer，部分路径可独立结束。统一成“准备上下文 → Agent 决策”既保留已有边界，也满足全部 chat 使用同一范式。

**Alternatives considered**:

- 让模型自己发现并读取所有上下文：会丢失现有授权、校验和确定性行为。
- 保留特殊入口提前返回：与“所有聊天”目标冲突，且 trace/memory 行为继续分叉。

## Decision 9: Add A Generic Run Lifecycle And Separate Internal/Public Tool Output

**Decision**: 通过 whitelist stream adapter 将 `createAgent` 的通用生命周期映射为最小 `agent-run-start/end`，工具、上下文和最终回答继续使用既有 `tool-*`、`resource-*`、`prompt-*`、`skill-selected` 与 `text-*`。前端将 General 生命周期投影为 `AgentRunPart(type='agent-run')`；Tasklist 等专用 LangGraph Agent 独占 `agent-graph-*` 与 `AgentGraphPart(type='agent-graph')`。不新增 route 或 StreamRun kind。Tool Definition 增加 public formatter，使内部 observation 与用户可见摘要分离；`tool-end` 继续以 optional `sources` 承载结构化来源。

**Rationale**: 通用 Run 与专用 Graph 的结构和 UI 语义不同。两个极小 lifecycle chunk 能让 reducer 做类型安全路由，并避免依赖 `agentName`、标题或 graph-node payload 猜测 presentation；旧客户端仍可忽略 optional chunk。自由文本 `output` 不能稳定承载来源去重和安全链接展示，因此保留向后兼容的 optional `sources`。adapter 只投影固定字段，避免把 LangChain raw event/state 变成 public contract，内部/公开结果分离也允许模型消费必要观察而不向 UI 和 stream 暴露全文。

**Alternatives considered**:

- 让 General ReAct 复用 `agent-graph-*`：表面少两个 chunk，但会把 generic Run 错建模为 dedicated LangGraph Graph，并迫使 UI 依赖 metadata 分流。
- 新增完整 `react-*` phase/chunk 协议族：表达过重；MVP 只需要 `agent-run-start/end` 两个 lifecycle chunk。
- 直接复用内部 tool result 作为 public output：可能泄露网页全文、raw error 或内部 metadata。

## Decision 10: Persist Only The Final Turn In Server Memory And Classify By Actual Execution

**Decision**: 服务端 Chat Memory/UserMemory 只写最终 user/assistant turn；source 由“是否实际执行过工具”决定，不再由 `toolBoundModel` 是否存在决定。浏览器完成态 Trace 的本地 UI 快照由 Decision 18 单独约束，不属于 Memory 或 Agent state。

**Rationale**: 所有普通聊天以后都会绑定工具，如果沿用当前 `session.toolBoundModel` 判断，会把零工具直答误记为 tool-assisted。中间轨迹不适合进入长期 memory，也没有稳定的数据生命周期。

**Alternatives considered**:

- 持久化全部 AI/Tool messages：扩大存储与隐私范围，且 provider metadata 不稳定。
- 所有通用 Agent 回答都标为 tool：损害 UserMemory candidate 提取与可观测性准确性。

## Decision 11: Web Input Is Untrusted, Secret-Guarded And URL Access Is Capability-Scoped

**Decision**: `read-url` 仅允许用户当前请求显式 URL 或本轮搜索返回并通过校验的 URL；仅 HTTP(S)，拒绝凭据/签名 URL、本机、私网、link-local 等 initial target；网页内容只能作为 data observation。`web-search.query` 和 `read-url.url` 共用最小 Outbound Secret Guard，在 provider 调用前拒绝可识别的 Token、Cookie、API Key、Authorization 凭据、系统已知 secret 和常见签名 URL。远端 provider 不暴露 redirect chain 时不声明逐跳校验，provider-reported URL 只有再次通过 policy 后才能公开或授权。

**Rationale**: 通用 URL fetch、第三方查询外发和 indirect prompt injection 是三个不同边界。授权 URL set 保持多轮 search → read 的最小能力范围；确定性 Secret Guard 用很小的实现成本防止演示项目最明确的凭据泄漏。模型可能语义改写任意私有上下文，字符串 Guard 无法形成通用 DLP 保证，因此本版本只承诺已声明结构化格式和系统已知 secret 的阻断，并让 public UI 只展示通用安全结果。

**Alternatives considered**:

- 模型可读取任意 URL：允许扫描内部网络或绕过用户意图。
- 只靠 prompt 要求模型保密：无法在 provider boundary 确定性阻断结构化凭据。
- 完整 DLP、PII 分类、taint tracking 或逐次用户审批：能扩大覆盖面，但复杂度和交互成本不符合演示版 v0.6.0。
- 把 Tavily remote fetch 描述成本地逐跳 SSRF 校验：实际能力不可观测，会形成无法验证的安全承诺。
- 把网页提示当系统指令：直接破坏 controlled agent 原则。

## Decision 12: Tool-Capable Model Selection Fails Closed

**Decision**: `routeType=chat` 必须选择 catalog 中声明 chat + tool-calling 能力且 provider 可 bind tools 的模型；失败时返回标准化错误。

**Rationale**: 模型 ID 只能改变来源，不能改变 Agent 权限和控制流。静默降级到旧 direct answer 会使同一 API 的行为取决于 provider 偶然能力。

**Alternatives considered**:

- 不支持工具时直答：兼容表面更好，但破坏 v0.6.0 的统一 Agent 契约。
- 自动切换到另一个模型：未经用户同意改变模型、成本和数据处理方。

## Decision 13: AI Mind Owns Policy Middleware, LangChain Owns The Loop

**Decision**: `createAgent` composition root 只接入两枚项目 middleware：`GeneralReActRunPolicyMiddleware` 和 `GeneralReActToolRuntimeMiddleware`；模型重试使用官方 `modelRetryMiddleware`，普通 Tool 重试由 `GeneralReActToolRuntimeMiddleware` 单点拥有，不叠加官方 `toolRetryMiddleware`。调用限制不与官方 limit middleware 重复叠加，统一由项目 policy 表达 Action 停止与固定 Answer Phase 语义。

**Rationale**: middleware 是 `createAgent` 的标准定制点。运行预算/deadline/no-progress 是一组内聚业务策略；Tool scope/validation/public output/attempt/retry 是既有 Tool Runtime 的边界。把两者拆开可独立测试，同时避免每个 concern 都长成一枚微型 middleware。Tool Runtime 必须同时知道 Profile、Tool 自身限制、Run 剩余预算、全局 retry count 和 transcript 生命周期，叠加独立 tool retry middleware 会形成双重所有权；官方 call-limit 的默认终止行为也无法直接表达“停止行动后保留一次无工具最终回答”。

**Alternatives considered**:

- 所有策略写进 system prompt：模型不能成为权限、预算或超时的执行者。
- 为每个 counter/error/trace 创建独立 middleware：抽象数量过多，顺序和 state update 更难审计。
- 同时使用项目 limit 与官方 limit：防御性表面更强，但两者可能以不同 exit behavior 抢先终止。

## Decision 14: Retry Ownership Is Explicit; Finalization Is Superseded By D032

**Decision**: 通用 ReAct model 与 `standard-tool` provider/client/transport 的隐藏 `maxRetries` 固定为 0；`agent-tool` 内部仍由专用 Agent Runtime 治理。每个逻辑 Action model call 只由 LangChain `modelRetryMiddleware` 对明确 transient failure 重试一次，每个 Run 最多 1 次；每个 `standard-tool/remote-readonly` 逻辑调用在前置校验通过后由 Tool Runtime 对任意 execution failure 最多执行 2 次 retry（首次加重试共最多 3 attempts），每个 Run 最多 4 次普通 Tool retries。退避优先使用 1～10 秒合法 `Retry-After`，否则按第一次随机 1～2 秒、第二次随机 2～4 秒执行，并在等待和 attempt 前检查取消及剩余 deadline；前置校验拒绝和 cancellation 不启动 retry。旧“仅非自然终止时 constrained final”的收口决策已被 D032 取代：145 秒后停止新行动，所有非取消、非 hard-deadline Action outcome 都进入一次未绑定 Tool 的 Answer Phase，并在 180 秒 hard deadline 前保留 lifecycle 收口时间。

**Rationale**: 当前 Provider 创建入口允许 `maxRetries` 为空，LangChain Core、MCP client 或 provider adapter 也可能自带 retry/timeout；多层各自重试会让次数、费用和时长脱离 Agent budget。模型重试和 Tool 重试分别只有一个所有者，Tool Runtime 再以 Profile、Tool 自身上限、Action 剩余和 Run 剩余中的最小值约束每个 attempt，才能保持可预测。两个 Tool retries 覆盖远端执行阶段的网络、4xx、5xx、typed、解析和未知异常，同时 Run 总计四次避免八个逻辑工具各自耗满重试；前置拒绝和 cancellation 不会启动 attempt。固定 Answer Phase 仍是 runner terminal post-condition，而不是外层 Graph：它让公开 token 只来自无 Tool binding 的模型流，同时保持 `createAgent` 为唯一 Tool loop。

**Alternatives considered**:

- 只依赖 provider 默认 retry：重试次数不可由 Agent state 和 180 秒 deadline 精确治理。
- 预算耗尽立即报错：稳定停止但用户经常拿不到已有观察形成的结论。
- 外层 StateGraph 增加 final node：能工作，但为单个 terminal post-condition 引入双层 Graph/state/stream。

## Decision 15: LangChain Family Is Upgraded As One Compatibility Unit

**Decision**: 新增稳定版 `langchain`，并将 `@langchain/core`、`@langchain/langgraph` 等直接依赖原子对齐到兼容版本；至少满足 `langchain >= 1.5.9` 和 `@langchain/core >= 1.2.8`，以使用明确的 retryability 标记。依赖升级先通过 special Agent/checkpointer/provider 回归和 `createAgent` Spike，再迁移普通聊天。

**Rationale**: 当前仓库没有高层 `langchain` package，且 core/langgraph 版本早于部分新 middleware/retry contract。让 package manager 隐式安装多套 core/langgraph 可能导致 message `instanceof`、schema reducer 和 checkpoint 类型分裂。先把依赖作为独立兼容单元验证，能把框架升级风险与业务迁移风险分开。

**Alternatives considered**:

- 安装一个能勉强兼容旧 core 的较老 `langchain`：减少首次 diff，但失去当前 retry/stream 修复与官方 contract。
- 让新旧 core/langgraph 长期并存：短期可能构建通过，运行时类型和 checkpoint 风险不可接受。
- 一次升级并立即迁移全部聊天：无法区分依赖回归和新 Agent 逻辑回归。

## Decision 16: Standard Tool And Agent Tool Are Different Execution Kinds

**Decision**: `ChatToolDefinition` 增加判别式 `ToolExecutionPolicy`。普通原子能力声明 `kind='standard-tool'` 和 `local-deterministic | remote-readonly` Profile；可选 `attemptTimeoutMs` 只能缩短 Profile 上限且永不进入模型参数。实际委派完整 Agent 工作的 Tool 声明 `kind='agent-tool'`、`profile='delegated-agent'`，外层不应用普通 Tool 的 1/5/20 秒 attempt policy，也不自动重试整个 Agent，只传播父级取消/截止并收取一次最终结果。现有 Delivery `*-subagent` Tool 是该类型的当前实例，但继续仅属于专用 `delivery-chain-manager` scope；v0.6.0 通用 Agent 不绑定 Agent Tool。

**Rationale**: 现有 `ChatToolDefinition` 只描述 schema、display、source 和 runtime scope，Delivery subagent 虽以 LangChain Tool 形态暴露，内部却会进行完整模型与 Contract 调用。若统一 Runtime 只按 Tool 外形套 20 秒 timeout 或自动重跑，会错误中止长阶段，甚至重复昂贵工作或副作用。判别式类型能在注册时暴露真实执行语义，同时保持专用 Agent 自己拥有内部预算。

**Alternatives considered**:

- 所有 Tool 使用同一 timeout/retry：配置最少，但无法同时满足毫秒级本地计算、波动网络请求和完整 Agent 委派。
- 根据名称、runtime scope 或耗时猜测 Agent Tool：无需改 Definition，但容易漏标和产生隐式行为。
- 允许 Agent Tool 继承普通 Tool retry：提高表面成功率，但会重复完整 Agent run；除非未来单独证明幂等和恢复语义，否则不采用。

## Decision 17: Generic Trace Owns The Whole Process Projection

**Decision**: 通用 ReAct 使用独立的浅色扁平内联 `GeneralAgentTracePanel`，不复用 Tasklist、Delivery Chain 或 Image Agent presentation。对 `routeType=chat`，`AgentRunPart`、Tool、Skill、Resource、Prompt 与来源过程信息只允许在该 Trace 内展示；assistant message renderer 必须按 part 的判别字段路由并把对应 Part 投影为统一 Trace 行，不能按 `agentName` 推断。Trace 外既有 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 被抑制。Skill 只显示可信目录中的名称，文案固定为 `加载了{skill.name} Skill`；Resource/Prompt 只显示安全摘要。前端实现目录为 `parts/general-agent/`，服务端实现目录保持 `runtime/general-react-agent/`。

Trace 只复用底层消息流、disclosure state、现有 shadcn/ui `Collapsible` / `Button` / `Separator` primitives、项目语义 token、官方 `shimmer` 文字 utility 与已安装的 Lucide 图标。Run active 时只有“正在思考”标题文字 Shimmer；Tool action 已结束但首个最终 `text-start` 尚未到达时仍保持 active。首个最终 `text-start` 到达时原子切换为不闪动的“已完成思考”并只自动收起一次；用户 active 期间手动收起后，新事件不得强制展开。显式取消显示“已停止思考”，无最终回答的终态失败显示“处理未完成”，两者均不闪动。并行 Tool 依 assistant ordinal 预建稳定槽位，retry 更新原行而不新增尝试行。

Web 搜索/读取数量由 Runtime 根据安全过滤和 canonical URL 去重后的记录确定性生成，retry 不重复计数；展开态只在有成功读取记录时显示最多 5 项“已读取来源”。每项展示标题与 hostname，并仅对通过 public URL policy 的 URL 提供安全新窗口链接。`SourceRecord` 不增加 `isOfficial`，Runtime 不推断“官方页面”。为避免 UI 解析 `tool-end.output` 自由文本，在现有 `tool-end` 增加 optional `sources`；除 D021 的两个最小 Run lifecycle chunk 外不新增 phase-specific 协议。

**Rationale**: 专用 Agent 的 Graph 卡片、节点编号和调试信息不适合普通聊天。单一扁平 Trace 能提供必要过程反馈而不暗示 raw chain-of-thought，也避免同一个 Tool、Skill 或 Resource 在聊天消息中被渲染两次。以最终回答真正开始作为完成边界，可避免 action 已结束、final 尚未生成时出现“已完成”假象；官方 Shimmer utility 能复用 shadcn 视觉语言，而无需引入 AI Elements、Motion 或第二套动画依赖。结构化可选来源字段让计数、去重和链接展示可验证，也保持旧客户端兼容。所谓“官方页面”需要可信域名目录或来源权威性规则，当前项目和 Tavily 返回值都不能通用证明，因此采用中性“页面/来源”文案。

**Alternatives considered**:

- 泛化现有 `AgentTracePanel`：代码表面复用更多，但会把 Tasklist presentation 语义和通用聊天耦合。
- 保留 Trace 外既有 Tool/Skill/Resource/Prompt 面板：改动较少，但会形成重复、顺序不一致和多个 loading 所有者，因此通用聊天禁用。
- 复用旧 `ThinkingText` 私有动画或引入 AI Elements `Shimmer` component：都能产生动画，但前者会继续保留双 loading 语义，后者为单个标题新增 Motion 依赖；MVP 采用 shadcn 官方 `shimmer` utility。
- 从 `tool-end.output` JSON/文本在 UI 解析来源：无需协议字段，但让展示依赖 Tool 自由文本格式，类型和兼容性脆弱。
- 新增独立 source chunk：语义明确，但为 MVP 增加新 chunk type、排序和回放分支；optional `tool-end.sources` 已足够。
- 根据域名或模型判断“官方”：实现快但不可可靠验证，容易形成虚假背书。

## Decision 18: Reuse The Existing IndexedDB Snapshot For Completed Public Trace

**Decision**: 正常完成且最终回答非空的通用 ReAct assistant message，复用现有浏览器 IndexedDB `ai-mind-local-chat` 的 `conversation-snapshots` stable snapshot，把最终回答与完整 public-safe Trace Parts 一并保存并在刷新时 local-first 恢复。继续沿用当前 `LocalConversationSnapshot`、50 个最近会话和每快照 120 条消息的容量/清理语义；不新增 object store、IndexedDB version bump、服务端表或 Agent checkpoint。

进入快照的必须是 UI 已获准展示的完成态投影，而不是运行时消息原样复制：不得包含 raw reasoning、provider metadata、raw Tool input/output/error、网页正文、内部 prompt、secret、授权 URL 集或 Agent state。显式取消、终态失败以及只输出部分回答的 assistant message 只可保留在当前页面状态，不提交 stable snapshot；标题使用“已停止思考”。会话/消息删除和重新生成沿用现有 snapshot commit 语义。IndexedDB 不可用、quota exceeded、数据被清理或 schema 校验失败时，降级为现有服务端最终问答恢复，Trace 可以缺失但聊天不能被阻塞。

**Rationale**: 现有本地持久化已经拥有 conversation snapshot、stable commit、local-first hydration、删除同步和恢复 Part 的 schema；完成态 Trace 本质上是 assistant message 的公开展示状态，复用该边界能以最小改动满足刷新恢复。把它放进服务端 Memory 会扩大隐私、跨设备和数据生命周期范围；新建第二个 IndexedDB store 则会制造消息与 Trace 的一致性、清理和迁移问题。

**Alternatives considered**:

- 只持久化最终文字：实现最少，但刷新后丢失用户明确要求保留的执行过程。
- 新增服务端 Trace 表或写入 Chat Memory/UserMemory：可跨设备，但超出演示版范围并扩大合规、删除和版本迁移成本。
- 新建独立 IndexedDB `trace` store：隔离表面清晰，但需要额外关联、原子性、过期与孤儿清理协议；现有 message snapshot 已能承载。
- 原样保存 stream/raw message parts：改动小但可能保存 raw Tool 参数、输出、错误或 provider metadata，违反 public boundary。

## Decision 19: Use A Bounded In-Process Node.js Runtime, Not Worker Threads

**Decision**: 采用 B 平衡容量方案。每个 Node.js 进程最多接纳 8 个 active General ReAct Run；使用不保存 request payload 的进程级 `GeneralReActExecutionGate` 发放 permit，无 permit 时在确定性上下文和 provider/Tool 工作开始前返回标准化可重试 busy 结果，不建立内存等待队列。model、Web、MCP、PostgreSQL 和 stream projection 保持 async I/O + `AbortSignal`；v0.6.0 不引入 `worker_threads`、child process、Redis、分布式 semaphore 或独立 Agent worker service。Tasklist、Delivery Chain、Image Agent 不进入该 gate。

**Rationale**: 当前 ReAct 热路径主要等待模型、HTTP Tool 和数据库，瓶颈是外部 I/O 与连接/内存容量，不是可并行的 CPU 计算。Worker Thread 无法缩短网络等待，却会增加 message serialization、取消传播、secret boundary 和 shutdown 清理成本。8 个 active Run 把单进程最坏的普通 Tool 底层并发约束在既有每 Run 3 的可计算范围内，同时避免对三条专用链路做未经授权的调度改造。fail-fast admission 比在 Node.js 内排 180 秒长任务更可控。

`calculator`、`datetime` 保留在事件循环内，但 calculator 必须通过输入长度、允许语法与复杂度限制把同步 CPU p95 控制在 5ms 目标内；attempt timeout 只约束异步生命周期，不能假装抢占同步 CPU。只有未来某个具体 Tool 在受控输入下仍持续超过性能门槛，才单独评审有界共享 worker pool，不能把整个 Agent Run 搬到 Worker。

**Alternatives considered**:

- 每个 Run 一个 Worker Thread：隔离直观，但对 I/O-bound workload 没有吞吐收益，且复制大量运行态、Tool/client 和 stream 生命周期。
- 独立 Agent worker service/queue：能做跨进程调度和 crash takeover，但超出本版单进程、最长 180 秒 Run 的 MVP 边界。
- 不设 process admission：实现最少，但 8 个以上长 Run 可同时放大模型连接、每 Run Tool 并发和数据库投影队列，无法提供明确容量上限。
- 在内存中等待 permit：减少 busy 响应，但会持有请求上下文并侵占 Run/transport 生命周期，进程重启还会丢队列；本版选择无 permit 即拒绝。

## Decision 20: PostgreSQL-First Durable Microbatch With Backpressure

**Decision**: 不引入 Redis。现有 StreamRun/StreamEvent 继续是可恢复流事实源，所有 public event 均先持久化成功再向 writer 投递。最终回答每个 part 的首个 `text-delta` 立即形成 durable batch；后续同一 part 按 40ms 或累计 256 chars 任一先到合并 flush。结构化/Tool/Trace/source/error/terminal event 强制 flush 更早文本并保持独立 envelope 和连续 sequence。单个 provider delta 超过 256 chars 时整块立即 flush，256 不是人工拆包上限。

`StreamEventStore` 增加 batch append 边界：一个 batch 只获取一次 run lock、分配连续 sequence、批量插入、更新一次 StreamRun 并至多 trim 一次。每 Run 的 `DurableStreamProjectionBuffer` 以 64 pending items/256KiB 为高水位、32 items/128KiB 为低水位；达到高水位时 Agent stream producer await，而不是继续积累或丢事件。浏览器沿用 ref-backed text buffer，但默认从现有 40ms 调整为 20ms timer + `requestAnimationFrame`；服务端约 25 batch/s 的正常输入频率仍是主要上限，前端只负责吸收网络 burst 和贴近绘制帧。

数据库 client 在开发和生产均为 process singleton，默认 PrismaPg pool `max=10`、`connectionTimeoutMillis=5000`、`idleTimeoutMillis=30000`，不得按请求断开。参考负载以 8 个并发 scripted Run 验证，目标 StreamEvent batch transaction p95 ≤20ms、Node event-loop delay p95 ≤50ms。

**Rationale**: 当前实现为每个事件创建 transaction 并把投影串到无界 Promise chain；ReAct 的 Tool/Trace 与 token 事件会放大锁、insert、run update 和 trim 次数。40ms 通常把连续文本限制在约 25 个 durable batch/s/Run，256 chars 则防止 burst 长时间滞留；两者兼顾回答平滑度和 PostgreSQL 压力。先持久化再投递保持断线回放一致，不需要 Redis 补偿“浏览器已看到但数据库未写入”的窗口。20ms 前端 buffer 不会重复制造服务端事务，也不会把服务端合并的 delta 重新切成打字机片段。

**Alternatives considered**:

- 原始 delta 立即推流、合并后异步入库：首屏最敏捷，但进程在两者之间失败时重连会倒退或丢失用户已经看到的文字；没有 Redis/WAL 中间层时不采纳。
- 30ms/128 chars：视觉更细，但在 8 个持续输出 Run 下会显著增加数据库事务和 React 更新上限。
- 60ms/512 chars：数据库压力更低，但 burst 时更容易一次出现整段文本；512 对存储很小，对视觉阈值偏大。
- 40ms/512 chars：时间路径通常可用，但无法像 256 一样限制高吞吐 provider 的成段视觉跳变，因此最终冻结为 40ms/256 chars。
- 为每个 token 保留独立数据库行、只批量 transaction：能减少部分 transaction overhead，但仍放大 event rows、replay 和 reducer 开销；同 part 连续 text delta 应安全合并。
- Redis stream/cache：可承担跨进程 buffer 或快速 replay，但本版已有 PostgreSQL durable event store，引入第二事实源会增加一致性、部署和恢复复杂度。

## Source Notes

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [OpenAI Agents guide](https://developers.openai.com/api/docs/guides/agents)
- [OpenAI Function Calling guide](https://developers.openai.com/api/docs/guides/function-calling)
- [LangGraph JavaScript quickstart](https://docs.langchain.com/oss/javascript/langgraph/quickstart)
- [LangChain JavaScript Agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [LangChain v1 createAgent](https://docs.langchain.com/oss/javascript/releases/langchain-v1)
- [LangChain custom middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)
- [LangChain built-in middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in)
- [LangChain tools and parallel state reducers](https://docs.langchain.com/oss/javascript/langchain/tools)
- [createAgent parameters](https://reference.langchain.com/javascript/langchain/index/CreateAgentParams)
- [LangGraph RunnableConfig maxConcurrency](https://reference.langchain.com/javascript/langchain-core/runnables/RunnableConfig/maxConcurrency)
- [LangGraph v1 migration guide](https://docs.langchain.com/oss/javascript/migrate/langgraph-v1)
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [Volcengine Function Calling](https://www.volcengine.com/docs/82379/1262342?lang=zh&redirect=1)
- [Volcengine Tool Calling](https://www.volcengine.com/docs/82379/1958524?lang=zh)
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Tavily Extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract)
- [Tavily API credits](https://docs.tavily.com/documentation/api-credits)

## Resolved Unknowns

Phase 0 结束时无 `NEEDS CLARIFICATION`：Agent 范式、`createAgent` 技术路线、middleware ownership、依赖升级、Web provider、工具最小集、`standard-tool/agent-tool` 类型、timeout/retry 所有权、运行持久化、完成态 Trace 本地恢复、推理可见性、预算/finalization、Stream、Memory、安全边界、process admission、Node.js event-loop/Worker 边界、PostgreSQL client/pool、durable microbatch/backpressure 和浏览器渲染节奏均已形成明确决策。实施首 Step 的 compatibility/performance Spike 是验证 gate，不是未决产品需求。

## Follow-up Decision D033: Skills Are Prompt-Only, Tool Policy Is Independent

**Decision**: 现有少量稳定 Tool 由独立 `GeneralToolPolicy` 固定装配；Skill 只提供可信系统提示词与输出风格。Skill 命中不得扩大 Tool schema、触发 remote MCP `tools/list`，或依据自然语言隐式读取 Resource/Prompt。脚本只有被单独注册、审计并纳入 Tool Policy 的 Tool Definition 包装后，才可能进入模型可见工具面。

**Rationale**: 主流 Agent API 将 tools 作为调用级 allowlist，而 prompt/instructions 是独立输入。将二者混入 Skill 会使“选中一种回答风格”隐式获得网络/MCP 权限，难以审计、难以稳定预算，也无法在 Tool 增长后实施独立的租户、权限和 Tool Search 策略。

**Alternatives considered**:

- 继续以 Skill selector 装配 Tool/MCP：被拒绝；权限与提示词耦合，且会造成隐式远程调用。
- 先为每个问题增加 planner 预调用来挑 Tool：被拒绝；当前七项安全、稳定工具无需额外模型延迟，未来目录扩大时再独立引入 Tool Policy/Tool Search。
