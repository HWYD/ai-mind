# Contract: Stream, UI And Memory Compatibility

## Public Stream Contract

v0.6.0 不新增 route、mode 或 StreamRun kind。General ReAct 增加正式的 run lifecycle chunk，其他过程事件复用现有协议：

| Runtime event              | Stream representation                                          | Public content                                                                                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| General Run start/end      | `agent-run-start/end`                                          | `partId`、`runId` 与 completed/failed/cancelled terminal status                                   |
| Tool start/success/failure | existing `tool-*` events                                       | tool name、Guard 通过后的 safe input preview、safe output summary、status；安全拒绝只显示通用状态 |
| Resource/source            | optional `tool-end.sources` + existing resource representation | public-safe SourceRecord update；title、canonical URL、status，网页正文不进入该字段               |
| Skill/Prompt preparation   | existing `skill-*` / `prompt-*` representation                 | 可信 capability 名称、固定安全状态；raw prompt/input 不进入通用 Trace                             |
| Final answer               | existing `text-*`                                              | assistant final text only                                                                         |
| Standardized failure       | existing error chunk                                           | stable code + safe user message                                                                   |

`GeneralReActStreamAdapter` 必须从 `createAgent` typed stream/events 中只挑选白名单字段，不得直接 serialize LangChain raw event、state、message metadata、middleware context 或 error。它只能用 `agent-run-start/end` 表达 General 生命周期，不得发出 `agent-graph-*`；Tasklist 等专用 LangGraph Agent 继续独占 graph chunks。为避免 UI 解析 `tool-end.output` 自由文本，现有 `tool-end` 增加 `sources?: PublicSourceRecord[]`。`sources` 最多 5 项，只承载当前逻辑 Tool Call 新增或更新的 public-safe 来源记录，并须同步 stream-core schema/writer、web reducer/UI tests 与本文；旧 `agent-step` 输入不再解析。

消费端必须按 schema discriminant 投影：`agent-run-*` → `AgentRunPart(type='agent-run')`，`agent-graph-*` → `AgentGraphPart(type='agent-graph')`。专用 Graph 的 `agentName` 只作为 metadata；不得用它推断 General UI。旧 `AgentStepPart(type='agent-step')` 不属于 v0.6.0 schema。

## Transport Disconnect And Replay Contract

- 普通 SSE disconnect 只关闭当前 response writer，不得触发 run-scoped abort，也不得停止尚在 180 秒预算内的 Action/Answer model 或 Tool。
- 后端 execution owner 继续把 public-safe events 投影到既有 StreamEvent store；writer 已关闭时不得继续向该 writer 发送 chunk。
- 已授权客户端使用现有 run ownership、cursor 和 replay API 重连；重连不得创建第二 executor，也不得恢复或序列化 `createAgent` state。
- 显式 cancel、hard deadline 或 Run 级 terminal signal 才终止在途 Agent 工作。180 秒从 deterministic preparation 开始，止于 terminal event 完成持久化投影；network flush、客户端接收和重连等待不属于该预算。

## Durable Projection And Rendering Cadence

- StreamEvent 继续采用 PostgreSQL-first。浏览器只能收到已经成功提交的 envelope；不得先推原始 delta、再异步补库。
- Action Phase 不得产生 `text-*`。每个 Answer Phase 最终回答 part 的首个 `text-delta` 立即 durable flush；后续同一 part 的连续 delta 按 40ms 或累计 256 chars 任一先达到时合并。256 chars 只是提前 flush 阈值，单个更大的 provider delta 整块立即 flush，不人工拆分或 pacing。
- Tool/Trace/Resource/Skill/Prompt/source、`text-start/end`、error、finish、cancel 和 terminal 到达时，先 flush 更早 text，再保持独立 envelope 与连续 sequence。一个 batch 可以包含多个 envelope，但 terminal 必须是最后一项。
- 每 Run durable projection queue 高水位为 64 pending items/256KiB，低水位为 32/128KiB；高水位时 General ReAct producer await，不丢弃、覆盖、乱序或继续建立无界 Promise chain。
- 浏览器最终回答 buffer 默认使用 20ms timer + `requestAnimationFrame`，transient map/timer/rAF 保存在 ref；仅已评估 token 粒度与 Markdown 成本的模型可通过受控 allowlist 覆盖 timer 窗口，但不得绕过 rAF 或 terminal flush；code fence 可提前到最近 rAF，`text-end`、error、finish、abort 与 unmount 必须 flush/cleanup。前端不得把服务端大 delta 重新拆成模拟逐字输出。
- 完整数据库、背压、进程容量和观测契约见 [runtime-performance.md](./runtime-performance.md)。

