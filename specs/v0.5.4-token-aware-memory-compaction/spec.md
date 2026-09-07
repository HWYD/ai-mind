# Feature Specification: Token-aware Memory Compaction

**Feature Branch**: `codex/v0.5.4-token-aware-memory-compaction`

**Created**: 2026-09-01

**Status**: Implementation and local verification complete; evidence and limits in acceptance.md; uncommitted worktree awaits human review

**Input**: 将聊天记忆从按固定轮次压缩改为按 token 预算压缩；云端普通聊天使用 128K 运行窗口，本地 Ollama 使用 32K；压缩完成或失败后都必须保证后续消息可继续回答，并参考主流模型与产品的长上下文实践。

## Summary

当前 chat memory 在 recent message 达到固定数量后触发压缩，压后又保留相同数量的 recent turns，导致长对话进入“每轮都压缩”的状态；同时，压缩是否成功只约束 ThreadState 的消息数量，没有约束最终发送给模型的完整输入，压后仍可能被字符级输入校验拒绝。

v0.5.4 将聊天记忆改为以模型可见 token 为单位管理，并在每次模型调用前执行统一预算预检。云端模型默认使用 128,000 tokens 的工作窗口，本地 Ollama 使用 32,768 tokens。压缩失败时保留原 checkpoint，并仅为当前请求构建不持久化的安全输入，使 chat memory 自身不能阻断下一轮回答。

## Clarifications

### Session 2026-09-01

- Q: 当 pinned decisions 单独超过当前请求可用预算时，如何选择保留项？ → A: 按新到旧保留可完整容纳的 pins；放不下的仅在当前请求省略，持久状态不变。

### Session 2026-09-06

- 确认完成后维持 following；手动展开进入 reading。保留浮层布局，followOutput=false，公共 scrollTo + 事件驱动 rAF，统一 auto。

## Goals

- 仅在聊天记忆或完整模型输入达到 token 预算时触发压缩，不再依赖固定轮次或消息数。
- 压缩后留出明确余量，避免随后一两轮短消息立即再次压缩。
- 压缩成功、失败或结果仍超限时，用户都能继续对话；只有非 chat memory 内容自身超限时才返回输入过长。
- 为所有当前云端模型和本地 Ollama 建立可审计、可测试的上下文预算。
- 保持 ThreadState、hydration DTO、stream chunk、前端 reducer、Agent/Delivery 边界和数据库 schema 向后兼容。
- 正常流式回答结束后，若用户没有主动离开尾部，保证静态尾部新增的操作区、建议区或 Composer 布局不会把最新内容推出可视区域。
- 让用户在 Composer 内以非操作性的圆环和 tooltip 了解当前聊天记忆相对于所选模型运行窗口的占用，而不暴露聊天原文、token 明细或 Provider 配置。

## Non-goals

- 不把云端默认工作窗口提高到模型物理上限 256K～1M，也不为每个请求动态吃满物理窗口。
- 不引入 ChatSession / ChatMessage 业务表、历史分页、历史搜索或跨会话 transcript retrieval。
- 不持久化 tool transcript、MCP raw result、GraphState、RuntimeArtifact、raw prompt 或 provider response。
- 不修改既有公开 API、`thread-memory-status` 协议、hydration DTO 或前端消息结构；本版独立的只读 usage endpoint 仅作为 FR-028 定义的最小 read model。
- 不在本版提供用户可配置的上下文窗口、压缩阈值或 Memory Inspector。
- 不新增手动压缩按钮、压缩入口、历史 Memory Inspector，或在圆环内显示数字。
- 不保证模型服务不可用、网络错误或非记忆输入自身超限时仍能获得模型回答。
- 不在用户主动阅读时抢回滚动；不引入消息分页、付费虚拟列表或新容器布局。完成/错误/暂停不自动取消 following。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 长对话按 token 预算压缩 (Priority: P1)

作为持续进行长对话的用户，我希望系统根据实际上下文大小决定何时压缩，而不是在达到固定轮次后每轮都压缩，从而减少等待并保留更多有效上下文。

