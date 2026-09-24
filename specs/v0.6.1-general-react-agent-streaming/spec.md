# Feature Specification: v0.6.1 General ReAct Agent Streaming

**Feature Branch**: `codex/v0.6.1-general-react-agent-streaming`

**Version**: `v0.6.1`

**Created**: 2026-09-22

**Status**: Completed — the 2026-09-23 Tool transcript, evidence-prompt, and trusted URL-provenance correction passed its acceptance gates. Local release closing and AC-039 were accepted on 2026-09-24; no Git tag, GitHub Release, push, commit, or merge was created.

**Input**: 在 v0.6.0 General ReAct Agent 基线上，移除普通成功路径中固定追加的未绑定 Tool Answer 模型调用；直接公开模型轮次中的安全正文，并用 `pending`、`commentary`、`final_answer` 三种语义驱动顺序、折叠、最终回答、Memory 与快照边界。

## Clarifications

### Session 2026-09-22

- Q: 无 Tool 的普通正文是否仍需再调用一次模型生成 Answer？ → A: 不需要。自然成功、无 Tool Call 且正文非空的模型轮次直接成为 `final_answer`，本轮结束。
- Q: 正文先于 Tool Call 到达时是否允许立刻流式展示？ → A: 允许。producer 在首个非空正文 delta 时发送不带 outcome 的 Agent text start；客户端据此呈现 `pending` 中性暂定态。模型轮次结束后根据是否存在 Tool Call 原地解析为 `commentary` 或 `final_answer`，不得先缓冲完整正文。
- Q: Tool 前或 Tool 间的可见说明文字放在哪里？ → A: 它是 public-safe `commentary`，与 General Agent 的思考过程一起折叠；它不是原始思维链，也不是最终回答。
- Q: 纯正文完成后的思考标题怎样展示？ → A: 保留空的“已完成思考”标题，但没有箭头且不可交互；`pending` 本身不构成可折叠详情。
- Q: 工具级 detail 是否进入 v0.6.1？ → A: 不进入。工具保持一行确定性状态；不展示 raw Tool input/output/error，也不建立自由文本到单个 Tool 的脆弱绑定。Pencil 的 `Nested Trace Row Disclosure` 仅作为未来候选，不是本版验收要求。
- Q: 运行预算怎样扩容？ → A: 采用选择性约 1.5 倍扩容：最多 9 个含 Tool 的模型轮次、14 次逻辑 Tool Call、10 次普通 Agent loop 模型调用，另为异常收口预留最多 1 次模型调用，总计最多 11 次逻辑模型调用；Run 硬上限 270 秒。
- Q: 三种正文语义怎样固定？ → A: `pending` 是尚未判定本轮是否会调用 Tool 的暂定展示态；`commentary` 是可公开的行动说明，只属于 Trace；`final_answer` 是自然成功且无 Tool Call 的最终用户回答，也是完成、复制、Memory 和后续建议的唯一正文事实源。
- Q: Provider 缺失原生 finish metadata，但完整 AIMessage 无 Tool、正文非空且 Agent stream 正常闭合时怎样处理？ → A: 可提交 normal final。完整消息与正常 stream 闭合是主证据；Provider 明确给出的非自然 metadata 只能否决，metadata 缺失不是失败。
- Q: 模型尝试已经公开正文 delta 后发生可重试错误时，是否仍重试？ → A: 不重试。公开事件不可撤回；本次已公开正文以 `commentary/interrupted` 收口，再按异常 finalizer gate 处理。模型 retry 仅允许发生在首次 public delta durable publish 之前。
- Q: 异常 finalizer 成功产出受限答复时，怎样向用户呈现？ → A: 正文仍作为 final answer 显示；Trace 标题为“处理未完成”且默认展开，不额外显示技术标签。该答复必须在正文中说明适用范围或限制，且不得写入 Memory。
- Q: 成功 constrained finalizer 是否写入 Memory？ → A: 不写。v0.6.1 保持 Chat Memory 与 UserMemory 均排除 constrained provenance；未来若要放开，必须作为带 provenance、压缩与提炼策略的独立扩展重新评审。
- Q: 模型正常结束、无 Tool，但没有可见正文时，是否允许一次 constrained finalizer？ → A: 允许。空白自然结束不是正常直答；只要未取消、未超时、执行状态明确且仍有 finalizer 预算，即可使用一次 constrained finalizer，且继续不写入 Memory。

### Session 2026-09-23 — Tool truth and URL provenance correction

