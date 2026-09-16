# Feature Specification: v0.6.0 General ReAct Agent MVP

**Feature Branch**: `codex/v0.6.0-general-react-agent-mvp`

**Version**: `v0.6.0`

**Created**: 2026-09-09

**Status**: Implementation closing — Phase 11 frontend audit remediation complete; pending final human browser review

**Input**: 将除 Tasklist Agent、Delivery Chain、Image Agent 外的全部聊天对话统一为通用 ReAct Agent 范式，并基于 AI Mind 现有 Runtime、Tool、Skill、MCP、Stream 与 Memory 边界设计可落地的 MVP。

## Clarifications

### Session 2026-09-09

- Q: “全部聊天对话”是否包含 `/summary`、`/check`、`@resource`、Skill、MCP Resource/Prompt 等特殊聊天入口？ → A: 包含；这些入口先完成确定性上下文准备，再进入同一个通用 ReAct 决策闭环。
- Q: 哪些现有专用链路明确不进入通用 ReAct Agent？ → A: Tasklist Agent、Delivery Chain、Image Agent 保持现有专用入口和权限边界。
- Q: MVP 是否提供联网能力及怎样的数据保护边界？ → A: 提供只读 Web Search 与受控网页读取，只对可识别的 Token、Cookie、API Key、Authorization 凭据和签名 URL 做确定性阻断；不实现通用 PII/DLP 或私有语义识别，也不提供网页写入、登录、提交或浏览器操作。
- Q: 是否向用户展示模型原始思维链或 Runtime 无法证明的安全细节？ → A: 不展示也不持久化原始思维链，不展示 redirect 链或敏感规则命中细节，只呈现安全的步骤、工具状态、已读取来源和通用安全拒绝。
- Q: MVP 是否需要跨请求恢复、HITL 或长期 Agent Run？ → A: 不需要；单次聊天请求内完成闭环，整个 Run 最长 180 秒，超出限制时受控收口。
- Q: 普通 Tool 的自身超时、统一 Tool Runtime 上限和 Agent Tool 如何协作？ → A: 普通 Tool 以服务端 execution policy 声明类型、Profile 和可选的更短自身限制，单次有效超时取 Profile 上限、Tool 自身限制、Action 剩余时间和 Run 剩余时间中的最小值；`agent-tool` 使用独立判别类型，由专用 Agent Runtime 管内部预算，外层不套普通 Tool 短超时，也不自动重试整个 Agent。
- Q: 同一轮多个 Tool Call 采用怎样的执行策略？ → A: 采用 C′：LangChain `createAgent(version='v2')` 原生并行，项目统一并发上限为 3；派发前按模型声明顺序预占逻辑 Tool Call 与 observation 配额，通用 ReAct effective tools 排除所有 `agent-tool`。
- Q: 并发上限为 3 时，Run Tool Call 总配额和普通 Tool retry 配额怎样分配？ → A: Run 最多接纳 9 次逻辑 Tool Call；一次逻辑调用的 retry 不重复占用 Tool Call 配额。普通 Tool retry 不再按批次预分配，每次实际 retry attempt 前统一原子竞争 Run 剩余配额，单调用最多 2 次、整个 Run 最多 4 次。
- Q: SSE 断线是否等同于取消 Agent Run，180 秒是否包含网络投递？ → A: 不等同；180 秒只约束从确定性上下文准备到终态事件完成持久化投影的后端 Run。普通 SSE 断线只结束当前传输，后台 Run 继续由 run-scoped signal 控制并可通过现有 resumable stream 重连回放；网络投递、客户端接收和重连等待不计入 180 秒。只有显式取消、hard deadline 或 Run 级终止信号才停止执行。
- Q: 通用 ReAct 的执行过程 UI 是否复用 Tasklist Agent 等专用 Agent 的展示？ → A: 不复用专用 Agent presentation；通用 ReAct 使用独立的浅色、扁平内联执行轨迹，标题整行可展开/收起且不显示耗时，展开/收起图标紧跟标题，最终回答开始后自动收起。工具图标只表达工具类型，运行、成功和失败只通过同一字重的状态文案表达；最终回答继续沿用现有 `text-*` 流式增量渲染。
- Q: Web 搜索、读取数量和来源列表怎样展示？ → A: 数量必须由 Runtime 基于最终安全结果确定性统计，retry 不重复计数；使用“已搜索到 N 个来源”“已读取 N 个页面”等中性文案，不根据域名或模型判断页面“官方”。展开轨迹仅在存在成功读取记录时显示“已读取来源”，按 canonical URL 去重并最多展示 5 项安全标题与 URL。
- Q: 通用 ReAct Trace 与现有 Tool、Skill、Resource、Prompt 展示怎样协作？ → A: 对 `routeType=chat`，`GeneralAgentTracePanel` 是 Agent Step、Tool、Skill、Resource、Prompt 和来源过程信息的唯一展示容器；现有独立 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 不得在 Trace 外重复渲染。Skill 可在 Trace 内以统一行样式显示可信目录中的名称；三条专用 Agent 继续使用各自 presentation。
- Q: “正在思考”何时闪动、何时结束？ → A: Run 活跃期间标题使用 shadcn/ui `shimmer` 文字效果；即使 Tool action 已全部收口，只要首个最终 `text-start` 尚未到达，仍保持“正在思考”和 Shimmer。首个最终 `text-start` 到达时原子切换为“已完成思考”并自动收起；显式取消显示“已停止思考”，无最终回答的终态失败显示“处理未完成”，两者均不闪动。
- Q: 最终回答完成后，刷新页面是否还要看到 Trace？ → A: 要；复用现有浏览器 IndexedDB `conversation-snapshots`，把已完成 assistant message 的完整 public-safe Trace Parts 与最终回答一起写入稳定本地快照并在刷新时恢复。刷新后的完成态 Trace 默认收起，用户可手动展开查看完整过程，不持久化临时 disclosure state。该快照不是 Agent state/checkpoint、Chat Memory 或 UserMemory，不提供服务端或跨设备同步；取消、失败和不完整回答不写入稳定快照，IndexedDB 不可用时降级为仅恢复服务端最终问答且不得阻塞聊天。
- Q: 通用 ReAct 上线后的 Node.js、PostgreSQL 和流式渲染采用什么性能基线？ → A: 采用 B 平衡方案：每 Node.js 进程最多 8 个 active General ReAct Run，无 permit 时不在内存排队；I/O 留在异步事件循环，v0.6.0 不引入 Redis、worker_threads 或独立任务队列。StreamEvent PostgreSQL-first，最终回答首个 delta 立即持久化并投递，后续同一 part 按 40ms 或 256 chars 任一先到进行 durable microbatch；每 Run pending projection queue 上限为 64 items/256KiB 并提供可等待背压。浏览器默认使用 20ms + `requestAnimationFrame` 的 ref-backed buffer；仅已评估 token 粒度与 Markdown 渲染成本的模型可通过受控 allowlist 设置自身窗口，仍复用同一 rAF、terminal flush 与虚拟列表链路，且不把大 delta 人工拆成打字机片段。
- Q: General ReAct 与专用 LangGraph Agent 怎样区分 stream/UI 协议，`agentName` 是否参与路由？ → A: General ReAct 只用最小通用生命周期 `agent-run-start/end`，前端归并为 `type='agent-run'`；Tasklist 等专用 LangGraph Agent 继续使用 `agent-graph-*` 并归并为 `type='agent-graph'`。`agentName` 只保留为专用 Graph metadata，不决定 General UI。v0.6.0 是破坏性切换，不再解析或迁移旧 `agent-step` 快照。
- Q: 本版本前端 General ReAct 的命名、组件边界和 Skill 展示怎样固定？ → A: 前端域名统一使用 `general-agent`，包括 `parts/general-agent/`、`GeneralAgentTracePanel`、`GeneralAgentTraceRow` 和 `GeneralAgentTraceView`；后端 `runtime/general-react-agent/` 保留以表达 ReAct 执行语义。General Trace 启动后才投影 `skill-selected`，Skill 行固定使用 `加载了{skill.name} Skill`，且 Tool、Skill、Resource、Prompt 只能出现在同一个 General Trace。除 Tasklist、Delivery Chain、Image Agent 外，所有有效 `routeType=chat` 请求都必须进入 General ReAct Runner；旧 Composer/Capability/direct-answer/planning/tool-calling fallback 在本版本删除，不保留不可达兼容代码。