**Why this priority**: 这是当前重复压缩问题的直接根因，也是后续连续性策略的基础。

**Independent Test**: 连续发送大量短消息，在记忆低于触发线时不压缩；跨过触发线后只压缩一次，压后记忆低于目标线，随后多轮短消息不立即再次压缩。

**Acceptance Scenarios**:

1. **Given** chat memory 仍低于当前模型触发线，**When** 用户完成新的短对话轮次，**Then** 系统保存该轮次但不启动压缩。
2. **Given** chat memory 跨过当前模型触发线，**When** 系统准备保存或使用该记忆，**Then** 系统最多执行一次持久化压缩，并把有效候选收敛到压后目标以内。
3. **Given** 一次压缩刚刚成功，**When** 用户继续发送若干短消息，**Then** 系统不会因固定消息数量再次压缩。

---

### User Story 2 - 压缩后持续可对话 (Priority: P1)

作为刚经历上下文压缩的用户，我希望下一条问题仍能获得正常回答，即使压缩模型失败或最后一轮内容很大，也不会因为旧记忆让整个请求被拒绝。

**Why this priority**: 用户截图中的核心故障是压缩后下一问无法回答；连续性与数据安全同等重要。

**Independent Test**: 分别模拟压缩成功、压缩失败、压缩结果仍超限和最后一轮超大四种情况，下一次请求都能在硬输入预算内调用模型；仅非 chat memory 内容自身超限时返回标准错误。

**Acceptance Scenarios**:

1. **Given** 持久化压缩成功，**When** 用户发送“Vue 3 的响应式系统为什么要用 Proxy？”，**Then** 请求在预算内进入模型并返回回答。
2. **Given** 压缩生成、校验或 candidate 保存失败，**When** 当前请求需要使用聊天记忆，**Then** 原 summary、pins 和 `lastCompactedAt` 不被覆盖，系统使用仅限本次请求的安全上下文继续调用模型；本轮完成后再独立尝试 raw final-turn append，第二次写入失败也不得阻断已经生成的回答。
3. **Given** 最新完整 turn 单独大于压后 raw retention 预算，**When** 系统压缩，**Then** 该 turn 作为整体进入 summary，不保留残缺 user/assistant message。
4. **Given** 系统提示、工具定义、UserMemory 和最新用户输入在完全移除 chat memory 后仍超过硬输入预算，**When** 系统预检，**Then** 返回现有输入过长错误且不伪称为记忆压缩失败。
5. **Given** 自动压缩已经启动，**When** 用户取消当前请求，**Then** 系统停止压缩模型调用并终止该请求，不写入新的 checkpoint、不构建 ephemeral fit 或继续 answer model 调用，压缩状态进入终态。

---

### User Story 3 - 不同模型使用可预测的工作窗口 (Priority: P2)

作为系统维护者，我希望云端模型统一使用安全的 128K 工作窗口、本地 Ollama 使用 32K，并能从日志判断一次请求的物理窗口、有效窗口、预算和 fallback 原因。

**Why this priority**: 统一预算可以避免 Provider 差异直接泄漏到主 Runtime，同时为后续提高默认窗口留下明确入口。

**Independent Test**: 对云端和 Ollama 的相同预算公式输入固定窗口与输出预留，得到精确预算结果，并确认日志不包含聊天正文或敏感配置。

**Acceptance Scenarios**:

1. **Given** 任一物理窗口不少于 128K 的云端模型，**When** 系统计算普通聊天预算，**Then** 有效窗口为 128,000，硬输入上限为 111,104，触发线为 77,772，压后目标为 38,886。
2. **Given** 当前 Ollama 模型可以支持至少 32K，**When** 系统计算并创建模型，**Then** 有效窗口和 `numCtx` 均为 32,768，硬输入上限为 20,480，触发线为 14,336，压后目标为 7,168。
3. **Given** 一次预算预检或压缩完成，**When** 系统记录诊断日志，**Then** 日志包含窗口、预算、token 前后值、触发原因和 fallback 类型，但不包含原始消息、prompt、API key 或 provider config。