- Q: 模型已声明 ToolCall、但在 provider 执行前被预算、schema、secret、URL policy、重复或 URL provenance 拒绝时，用户是否应看见该动作？ → A: 应看见一个现有样式的、脱敏的失败 Tool Trace row。它准确表示“模型请求未执行”，不表示 provider 已调用、更不表示页面已读取；使用既有 `tool-start` 加同 `partId` 的 tool-scope `error`，不得伪造成功 `tool-end`。
- Q: URL 是否需要用户再次点击或授予交互式权限？ → A: 不需要。用户在当前请求明确给出的、每次都通过既有 public-web/secret policy 的 URL 自动成为可读候选；这不是放宽 SSRF、credential 或 allowlist 安全边界。
- Q: 同一会话后续请求能否复用用户之前明确给出的公开 URL？ → A: 可以，但只从已经完成会话归属验证的服务端 Chat Memory 原始 `user` turn 提取、重新 canonicalize，并最多提供最近 8 个去重 URL。不得从客户端历史、assistant、摘要、pinned decision、UserMemory、Tool output 或模型文本授予；原始 turn 已被压缩丢弃时 fail closed，要求用户重新提供。
- Q: 用户追问“上一轮真的读取了吗？”时，能否以 URL reuse 或 prompt 证明历史执行？ → A: 不能。当前版本没有按 conversation 可验证查询前一 Run Tool transcript 的受信索引；不得臆测或为了补证据自动重读。模型应如实说明当前 Run 无法核验旧执行；用户明确要求重新读取且唯一识别一个受信 URL 时，才可发起新的 read-url。
- Q: 无 ToolCall 的 loop 正文如何约束？ → A: 它直接面向用户并成为 final answer；loop 与 finalizer 共用事实边界。没有当前 Run 的真实 observation 时不得声称已经搜索、读取、执行或得到失败；真实 denied ToolMessage 只能表述为“未执行/未完成”，成功读取必须同时具有真实 `read-url` observation 和 `status=read` source。

## Summary

v0.6.0 通过 Action/Answer 双阶段保证只有未绑定 Tool 的 Answer 文本公开，但即使模型已在 Action 中自然给出完整答案，也必须再进行一次模型调用。这增加了直答延迟、费用和重复表达，并阻止 Tool 前/Tool 间的安全说明按真实 ReAct 顺序展示。

v0.6.1 把“一个模型轮次内的正文与 Tool Call 是否共存”设为公开语义判定点：正文一到达即以无 outcome 的 Agent text stream 发送，客户端暂定展示为 `pending`；本轮含 Tool Call 时解析为 `commentary` 并纳入 Trace，本轮正常闭合、无 Tool Call 且正文非空时解析为 `final_answer` 并结束。固定 Answer Phase 被删除，只在非自然/预算停止或空白 natural no-Tool 结果且仍有预算时允许一次受约束 finalizer。

本版本改变 General ReAct 的 stream contract、前端 Part 模型、Trace 展示、最终回答投影与预算，不改变 Tool 权限、Skill 边界、Web 安全、专用 Agent presentation、数据库 schema 或部署拓扑。

## Goals

- 让无 Tool 的普通问答只需一次模型调用，并从首个正文 delta 开始真实流式展示。
- 按模型真实产出顺序展示 Tool 前、Tool 间和 Tool 后的 public-safe 说明，不伪造独立 planning step。
- 用明确、可回放的 phase contract 区分过程说明与最终回答，防止 commentary 污染复制、Memory、快照最终正文或下一轮上下文。
- 覆盖 Tool/正文的主要排列、并行 Tool、异常停止、取消、重连与协议违规。
- 在约 1.5 倍选择性扩容后仍保持可预测的时间、调用、observation、并发和 retry 上限。

## Non-goals

- 不展示、记录、持久化或恢复模型 raw reasoning、hidden chain-of-thought、内部 prompt 或 provider 私有事件。
- 不实现工具级 detail、工具行二级 disclosure、raw Tool input/output/error 展示或模型自由摘要的 Tool 归属。
- 不新增 Tool、扩大 Tool 权限、启用副作用 Tool、开放 remote MCP Tool 自动发现或改变 Web URL/secret 安全策略。
- 不改变 Tasklist Agent、Delivery Chain、Image Agent 的 stream/UI contract。
- 不新增数据库表、Redis、队列、worker thread、跨设备 Trace 同步或 Agent checkpoint。
- 不为“上一轮是否真的读取”新增 server Trace storage、Run-to-conversation 索引或自动补读；这一能力须作为独立版本重新评审。
- 不用关键词、标点、文案内容或缺失的 provider metadata 猜测 outcome；outcome 只能由完整模型轮次结构、正常 stream 闭合与明确的非自然终止证据决定。
- 不绕过本规格实施；代码、测试、Pencil 和长期文档必须以本 canonical workspace 的已批准决策为准，任何行为变化先回写规格并取得必要确认。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 单次模型调用完成普通问答 (Priority: P1)

作为不需要外部工具的用户，我希望回答从首个正文片段开始流式出现，并在同一模型轮次完成，避免额外等待和重复生成。

**Why this priority**: 普通问答是最高频路径，也是当前固定 Answer Phase 最直接的额外成本来源。

**Independent Test**: 使用确定性模型流输出多个正文 delta 且不产生 Tool Call；正文必须立即可见，最终只形成一个 `final_answer`，整个 Run 仅有一次普通 Agent loop 模型调用。

**Acceptance Scenarios**:

1. **Given** 一个不需要 Tool 的请求，**When** 模型持续输出正文并自然结束，**Then** 正文从首个 delta 可见，结束后成为唯一最终回答，且不追加第二次模型调用。
2. **Given** 纯正文正在流式输出，**When** 该模型轮次尚未结束，**Then** UI 以中性暂定态展示正文，不提前声称已经完成思考。
3. **Given** 纯正文自然完成，**When** Trace 中没有 Tool、Skill、Resource、Prompt 或 commentary 详情，**Then** 保留“已完成思考”标题，但不显示箭头且标题不可展开。

---

### User Story 2 - 按真实顺序展示行动说明与工具 (Priority: P1)

作为需要搜索、读取、计算或其他 Tool 的用户，我希望看到模型主动说明接下来要做什么，并且说明、Tool 状态和最终回答保持真实先后顺序。

**Why this priority**: 这是 ReAct 体验的核心；如果正文被丢弃或错当最终回答，用户无法理解长任务的进度，最终内容也会被污染。

**Independent Test**: 分别回放“先 Tool 后正文”“正文→Tool→正文”“Tool→正文→Tool→正文”三种模型序列；每段正文和每个 Tool 必须按到达/模型轮次顺序出现，含 Tool 的轮次正文只作为 `commentary`，最后无 Tool 的自然正文才是 `final_answer`。

**Acceptance Scenarios**:

1. **Given** 首轮只有 Tool Call，**When** Tool 完成且下一轮输出无 Tool 正文，**Then** Trace 先显示 Tool 状态，后显示最终回答。
2. **Given** 首轮先输出正文再产生 Tool Call，**When** 该轮结束，**Then** 已显示正文原地解析为 `commentary` 并进入 Trace，随后显示 Tool，下一轮无 Tool 正文成为最终回答。
3. **Given** 一轮 Tool 完成后模型输出说明并再次调用 Tool，**When** 第二个 Tool 完成且末轮输出正文，**Then** UI 顺序保持为 Tool→commentary→Tool→final answer，不合并、不重排、不重复。
4. **Given** 同一模型轮次既有正文又有多个 Tool Call，**When** Tool 并行执行，**Then** 正文只解析一次为 `commentary`，Tool 行按模型声明 ordinal 稳定展示，完成先后不改变顺序。

---

### User Story 3 - 可折叠、可恢复且不污染最终内容 (Priority: P2)

作为查看长任务或刷新会话的用户，我希望过程详情可折叠、可恢复，但复制、Memory、后续建议和最终答案只使用真正的最终正文。

**Why this priority**: phase 不只影响视觉；如果 process text 进入最终内容，会造成历史污染、重复引用和错误的下一轮上下文。

**Independent Test**: 完成一个带 commentary 与 Tool 的 Run，验证运行中默认展开、最终回答提交时自动折叠一次、手动折叠保持、刷新后恢复完成态 Trace；复制和 Memory 仅包含 `final_answer`。

**Acceptance Scenarios**:

1. **Given** Trace 有可折叠详情，**When** Run 正在进行且用户未手动折叠，**Then** 默认展开并显示“正在思考”。
2. **Given** 用户在运行中手动折叠，**When** 后续 commentary 或 Tool 到达，**Then** Trace 保持折叠，不因新事件自动展开。
3. **Given** 最终回答开始或被权威识别，**When** Trace 尚未执行本轮自动折叠，**Then** 自动折叠一次；完成后用户仍可重新展开。
4. **Given** Run 完成并刷新页面，**When** 恢复本地稳定快照，**Then** public-safe commentary 与 Tool Trace 可恢复且默认折叠，`pending` 不恢复，最终正文仍只有 `final_answer`。
5. **Given** 用户复制回答、生成 follow-up 或写入 Chat Memory/UserMemory，**When** 消费 assistant 内容，**Then** commentary 与 pending 均被排除。

---

### User Story 4 - 异常停止时保持诚实边界 (Priority: P2)

作为遇到超时、取消、provider 截断或协议异常的用户，我希望系统不把不完整正文冒充最终答案，并能在预算内给出受控收口。

**Why this priority**: 直接公开模型正文后，终止原因成为最终性判断的安全边界，错误分类会把截断内容写入 Memory 或稳定快照。

**Independent Test**: 对 `length`、content filter、provider error、取消、hard deadline、空白自然结果和 final 后迟到 Tool Call 分别注入事件；任何非自然或不完整结果不得提交为正常 `final_answer`。

**Acceptance Scenarios**:

1. **Given** 模型输出部分正文后因长度、预算或状态已知的 provider error 停止且没有 Tool Call，**When** 系统仍有 finalizer 时间与模型预算，**Then** 部分正文以 interrupted process text 收口，并最多调用一次受约束 finalizer；content filter 与 unknown execution 不得进入该路径。
2. **Given** 取消或 hard deadline，**When** 已有 pending 正文，**Then** 不再调用 finalizer，不提交正常最终回答，Trace 分别显示停止或未完成状态。
3. **Given** 自然成功但正文为空白，**When** 本轮无 Tool Call，**Then** 不把空白提交为最终回答；按异常收口策略处理。
4. **Given** `final_answer` 已提交，**When** 后续出现 Tool Call，**Then** 视为协议违规并 fail closed，不执行 Tool、不改写最终回答。