### Session 2026-09-14

- Q: Skill 命中是否能够改变 General ReAct 本轮可调用的 Tool、MCP Resource 或 Prompt？ → A: 不能够。v0.6.0 的 Skill 只叠加可信的系统提示词和输出风格；它不是 Tool 权限、MCP 发现或隐式上下文读取的来源。General ReAct 的 Action Phase 固定使用独立 `GeneralToolPolicy` 解析出的基础 Tool 集。
- Q: 当前少量稳定 Tool 怎样平衡固定可见性与最小权限？ → A: `calculator`、`datetime`、`text-transform`、`unit-convert`、`read-url`、`web-search`、`city-weather` 均已具备受控 schema、scope 与只读/确定性 execution policy，进入基础集；`agent-tool`、未明确登记的 remote MCP Tool 以及任何写入能力一律排除。未来 Tool 数量或权限维度增长后，才以独立 Tool Policy/Tool Search 按需装配，不把这个职责回退给 Skill。
- Q: 原先 Reader Skill 的远程 Resource/Prompt 自动注入怎样处理？ → A: 仅保留已有 Composer 显式命令和 `@resource` 引用的确定性 preparation；不得因为自然语言命中或 Skill 选择而静默读取 remote Resource、Prompt 或发现 remote MCP Tool。当前未提供显式入口的 remote mock capability 不再由 generic chat 触发。

### Session 2026-09-15

- Q: 普通聊天的最终回答怎样兼顾直接性与真实用户阅读体验？ → A: 只在未绑定 Tool 的 Answer Phase 使用服务端基线策略：普通问题先直接回答并给出适中的必要解释；用户明确要求简短、详细、步骤、表格或特定格式时优先满足该表达要求。该策略不改变 Action、Tool allowlist、预算、stream schema 或持久化边界。
- Q: 网页、工具观察和显式注入资料中的内容能否影响上述回答策略或运行边界？ → A: 不能。它们只作为事实资料；其中嵌入的指令不能改变系统规则、回答策略优先级、Tool 权限、授权 URL、预算或数据访问范围。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 普通问题统一进入通用决策闭环 (Priority: P1)

作为聊天用户，我希望普通问答也由同一套通用 Agent 判断是否需要行动：能直接回答时直接回答，需要外部事实或计算时再调用工具，而不是要求我选择模式或命令。

**Why this priority**: 这是 v0.6.0 的核心价值；只有普通聊天入口统一，ReAct 才是默认运行范式而不是附加能力。

**Independent Test**: 分别发送一个无需工具的常识问题和一个需要计算或当前网页信息的问题，验证两者使用同一入口，前者直接完成，后者在工具结果返回后完成最终回答。

**Acceptance Scenarios**:

1. **Given** 用户发送无需外部能力即可回答的问题，**When** Agent 判断无需工具，**Then** 系统不制造空工具调用，并由 Answer Phase 先给可直接使用的结论和适中的必要解释，不输出执行过程、模式说明或无关扩展。
2. **Given** 用户发送需要计算、当前时间或联网检索的问题，**When** Agent 选择允许的工具，**Then** 系统执行工具、把结果交回 Agent，并基于结果输出最终回答。
3. **Given** 一次请求需要多个只读工具步骤，**When** 前一步结果产生新的信息需求，**Then** Agent 可继续下一轮判断，直到完成回答或触发受控上限。

---

### User Story 2 - 特殊聊天入口仍汇入同一 Agent (Priority: P1)

作为已经使用 `/summary`、`/check`、`@resource`、Skill 或 MCP 上下文的用户，我希望这些入口保留原有上下文语义，同时获得通用 ReAct 的后续判断与工具能力。

**Why this priority**: 如果特殊聊天入口继续提前返回或绕过统一闭环，“全部聊天对话”会出现难以解释的行为分叉。

**Independent Test**: 对每类现有特殊聊天入口构造一个请求，验证确定性上下文先被准备，随后均进入通用 Agent，且既有上下文和权限没有丢失或扩大。

**Acceptance Scenarios**:

1. **Given** 请求带有 `/summary`、`/check` 或 `@resource` 上下文，**When** 上下文准备完成，**Then** Agent 以这些结果作为可用观察继续决策，而不是在准备阶段直接结束。
2. **Given** 请求选择了 Skill，**When** 进入通用 Agent，**Then** 通用基础工具集合保持不变；Skill 只叠加可信系统提示词与输出风格，且不触发隐式上下文读取。
3. **Given** 请求引用 MCP Resource 或 Prompt，**When** 外部上下文不可用或未授权，**Then** 系统保持 fail-closed，并给出可理解的受控结果。

---

### User Story 3 - 获得可审计但不泄露推理的过程反馈 (Priority: P2)

作为用户，我希望看到 Agent 正在分析、执行哪个工具、使用了哪些来源以及步骤成功或失败，而不会看到模型原始思维链、内部提示或敏感配置。

**Why this priority**: 多步 Agent 需要足够的过程可见性来建立信任，但可见性不能突破安全与隐私边界。

**Independent Test**: 执行一次多工具请求，检查流式界面只展示安全步骤摘要、工具状态与来源；再检查响应和持久化内容均不存在原始思维链、内部提示、密钥或 provider 配置。

**Acceptance Scenarios**:

1. **Given** Agent 正在判断或执行工具，**When** 状态发生变化，**Then** 用户能看到独立于专用 Agent UI 的扁平内联轨迹、紧跟标题的展开/收起图标以及简洁稳定的步骤状态，且标题不显示耗时。
2. **Given** Tool lifecycle 处于运行、完成或失败，**When** 用户查看轨迹，**Then** 图标只表达工具类型，状态通过字重一致的“正在… / 已… / …失败”文案表达，不额外显示运行、成功或失败状态图标。
3. **Given** Web Search 或网页读取产生结果，**When** 形成用户可见展示，**Then** 数量来自安全过滤和去重后的真实结果；成功读取来源按 canonical URL 去重且最多展示 5 项，不把未经可信规则证明的页面标记为“官方”。
4. **Given** 工具返回内部观察数据，**When** 形成用户可见展示，**Then** 仅展示必要工具状态和来源，不增加解释性段落，也不直接暴露完整网页正文或内部错误。
5. **Given** 模型返回供应商特有的推理元数据，**When** 后续轮次需要保持协议连续性，**Then** 系统可在单次运行内部使用该元数据，但不向用户输出或持久化。
6. **Given** 通用聊天产生 Tool、Skill、Resource 或 Prompt 过程 Part，**When** assistant message 渲染，**Then** 这些 Part 只在同一个 General ReAct Trace 中显示，不再产生 Trace 外的旧面板；Skill 名称采用 Trace 行样式且不得使用模型自由文本伪造。
7. **Given** Tool action 已结束但最终回答尚未开始，**When** 首个最终 `text-start` 尚未到达，**Then** 标题仍为带 Shimmer 的“正在思考”；只有最终回答真正开始后才切换为“已完成思考”并自动收起。
8. **Given** 用户在 Run active 时手动收起 Trace，**When** 后续 Tool 或状态事件到达，**Then** 系统保持用户的收起选择，不因新事件强制展开。
9. **Given** Agent 零 Tool 直接回答并正常完成，**When** 用户查看或刷新会话，**Then** 系统保留该次已完成 Trace 与最终回答，但不创建虚假 Tool 行。
10. **Given** 一次 Run 已正常完成，**When** 用户在同一浏览器刷新并重新进入该会话，**Then** IndexedDB 稳定快照恢复完整 public-safe Trace 与最终回答；Trace 默认收起且可手动展开，不恢复临时 disclosure state、raw reasoning、原始工具参数/输出、网页正文或内部错误。
11. **Given** IndexedDB 不可用、数据被清理或本地快照校验失败，**When** 用户重新进入会话，**Then** 系统仍可从现有服务端记录恢复最终问答；Trace 缺失不得阻塞聊天或制造无法证明的恢复提示。
12. **Given** 用户在已出现部分最终回答后显式停止，**When** 当前页面收口该 Run，**Then** 已输出文本可暂留当前界面且标题显示“已停止思考”，但该不完整 assistant message 与 Trace 不进入稳定本地快照。
13. **Given** 通用聊天已提交但 assistant message 或 `agent-run` 尚未投影，**When** 首帧显示“正在思考”，**Then** 它已使用与后续 `agent-run` 相同的 `GeneralAgentTracePanel` 标题和字体规格，不得先渲染独立 `ThinkingText` 再切换。