---

### User Story 4 - 了解聊天记忆占用 (Priority: P3)

作为正在持续对话的用户，我希望在输入框工具栏中快速了解聊天记忆已经占用当前模型运行窗口的比例，从而知道长对话接近压缩边界，但无需手动操作压缩。

**Why this priority**: 该提示把已有 token-aware memory 的运行状态转成轻量、可理解的反馈，同时不改变自动压缩或发送主链。

**Independent Test**: 对同一会话分别选择云端和 Ollama 模型，读取安全的聚合用量；Composer 在工具技能右侧显示无数字圆环，hover/focus 后展示“聊天上下文已使用 xx%（128K/32K）”，且没有压缩操作。

**Acceptance Scenarios**:

1. **Given** 当前会话拥有可读取的 chat memory 且选择云端模型，**When** Composer 空闲展示，**Then** 系统只返回 memory 用量百分比和 128K effective window，圆环不显示文字。
2. **Given** 用户切换到 Ollama 模型或一轮正常流式回答完成，**When** Composer 回到空闲态，**Then** 圆环在下一次安全刷新后使用当前模型的 32K effective window 和最新 memory。
3. **Given** 会话为草稿、会话不属于当前 session，或用量读取失败，**When** Composer 渲染，**Then** 不显示圆环且不影响发送、压缩状态或既有 hydration。
4. **Given** 用户 hover 或键盘聚焦圆环，**When** Tooltip 打开，**Then** 显示“聊天上下文已使用 xx%（窗口）”，不出现压缩按钮或其它操作。

### Edge Cases