### Edge Cases

- Tool-only 模型轮次不得创建空的 commentary Part。
- 模型已声明、但 provider 尚未执行即被拒绝的已知 ToolCall 必须成为一个脱敏的失败 Tool row；它与成功 Tool row 使用相同的事件顺序，但不得被 `tool-end` 或来源列表误标为完成。
- 当前请求以外的 URL grant 只能来自同一已验证会话的服务端原始 user turn；摘要、assistant、client-supplied history、Memory 或被压缩移除的原始 turn 一律不能恢复该 grant。
- “历史读取是否发生”与“本 Run 能否读取用户曾给 URL”是不同事实；后者不得反推前者。
- 零长度 delta、重复 start/end、乱序 end、未知 `partId`、同一 Part 二次 phase 解析必须被幂等处理或作为协议违规拒绝。
- Markdown 结构跨多个 delta 时必须连续累积；phase 转换不得重建 Part 或造成闪烁、跳位、重复渲染。
- Tool Call 参数流与正文 delta 交错时，正文仍立即显示为 `pending`；只有完整模型轮次结构能决定最终 phase。
- 有完整 AIMessage、无 Tool、非空正文且 Agent stream 正常闭合时，Provider 缺失 finish metadata 不阻止 `final_answer`；`length`、content filter、provider error、abort、明确未知终止或不完整消息均不得成为正常最终回答。
- 重连/回放可从任意 durable sequence 开始；相同 `partId` 的 start/delta/end 重放必须得到同一 phase、文本和顺序。
- 并行 Tool 完成乱序不得改变模型声明的 Tool ordinal，也不得把中间 commentary 绑定到任一单独 Tool。
- 只有 commentary、Tool、Skill、Resource、Prompt 或来源列表才构成 foldable details；`pending` 与 `final_answer` 不构成箭头显示条件。
- cancelled 显示“已停止思考”，failed/incomplete 显示“处理未完成”，两者都不 shimmer；失败/不完整默认展开以便看见已公开的安全上下文。
- 完成且无 foldable details 时标题行不可聚焦为 disclosure control；有详情时整行必须支持键盘操作并暴露展开状态。

## Requirements _(mandatory)_

### Functional Requirements

#### Model-turn phase semantics

- **FR-001**: General ReAct MUST 把每个模型轮次中可公开的正文作为独立、稳定身份的 Agent text part，从首个非空 delta 开始流式投影；不得等待完整轮次正文后再统一显示。
- **FR-002**: 新 Agent text part 在无法提前证明最终语义时 MUST 以 `pending` 开始；`pending` 只表示“本轮是否含 Tool Call 尚未确定”，不得被解释为 reasoning、commentary 或 final answer。
- **FR-003**: 一个模型轮次只要包含至少一个 Tool Call，其非空 public-safe 正文 MUST 在该轮结束时解析为 `commentary`；正文和 Tool Call 的到达先后不得改变该规则。
- **FR-004**: 一个模型轮次只有在“完整 AIMessage、Agent stream 正常闭合、无 Tool Call、正文非空、Run 未取消且未越过 hard deadline，并且没有明确的非自然 provider metadata”全部满足时，正文才 MUST 解析为 `final_answer`。Provider 缺失 finish metadata 不得单独阻止该 normal final。
- **FR-005**: 每个 Agent text part 在客户端 MUST 从 `pending` 最多解析一次为 `commentary` 或 `final_answer`；解析后不可回退、切换或复用到另一模型轮次。
- **FR-006**: `length`、content filter、provider/transport error、abort、timeout、明确未知终止原因和不完整消息 MUST NOT 被归类为自然成功，也 MUST NOT 直接提交 `final_answer`；content filter MUST fail closed，MUST NOT 通过 finalizer 绕过 provider safety stop。缺失 provider finish metadata 本身不属于非自然终止。
- **FR-007**: Tool-only 轮次 MUST NOT 创建空 Agent text part；空白自然结果 MUST 进入异常收口，不得伪造空最终回答。空白 natural no-Tool 轮次在满足 FR-011 gate 时 MAY 使用一次 constrained finalizer。
- **FR-008**: 一旦正常 `final_answer` 提交，普通 Agent loop MUST 立即结束；任何后续 Tool Call MUST 作为 contract violation fail closed，且不得执行。

#### ReAct loop and terminal policy