---

### User Story 4 - 失败和循环能够安全收口 (Priority: P2)

作为用户，我希望工具参数错误、外部服务失败、重复调用或 Agent 长时间无进展时，请求可以在明确限制内停止并给出可用回答或标准化错误，而不是无限循环或留下半截消息。

**Why this priority**: 通用 Agent 会扩大运行分支，MVP 必须先证明它在异常条件下可控。

**Independent Test**: 注入非法工具参数、重复调用、工具超时、搜索失败和运行预算耗尽场景，验证每个行动都有对应结果，循环按上限停止，并且最终状态可被现有聊天 UI 正确消费。

**Acceptance Scenarios**:

1. **Given** Agent 请求未知工具或提交非法参数，**When** 校验失败，**Then** 系统拒绝执行、生成结构化失败观察，并允许 Agent 基于失败继续或收口。
2. **Given** 工具调用超时、失败或返回过大内容，**When** 结果进入运行态，**Then** 系统截断或标准化该结果，且不暴露原始内部错误。
3. **Given** 达到行动轮次、工具次数、模型次数或总时长上限，**When** Agent 尚未自然结束，**Then** 系统禁止继续调用工具，并基于已有可靠信息生成受约束的最终回答。
4. **Given** 多个通用聊天同时执行并持续产生文本或工具事件，**When** 达到进程、数据库或投影队列容量边界，**Then** 系统通过 admission、微批量和背压保持事件顺序与持久化一致性，不阻塞 Node.js 事件循环、不无限堆积内存，也不静默丢事件。

---

### User Story 5 - 专用 Agent 行为不回归 (Priority: P3)

作为现有用户，我希望 Tasklist Agent、Delivery Chain 和 Image Agent 继续按各自的专用入口、工具、GraphState 与交付协议工作，不因普通聊天 Agent 化而改变权限或体验。

**Why this priority**: v0.6.0 的目标是统一通用聊天，而不是重写已经稳定的专用 Agent。

**Independent Test**: 回归执行三条排除链路的代表场景，验证它们仍由原有专用运行时处理，且普通聊天的工具集没有泄漏到这些链路。

**Acceptance Scenarios**:

1. **Given** 请求被识别为 Tasklist、Delivery Chain 或 Image，**When** 路由完成，**Then** 请求不进入通用 ReAct Agent。
2. **Given** 普通聊天启用新的通用工具集，**When** 专用 Agent 运行，**Then** 其原有工具 allowlist 和权限边界保持不变。

### Edge Cases