- summary、pinned decisions 和 recent messages 的组合刚好等于触发线或硬输入上限。
- Provider 的真实 tokenizer 与统一估算器存在偏差。
- 压缩候选 schema 合法但比原记忆更大，或仍高于压后目标。
- recent messages 不是完整 user/assistant pairs，或最后一轮只有 user 尚未完成。
- 动态 Tool schema、Resource/Prompt context 或 UserMemory 在同一轮显著增加。
- 压缩已经启动但请求被取消、模型抛错或 checkpointer 保存失败。
- candidate checkpoint 保存失败后，独立 raw final-turn append 再次保存成功或继续失败。
- 持久化压缩连续失败，raw checkpoint 持续增长。
- pinned decisions 单独超过 ephemeral fit 的可用 memory budget。
- 模型目录声明的物理窗口小于应用运行上限。
- Ollama 主机实际显存不足以稳定运行 32K。
- `finish` 后 `Streamdown` 静态渲染、操作按钮、追问建议或 Composer 尺寸变化导致虚拟列表总高度增长。
- 用户在完成态对齐尚未执行时滚轮上滑、触摸回拉、键盘向上导航或拖动滚动条离开尾部。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST derive an effective context window per selected model and environment instead of using one global fixed input limit.
- **FR-002**: Cloud chat MUST cap the effective context window at 128,000 tokens while preserving each model's physical context metadata.
- **FR-003**: Ollama chat MUST cap the effective context window at 32,768 tokens and MUST NOT exceed the selected model's physical context window.
- **FR-004**: System MUST reserve the configured maximum output plus `max(8,192, 10% of effective window)` before deriving the hard input budget.
- **FR-005**: System MUST set the compaction trigger to 70% and the post-compaction target to 35% of the hard input budget, using integer floor semantics.
- **FR-006**: The cloud budget MUST resolve to `111,104 / 77,772 / 38,886` for hard input, trigger, and target; Ollama MUST resolve to `20,480 / 14,336 / 7,168`.
- **FR-007**: System MUST estimate model-visible tokens for roles, text, structured payloads, tool calls, tool results and framing, with an additional 10% cross-provider safety margin.
- **FR-008**: The single-user-input character limit MUST remain an abuse/request-body guard and MUST NOT reject the fully assembled model input.
- **FR-009**: Persistent compaction MUST be triggered by estimated token usage, not by a fixed turn or message count.
- **FR-010**: A request MUST attempt persistent compaction at most once.
- **FR-011**: Compaction MUST cover the previous summary, pinned decisions and all raw recent messages, with a maximum generated compaction result of 3,000 tokens.
- **FR-012**: A persisted compaction candidate MUST be schema-valid, contain only complete retained turns, fit the post-compaction target and be strictly smaller than the original memory.
- **FR-013**: Retained raw messages MUST be selected newest-first by complete user/assistant turn without splitting a turn.
- **FR-014**: An oversized latest complete turn MUST be represented by the generated summary rather than retained as a partial raw turn.
- **FR-015**: Pinned decision promotion and `lastCompactedAt` updates MUST occur only when a valid compaction candidate is persisted.
- **FR-016**: Compaction failure MUST preserve the existing summary, pins and `lastCompactedAt`; after the current final turn completes, System MUST independently attempt to append that complete turn to the last durable checkpoint. If this raw append also fails, System MUST preserve the last durable checkpoint, MUST NOT invalidate the already produced answer, and MUST emit only a sanitized failure diagnostic.
- **FR-017**: Before every model call that injects chat memory, System MUST assemble and count the complete input, including system instructions, UserMemory, dynamic capability/tool content and latest user input.
- **FR-018**: If persistent compaction fails or the rebuilt input remains over budget, System MUST create a non-persisted request-local fit that prioritizes pins, summary and newest complete turns in that order. The durable `pinnedDecisions` array MUST be interpreted oldest-to-newest, with the newest item at the final index, including legacy states without migration; when pins alone exceed the available memory budget, System MUST traverse that array in reverse, retain the newest complete pins that fit and omit the rest for that request only.
- **FR-019**: Request-local fitting MUST NOT delete or overwrite persisted ThreadState.
- **FR-020**: System MUST return the existing input-length error only when non-chat-memory content remains above the hard input budget after chat memory is excluded.
- **FR-021**: Direct answer, tool planning/final, Composer Context and Capability Context paths MUST use the same preflight budget policy when they inject chat memory.
- **FR-022**: Tasklist and Delivery MUST continue to persist only safe final visible text and MUST NOT add GraphState, RuntimeArtifact, tool transcript or raw results to chat memory.
- **FR-023**: The persisted ThreadState field shape, hydration DTO, public API, `thread-memory-status` chunk and frontend reducer contract MUST remain backward-compatible.
- **FR-024**: Compaction status MUST terminate on success, failure, cancellation and request-finalization paths so the UI cannot remain stuck in a compressing state.
- **FR-025**: Diagnostics MUST record model physical/effective windows, hard input, trigger, target, before/after token counts, reason and fallback type without recording raw content or secrets.
- **FR-026**: Request cancellation MUST propagate through context preflight, persistent compaction and the compaction model invocation. `AbortError` MUST bypass ephemeral fit, preserve ThreadState and reach the Orchestrator so the request terminates normally with a terminal compaction status.
- **FR-027**: 虚拟聊天 MUST 持久保存 following/reading 意图，遵循 contracts/chat-scroll-policy.md。首问/续问接受后恢复跟随；已有历史上的新问题 send MUST 在 following 不变的前提下，以仅存于当前流式轮次的 CSS reply runway 将新 user 消息初始定位到 Composer 上方。该轮在展示层保持一个稳定的 `TurnEntry`，由同一个 Virtuoso item 同时承载 user 消息和 assistant loading slot；submitted 阶段 slot 显示思考态，assistant 出现后只替换 slot 内容，并在 slot 上使用相同 `min-height`，内容自然填充且不得按 token 实时测高。该 runway 不用于首问、regenerate 或 resume，完成/失败/取消后移除。内容触及 runway 边界后沿用既有 measurement follow；following 中已建立基线的 Virtuoso 总高实际增加时，MUST 在既有单个 rAF 内安排一次 auto 回底，即使 `atBottomStateChange` 尚未反映该次增长；该强制不得跨过 reading、pending entry 或展示代次边界。流式 text/reasoning 继续保持 40ms 合并窗口；同一 pending Map 累计达到 48 个 Unicode code point 或出现既有代码围栏结构变化时，MUST 提前请求既有下一 rAF flush。该 rAF 仍只完整提交已合并的 pending 内容，不成为独立回底命令来源。完成后建议/图片/Markdown 和 Composer 增高仍跟随。真实上翻/手动展开 MUST 停止；用户向下回底/按钮恢复。promotion 保持展示身份和意图，切换隔离旧回调，缓存刷新不得卸载活跃列表。只通过 Virtuoso 公共接口滚动，禁止终态时窗、自旋、重复 Footer offset。
- **FR-028**: System MUST provide a session-authorized, read-only chat-memory usage summary for a selected conversation and allowed chat model. The response MUST contain only the non-negative percentage and that model's effective window; it MUST NOT extend `GET /api/chat/thread`, hydration DTOs, stream chunks, public model payloads, raw memory, token-category details or Provider configuration.
- **FR-029**: The usage numerator MUST be the existing conservative token estimate of persisted chat memory only (summary, pinned decisions and complete raw messages). Its denominator MUST be the same selected-model `effectiveWindowTokens` derived by the Context Budget policy, including the 128K cloud and 32K Ollama operational caps.
- **FR-030**: On desktop Composer toolbar, the client MUST render the usage summary immediately after the skill-mode control as a non-operational circular indicator with no visible number. Hover and keyboard focus MUST use the installed shadcn Tooltip to show `聊天上下文已使用 {percentage}%（{window}）`; the indicator MUST not offer compression or any other action.
- **FR-031**: The client MUST refresh the usage summary for the selected non-draft conversation when the selected model changes and after a normal stream completion returns to idle. It MUST retain no error UI and hide the indicator when the summary cannot be safely fetched; it MUST NOT fetch while a response is streaming.
- **FR-032**: 全局短暂操作反馈 MUST 使用 shadcn Base UI Toast 的单一 Messages 宿主，顶部居中且不参与消息列表几何。持续故障 MUST 位于对应内容/操作区域：会话列表内、消息加载占位、Composer 或具体回复；保留恢复入口，不集中到页面顶部或 Virtuoso Header。移动导航 MUST 位于消息滚动容器外；不迁移现有 Radix preset，不改 wire/API。