- **FR-009**: 普通成功路径 MUST 只使用一个带受控 Tool 集的 ReAct loop；不得在自然无 Tool 终局后固定追加未绑定 Tool 的 Answer 模型调用。
- **FR-010**: 不需要 Tool 的普通请求 MUST 允许由第一次模型调用直接完成；进行了 N 个含 Tool 的模型轮次后，正常终局 MUST 允许由第 N+1 次无 Tool 模型调用直接完成。
- **FR-011**: 只有非自然/预算停止或空白 natural no-Tool 结果，且 Run 未取消、hard deadline 未到、底层执行状态明确并仍保留 finalizer 时间和模型调用额度时，Runtime MAY 调用一次未绑定 Tool 的受约束 finalizer；同一 Run MUST NOT 超过一次。
- **FR-012**: 取消、hard deadline、未知底层执行状态或 finalizer 自身失败 MUST NOT 再触发模型收口；系统 MUST 以安全、确定性的终态或 fallback 结束。
- **FR-013**: finalizer 产生的正文 MUST 以无 outcome 的 Agent text start 开始并由客户端暂定为 `pending`，只有满足 FR-004 的完整正常收口条件后才能解析为 `final_answer`；其结果 MUST 标记为 `constrained` 异常收口来源。`constrained` final_answer MUST 正常显示正文，但 Trace MUST 显示“处理未完成”且默认展开；不得额外显示技术标签，正文 MUST 说明适用范围或限制，且不得伪装成普通自然完成 provenance。
- **FR-014**: Runtime MUST 统一判定完整消息、正常 stream 闭合、Tool Call 结构与 provider 已提供的 finish metadata 后再判定 outcome；明确的非自然 metadata 必须否决 normal final，缺失 metadata 不得被当作非自然停止。不得使用正文关键词或 provider 品牌特例猜测语义。

#### Public stream, ordering, and replay

- **FR-015**: General Agent 的 phase-aware 正文 MUST 使用新增、严格、可回放且向后兼容的 public stream contract；现有普通 `text-*`、专用 Agent 和历史有效 chunk MUST 保持可解析。
- **FR-016**: public Agent text contract MUST 至少携带稳定的 `partId`、`runId`、`modelTurnId`、delta 和 terminal outcome/status；start 不携带 phase，客户端在 start 与 terminal outcome 间派生 `pending`，使 reducer 能按模型轮次幂等重建状态。
- **FR-017**: 正文、Tool、Skill、Resource、Prompt 与来源 MUST 按模型/Runtime 的逻辑发生顺序投影；并行 Tool MUST 按模型声明 ordinal 稳定排序，而不是按完成时间重排。
- **FR-018**: durable stream MUST persist-before-publish，并对 Agent text delta 复用现有首 delta 立即投递、后续有界 microbatch 与背压语义；重连回放 MUST 得到相同 Part 顺序和 phase 终态。
- **FR-019**: 重复或重放的 start/delta/end MUST 幂等；相同 `partId` 的 `tool-start` 仅当 `toolName` 和已公开 input 一致时才能忽略，冲突 MUST fail closed。未知 part、非法 phase 转移、final 后 Tool、重复 terminal 或跨 Run 身份冲突 MUST fail closed。
- **FR-020**: raw reasoning、hidden chain-of-thought、internal prompt、raw provider event、raw error、secret、完整网页正文和 raw Tool input/output MUST NOT 进入 Agent text、Trace、日志、Memory 或快照。

#### UI and disclosure

- **FR-021**: `pending` MUST 从首个 delta 起使用与 final answer 相同的安全 Markdown 正文样式且不带过程图标；它本身 MUST NOT 计入 foldable details，也不得显示为“思维链”。无 foldable detail 时它显示在无箭头标题下；已有 foldable detail 时它 MUST 按 `message.parts` ordinal 作为 Trace 时间线末尾的正文行展示。
- **FR-022**: `pending` 解析为 `commentary` 时 MUST 保持相同 Part 身份、正文样式与时间位置，并与 General Agent Trace 一起折叠；解析为 `final_answer` 时 MUST 以相同 `partId` 从其运行期位置（有 detail 时为 Trace 时间线；无 detail 时为标题下正文）投影到 Trace 外的正常 Markdown 最终回答，不得复制、重排或出现样式跳变。
- **FR-023**: `commentary` MUST 只表达 public-safe 的行动/进度说明，推荐为一到两句；它属于 Run 级 Trace，不绑定到某个工具行，也不形成工具级 detail。
- **FR-024**: Tool、Skill、Resource、Prompt 行 MUST 继续使用单行确定性状态；本版 MUST NOT 增加单行 chevron、nested disclosure 或 raw detail。`web-search` 完成标题中的来源数 MUST 只从该 Tool Part 自己的安全 discovered source 去重计算，不得复用整段 Trace 的聚合数，也不得展示 raw query/input。Web 来源 MUST 继续使用独立的安全来源列表，并作为其所属 `read-url` Tool 的直属 child 紧随该 Tool 行出现，不得聚合到 Trace 末尾。
- **FR-025**: 无 foldable details 的 Run 在运行时 MUST 显示“正在思考”且无箭头，完成后 MUST 保留“已完成思考”且无箭头；标题行不可作为空 disclosure 交互。
- **FR-026**: 有 foldable details 时 MUST 使用右箭头表示收起、下箭头表示展开，整行标题为 disclosure control，并提供键盘访问、focus、`aria-expanded` 与 `aria-controls`。
- **FR-027**: active Run 默认展开；用户手动折叠/展开选择在本 Run 内 MUST sticky，新事件不得强制重开。新 pending/commentary/Tool arrival MUST 追加在既有顶层 Trace 事件之后；只有已有 owner 的 child/source 容器可例外，且 source child 必须紧随所属 Tool、早于后续顶层事件。pending 在轮次结束解析为 final 时，UI MUST 至多自动折叠一次；完成后用户仍可展开。
- **FR-028**: running 标题使用现有 shimmer；cancelled 显示“已停止思考”，failed/incomplete 显示“处理未完成”，两者 MUST NOT shimmer。失败或不完整且有详情时默认展开；`constrained` finalizer 成功虽有 final_answer，仍属于 `incomplete` Trace header，MUST 保持展开且不得因为 final answer 自动折叠。该状态 MUST 由 `agent-run-end.finalizationMode=constrained` 派生，不得由正文或 UI 时序猜测。