- 模型声称需要工具但未提供合法工具调用时，系统不得猜测或执行未声明行动。
- 同一工具以相同参数重复调用且没有新增信息时，系统应识别无进展并阻止无界循环。
- 单轮返回多个普通工具调用时，MVP 允许最多 3 个底层调用并行；批次必须在派发前按模型声明顺序预占逻辑调用和观察体积配额，超出预算的调用返回唯一配对的 `budget_blocked` 观察且不得触发 provider。
- 并行调用可以按实际完成顺序产生 lifecycle 更新，但内部观察、下一轮模型输入和 UI 槽位必须通过 `toolCallId` 配对，并按模型声明的 ordinal 形成稳定顺序。
- 同一逻辑 Tool Call 的首次 attempt 和最多 2 次 retry 共同只占 1 次 Tool Call 配额；每次 retry 必须在退避完成并重新检查取消/截止时间后、实际 attempt 开始前原子申请 Run retry permit，未获得 permit 时不得重试。
- Web Search 没有结果、网页读取失败、内容为空或内容过长时，最终回答必须区分“未找到”“无法读取”和“信息不足”。
- 网页正文包含要求忽略系统指令、调用其他工具或泄露数据的内容时，只能把它当作不可信数据。
- 网页 URL 指向本机、私网、凭据 URL、非 HTTP(S) 协议或不是本轮获授权的地址时，必须拒绝读取。
- Web Search query 或待读取 URL 含可识别凭据或签名参数时，必须在任何 provider 调用和公开 input preview 之前拒绝，失败结果不得回显命中值。
- 远端网页提取 provider 不提供 redirect chain 时，系统不得推断或展示逐跳校验；provider 返回的 URL 只有重新通过当前 URL policy 后才能展示或授权。
- 普通 SSE 连接中断时，只停止向该连接继续投递，不得把传输断线传播为 Run 取消；后端 Run 在 180 秒边界内继续投影可回放事件。显式取消、hard deadline 或 Run 级终止后才停止模型和工具，且不得写入不完整的最终轮次。
- 选择的聊天模型不支持工具调用时，普通聊天必须 fail-closed，不得静默退回行为不同的旧链路。
- 工具已经成功但最终模型调用失败时，系统只输出标准化错误或明确的不完整结论，不把内部观察全文直接当作最终回答。
- 普通 Tool 声明的自身超时高于所属 Profile 上限时必须被统一 Tool Runtime 截断；低于上限时以更短值执行，且不得由模型参数放宽。
- Tool 的实现实际委派了另一个 Agent 时必须声明为 `agent-tool`，不得因其外形是 LangChain Tool 就继承普通 Tool 的短超时和自动重试。
- 通用聊天的 Tool、Skill、Resource、Prompt Part 已进入 General ReAct Trace 后，assistant message renderer 不得再在 Trace 外渲染对应旧面板；三条专用 Agent 不受此规则影响。
- 同批并行 Tool 可以同时显示 running/completed/failed 行，但 UI 位置必须按 assistant ordinal 固定；retry 只更新原逻辑调用行，不新增行、不改变稳定顺序。
- Tool action 已结束到首个最终 `text-start` 之间不得提前显示“已完成思考”；零 Tool 直答也不得创建空 Tool 行或同时显示旧 `ThinkingText` 与新 Trace loading 标题。
- 用户在 active 期间手动收起 Trace 后，后续 Tool、Resource、Skill、Prompt 或 phase 事件不得重新强制展开；首个 final `text-start` 的自动收起仍只执行一次。
- 显式取消或无最终回答的终态失败不得永久停留在 Shimmer“正在思考”；必须分别收口为不闪动的“已停止思考”或“处理未完成”，并只显示安全停止原因。
- 已完成本地 Trace 快照必须和现有会话删除、消息删除及重新生成语义一致；不得留下指向已删除 assistant message 的孤儿 Trace。浏览器存储不可用、超额或快照失效时必须安全降级，不得影响服务端最终问答加载。
- 同时到达的第 9 个 General ReAct Run 不得在 Node.js 内形成无界等待；必须在 context/provider/Tool 工作开始前返回标准化可重试 busy 结果，且不得影响三条专用 Agent 的既有容量治理。
- 高频 `text-delta` 不得为每个 token 单独创建 PostgreSQL transaction。首个最终回答 delta 必须立即 durable projection，后续同一 part 必须按 40ms 或 256 chars 任一先到 flush；结构化或 terminal event 必须先 flush 更早文本并保持连续 sequence。
- 单个 provider delta 已超过 256 chars 时必须整块立即 flush；256 chars 只是提前 flush 阈值，不得为了视觉打字机效果人为拆包或延迟。
- PostgreSQL 暂时变慢时，run-local projection queue 不得超过 64 items/256KiB，也不得继续无界拉取 Agent stream；取消、deadline 或 projection failure 必须唤醒等待者并清理 timer、listener、permit 和 pending promise。
- 同步本地 Tool 即使设置了 attempt timeout，也不得依赖 `Promise.race()` 抢占 CPU；必须先通过输入长度、语法和复杂度限制保证事件循环可终止。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系统 MUST 将所有 `routeType=chat` 请求交给同一个通用 ReAct Agent 决策闭环处理。
- **FR-002**: 系统 MUST 明确排除 Tasklist Agent、Delivery Chain 和 Image Agent，并保持这三条专用链路的既有路由与权限边界。
- **FR-003**: 通用 ReAct Agent MUST 能在每轮选择“直接完成”或“调用一个或多个允许工具”；“采用 ReAct”不得等同于每次强制调用工具。
- **FR-004**: `/summary`、`/check` 与 `@resource` 等显式聊天入口 MUST 先完成既有的确定性上下文准备，再把结果交给通用 ReAct Agent，且不得在正常准备成功后旁路最终决策。Skill 选择或自然语言匹配 MUST NOT 单独触发 MCP Resource/Prompt preparation。
- **FR-005**: Skill MUST 只影响可信系统提示词与输出风格，MUST NOT 改变本轮 General ReAct 的 Tool allowlist、MCP Resource/Prompt 权限、Tool discovery 或 execution policy。Skill 不得成为 Tool 权限来源。
- **FR-006**: MVP 通用基础 Tool 集 MUST 固定为 `calculator`、`datetime`、`text-transform`、`unit-convert`、`read-url`、`web-search` 与 `city-weather`；每项均须通过既有 availability、`general-react-agent` scope 和 `standard-tool` execution policy 校验。`agent-tool`、未显式登记的 remote MCP Tool 和任何副作用 Tool MUST NOT 进入该集合。
- **FR-007**: MVP MUST 不提供网页写入、登录、表单提交、购买、消息发送、文件系统、Shell、桌面控制或其他高副作用通用工具。
- **FR-008**: 同一轮互不依赖的 `standard-tool` 调用 MUST 由 LangChain `createAgent(version='v2')` 原生并行调度，项目级并发上限 MUST 为 3；下一次 Agent 决策只能在该批次全部成功、失败或被拒绝并形成完整配对观察后开始。`agent-tool` MUST NOT 进入通用 ReAct effective tools 或该并行通道。
- **FR-009**: 每个模型发出的工具调用，无论成功、参数非法、未知工具、权限拒绝、超时、取消或内部失败，MUST 产生一一对应且可被下一轮消费的结构化观察。
- **FR-010**: 所有工具调用 MUST 同时通过名称 allowlist、严格输入校验、运行预算和当前请求权限校验；任一校验失败都不得触发工具副作用。
- **FR-011**: 单次运行 MUST 默认限制为最多 6 个携带 Tool 的 Action 轮次、9 次被 admission 接纳的逻辑工具调用、7 次 Action 模型调用加 1 次预留 Answer 调用（总计 8 次逻辑模型调用）和 180 秒后端总时长；145 秒后必须停止新行动，Answer 最多使用 30 秒，并为生命周期收口保留 5 秒。180 秒从确定性上下文准备开始，止于终态事件完成持久化投影，不包含 SSE 网络投递、客户端接收或重连等待。单个逻辑模型调用最多允许 1 次 transient retry，单个已通过前置校验且符合 `retrySafe` 的远端只读 Tool 对任意执行异常最多允许 2 次 execution retry（首次执行加 2 次重试，最多 3 次 attempt），且每个 Run 最多 1 次模型重试、4 次普通 Tool 重试。retry attempt MUST NOT 重复占用逻辑 Tool Call 配额或生成额外 ToolMessage。
- **FR-012**: 系统 MUST 限制单次工具观察和累计观察体积，并在截断时保留“内容已截断”的明确信号，避免外部内容无限占用上下文。
- **FR-013**: 系统 MUST 检测完全相同的重复工具调用和连续无进展；达到无进展阈值后必须停止继续行动。
- **FR-014**: 达到任一预算或无进展上限时，系统 MUST 禁止新的工具调用，并基于当前可靠观察生成受约束最终回答；若无法形成可靠回答，则返回标准化错误。
- **FR-015**: Web Search 和网页读取 MUST 只向 provider 发送 schema 声明的最小搜索词或 URL 以及固定选项，不得附带完整聊天历史、内部提示或用户记忆对象；搜索词与 URL 在外发前 MUST 拒绝可识别的 Token、Cookie、API Key、Authorization 凭据和签名 URL，且不得回显命中值。
- **FR-016**: 网页读取 MUST 只接受用户在当前请求中明确提供的 URL，或本次运行的 Web Search 返回并通过校验的 URL；只允许 HTTP(S)，并拒绝凭据、签名 URL、本机、私网和其他受限初始目标。IPv4-mapped IPv6 与 IPv4-compatible IPv6 必须先还原为 IPv4，再复用 IPv4 的 loopback、link-local、multicast 和私网拒绝规则。远端 provider 不公开 redirect chain 时，系统不得声明或展示逐跳校验；provider 返回的 URL 必须重新通过相同 URL policy 后才能展示或授权。
- **FR-017**: Web 内容 MUST 被视为不可信观察数据；其中的指令不得修改系统规则、工具 allowlist、授权 URL、预算或数据访问范围。
- **FR-018**: 用户可见流 MUST 展示安全的 Run 生命周期、工具状态、结果摘要和来源。General ReAct MUST 只使用 `agent-run-start/end` 表达最小 Run 生命周期，不得伪装成 `agent-graph-*`；Tasklist 等专用 LangGraph Agent MUST 保持既有 `agent-graph-*`。MVP MUST NOT 输出原始 chain-of-thought、内部提示、供应商推理字段、原始错误、敏感配置、被拒绝的凭据值，或 Runtime 无法证明的 redirect/安全检查细节。
- **FR-019**: 内部运行态 MUST 保存模型原始行动消息与对应观察，以满足多轮工具协议连续性；其中不得保存 client、request、writer、AbortSignal、secret、raw Error 或持久化数据整行。
- **FR-020**: 单次运行完成后，服务端 Chat Memory/UserMemory MUST 只按既有规则持久化最终 user/assistant 轮次；不得把 ReAct 中间轨迹、工具观察、网页正文或原始推理写入 Chat Memory/UserMemory。FR-038 允许的浏览器本地已完成 public-safe Trace 快照不属于服务端 Memory 或 Agent state 持久化。
- **FR-021**: UserMemory 的最终来源分类 MUST 依据本次是否实际执行过工具，而不是依据模型是否具备工具能力。
- **FR-022**: 所有进入通用 ReAct Agent 的聊天模型 MUST 明确支持工具调用；不支持、未配置或未授权时必须 fail-closed。
- **FR-023**: 通用 ReAct Agent MUST 复用现有聊天请求 DTO 和 StreamRun 分类，不要求客户端选择新的 route、mode 或 command。`agent-run-start/end` 是 v0.6.0 的正式生命周期事件；消费端 MUST 分别投影为 `AgentRunPart(type='agent-run')` 与 `AgentGraphPart(type='agent-graph')`，不得按 `agentName` 猜测 UI 类型。旧 `agent-step` 协议和快照格式不属于 v0.6.0 输入。
- **FR-024**: 通用 ReAct 执行过程 MUST 使用独立于 Tasklist、Delivery Chain 和 Image Agent presentation 的浅色扁平内联 UI。对 `routeType=chat`，`GeneralAgentTracePanel` MUST 是 Agent Step、Tool、Skill、Resource、Prompt 与来源过程信息的唯一展示容器，已被 Trace 消费的 Part MUST NOT 在外部旧面板重复渲染；三条专用 Agent presentation 保持不变。标题整行可展开/收起，展开/收起图标紧跟标题且标题不显示 `durationMs`；展开内容不增加解释原始思维链或安全策略的段落。Pencil 状态稿只定义 AI 回复中的 Trace，用户消息气泡及其复制/删除交互 MUST 保持现有 `UserMessage` presentation，最终回答继续沿用现有流式增量渲染。
- **FR-025**: v0.6.0 MVP MUST 保持 Agent state run-local，不新增 Agent checkpoint/resume、HITL、AgentRun 持久化、服务端 Trace 存储或数据库迁移；复用既有 StreamRun/StreamEvent 的 SSE 断线重连与事件回放，以及 FR-038 的浏览器本地完成态 UI 快照，均不属于 Agent state resume。
- **FR-026**: 系统 MUST 记录可运维的安全指标，至少覆盖运行结果、停止原因、模型/工具调用次数、工具失败分类、耗时和 Web 能力状态；日志不得包含查询全文、网页正文、原始推理、被拒绝的原始参数、Token、Cookie、API Key、Authorization 值、签名 URL 或其他 secret。
- **FR-027**: 显式用户取消、hard deadline 和 Run 级终止信号 MUST 贯穿模型与工具执行；当前 SSE transport 的断开信号 MUST 与 run-scoped cancellation signal 分离，不得仅因客户端断线取消后端 Run。真正取消后的中间结果不得被误记为成功最终轮次。
- **FR-028**: v0.6.0 允许破坏性切换：Tasklist、Delivery Chain 和 Image 的专用 runtime/stream/UI 必须保持；除此之外的普通聊天、Skill、MCP、Memory 和通用消息展示全部迁移到 General ReAct Runner/Trace，不再保留旧 direct-answer、planning、tool-calling fallback 或旧通用面板兼容路径。
- **FR-029**: 每个普通 Tool MUST 通过服务端 `ToolExecutionPolicy` 显式声明 `standard-tool` 类型、执行 Profile、`retrySafe` 和可选的 Tool 自身 `attemptTimeoutMs`；该字段不得进入模型可填写的 Tool input schema。统一 Tool Runtime MUST 以 `min(Profile 上限, Tool 自身限制或 Profile 默认值, Action 剩余时间, Run 剩余时间)` 计算单次有效超时，并成为 timeout、retry、退避、预算检查和取消传播的唯一所有者。Tool/provider adapter 只能在该有效预算内定义更短的协议子超时，不得隐藏重试或延长外层截止时间。
- **FR-030**: 实际委派完整 Agent 工作的 Tool MUST 显式声明为 `agent-tool`，不得落入 `standard-tool` 默认值。外层 Tool Runtime MUST 不对整个 Agent Tool 应用普通 Profile 的短 attempt timeout 或自动 retry，只负责 runtime scope/allowlist/参数校验、父级取消与截止时间传播、一次逻辑委派和一次最终配对结果；内部模型、阶段、工具、timeout 和 retry 由该 Agent 的专用 Runtime 治理。v0.6.0 不向 GeneralToolPolicy 新增 Agent Tool，现有 Delivery subagent Tool 继续仅属于专用链路。
- **FR-031**: Run Policy MUST 在 v2 Tool task 派发前为整个 action batch 生成不可变 admission：按 assistant tool call ordinal 接纳剩余的最多 9 次逻辑 Tool Call 配额，超额调用仍须返回配对的 `budget_blocked` 观察，并对接纳调用预分配累计 observation 配额。并行 Tool task 只能消费自身 admission，不得独立执行会产生竞态的逻辑调用或 observation“检查后递增”。retry 配额不属于 batch admission。
- **FR-032**: 并行 Tool task 对计数、Authorized URL、Source、fingerprint 和 observation 的 state update MUST 使用可合并的 delta/sum/union 语义；单个 Tool task 不得决定 Run 级 stop/no-progress。批次汇合后 MUST 按固定优先级统一计算停止状态，并在下一次模型调用前按 ordinal 规范化 ToolMessage 投影。
- **FR-033**: Tool Runtime MUST 为每个 Run 提供并发安全的 `RetryPermitPool`。只有已通过 allowlist、scope、schema、安全和授权等前置校验的 `remote-readonly/retrySafe` Tool 执行异常（包括网络异常、HTTP 4xx/5xx、provider typed error、解析异常和其他异常）才能在单调用 retry 次数未达 2、退避完成且取消/Action/Run deadline 再检查通过后，同步原子申请一个 permit；成功 grant 后必须立即启动并计入一次 retry attempt，permit 不返还。全 Run 最多 grant 4 个 permit，同一 callId 最多 2 个；申请失败时直接收口当前逻辑 Tool Call，不得等待、隐藏重试或突破上限。前置校验拒绝、取消和已耗尽 deadline 不启动 retry attempt。
- **FR-034**: 通用 ReAct Run MUST 复用现有 resumable stream execution coordinator：transport 关闭后继续把安全事件投影到既有 event store，已授权客户端可重连回放；不得新增第二 executor、Agent checkpoint 或长期任务队列。显式取消或 180 秒 hard deadline 后不得启动新的 Action/Answer model 或 Tool 工作。
- **FR-035**: 每个用户可见 Tool 行 MUST 使用项目统一图标体系中的工具类型图标，不得用 spinner、check、cross 等运行/成功/失败图标代替工具图标。`running/completed/failed` 只能通过同一颜色和字重层级的本地化状态文案表达，失败文案可使用错误语义色但不得改变图标语义。
- **FR-036**: Web Search 的“已搜索到 N 个来源” MUST 统计该逻辑调用中通过安全过滤并按 canonical URL 去重的 public results；“已读取 N 个页面” MUST 统计当前 Run 中成功读取的唯一页面，retry attempt 不得重复计数。只有存在 `status='read'` 的 Source Record 时才能显示“已读取来源”，列表 MUST 按 canonical URL 去重、最多 5 项且只含安全标题与 URL；系统不得仅凭域名、provider title 或模型判断增加“官方”标签。
- **FR-037**: General ReAct Trace 的 active 标题 MUST 使用 shadcn/ui `shimmer` 文字效果展示“正在思考”，且 Shimmer 只作用于标题文字，不作用于 chevron、Tool 图标或状态行。通用聊天提交后、assistant message 或 `agent-run` 尚未投影的首帧 MUST 已使用同一个 `GeneralAgentTracePanel`，按 `running` 状态展示相同标题和字体规格，不得先显示独立 `ThinkingText`。Tool action 已结束但首个最终 `text-start` 尚未到达时 MUST 继续保持 active；首个最终 `text-start` 到达时 MUST 原子切换为不闪动的“已完成思考”并自动收起，且自动收起只触发一次、用户之后可手动重开。用户在 active 期间手动收起后，后续事件 MUST 保持该 disclosure state。显式取消 MUST 显示“已停止思考”，无最终回答的终态失败 MUST 显示“处理未完成”，两者均不得继续 Shimmer。
- **FR-038**: 正常完成且最终回答非空的通用 ReAct assistant message MUST 复用现有浏览器 IndexedDB `ai-mind-local-chat` 的 `conversation-snapshots` 稳定快照，保存可刷新恢复的完整 public-safe Trace Parts 与最终回答；不得新增独立 Trace object store、服务端表或 Agent checkpoint。刷新恢复后的完成态 Trace MUST 默认收起并允许用户手动展开，临时 disclosure state MUST NOT 持久化。写入前 MUST 使用公开投影移除 raw reasoning、provider metadata、raw Tool input/output/error、网页正文、内部 prompt、secret 和 Runtime state；取消、失败或部分回答不得提交为稳定快照。会话/消息删除与重新生成 MUST 同步更新该快照；IndexedDB 不可用、超额或快照无效时 MUST 安全降级到现有服务端最终问答恢复且不阻塞聊天。
- **FR-039**: 服务端 MUST 使用进程级、无 request payload 的 `GeneralReActExecutionGate` 将每个 Node.js 进程的 active General ReAct Run 限制为 8。admission MUST 在 context/provider/Tool 工作前完成；无 permit 时 MUST 复用 `STREAM_SERVICE_UNAVAILABLE`、`retryable=true` 和固定“服务繁忙，请稍后重试。”，不得建立进程内等待队列、消耗模型/Tool 配额或公开内部容量数值。permit MUST 在终态投影、projection drain 和资源清理后的 `finally` 中恰好释放一次；transport disconnect 不得提前释放。该 gate MUST NOT 改写三条专用 Agent 的容量策略，且 v0.6.0 MUST NOT 引入 Redis、分布式 semaphore 或 worker queue。
- **FR-040**: 所有可回放 public stream event MUST 先成功持久化到 PostgreSQL，再向仍连接的 writer 投递。最终回答每个 part 的首个 `text-delta` MUST 立即 flush；后续同一 part MUST 在 40ms 或累计 256 chars 任一先达到时合并 flush。结构化、error、finish、cancel 或 terminal event MUST 强制 flush 更早文本并保持独立 envelope、连续 sequence 和原始顺序；256 chars MUST 仅作为触发阈值，单个更大的 provider delta MUST 整块立即 flush。一次数据库 batch MUST 至多锁定/更新/trim StreamRun 一次；事务失败不得投递未持久化事件。
- **FR-041**: 每个 General ReAct Run MUST 使用可取消的 durable projection buffer，并以 64 个 pending items 或 256KiB pending serialized bytes 作为高水位、32 items/128KiB 作为低水位。达到高水位时 producer MUST await 背压，不得丢弃、覆盖、乱序或继续无界拉取 Agent stream。浏览器最终回答 buffer MUST 默认采用 20ms timer + `requestAnimationFrame`，使用 ref 保存 transient queue/timer，并在 `text-end`、error、finish、abort 和 unmount 时 flush/cleanup；仅已评估 token 粒度与 Markdown 成本的模型可通过受控 allowlist 覆盖 timer 窗口，且不得绕过 rAF 或终态 flush；不得对服务端 delta 人工逐字切片。
- **FR-042**: `@ai-mind/database` MUST 在开发与生产中为每个 Node.js 进程复用单一 Prisma/`PrismaPg` client，默认 pool `max=10`、`connectionTimeoutMillis=5000`、`idleTimeoutMillis=30000`，且不得按请求 `$disconnect()`。model/Web/MCP/database/stream projection MUST 使用非阻塞异步 I/O 和 `AbortSignal`；v0.6.0 MUST NOT 为这些 I/O 创建 worker thread 或 child process。本地确定性 Tool MUST 通过输入复杂度限制保持短 CPU task，未来只有持续越过性能门槛的具体 CPU Tool 才可单独评审有界共享 worker pool。
- **FR-043**: 前端消息部件 MUST 按 Agent 域文件夹隔离：`parts/general-agent/` 只拥有 General Trace，`parts/tasklist-agent/`、`parts/delivery-agent/`、`parts/image-agent/` 只拥有对应专用 presentation，通用小部件进入 `parts/shared/`；不创建 `parts/legacy/`，旧通用面板从源码和 renderer 中删除。消息 renderer MUST 通过显式 import 路径消费这些目录，不得恢复根级混放文件。
- **FR-044**: General ReAct 的 public event 顺序 MUST 为 `agent-run-start`、可选 `skill-selected`、Tool/Resource/Prompt events、最终 `text-start` 和 `agent-run-end/text-end`；Skill MUST 只由 General Trace 消费，并使用精确文案 `加载了{skill.name} Skill`，不得渲染旧的独立 Skill 面板或“Skill 命中”文案。Composer MUST NOT 提供手动 Skill mode 选择器，也不得按前端可见模式写入请求 `options.skill`；Skill 仍由 General Agent 在服务端自动命中。
- **FR-045**: 除 `routeType !== 'chat'` 的 Image Agent 及 `tasklist`、`delivery-chain` 专用命令外，任何有效 `routeType=chat` 请求 MUST 申请 General gate、准备上下文并调用同一个 General ReAct Runner；不得走旧 Composer/Capability/direct-answer/planning/tool-calling fallback。旧方法、旧 DTO 字段和旧通用 renderer MUST 在本版本源码中删除。
- **FR-046**: General Agent UI 的实现标识 MUST 使用 `general-agent`，但 wire protocol 和 server runtime 的 `general-react-agent` 语义保持稳定；不得用 `agentName` 或目录名猜测 `agent-run`/`agent-graph` 类型。
- **FR-047**: 具有既有会话内容的普通聊天发起新一轮后，仅 latest user/assistant accepted turn MUST 使用固定 `288px` response reserve：submitted/streaming 应作用于 assistant slot，ready/error 应交接至最终 assistant item。该 reserve 不得随 `dvh`、viewport 或输入框高度变化，且不得在终态移除；之前的历史消息不得带有该 reserve。现有 Composer-safe bottom inset 与用户阅读意图驱动的滚动策略 MUST 保留，短回答可在 reserve 内与三条推荐问题一起稳定展示。
- **FR-048**: 一个 General ReAct Run MUST 分为同一已选模型的 Action Phase 与 Answer Phase。Action Phase 仅在 `createAgent` 内作 Tool 决策和观察回灌；其所有模型文本、reasoning、metadata 均为内部数据，MUST NOT 进入 public stream、durable event、Memory 或稳定快照。Action Phase 在无 Tool Call、预算/无进展停止或可恢复失败后，除显式取消或 hard deadline 外 MUST 恰好进入一次 Answer Phase。Answer Phase MUST 使用同一 resolved model selection 的未绑定 Tool model，MUST NOT 再经 `createAgent` 或绑定任何 Tool；其输入只能重建自用户问题、可靠 Tool observation、安全来源和固定 stop reason，MUST NOT 包含任何 Action assistant text/reasoning/metadata。其首个安全文本 delta 才可创建并立即 durable-project `text-start`/`text-delta`，后续 delta 按既有流式节奏投影。若未绑定 Tool 的 Answer response 仍含 Tool Call，MUST fail-closed，且不得执行或公开该调用。只有正常结束但文本为空的 Answer 才可在尚有收口时间时给出确定性 fallback；provider error、Answer Tool contract violation 或已公开部分 delta 后的异常必须以 failed 收口，不得追加 fallback、不得把该部分文本写入 Memory 或稳定快照。
- **FR-049**: 对已通过 allowlist、schema、授权和预算校验并真正执行的普通 Tool，`tool-start`/`resource-start` MUST 在首个 attempt 开始前完成 awaited durable projection；成功终态、错误终态和来源只能在最后一次 attempt 已完成后发布，并与 start 使用同一 `partId`。为附加安全来源而延迟 `tool-start` 是禁止的；拒绝或 validation failure 仍只形成配对 observation，不伪造运行中的 Tool。
- **FR-050**: General ReAct observer 的 timing percentile 样本 MUST 使用固定容量为 1,024 的 rolling window，不得在 process singleton 中无限累积。`count` 与 `total` 保持累计指标；`p50`、`p95` 与 `max` 必须明确表示当前 rolling window，且不得包含用户内容或原始 Tool/Model 数据。
- **FR-051**: StreamEvent batch transaction `p95 ≤20ms` 是 production-like PostgreSQL 部署拓扑的 release hard gate。开发机 Docker 的冷启动结果只能作为诊断记录，不能视为达标、不能降低数值，也不能以未证明的 pool/window 改动替代基准；目标环境基准必须区分预热和测量阶段并记录 pool、数据库实例、并发与样本数。
- **FR-052**: General ReAct 的有效 Tool 集 MUST 由独立 `GeneralToolPolicy` 在本轮开始时一次解析，并在 Action Phase 内保持不变。Skill 命中与否下，该集合必须相同；解析过程不得调用 remote MCP `tools/list`，也不得将脚本、Resource 或 Prompt 自动伪装成模型 Tool。
- **FR-053**: General ReAct MUST 为 Action 与 Answer 构建彼此独立的 server-owned system prompt projection。Action-only 的 Tool 选择、调用和后续行动指令 MUST NOT 进入 Answer 输入；Answer 只使用用户目标、可信的 Skill 输出风格、可靠 observation、安全来源、固定 stop reason 与面向用户的回答策略。该分离不得改变 Tool allowlist、模型/Tool 预算、stream DTO、Memory 或稳定快照边界。
- **FR-054**: Answer 的默认表达 MUST 面向真实用户体验：普通问题先给直接可用的回答，并提供适中的必要解释；用户明确要求简短、详细、步骤、表格或特定格式时，在安全边界内优先遵从。网页、Tool observation、Resource 或 Prompt 内容中的嵌入指令只是不可信资料，MUST NOT 覆盖系统规则、该表达优先级、Skill/Tool 权限、授权 URL、预算或数据访问范围。

