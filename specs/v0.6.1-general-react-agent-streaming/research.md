# Research: v0.6.1 General ReAct Agent Streaming

**Date**: 2026-09-22

**Scope**: 重新评估 v0.6.0 固定 Action/Answer、模型轮次正文公开、前端 Trace、异常收口、预算和工具级 detail。结论用于 v0.6.1 规格，不代表已实施。

## R001 — Normal completion authority

**Decision**: 普通成功路径由同一个带 Tool 的 ReAct loop 直接产生最终回答：模型轮次含 Tool Call 时，正文是 `commentary`；自然成功、无 Tool Call且正文非空时，正文是 `final_answer` 并结束。v0.6.0 固定追加未绑定 Tool Answer 的 D032 被 supersede。

**Rationale**: 固定 Answer 能隔离 Action 文本，但让零 Tool 请求也至少调用模型两次，增加首答完成延迟、费用和措辞漂移；它还丢弃了模型在 Tool 前/Tool 间生成的有价值说明。模型轮次结构本身已提供更自然的 ReAct 终止条件。

**Alternatives considered**: 保留固定 Answer；Action 正文全部丢弃；每轮正文完整缓冲后分类。前两者无法满足真实过程展示，后者破坏流式输出。

## R002 — Pending staging instead of buffering

**Decision**: 正文首 delta 立即以 `pending` 展示，模型轮次结束后原地解析；不缓冲全文，也不提前把首段正文叫作 final answer。视觉上 pending 从第一 token 即使用最终正文的 Markdown 排版；当已有 Tool/Trace 事件时它按 part ordinal 追加在时间线末尾，而非使用独立顶部 staging slot。

**Rationale**: provider 可能先输出正文、后输出 Tool Call。首 delta 时无法可靠知道本轮是否调用 Tool；`pending` 作为客户端由 start 未结束窗口派生的暂态，在不牺牲流式体验的情况下避免错误承诺。协议只在 end 传递后端有裁决权的 commentary/final_answer outcome；稳定 Part identity 防止分类时闪烁或跳位。

## R011 — 不在 v0.6.1 增加 Responses API 的提前终态探测

**Decision**: 不为 `response.function_call_arguments.done` 或其他 provider 原始事件增加“本轮不会再调用 Tool”的提前裁决。现有 ChatOpenAI/LangChain 流保持 provider-normalized 的正文、Tool Call 和完整 `AIMessage` 收口；只有完整轮次结束时才把 `pending` 解析为 `commentary` 或 `final_answer`。

**Rationale**: `response.function_call_arguments.done` 证明某一已决定 Tool Call 的 arguments 已完整，不证明同一 Response 后续不会产生 Tool Call，也不等价于 no-Tool final。把它升级为终态信号会破坏 OpenAI-compatible、DeepSeek、豆包等 provider 的统一边界，且无法消除模型在最后一轮正文流期间的 `pending` 语义。v0.6.1 以首 delta 正文样式和稳定 ordinal 消除体感延迟；原始事件的 provider-specific fast path 留待有跨 provider contract 和实测证据的后续版本。

**Alternatives considered**: 首 delta 一律当 final、首 delta 一律当 commentary、延迟到 turn end 才显示，分别存在语义反转、布局搬移或失去流式体验的问题。

## R003 — Dedicated additive public contract

**Decision**: 新增 `agent-text-*` chunks 与 `AgentTextPart`，而不是给所有普通 `text-*`/`TextPart` 隐式增加 General Agent phase。

**Rationale**: 当前普通 `text-*` 被 Tasklist、Delivery、Image、静态错误与其他路径广泛视为最终正文。独立类型能强迫 producer/consumer 显式选择，降低 commentary 静默进入 Memory、复制或快照的风险，同时保持旧 chunk 向后兼容。

**Alternatives considered**: 给 `text-*` 增加 optional phase、复用 `reasoning-*`、把文本嵌进 Tool row；三者分别有静默兼容风险、概念错误或无法表达 run-level 顺序。

## R004 — Evidence from mainstream agent protocols/products

**Decision**: 借鉴主流产品的“结构化区分 reasoning / message text / tool call”和“过程可折叠、最终答案独立”原则，但不复制任何单一产品的私有 UI 或 provider-specific event。

**Evidence**:

- OpenAI Responses streaming 将 output text、function-call arguments 和 output items 作为不同结构化事件，并提供 sequence/item identity；这支持“按结构判断，不按字符串猜测”。来源：[OpenAI Streaming events](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal?lang=python)。
- OpenAI 明确选择不向用户展示 raw chain-of-thought，并提供 reasoning summaries/encrypted reasoning 作为不同层级；这支持继续隔离 raw reasoning 与 public commentary。来源：[Learning to reason with LLMs](https://openai.com/index/learning-to-reason-with-llms/)、[New tools and features in the Responses API](https://openai.com/index/new-tools-and-features-in-the-responses-api/)。
- DeepSeek 官方 thinking/tool 示例中，同一个 assistant message 可同时包含 `content`、`reasoning_content` 与 `tool_calls`；样例第一子轮输出可见说明再调用 Tool，最后以 `tool_calls=None` 的正文轮结束。这直接证明“正文 + Tool”“Tool-only”“最终无 Tool 正文”都是真实模型形态。来源：[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)、[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)。
- 豆包/火山方舟 Chat API 将 `reasoning_content`、`content`、`tool_calls` 和 `tool_call_id` 作为独立字段，并要求调用前校验模型参数；这支持 provider adapter 归一化与服务端 Tool policy，而不是把 reasoning 或自由文本当执行授权。来源：[火山方舟 Chat API](https://docs.volcengine.com/docs/ark/chat-api?lang=zh&redirect=1)。

**Inference boundary**: 官方 API 文档证明数据形态和安全分层，但不构成对 GPT、豆包、DeepSeek 客户端像素级 UI 的稳定承诺。v0.6.1 的 disclosure 规则以本项目 Pencil 与已批准需求为事实源。

## R005 — Raw reasoning remains private

**Decision**: 只从模型 message 的 public text/content blocks 生成 Agent text；`reasoning_content`、reasoning item、encrypted reasoning、内部 prompt 与未知 provider block 永不进入 public stream。

**Rationale**: public commentary 是模型面向用户写出的行动说明，与 hidden chain-of-thought 在来源、风险和展示目的上不同。混用会突破 Constitution 的 strict public DTO 和已批准隐私边界。

**Alternatives considered**: 直接展示 reasoning_content 或另调模型总结；前者不安全，后者新增调用和数据面。

## R006 — Abnormal-only finalizer

**Decision**: 未绑定 Tool 的 finalizer 只用于非自然/预算停止，且每 Run 最多一次；自然无 Tool正文绝不再调用。取消、hard deadline、未知执行状态不调用。

**Rationale**: 预算/no-progress 停止可能发生在刚完成 Tool、尚未生成用户可读结论时；保留一次受约束 finalizer 能改善失败体验。限制为异常路径才能实现普通路径成本目标。

**Alternatives considered**: 完全删除 finalizer、所有结束都 finalizer、deterministic fallback 一律代替；分别牺牲异常可用性、回到重复调用或无法利用可靠 observations。

## R007 — Selective 1.5x budget expansion

**Decision**: 9 个 Tool-bearing rounds、14 logical Tool Calls、10 normal loop model calls、1 reserved finalizer、11 total model calls、235s loop cutoff、30s finalizer、5s terminal reserve、270s hard limit、48k cumulative observation、recursion 24。并发/retry/timeout/active-run/microbatch/pool 不变。

**Rationale**: 从 v0.6.0 的 6 rounds/9 tools/7+1 calls/180s 提升到约 1.5 倍，为“搜索→读取→补查→回答”提供空间，同时不放大并发、retry 或单 Tool timeout。10 次 normal loop 精确容纳 9 个 Tool 轮次 + 1 个自然 no-tool terminal。

**Cost note**: 模型上下文会携带之前的 assistant/tool messages；轮次上限 1.5 倍并不意味着最坏成本只增 1.5 倍。按累积上下文粗略估计，输入 token 可接近原预算的 2 倍，因此 observation 从 32k 仅扩到 48k，并保留 no-progress/cutoff。

**Alternatives considered**: 全部 2 倍、只扩时间、只扩 calls；分别成本过高或不能同时解决复杂度与慢 I/O。

## R008 — Run-level commentary; no tool-level detail

**Decision**: commentary 与整个 Trace 一起折叠；Tool 行维持一行确定性状态和独立来源列表。本版不实现 `Nested Trace Row Disclosure`。

**Rationale**: 当前 Tool 集为确定性/只读操作，模型 commentary、行状态和 Web source list 已提供足够说明。额外 detail 容易重复；自由文本很难归属到并行 Tool；公开 raw output 又扩大安全、schema、snapshot 和 replay 面。

**Future reconsideration triggers**: 副作用操作需要 receipt、长任务需要阶段诊断、Tool 产生可复用 artifact、或用户明确需要逐工具证据。届时应设计 server-owned strict summary DTO，而不是展示 raw output。

## R009 — Disclosure state machine

**Decision**: pending 不构成详情；有 commentary/Tool/Skill/Resource/Prompt/source 才有 chevron。active 默认展开，用户手动选择 sticky，final 解析时至多自动折叠一次，完成后可重开；无详情仍保留状态标题。

**Rationale**: 该规则同时覆盖仅正文与多轮 Agent，不会因为早到 pending 错误出现箭头，也不会在用户主动收起后被新事件打扰。无详情保留“已完成思考”提供一致生命周期反馈。

## R010 — Persistence and final-content projection

**Decision**: completed final answer 是复制、Memory、follow-up 和下一轮 history 的唯一 General Agent 文本；completed public commentary 只允许作为本地 Trace snapshot，pending/interrupted 不稳定保存。

**Rationale**: UI 展示顺序与对话语义必须分离。commentary 对用户有过程价值，但写入对话历史会让后续模型把“我将搜索”当成已完成答案，产生重复和污染。

## R011 — LangChain model-turn compatibility validation

**Decision**: v0.6.1 以完整 `AIMessage.tool_calls`、`afterModel` state 和正常闭合的 Agent stream 作为模型轮次/Tool/终止证据；provider 原生 `finish_reason` 若有必须归一化为附加证据，但不得成为唯一终止依据。

**Evidence**:

- 本分支既有 `dependency-compatibility.test.ts` 已通过 4/4，验证 `createAgent(version='v2')` 可安全 stream、after-model hook 顺序、abort signal 透传及 4 个并行 Tool 在 `maxConcurrency=3` 下受控执行。
- `general-react-agent-runner.test.ts` 已通过 33/33；其 scripted model 在同一逻辑模型轮先 token-stream `我先查一下。`，再以完整 `AIMessage({ content, tool_calls })` 收口，证明“正文后 Tool”不是假设，而是当前测试栈可表达的数据形态。
- 当前 Runner 同时订阅 `values` 和 `messages`，保存完整 state messages；Run Policy 的 `afterModel` 读取末条 `AIMessage.tool_calls`，发生在 Tool middleware 调度之前。因此可在 dispatch 前完成 commentary/final 的后端裁决。
- 代码中尚未存在统一的 provider `finish_reason` normalizer；因此 T004/T046 仍必须增加 OpenAI-compatible、DeepSeek、豆包、Qwen 和 unknown fixtures。其目的不是让缺失原生 finish reason 阻塞正常回答，而是将已提供的非自然终止信号集中 veto 为非 final。

**Rationale**: LangChain 官方流式约定将 `messages` 定义为 LLM token + metadata，将 `updates` 定义为每个 Agent step 的完整状态更新；工具调用时更新顺序为 AIMessage Tool request → ToolMessage → 最终 AI response。官方也将 `beforeModel`/`afterModel` 与 `wrapToolCall` 明确定义为 `createAgent` 内的 middleware hook。由此可推断，本项目应以完整 state/AIMessage 判定结构，而不是从 token 字符串或某个 provider 私有 finish 字段猜测。来源：[LangChain Streaming](https://docs.langchain.com/oss/javascript/langchain/streaming)、[LangChain Custom Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)。

## R012 — Retain `createAgent`, reject a Chain-owned ReAct loop

**Decision**: General ReAct 保持 `createAgent(version='v2')` + Run Policy/Tool Runtime/Retry middleware；不将它改写成 `RunnableSequence`、手写 `model.bindTools().pipe(...)` 链或 legacy AgentExecutor。确定性的 context preparation 可以继续在外层，不能夺取 loop authority。

**Evidence**:

- 静态检查 General ReAct、Delivery Chain 和 chat orchestrator 后，没有发现 `RunnableSequence`、`RunnableLambda`、`RunnableBranch`、`.pipe()`、`createReactAgent` 或 `AgentExecutor` 参与 General ReAct；当前使用的 `delivery-chain` 是独立专用 route，不是通用 Tool loop。
- 当前 `createGeneralReActAgent` 已把 `createAgent(version='v2')`、Run Policy、Tool Runtime 和 `modelRetryMiddleware(maxRetries=1)` 组合为单一控制面。Tool Runtime 进一步调用 shared `executeToolCall`，按 Tool profile、loop/hard deadline 余量取最小 attempt timeout，以 AbortSignal 取消迟到调用，并将 retry、permit、ordinal、public transcript、allowlist 与安全策略绑定在同一执行点。
- LangChain 官方把 Agent 定义为“模型反复调用 Tools 直到任务完成”的 loop；middleware 可在每次 model/tool call 前后执行，处理 retry、early termination、state counters 和 `jumpTo: 'end'`。官方建议只有在标准 loop 之外存在路由、扇出或确定性步骤时，才把完整 Agent 作为 StateGraph 节点嵌入更大拓扑。来源：[LangChain Agents](https://docs.langchain.com/oss/javascript/langchain/agents)、[LangChain Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/overview)。

**Assessment**:

| Concern         | Current `createAgent` + middleware                                | Chain-owned Tool loop                                                               |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 动态 ReAct 终止 | `afterModel` 以完整 AIMessage 和 `jumpTo:end` 决策                | 必须手写递归/循环与 Tool-call branch                                                |
| 模型/Tool retry | 现有 model retry；Tool Runtime 保留 profile-aware retry/permit    | 可包一层 retry，但必须防止与 Tool Runtime 双重重试、错误计数                        |
| 超时/取消       | phase scope、Run deadline、Tool profile、AbortSignal 已集中       | 必须将 signal/deadline 正确穿过每个 Runnable 与 batch；遗漏会产生迟到结果           |
| 预算/并发/顺序  | middleware state、batch admission、ordinal、maxConcurrency 已一致 | 必须重新维护 logical call 与 retry attempt、parallel completion 和 durable ordering |
| v0.6.1 文本解析 | messages/state 可在 Tool dispatch 前裁决 commentary               | 仍需自建 turn collector 和 end-before-tool 规则                                     |

**Conclusion**: Chain 不会让本版工具超时、重试或最大次数约束更容易；它只会把已有的强约束从可测试的 Middleware/Tool Runtime 边界分散到手写编排。保留 `createAgent` 是较小、可验证且与 v0.6.1 流式目标一致的方案。

## R013 — T005 Runtime compatibility spike evidence

**Date**: 2026-09-22

**Evidence**:

- `dependency-compatibility.test.ts` 的 test-only `ModelTurnStreamFixtureModel` 以 callback token 依次发出 `我先`、`查询天气。`，再以同一完整 `AIMessage` 收口；该完整消息同时含 public `content` 和已解析的 `tool_calls`。`createAgent(version='v2')` 的 `messages` stream 保留两段文本 delta，`afterModel` 可读取完整 `AIMessage.tool_calls`，因此模型正文、Tool Call 与完整 turn 消息可在同一逻辑 turn 关联。
- 实测 `messages` stream metadata 的节点名是 `model_request`，并带数值 `langgraph_step`；该 metadata 可作为流事件 ordinal/turn 定位的附加证据，但不能替代完整 `AIMessage` 的 Tool/终止裁决。
- 完整消费 async iterator 后正常结束，证明正常 closure 不要求 provider metadata。另一个 fixture 在完整 `AIMessage.response_metadata.finish_reason` 中携带 `length`；该显式非自然信号在 closure 后仍可由 `afterModel` 读取。测试 fixture 的 `reasoning_content` 仅置于 `additional_kwargs`，没有作为 callback public text delta 发出。

**Provider finish-metadata limitation**: 该 spike 证明 LangChain 会保留已提供的 OpenAI-compatible `finish_reason`，但没有证明所有 provider 都会提供同名字段，也没有引入 production normalizer。因此普通自然结束仍必须以完整 `AIMessage`、无 Tool、非空 public text 和正常 closure 为主证据；一旦 adapter 已明确提供非自然 metadata，后续 T046 必须 fail-closed veto final，而不是让缺失字段阻断正常回答。

**Control-plane assessment**: 本次 test-only fixture 直接挂接现有 `createAgent` 的 `afterModel` 与 `messages` stream，未需要 `RunnableSequence`、手写 loop 或 Chain-owned Tool dispatch。它复证 R012：完整消息和 Tool Call 在 middleware 边界已可观察；改为 Chain 只会重复实现已有的 loop、deadline、retry、concurrency 和 AbortSignal 传递约束。

## Resolved unknowns

不存在 `NEEDS CLARIFICATION`。实现前唯一需要用户重新确认的情况是：预算数值变化、工具级 detail 重新进入范围、commentary 是否写入 server Memory、取消/hard deadline 是否允许 finalizer，或将 General ReAct control plane 从 `createAgent` 改为手写 Chain/Graph；这些当前均已有明确否定/固定决策。

## R014 — Tool transcript must include provider-preexecution rejection

**Decision**: 已被模型声明、名称可安全映射的 ToolCall 即使未进入 provider，也要在 public Trace 显示为失败 Tool row。使用现有 `tool-start` 后跟同 `partId` 的 tool-scope `error`；不扩展 `tool-end`。

**Evidence**: `tool-runtime-middleware.ts` 的 admission、scope、schema、secret/web policy、duplicate 与 URL provenance 分支此前只构造 model-facing `ToolMessage`。`executeToolCall` 的常规分支才发布 `tool-start`，所以模型能基于 denied observation 作答而用户完全看不到本次请求。现有 reducer 对 tool-scope error 已能将 Tool part 收口为 failed；相反 `tool-end` 无 status 字段且会被消费端标为 completed。

**Rationale**: 这以最小的既有 public contract 修复“模型事实/用户 Trace 不对称”，并保持 provider 调用、重试、预算与 UI Tool 风格不变。公开事件只表达模型请求未执行，绝不泄露被拒绝参数、URL、secret、fingerprint、原始异常或 Tool output。

**Alternatives considered**: 静默拒绝（造成当前问题）；把拒绝伪装成 `tool-end`（UI 错标成功）；新增 `tool-end` outcome 协议（超出最小修复面）；展示 raw 拒绝内容（破坏 public DTO）。

## R015 — URL provenance is automatic safety scoping, not a click authorization

**Decision**: 当前 user message 的安全 public URL 继续自动 grant；同一已验证 conversation 可从服务端 Chat Memory 的原始 `user` turns 提供最多 8 个重验 URL。不得从准备后的模型上下文、客户端 history、assistant、summary、pinned decision、UserMemory 或 Tool result 获取 grant。

**Evidence**: `collectUserAuthorizedUrls` 已用 `canonicalizePublicWebUrl` 与 known-secret guard 过滤当前 HumanMessage；`chat-session` 只将最新 user 作为本轮输入。Chat Memory 的原始 `state.messages` 是服务端的 complete user/assistant turns，而 context builder 会混入 summary/pinned 并按 token 压缩，不能作为安全 provenance。已压缩的 raw turn 本身不存在时必须 fail closed。

**Rationale**: 用户给 URL 时无需二次交互，但必须阻止模型从 prompt、memory 或任意 assistant 文本扩展网络访问面。受限 catalog 支持“请重新读取上面的链接”而不把完整历史塞给模型。

## R016 — Historical Tool proof remains explicitly out of scope

**Decision**: 本次不把“用户过去是否真正读取过某 URL”变成可验证能力。用户只问历史执行时，模型必须说明当前 Run 无法核验；不得自动重读来伪造旧事实。

**Evidence**: Chat Memory 只保存 user/assistant completed text，不保存 Tool events；现有 StreamRun 恢复按 owner/run identity，不提供 conversation-scoped last Tool transcript query。URL catalog 只给出新 read 的候选，无法证明旧调用的开始、完成、失败或来源。

**Future requirement**: 若产品需要可核验回答，必须设计并审查 Run-to-conversation 关联、public Tool terminal snapshot、数据保留/删除、权限和 UI 引用语义，不能仅靠 prompt 或现有 Memory 旁路实现。