#### Final content, Memory, and snapshot

- **FR-029**: `final_answer` MUST 是复制、反馈、follow-up、assistant 最终正文、Chat Memory、UserMemory 与下一轮历史投影的唯一 General Agent 正文来源。
- **FR-030**: `pending` 与 `commentary` MUST NOT 进入最终正文、复制、feedback payload、follow-up generation、server Chat Memory、UserMemory 或下一轮模型历史中的 assistant answer。
- **FR-031**: 只有 completed、非空且 `normal` provenance 的 `final_answer` 才允许正常 Memory 写入；`constrained` finalizer final_answer 可被呈现、复制、feedback、follow-up 与下一轮同会话 assistant history 消费，且必须保留正文中的限制说明；Chat Memory/UserMemory 沿用 fail-closed policy。deterministic fallback、cancelled、failed 或 interrupted 内容同样不得写入 Memory。
- **FR-032**: `normal` 或 `constrained` 的 completed Run 均 MAY 进入浏览器本地稳定快照，但 `constrained` 快照 MUST 保留 `finalizationMode=constrained` 与 completed public-safe Trace 行，只排除 `pending`、interrupted/failed AgentTextPart、raw detail、取消/失败 Run 和 UI open state。恢复时 final answer 保持可见、header 仍为“处理未完成”；有剩余 foldable details 时默认收起。
- **FR-033**: 快照 schema、消息高度 fingerprint、最终正文选择与恢复逻辑 MUST 显式包含 Agent text phase，避免把 commentary 恢复成 final answer 或复用错误高度。

#### Fixed runtime budget

- **FR-034**: Run MUST 最多允许 9 个含 Tool 的模型轮次和 14 次接纳的逻辑 Tool Call；retry 不重复占逻辑 Tool Call 配额。
- **FR-035**: 普通 Agent loop MUST 最多允许 10 次逻辑模型调用；异常 finalizer MUST 最多预留 1 次，因此每个 Run 的逻辑模型调用总上限 MUST 为 11。
- **FR-036**: Run hard deadline MUST 为 270 秒，其中普通 Agent loop/action cutoff 为 235 秒、异常 finalizer 最多 30 秒、terminal durable projection 预留 5 秒；三者不得互相透支。
- **FR-037**: 单个 observation MUST 继续最多 12,000 chars，Run 累计 observation 上限 MUST 为 48,000 chars，连续无进展阈值 MUST 保持 2 个模型轮次，recursion limit MUST 为 24。
- **FR-038**: Tool 并发上限 MUST 保持 3，Run 普通 Tool retry permit MUST 保持 4，单个 retry-safe remote readonly Tool 最多 retry 2 次，Run model retry 总计最多 1 次。模型 retry 只允许在该 attempt 首次 public Agent text delta durable publish 之前发生；首次公开 delta 后的任何错误 MUST NOT 启动模型 retry，已公开正文 MUST 以 `commentary/interrupted` 收口并按异常 finalizer gate 处理。
- **FR-039**: Tool timeout MUST 保持现有 Profile：local deterministic 5 秒、calculator/datetime 1 秒、remote readonly 20 秒；实际 timeout 继续取 Profile、Tool 自身、loop cutoff 和 Run 剩余时间中的最小值。
- **FR-040**: 每进程 active General ReAct Run 上限 MUST 保持 8；server 文字 microbatch MUST 保持首 delta 立即、随后 40ms 或 256 chars 任一先到；现有 projection watermarks、browser rAF buffer 与 database pool MUST 保持不变。
- **FR-041**: 预算扩容 MUST 记录成本风险：由于历史消息与 observations 在后续模型调用中重复进入上下文，约 1.5 倍轮次上限可能令最坏情况累计输入 token 接近原预算的 2 倍；观测指标必须能按 Run 识别模型调用、Tool 调用、observation 和 finalizer 使用量。

#### Scope and compatibility