### Key Entities

- **General ReAct Run**: 一次 `routeType=chat` 触发的受控决策闭环；包含消息轨迹、计数器、授权 URL、来源、停止原因和最终输出。它可短暂独立于某一次 SSE 连接，但后端执行生命周期不得超过 180 秒，也不具备 checkpoint 恢复能力。
- **Action Request**: 模型请求执行的工具名称、严格参数和调用标识；必须能与唯一观察配对。
- **Tool Observation**: 工具成功、拒绝、校验失败、超时、取消或执行失败后的结构化结果；内部信息与用户可见摘要分离。
- **Authorized URL Set**: 当前运行内允许网页读取的 URL 集合，仅由用户明确输入和本轮搜索结果扩展。
- **Source Record**: 最终回答可引用的最小来源信息，包括标题、URL、来源工具和读取状态。
- **Run Budget**: 单次运行的行动轮次、工具次数、模型次数、时长、观察体积、重试和无进展限制。
- **Action Batch Admission**: 每次模型产生一组 Tool Call 后、v2 并行派发前形成的 run-local 不可变准入记录；保存 ordinal、是否接纳及该调用可消费的 observation 配额，不保存 raw secret，也不预分配 retry。
- **Retry Permit Pool**: 单次 Run 内普通 Tool retry 的原子准入器；只在实际 retry attempt 即将开始时发放最多 4 个不可返还 permit，并限制同一逻辑调用最多获得 2 个。
- **Tool Execution Policy**: 服务端对 Tool 执行类型、Profile、自身 attempt 上限、retry safety 和预算所有权的判别式配置；区分 `standard-tool` 与 `agent-tool`。
- **Stop Reason**: 自然完成、预算耗尽、无进展、取消、模型失败、工具失败或安全拒绝等可观测终止原因。
- **Local Completed Trace Projection**: 写入现有 IndexedDB 会话稳定快照的完成态 UI 投影；只包含 public-safe Trace Parts 与最终回答，不是 Agent state、服务端 Memory 或跨设备记录。
- **General ReAct Execution Gate**: 每 Node.js 进程最多发放 8 个 active General ReAct Run permit 的无载荷容量门；不是 request store、分布式锁或等待队列。
- **Durable Stream Projection Buffer**: 每 Run 的 public event 微批量与背压边界；在 PostgreSQL 提交后才投递，限制 pending items/bytes，并保持 sequence/terminal 顺序。