## Safe General Run Lifecycle

General ReAct 不公开内部 phase/node。`agent-run-start` 只建立 running Run part，随后可投影一次 `skill-selected`；`agent-run-end` 只给出 `completed | failed | cancelled`。UI 标题由 Run terminal status 与首个 final `text-start` 确定性派生，不包含 raw reasoning、内部 prompt、LangChain node name、duration 或模型自由文本。

## Agent Trace UI Contract

- 通用 ReAct 使用独立 `GeneralAgentTracePanel` presentation（源码位于 `parts/general-agent/`），不复用或泛化 Tasklist、Delivery Chain、Image Agent 的专用 Trace UI。对 `routeType=chat`，它是 Agent Run、Tool、Skill、Resource、Prompt 与来源过程信息的唯一展示容器；assistant message renderer 必须按 part discriminant 把这些 Part 归并到同一个 Trace view model，已消费的 Part 不得再由 Trace 外 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 重复渲染。三条专用 Agent 的 `AgentGraphPart` 继续使用原 presentation。Skill 行固定使用 `加载了{skill.name} Skill`。
- Pencil 状态稿只约束 AI 回复区域。现有 `UserMessage` 的右对齐气泡、command/resource display segments、复制和删除交互保持不变，不属于 General ReAct Trace 的组件或改造范围。
- UI 采用浅色、扁平内联布局。标题整行作为 disclosure trigger，chevron 紧跟标题且不显示 `durationMs`。Run active 时“正在思考”使用 shadcn/ui 官方 `shimmer` 文字 utility；Shimmer 只作用于标题文字，chevron、Tool 图标与状态行不闪动，`prefers-reduced-motion` 下回退为静态文字。
- Tool action 已全部收口但最终 `text-start` 尚未到达时仍属于 active，继续显示 Shimmer“正在思考”。用户在 active 期间手动收起后，后续 Tool/Resource/Skill/Prompt/phase 事件不得强制展开。首个最终 `text-start` 到达时，reducer 必须在同一次状态归并中切换为不闪动的“已完成思考”并执行一次幂等自动折叠；之后用户手动重开不得被后续 `text-delta` 再次覆盖。显式取消显示“已停止思考”，无最终回答的终态失败显示“处理未完成”，两者均不 Shimmer。
- 展开内容只显示统一 Trace 行，不增加“正在确认回答所需的信息”或“仅展示安全执行摘要”等解释性段落。Skill 行可以显示来自可信 capability catalog/selection 的 Skill 名称，但必须使用与 Tool/Resource/Prompt 相同的 Trace 图标、间距、颜色和字重规则，不得显示独立 Skill 卡片。Resource/Prompt 只显示固定安全摘要，不展示 raw content/input。最终回答继续由现有 `text-*` 增量渲染，通用 Trace 不拥有第二套回答 UI。
- Tool 行使用工具类型图标；running/completed/failed 不显示 spinner、check、cross 等状态图标，只以同一颜色和字重层级的本地化文案表达。失败文案可以使用错误语义色。
- Tool/Resource detail 使用 public formatter 结果，不访问 Agent state。相同 Tool 类型可以在 presentation 层派生汇总行，但底层一个逻辑调用仍保持一个 `partId/toolCallId`，不得破坏 ordinal 配对。
- `web-search` 完成文案中的数量来自该调用的安全去重结果；Run 级“已读取 N 个页面”和“已读取来源”由 reducer 对 `tool-end.sources` 做 canonical URL union 后派生。来源区域只显示 `status='read'`、最多 5 项安全标题和 URL；标题作为安全 URL 链接并显示规范化 hostname，新标签打开且使用 `noopener noreferrer`。长标题可换行或截断，无成功读取来源时隐藏，不推断“官方”属性。
- 同一 action batch 在 assistant tool call 出现时按 ordinal 建立稳定 Tool 槽位；并行 start/result 可以乱序到达，但必须按 `toolCallId` 更新原槽位，不因完成顺序重排。
- retry attempt 只更新原逻辑调用槽位，不创建新行、不改变 ordinal，也不显示 attempt 次数；最终成功或最终失败只产生一个 terminal 状态。零 Tool 直答不创建空 Tool 行，但正常完成后仍保留完成态 Trace；旧 `ThinkingText` 与 General ReAct active 标题不得同时显示。
- Debug disclosure 不显示 messages、reasoning、web body、raw LangChain events/state、raw errors、API key/provider config。
- Web Tool 在 Secret/URL policy 通过前不得发送包含 raw query/URL 的 start preview；被拒绝时只显示通用安全拒绝或“该链接不可读取”。
- UI 不展示 Secret Guard 命中规则、凭据类别、redirect chain/final URL 推断或其他 Runtime 无法证明的安全检查；这些信息也不作为产品能力文案。
- Tasklist Agent、Delivery Chain、Image Agent 的现有专属展示保持兼容；“通用 Trace 唯一容器”规则不进入三条专用 renderer。
- 新文案使用现有可访问组件与本地化路径；行为测试断言角色、状态和展开/收起，不依赖偶然文案全文。