- **FR-042**: v0.6.1 MUST supersede v0.6.0 D032 的固定 Action/Answer authority；v0.6.0 的 Tool policy、Web security、retry owner、durable stream、active Run、专用 Agent 排除范围及其他未明确覆盖的决策继续有效。
- **FR-043**: stream-core schema tests、writer/durable projection tests、Runtime tests、reducer tests、UI tests、snapshot/Memory tests和 contracts/docs MUST 随 public contract 同步更新，任何一层不得保留旧的“首个普通 text 即最终回答”隐式假设。
- **FR-044**: canonical Pencil 原稿在实现阶段 MUST 更新为本规格的 pending staging、commentary row、空完成标题和 disclosure 状态；`Nested Trace Row Disclosure` MUST 标记为 Deferred，不得作为 v0.6.1 已实现状态。
- **FR-045**: 实现前 MUST 通过 contract-first 审查；该审查已完成且用户已授权实施。后续生产代码、测试代码或 Pencil 的改动 MUST 遵守本规格、contracts 与 decisions，不能擅自改变已批准语义。
- **FR-046**: v0.6.1 General Agent 的 completed `agent-run-end` MUST 携带公开 `finalizationMode=normal|constrained`。该字段必须由 strict schema、durable replay、AgentRunPart 与 snapshot 端到端保留；对不含 `agent-text-*` 的历史 General Agent chunk 保持可解析，但同一 v0.6.1 Run 若已出现 AgentTextPart 却缺少 completed finalizationMode，MUST fail closed。
- **FR-047**: 对每个已知且通过基础调用身份解析、但被 admission、allowlist/scope、schema、outbound secret/web policy、duplicate 或 URL provenance 在 provider 执行前拒绝的 General ReAct ToolCall，Runtime MUST durable publish 一个脱敏 `tool-start`，随后用相同 `partId` durable publish tool-scope `error`。该 row MUST 保持现有失败 Tool UI，既不得发布 `tool-end`，也不得含 raw input、URL/query、secret、fingerprint、内部错误或来源；provider 调用次数仍为零。
- **FR-048**: loop prompt 与 finalizer prompt MUST 共享“当前 Run 真实 observation 才能陈述 Tool 事实”的约束。无 ToolCall loop 正文 MUST 被明确告知它直接面向用户；没有当前 Run observation 时不得声称执行、读取、搜索或失败。真实 denied observation 只能说明未执行/未完成，只有真实成功 `read-url` 且有 `status=read` public source 时才可表述已读取页面。Runtime MUST NOT 用正文关键词正则改写或拦截模型回答。
- **FR-049**: `read-url` 的 user grant MUST 保持 current-user-message 自动授权，并 MAY 受限复用同一已验证 conversation 的服务端 Chat Memory 原始 user turns 中最近 8 个去重、安全 canonical URL。所有 grant 在使用前 MUST 通过既有 canonical public-web/secret policy；assistant、summary、pinned decision、UserMemory、Tool output、客户端携带的历史与已压缩丢弃的 raw turn MUST NOT 授权。URL catalog 不是历史 Tool 执行证据；用户只问先前是否读取时不得自动 read-url 或声称可验证。

### Key Entities