### Non-goals

- 不把 Tasklist Agent、Delivery Chain 或 Image Agent 迁入通用 ReAct Agent。
- 不实现浏览器自动化、网页写操作、账号登录、购买、发消息、文件写入、Shell、桌面控制或任意代码执行。
- 不展示、记录或持久化 raw chain-of-thought；安全步骤摘要不是思维链复刻。
- 不实现跨请求 Agent checkpoint/resume、HITL、长期 AgentRun 或队列化后台任务，也不为通用 ReAct Agent 新增 Agent Tool、子 Agent 或多 Agent 编排；现有 resumable stream 只允许同一短生命周期 Run 在传输断线后继续并回放事件。`agent-tool` 类型仅显式隔离现有专用 Delivery subagent Tool 并为未来接入阻止错误套用普通 Tool 策略。
- 不新增数据库表、修改 Prisma schema、服务端 Trace 记录或跨设备 Trace 同步，也不把中间工具轨迹写入 Chat Memory/UserMemory；仅允许 FR-038 定义的浏览器本地完成态公开 Trace 快照。
- 不新增新的聊天 API route、客户端模式选择器或破坏性 stream protocol。
- 不在本版本解决网页全文索引、长期搜索缓存、付费额度管理、复杂引用编辑器或多 Web Provider 自动故障转移。
- 不实现通用 PII 检测、私有上下文语义追踪、DLP、外发数据人工审批，也不承诺识别无标识且不等于系统已知 secret 的任意随机字符串。
- 不为远端网页提取 provider 实现或声称逐跳 redirect 可见性；本版本只校验提交的初始 URL 和 provider 明确返回且准备公开/授权的 URL。
- 不建设“官方网站”可信域名目录或通用来源权威性判定；页面标题可以保留来源自身的安全标题，但 Runtime 不额外推断“官方”属性。
- release note 与 package version 只在实现、验收和 release closing 完成后更新；本版本的实现与验收证据集中记录在同一 canonical workspace。
- 不在 v0.6.0 引入 Redis/KV、消息队列、独立 Agent worker service、`worker_threads` 通用池、跨实例全局并发控制或 process-crash takeover；这些能力不能作为本版正确性的前置条件。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 自动化路由验收中，100% 的 `routeType=chat` 场景进入同一通用决策闭环，且 100% 的 Tasklist、Delivery Chain、Image 场景仍进入各自专用链路。
- **SC-002**: 在无需工具的代表性问答集中，100% 的请求可在零工具调用下完成，且不会生成空调用、虚假来源或额外模式提示。
- **SC-003**: 在需要 1 至 4 轮行动的代表性场景集中，100% 的成功工具调用都被后续决策消费，最终回答可追溯到对应观察或来源。
- **SC-004**: 在未知工具、非法参数、权限拒绝、超时、取消和工具失败测试中，100% 的行动请求都有一一对应观察，且请求不会无限等待或循环。
- **SC-005**: 在重复调用、无进展和各类预算耗尽测试中，100% 的运行在声明上限内停止，并进入最终收口或标准化失败状态。
- **SC-006**: 安全测试中，100% 的非 HTTP(S)、凭据/签名 URL、本机、私网和未授权初始 URL 被拒绝；包含已声明可识别凭据格式或系统已知 secret 的 Web Tool 参数产生 0 次 provider 调用，网页内容中的提示注入不会改变工具权限或运行边界。
- **SC-007**: 对所有新增 provider fake、流式、日志与持久化测试样本扫描时，原始思维链、内部提示、完整网页正文、原始 provider 错误、Token、Cookie、API Key、Authorization 值、签名 URL 和 session secret 的泄漏数量为 0。
- **SC-008**: `/summary`、`/check`、`@resource`、每类现有 Skill 和 MCP 上下文的代表场景均通过验收，且其上下文在最终回答中可验证地生效。
- **SC-009**: 现有普通聊天、Tool、Skill、MCP、Memory、Tasklist、Delivery Chain、Image、stream reducer 与 UI 回归套件保持通过。
- **SC-010**: 评审者能够仅依据安全步骤摘要、工具状态、来源和停止原因解释一次运行发生了什么，而无需访问 raw chain-of-thought 或内部 Runtime 对象。
- **SC-011**: Tool Runtime 策略测试中，100% 的 `standard-tool` attempt 使用 Profile、Tool 自身限制、Action 剩余和 Run 剩余中的最小有效超时；本地确定性 Tool 不自动重试，已通过前置校验的远端只读 `retrySafe` Tool 对网络、HTTP 4xx/5xx、provider typed、解析和未知执行异常最多执行 3 次且每个 Run 最多消耗 4 次 Tool retry；schema/security/permission/cancellation 等前置拒绝的 provider invocation/retry 次数为 0。
- **SC-012**: 已标记的 Delivery `agent-tool` 回归中，100% 的调用不受普通 Tool 1/5/20 秒 attempt policy 和整 Agent 自动重试影响，仍受专用 Agent Runtime 与父级取消/截止边界控制；通用 ReAct effective tools 中 Agent Tool 数量为 0。
- **SC-013**: scripted concurrency 验收中，同批 4 个可并行普通 Tool 的底层同时执行数峰值必须为 3；每个 call 只产生一个配对 ToolMessage/public part，下一轮模型输入和 UI 槽位保持 ordinal 稳定；9 次接纳调用和 4 次普通 Tool retry 的 Run 上限在并发失败、超时和乱序完成下均不得被突破。未发生失败的 Tool 占用 retry permit 数必须为 0，其他 Tool 可在单调用上限内竞争其未使用额度。
- **SC-014**: 可恢复流验收中，普通 SSE 断线产生 0 次 run-scoped abort，后端 Run 仍在 180 秒内完成或受控终止，重连客户端能按既有协议回放已投影事件；显式取消和 hard deadline 均能终止在途 model/tool，且网络投递耗时不改变后端 deadline 计算。
- **SC-015**: Web UI 验收中，搜索/读取数量与经过安全过滤、canonical URL 去重后的 Runtime 记录 100% 一致，retry 不增加数量；无成功读取来源时不显示来源列表，有成功读取来源时只显示最多 5 项 `status='read'` 的安全记录，且 Runtime 生成的状态文案中“官方”误标数量为 0。
- **SC-016**: General ReAct UI 验收中，通用聊天的 Tool、Skill、Resource、Prompt 独立旧面板渲染数量为 0，全部安全过程内容只出现于一个 Trace；active、action-settled/final-pending、final-start、manual-reopen、cancelled 和 failed-terminal 状态均按 FR-037 转换，页面同时出现旧 `ThinkingText` 与 Trace loading 标题的次数为 0。
- **SC-017**: 本地恢复验收中，100% 正常完成且最终回答非空的代表场景在同一浏览器刷新后恢复完整 public-safe Trace 与答案；raw reasoning、原始 Tool input/output/error、网页正文和 secret 的本地快照泄漏数为 0。取消、失败和部分回答的稳定快照写入数为 0；IndexedDB 不可用或快照无效时最终服务端问答仍可加载，聊天阻塞数为 0。
- **SC-018**: scripted reference load 中，8 个并发 General ReAct Run 能持续完成，第 9 个在 provider/Tool 调用前被标准化 busy 拒绝；首个最终回答 delta 立即 durable projection，后续 batch 满足 40ms 或 256 chars flush，pending queue 峰值不超过 64 items/256KiB，未出现未持久化先投递、sequence gap、terminal 后追加、permit/timer/listener 泄漏或静默丢事件。参考环境的 StreamEvent batch transaction p95 目标不超过 20ms、Node.js event-loop delay p95 目标不超过 50ms，默认浏览器 buffer 配置下正常持续文本的消息树提交频率通常不高于服务端约 25 batch/s；模型 timer 覆盖需单独记录性能证据。
- **SC-019**: General Agent UI 组件回归中，accepted follow-up 在 submitted、streaming、ready 与 error 状态均保留固定 `288px` response reserve，且不存在 viewport reply runway；之前的历史 assistant message 不带该 reserve。同一轮在 submitted/streaming 仍使用稳定的列表 item key，Composer-safe bottom inset 与现有滚动策略不变。
- **SC-020**: 混合文本与 Tool Call 的模型 turn 中，最终文本 public/durable/Memory/snapshot 泄漏数为 0；IPv4-mapped 或 IPv4-compatible IPv6 私网目标授权数为 0；执行中的普通 Tool 在首个底层 invoke 前已经拥有同 `partId` 的 durable start，终态与来源只在执行结束后出现；长期 observer 的 percentile 样本量不超过 1,024；目标 PostgreSQL 环境的预热后 reference load transaction p95 不超过 20ms。
- **SC-021**: 在已配置可用基础 Tool 的测试中，未选 Skill、`utility-skill` 与 `reader-skill` 三种请求的有效 Tool 名称集合 100% 相同，且等于七项固定基础集；其间 remote MCP `tools/list` 调用数为 0。Skill 命中不会产生 remote Resource/Prompt preparation，显式 Composer/`@resource` preparation 仍可进入同一 Agent。
- **SC-022**: 提示词组合回归中，100% 的 Answer 输入不包含 Action-only 的 Tool 调用指令；普通问题的最终 Answer 采用结论优先且适中的默认表达，用户明确的简短/详细/格式要求可在安全边界内覆盖默认；包含“忽略此前指令”等文本的 Web、Tool 或显式上下文观察不会改变回答策略、Tool allowlist、授权 URL 或预算。