## Reasoning Visibility Contract

| Data                         | Agent internal                            | Public stream/UI | Logs         | Server Memory / browser local snapshot |
| ---------------------------- | ----------------------------------------- | ---------------- | ------------ | -------------------------------------- |
| Safe fixed step summary      | yes                                       | yes              | optional     | no / completed public Trace only       |
| Tool name/status/source      | yes                                       | yes              | safe metrics | no / completed public Trace only       |
| Provider `reasoning_content` | only if protocol-required                 | never            | never        | never / never                          |
| Raw chain-of-thought         | never intentionally requested for display | never            | never        | never / never                          |
| Internal prompt              | runtime dependency only                   | never            | never        | never / never                          |
| Web body                     | bounded observation                       | never in full    | never        | never / never                          |

`request.options.enableReasoning` 不得让 generic ReAct 暴露 raw reasoning。该选项在通用 Run 中最多影响 provider 内部能力启用，不改变 public visibility policy。

## Browser Local Completed Trace Contract

- 复用现有 IndexedDB `ai-mind-local-chat` 的 `conversation-snapshots`、`LocalConversationSnapshot` schema、stable commit 与 local-first hydration；不新增独立 Trace store、DB version bump、Prisma migration 或服务端 Trace API。
- 只有 `completed` 且 `assistantText.trim()` 非空的 assistant message 才可提交稳定本地快照。快照必须同时恢复最终回答与当时完整的 public-safe General ReAct Trace；“完整”不包括 raw chain-of-thought、LangChain messages 或 ToolObservation 全文。临时 `expanded`/disclosure state 不写入快照，刷新后的完成态默认收起并可手动展开。
- stable snapshot writer 必须保存公开 formatter/reducer 已允许的 Trace parts，并在持久化边界剔除 raw reasoning/provider metadata、raw Tool input/output/error、网页正文、内部 prompt、secret、授权 URL、Agent state/context 和 raw error。不得直接把 createAgent state 或未经公开投影的 ToolPart 原样写入。
- 显式取消、终态失败和部分回答不得提交 stable snapshot。用户停止后已输出的部分文本可以保留在当前 React state，Trace 标题固定为“已停止思考”；刷新后只恢复上一次稳定快照。
- Answer provider error、Answer Tool contract violation 与已公开部分 Answer 后的异常均属于终态失败；不得在已经公开的前缀后拼接 fallback，也不得写入 Chat Memory、UserMemory 或稳定快照。
- 会话删除、消息删除、重新生成和保留上限沿用现有 snapshot commit/cleanup 语义，确保删除 assistant message 时其 Trace parts 一同消失。当前边界保持最近 50 个会话、每快照最多 120 条消息。
- IndexedDB 不可用、quota exceeded、数据被清理或快照 schema 无效时，读取路径回退现有服务端最终 user/assistant turn。Trace 可以缺失，但不得阻塞发送、恢复或渲染最终回答；不新增前端能力说明或错误承诺。
- 本地快照仅对同一浏览器 profile 有效，不承诺跨设备、跨浏览器、无痕模式或清空站点数据后的恢复。

## Memory Contract

### Write Eligibility

只有满足全部条件才 append completed turn：