### Key Entities

- **Model Context Capability**: A server-owned declaration of the selected model's physical context window and environment.
- **Context Budget**: The effective window, output reserve, runtime reserve, hard input budget, compaction trigger and post-compaction target derived for one request.
- **Token Estimate**: A conservative count for a complete model-visible payload and its major categories.
- **Chat Thread Memory**: Existing text-only `messages`, `summary`, oldest-to-newest `pinnedDecisions` and optional `lastCompactedAt` for one conversation.
- **Compaction Candidate**: A validated replacement summary/pins plus newest complete raw turns that may atomically replace the previous checkpoint.
- **Ephemeral Fit**: A request-local model input projection that is never persisted.
- **Chat Memory Usage Summary**: A session-authorized, read-only client projection containing only `usedPercent` and `effectiveWindowTokens` for a selected conversation/model pair.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: One hundred percent of short-turn scenarios below the token trigger complete without starting compaction, independent of raw message count.
- **SC-002**: Every successful compaction fixture produces memory at or below the configured post-compaction target and smaller than its source.
- **SC-003**: In success, generator failure, invalid candidate and save failure scenarios, the next eligible chat request reaches the model whenever non-chat-memory content fits the hard input budget.
- **SC-004**: No accepted persisted or ephemeral context contains an incomplete user/assistant turn.
- **SC-005**: The exact cloud and Ollama budget fixtures produce the six documented budget values with deterministic integer rounding.
- **SC-006**: Existing hydration, safe final-turn memory, stream status and frontend consumption contract tests continue to pass without a migration or public schema change.
- **SC-007**: Diagnostic tests find zero raw message texts, prompt contents, API keys, cookie values or provider configuration values in budget/compaction logs.
- **SC-008**: The documented post-compaction Vue Proxy scenario returns a normal assistant answer instead of an input-length error caused by prior chat memory.
- **SC-009**: Every cancellation fixture forwards the original request signal to the compaction model, preserves the checkpoint, skips ephemeral fitting and terminates the request without an answer-model invocation.
- **SC-010**: 自动化覆盖首问、升格、续问、延迟布局、上翻/展开、回底/按钮、拒绝发送、切换和卸载。真实 Page 与 Chrome/Virtuoso 验证首问/续问及 promotion 实例连续性、历史进入、建议/图片、Composer/宽度、手动展开与键盘回底。following 静止后尾部距有效底部不超过 4px；reading 后续增高不发拉底命令；旧展示代次不能影响当前列表。证据记录 acceptance.md。

    流式测量过程验收：首次总高观测仅建立基线；同一展示代次 following 中的正向总高变化在下一 animation frame 发出一次 `auto` 回底，不等待迟到的 `atBottom=false`。同帧多次变化仍至多一次命令；reading、pending entry、旧展示代次和总高未增加不得被该路径强制拉底。

    流式缓冲过程验收：text/reasoning delta 保持 40ms timer 合并；pending Map 累计达到 48 个 Unicode code point 或已有代码围栏结构性变化时，可以提前请求下一 rAF flush。内容 render 不成为独立回底命令来源。

    按钮过程验收：following 全程不得因增量短暂离底而反复显示；reading 离底时可以点击；显式恢复至首次真实 bottom 后，后续流式及完成后的布局变化保持隐藏。不能仅采样输出结束后的按钮状态。

    续问初始定位验收：已有历史的新问题进入 submitted 后，TurnEntry 同时包含 user 消息和 assistant loading slot；在 1024x760 Chrome 基准视口中，TurnEntry 顶部应位于 viewport 高度的 15%–40%。assistant 首次出现时必须复用 submitted 期的 TurnEntry item/key，只替换 slot 内容并保持 runway 的 `min-height` 无可见跳变；逐帧采样 user item 的交接偏移不得超过 4px。短回复在 runway 内增长不得增加列表总高或触发额外定位接口；超过 runway 后继续使用既有 total-height follow。首问、regenerate、resume 和 ready 状态均无 runway 或 slot。