- **Agent Model Turn**: 一次模型调用的完整输出边界，包含有序正文 delta、零个或多个 Tool Call、完整 AIMessage、正常 stream 闭合证据、可选 provider finish metadata 与唯一 `modelTurnId`。
- **Agent Text Part**: 某个 Agent Model Turn 的 public-safe 正文投影，具有稳定 `partId`、`runId`、`modelTurnId`、phase、status 与累计 text。
- **Agent Run Completion**: `agent-run-end` 的 completed public provenance；`normal` 表示普通自然收口，`constrained` 表示异常 finalizer 收口，是 Trace header、Memory、history 与 snapshot 规则的权威输入。
- **Agent Text Phase**: `pending`、`commentary`、`final_answer`；其中 `pending` 是瞬态，后两者是已解析终态语义。
- **Trace Detail**: 可折叠的 public-safe commentary、Tool、Skill、Resource、Prompt 与来源；不包含 raw reasoning、pending 或 final answer。
- **Final Answer Projection**: 从 completed `final_answer` 生成的唯一用户回答正文，供复制、Memory、follow-up 与后续历史使用。
- **Run Budget**: 单 Run 的模型调用、Tool 轮次、逻辑 Tool Call、observation、retry、并发、loop cutoff、finalizer 与 hard deadline 的统一上限。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 在不调用 Tool 的正常问答验收集中，100% 的 Run 只进行 1 次普通 Agent loop 模型调用，首个非空正文 delta 无人为 Answer Phase 延迟。
- **SC-002**: 四个核心序列（Tool→正文、正文→Tool→正文、Tool→正文→Tool→正文、仅正文）以及并行 Tool、异常、取消、重连场景均能得到唯一、稳定、可回放的 phase 与展示顺序。
- **SC-003**: 所有含 Tool Call 的模型轮次正文 100% 归入 commentary；所有正常 final answer 100% 来自自然成功、无 Tool Call且非空的模型轮次。
- **SC-004**: raw reasoning、raw Tool input/output/error、secret 与网页全文进入 public stream、UI、Memory、snapshot 或普通日志的数量为 0。
- **SC-005**: commentary/pending 进入复制、feedback、follow-up、Chat Memory、UserMemory 或下一轮 assistant answer 投影的数量为 0。
- **SC-006**: 无详情完成态 100% 显示无箭头的“已完成思考”；有详情的运行、自动折叠、手动 sticky、取消和失败状态满足全部 disclosure 验收场景与键盘可访问要求。
- **SC-007**: 任一 Run 均无法超过 9 个含 Tool 轮次、14 次逻辑 Tool Call、10 次普通 loop 模型调用、1 次异常 finalizer、11 次总逻辑模型调用或 270 秒 hard deadline。
- **SC-008**: 新 public stream contract 对既有普通 `text-*` 与专用 Agent chunk 保持向后兼容；旧有效会话和非 General Agent 渲染无行为回归。
- **SC-009**: 实现阶段的 contract、Runtime、stream recovery、reducer、UI、snapshot/Memory 与端到端验证全部通过，且 Pencil 与文档不再宣称工具级 detail 已实现。
- **SC-010**: 所有“首个 public delta 后发生 retryable model error”的 scripted 场景均为 0 次模型 retry、0 次撤回/重复正文，并以唯一 `commentary/interrupted` terminal 收口。
- **SC-011**: 所有成功 constrained finalizer 场景均将受限正文显示为 final answer，同时 Trace 100% 显示“处理未完成”、默认展开、无技术标签，且 Chat Memory/UserMemory 写入次数为 0。
- **SC-012**: 所有 completed Agent Run 都以 `agent-run-end.finalizationMode` 重放相同 header；constrained Run 刷新后保留 final answer 与安全 completed Trace 行、排除 interrupted 内容，且 Chat Memory/UserMemory 写入次数为 0。
- **SC-013**: 所有 provider 前拒绝的已知 ToolCall 都以恰好一个脱敏失败 Tool row 可回放显示，provider 调用数为 0、无来源/raw detail；无 ToolCall Run 没有该 row。
- **SC-014**: loop/finalizer prompt 在无 observation、真实 denied observation、成功 `read-url` observation 三种场景具有一致事实边界；系统不使用正文词汇猜测或重写回答。
- **SC-015**: 当前 URL 与同会话最近 raw user URL 的 grant 都经重新安全校验；其他会话、assistant/summary/Memory/client history 与被压缩的 URL 100% 不授权，且历史执行追问不会自动补读或伪称已读。

## Assumptions

- v0.6.1 基于已发布的 v0.6.0 General ReAct Agent，保留 `createAgent(version='v2')`、受控基础 Tool 集、PostgreSQL-first resumable stream 与浏览器本地稳定快照。
- 当前 provider 均须在 adapter 层得到“完整模型轮次 + Tool Call 结构 + 正常 stream 闭合证据”；Provider 有明确的非自然 finish metadata 时必须按其 fail closed，缺失 metadata 时不得降级猜测为失败。
- 模型产出的 public text 仍需经过现有安全边界；`commentary` 表示可公开行动说明，不代表向用户开放内部 chain-of-thought。
- 当前七个基础 Tool 的单行状态、来源列表和最终回答已足以解释任务；工具级 detail 只有在未来出现副作用回执、长任务可检查性、可复用 artifact 或明确证据需求时重新评审。
- 本版预算是硬上限而非目标值；prompt 应鼓励只在有必要时调用 Tool，并保持 commentary 简短。

## Dependencies

- v0.6.0 General ReAct Runtime、Tool policy、stream recovery、General Agent Trace 与 local snapshot 已稳定可用。
- `@ai-mind/stream-core` 能以 additive chunk/type 扩展保持严格 schema 与旧消费者兼容。
- Provider adapter 能提供规范化的自然/非自然终止证据，LangChain model stream 能关联同一 `modelTurnId` 的正文与 Tool Call。
- 后续实现必须同步 `specs/v0.6.1-general-react-agent-streaming/contracts/`、Runtime/UI tests、Pencil 与长期 architecture docs。

## Risks

- pending 在轮次结束前无法证明是最终回答；暂定 phase 语义可换取零缓冲流式体验，且从首 delta 就使用正文样式；final-only 场景的“已完成思考”只能在 phase 解析后切换。
- 新 Agent text Part 会触及 stream schema、durable microbatch、reducer、UI、snapshot、copy 和 Memory；若某一消费者仍按普通 TextPart 处理，会产生内容污染。
- 扩容使极端长 Run 的累计模型输入成本非线性增长；必须保留 observation 截断、no-progress、cutoff 与观测指标。
- Provider finish metadata 可能语义不一致或缺失；必须集中规范化“正常闭合主证据 + 明确非自然 metadata 否决”并用 scripted provider contract tests 固定，而不是在 UI 或 runner 多处猜测。
- commentary 是模型生成文本，即使 public-safe 也可能冗长或重复；本版通过 prompt 与折叠控制，不引入额外摘要模型调用。
- 从公开 URL catalog 不能推导旧 Tool 是否执行成功；当前不持久化 conversation-scoped Tool proof，因此“是否曾读取”必须 fail closed，而非以 prompt 或链接复用伪造历史事实。