- runner terminal result 为 `completed`；
- `assistantText.trim()` 非空；
- Run 未被显式取消，且 terminal event 已完成持久化投影；当前 SSE transport 是否仍连接不影响 completed turn eligibility；
- 现有 session/conversation ownership 和 memory eligibility 通过；
- source 由实际工具执行决定。

### Source Classification

```text
executedToolCallCount > 0  → source = tool
executedToolCallCount = 0  → source = chat
```

仅绑定工具、模型提出后被 validation/permission/budget 拒绝的 call，不等于实际执行。现有 `/summary` 等 composer command 的 UserMemory write eligibility 不因进入 Agent 而自动扩大。

### Persisted Fields

服务端沿用现有最终 turn contract：assistant message ID、latest user text、assistant final text、source、既有 promotion context。createAgent state 不扩展 checkpoint schema。浏览器本地完成态 Trace 由上一节独立约束，不改变 Chat Memory/UserMemory 的字段或 eligibility。

### Never Persist In Chat Memory/UserMemory

- intermediate assistant/tool messages；
- ToolObservation/modelContent/public summary；
- search query/result body、read-url markdown、AuthorizedUrl；
- raw reasoning/provider metadata；
- Agent counters/fingerprints/deadlines/middleware context；
- cancelled/partial answer。

## Compatibility Matrix

| Existing path          | Expected v0.6.0 behavior                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Ordinary chat          | LangChain `createAgent`; zero-or-more actions                                                                                 |
| Skill chat             | `createAgent` + selected overlay                                                                                              |
| `/summary`, `/check`   | Deterministic context preparation → `createAgent`                                                                             |
| `@resource`            | Authorized resource preparation → `createAgent`                                                                               |
| MCP Resource/Prompt    | Existing adapter/scopes → `createAgent`                                                                                       |
| Tasklist Agent         | Existing dedicated runtime, no Generic ReAct                                                                                  |
| Delivery Chain         | Existing dedicated runtime, no Generic ReAct                                                                                  |
| Image Agent            | Existing dedicated runtime, no Generic ReAct                                                                                  |
| Chat Memory/UserMemory | Final turn only; actual-execution source                                                                                      |
| Browser local refresh  | Completed public-safe Trace + final answer; server final-turn fallback                                                        |
| Existing clients       | v0.6.0 client/server 同步升级；旧 `agent-step`/旧通用 Trace 不兼容                                                            |
| SSE reconnect          | Existing owner/cursor replay; no Agent state resume                                                                           |
| Final text cadence     | Server first delta immediate, then 40ms/256 chars; browser default 20ms+rAF, approved model allowlist may override timer only |

## Security Assertions

Automated tests must prove public chunks and persisted final turns do not contain sentinel values placed in:

- `reasoning_content`；
- internal system prompt；
- Tavily 或智谱的 key/provider config；
- raw tool/provider Error；
- oversized web body beyond public preview；
- Token、Cookie、API Key、Authorization 值、签名 URL、session cookie 和 internal MCP token。

Sensitive sentinel scan is required at serialized stream、browser local snapshot 和 memory adapter boundaries, not only at individual node unit tests.

## Stream Ordering Contract

- `createAgent` 使用 `version='v2'`，runner invocation 固定 `maxConcurrency=3`；adapter 在模型声明 batch 时按 ordinal 建立稳定 part identity，工具 lifecycle 事件允许按实际开始/完成顺序到达。
- reducer/UI 必须按 `toolCallId` 更新既有 part，并按 assistant ordinal 展示；下一轮 model request 也按该 ordinal 投影 ToolMessage，不依赖网络完成顺序。
- retry attempt 不得新建第二个 public part；一个逻辑 tool call 对应一个 part lifecycle。
- 含 tool calls 的中间 model turn 不得被当作 completed final text 写入 Memory。
- 最终 model text 可以从 agent stream 增量映射；若 provider 在同一 turn 混合 text/tool chunks，adapter 必须延迟或停止 final classification，直到该 turn 是否含 tool calls 已确定。
- batch persistence 必须先提交再按连续 sequence 投递；数据库 transaction 失败时该批不得出现在当前 writer。writer 已关闭时保留已提交事件供 replay。
- hard deadline 或显式取消后不得启动新的 Agent 工作；SSE 断流后不得继续写入已关闭的 writer，但仍须在后端 Run 预算内投影可回放事件。