- **SC-011**: Route fixtures for cloud and Ollama return only the expected numeric usage summary for the current session and selected model; Composer fixtures show an accessible Tooltip with the exact context wording, no visible percentage text, and no compression action.
- **SC-012**: 通知验证 Portal、同 id 去重更新、关闭/超时、长文案与窄屏居中、Radix Sheet 共存；持续故障及重试位于对应区域。18 项既有 Chrome 滚动场景继续通过，通知出现/消失不改变列表 scrollHeight 或阅读位置，移动导航在历史滚动后仍可见。

## Assumptions

- Current `chatMaxOutputTokens` remains 4,096 for this version.
- Cloud models with smaller physical windows are clamped below 128K; the application does not claim capacity the model does not advertise.
- Current Ollama deployment deliberately uses 32K even when an artifact or host could support more, accepting the associated VRAM and latency cost.
- A conservative shared tokenizer estimate plus 10% margin is sufficient for routing; provider-reported usage may be observed but is not the preflight source of truth.
- Browser-local full history and Virtuoso remain. UI behavior uses persistent following/reading intent, stable presentation identity and a single public scroll interface; no completion-qualified scrolling phase remains.
- During a prolonged compaction outage, preserving checkpoint data is preferred over destructive truncation, so persisted raw memory may temporarily grow.
- Model/provider outages and oversized non-memory inputs remain ordinary failure cases outside the continuity guarantee.