## Assumptions

- v0.6.0 是在已完成 release closing 的 v0.5.4 之后开启的新版本开发窗口，唯一 canonical workspace 为 `specs/v0.6.0-general-react-agent-mvp/`。
- 现有聊天 API、模型目录、Tool Definition/Registry、Skill、MCP、stream-core、聊天记忆和 UserMemory 能力继续作为新 General ReAct Runner 的输入基础；旧通用运行逻辑和旧 UI 不作为兼容基础。
- Web 能力通过一个服务端只读搜索/提取供应商提供；供应商不可用时允许该能力 fail-closed，不影响无需 Web 的直接回答和本地工具。
- MVP 面向当前单次交互规模，只允许现有 coordinator 在 SSE 断线后继续同一最长 180 秒的后端 Run；不承诺长时间或队列化后台执行、Agent state 跨请求/跨设备恢复或大规模并发 Agent 调度。
- 默认预算可在实现评审中收紧，但不得在没有新决策记录的情况下放宽权限、URL 范围或副作用边界。
- 性能默认值按单个长期运行 Node.js 实例定义；多实例环境的 active Run 和 PostgreSQL 连接总量按实例数线性增长。v0.6.0 的 reference load 用 scripted model/Tool 验证，不把第三方 Tavily 稳定性混入本地容量结论。
- 用户界面继续使用现有语言与可访问性基线；General ReAct 使用全新的唯一 Trace presentation，不泛化或复用 Tasklist、Delivery Chain、Image Agent 的专用展示，也不继续保留通用聊天的独立 Tool/Skill/Resource/Prompt 面板。
