# Decisions: Token-aware Memory Compaction

本文记录 v0.5.4 在代码实施前已经锁定的方案。后续若出现新结论，必须在同一 canonical workspace 中更新相关资产并明确 supersede 关系，不建立 sibling spec directory。

## D001 — 云端采用 128K 运行窗口

**Decision**: 云端普通聊天的 `effectiveWindow` 为 `min(model.contextWindowTokens, 128000)`；模型目录仍保存真实物理窗口。

**Rationale**: 128K 已覆盖当前普通聊天需求，同时为输出、工具和 Provider 差异保留可预测的资源边界。物理窗口与运行上限分离后，未来可在不伪造模型能力的前提下独立调整产品策略。

**Rejected alternatives**:

- 默认吃满 256K～1M：成本、首 token 延迟和 Provider 差异不可控。
- 全模型共用固定 128K 物理值：会覆盖真实 capability，也会高估较小模型。

## D002 — Ollama 采用 32K 运行窗口并显式设置 numCtx

**Decision**: Ollama 的 `effectiveWindow` 为 `min(model.contextWindowTokens, 32768)`，Provider 创建模型时显式传入 `numCtx=32768`；若 artifact 物理窗口更小，则使用更小值。

**Rationale**: 本地推理的 KV cache、显存和延迟约束与云端不同，32K 是当前部署可验证的 opt-in 上限。

**Rejected alternatives**:

- 依赖 Ollama 默认值：部署间行为不可预测。
- 默认 64K 或自动吃满 artifact：会显著提高本地资源风险。

## D003 — 使用统一动态预算公式

**Decision**:

```text
runtimeReserve = max(8192, ceil(effectiveWindow × 10%))
hardInputBudget = effectiveWindow - 4096 - runtimeReserve
compactionTrigger = floor(hardInputBudget × 70%)
postCompactionTarget = floor(hardInputBudget × 35%)
```

云端预算固定验证为 `111104 / 77772 / 38886`，Ollama 固定验证为 `20480 / 14336 / 7168`。

**Rejected alternatives**: 只预留输出 token、固定字符阈值和按模型手填三套阈值，均无法稳定覆盖动态 Tool/System 占用或保持跨 Provider 一致性。

## D004 — 统一 token 估算器采用 o200k_base

**Decision**: 使用 server-only `js-tiktoken/o200k_base` 估算 role、文本、结构化 payload、tool calls/results，并增加每条消息 8 tokens、每请求 3 tokens 的 framing 和最终 10% Provider 偏差安全系数。

**Rejected alternatives**:

- 继续以字符数估算完整输入：中文、JSON 和工具 schema 的误差不可接受。
- 为每个 Provider 维护独立 tokenizer：当前维护成本大于收益，且不利于统一 preflight。

## D005 — 仅按 token 触发持久化压缩

**Decision**: 删除固定 turn/message count trigger；chat memory 达到 `compactionTrigger` 才尝试持久化压缩，成功候选必须收敛到 `postCompactionTarget` 以内。

**Rejected alternative**: 保留 count trigger 作为第二触发器。它会继续造成短消息达到固定轮次后每轮压缩，与本版目标冲突。

## D006 — 压缩覆盖全部记忆并只保留完整轮次

**Decision**: 压缩输入包含旧 summary、pins 和全部 recent messages，生成上限为 3000 tokens；raw retention 从新到旧选择完整 user/assistant turn。最后一轮若单独超过 raw retention 预算，则整体进入 summary，不拆断保留。

**Rejected alternatives**: 强制保留最后一条 message、裁剪单条 message 或只压缩旧 summary，都会制造不完整语义或无法达到目标预算。

## D007 — 每请求最多一次持久化压缩

**Decision**: 一个请求最多尝试一次会写 checkpoint 的 compaction。候选必须 schema 合法、完整轮次、位于目标内且严格小于原上下文，才可原子保存。

**Rejected alternative**: 在同一请求循环压缩直到成功。该方案会造成不可控延迟、费用和状态流转。

## D008 — 压缩失败保留 checkpoint，当前请求使用 ephemeral fit

**Decision**: 生成、校验或 candidate 保存失败时，不覆盖原 summary、pins 或 `lastCompactedAt`；当前回答完成后，基于 last durable checkpoint 独立尝试 raw final-turn append。若第二次写入也失败，则保留 last durable checkpoint、记录脱敏 `raw-append-failed`，且不撤销已生成回答。当前请求使用只读、非持久化的 fit，优先 pins、summary，再从新到旧加入完整 turns。Durable `pinnedDecisions` 统一解释为 oldest-to-newest，最新项位于末尾；pins 单独超过可用 memory budget 时从数组末尾向前保留完整项，其余只在当前请求省略，不裁剪单条 pin，不修改持久状态。

**Rejected alternatives**:

- 失败即返回输入过长：重现用户截图中的连续性故障。
- 失败时破坏性截断 checkpoint：会丢失可恢复的历史事实。

## D009 — 仅非 chat memory 自身超限才拒绝

**Decision**: 先排除全部 chat memory 再检查 system instructions、Tool/Capability payload、UserMemory 和最新用户输入；只有这些内容仍超过 `hardInputBudget` 时，才返回现有输入过长错误。

## D010 — Orchestrator 统一执行完整输入 preflight

**Decision**: direct answer、tool planning/final、Composer Context 和 Capability Context 等所有注入 chat memory 的模型调用，都必须经过同一 Orchestrator preflight。

**Rejected alternatives**: 在 route、各 Provider 或每条执行路径分别裁剪，会形成阈值漂移并遗漏动态上下文。

## D011 — 模型窗口元数据保持 server-only

**Decision**: `contextWindowTokens` 属于内部 model catalog capability，不扩展 `PublicChatModel`、模型列表 API 或 hydration DTO。

## D012 — 保持现有状态协议并限制日志内容

**Decision**: 继续复用 `thread-memory-status` 和前端 reducer；成功、失败、取消及请求终止均必须结束压缩状态。日志只记录窗口、预算、before/after tokens、原因和 fallback 枚举，不记录正文、prompt、密钥或完整 Provider 配置。

## D013 — 不改变持久化字段和数据层

**Decision**: `AiMindThreadState` 仍只持久化 `messages/summary/pinnedDecisions/lastCompactedAt`；移除固定四条消息限制，但不改变字段 shape，不新增数据库 migration、业务历史表或 transcript 存储。

## D014 — release 资产延后到实现完成

**Decision**: `docs/versions`、`docs/releases`、`docs/tasklists`、README、package version 和正式 release closing 只作为 `tasks.md` 的实现后任务，本轮文档门不提前修改。

## D015 — ADR supersession 关系

**Decision**: ADR-0018 在实现完成后 supersede ADR-0012 中 count-based trigger/retention 的决策；ADR-0012 的 ThreadState 与 hydration 基线继续有效，ADR-0013 的安全 final-turn 边界完整保留。

## D016 — 取消信号贯穿压缩链路，且不降级为 fit

**Decision**: 将同一 request `AbortSignal` 从 Orchestrator 传递到 preflight、chat-memory service、compaction generator 和结构化 compaction model invocation。`AbortError` 是请求控制流：它必须向上抛出，保留已有 checkpoint，并禁止进入 ephemeral fit 或继续 answer model；若压缩状态已 started，则以 terminal failed 状态收口。

**Rejected alternatives**:

- 将 `AbortError` 视为普通 generator failure 并使用 ephemeral fit：会在用户已经取消后继续准备或发送模型请求。
- 只取消外层流而让压缩模型继续运行：会产生无效计算、可能写入不再属于活跃请求的候选，也会使状态收口不可预测。

## D017 — 持久跟随意图与 Virtuoso 单一接口（2026-09-06 修订）

**Decision**: 采用 plan 的 Persistent Scroll Intent Amendment 和 contracts/chat-scroll-policy.md。following 不因 finish/布局稳定失效；上翻/手动展开进入 reading。接受新轮次/到底按钮/用户向下回底恢复。presentationKey 跨 draft promotion；缓存只阻塞历史首屏。业务策略用单个事件驱动 rAF，list handle 通过公共 scrollTo 和缓存总高到底。外部 viewport 设置 overflow-anchor:none：Chrome 回归证实默认浏览器锚定会与 Virtuoso upward compensation 叠加，造成阅读位移。

**Button amendment (T053)**: 不再直接以 !atBottom 显示按钮。following 的临时距离由策略补齐，按钮保持隐藏；reading 离底显示。显式恢复保留已显示按钮至首次确认底部，随后继续隐藏；重新进入 reading 时立即结合已有几何同步。拒绝仅用扩大阈值、streaming 时一律隐藏或定时 debounce 遮掩闪烁。

**Rationale**: 列表级 total-height 不能证明静态尾部测量，短时稳定不能预测延迟图片。依赖 streaming 的页面清理会清空首问跟随，持久 ID key 与缓存 gate 会重挂载列表。意图、身份、测量须各有事实来源。

**Rejected alternatives**:

- terminal revision handshake、800ms 窗口或两帧后 passive：不能覆盖延迟布局。
- followOutput callback 返回 false 作为阅读锁：4.18.12 若干尺寸路径只判断 prop !== false；独立子组件变化依赖短时 trap。旧“仅新增 item”说法不准确，已删除。
- scrollToIndex/近尾 smooth：内部 listRefresh 重试可能在上翻后重新拉底，本版用 auto 公共 scrollTo。
- 缩小 viewport、额外消息级 RO、直接写 scrollTop：增加范围或重复滚动/测量所有权。

## D018 — 聊天记忆用量使用独立只读聚合与 shadcn Tooltip

**Decision**: Composer 只展示 persisted chat memory 相对于 selected model `effectiveWindowTokens` 的占比。服务端用既有 `estimateChatMemoryTokens` 和 `deriveContextBudget` 生成只含 `usedPercent`、`effectiveWindowTokens` 的 session-authorized response；不扩展 hydration DTO、stream chunk 或 public model payload。桌面工具栏在 skill-mode 右侧以无数字圆环展示，并使用官方安装的 shadcn Tooltip 呈现“聊天上下文已使用 {percentage}%（{window}）”。

**Rationale**: chat memory 是当前自动 compaction 的直接管理对象；独立最小投影既避免 client 复制 tokenizer/budget 规则，也避免发送原文、token 明细和 Provider config。Tooltip 保持视觉轻量且键盘可访问；非操作性展示不会暗示用户可在此手动压缩。

**Rejected alternatives**:

- 将数字、raw token 或 memory 内容塞入既有 hydration DTO：会扩大稳定 DTO 的敏感面并破坏 FR-023 兼容边界。
- 在浏览器估算 token 或从 `PublicChatModel` 推断窗口：会复制 server-only policy，且不能安全获得 summary/pins。
- 复用原生 `title`：项目现有点赞等控件使用的是原生提示；本需求按用户决定安装 shadcn Tooltip，以获得一致的 hover/focus 可访问行为和可测试内容。
- 展示压缩按钮或接入手动压缩：改变了本版自动 token-aware compaction 的产品边界，不在当前需求范围内。

## D019 — 流式高度估算冻结并以 Virtuoso measurement 收敛

**Decision**: 流式 assistant 的启发式 heightEstimates 在同一 message 生命周期内冻结；Virtuoso 继续执行真实 DOM measurement。streaming content render 不单独发起回底命令，following 主要由 totalListHeightChanged 进入单个 rAF 合并。完成后，最新 assistant 不再永久排除 height hint，只有稳定 fingerprint、连续两次 item size、字体 ready、非 busy 和无 disclosure 偏差时才写入。

**Rationale**: Markdown token 增量会让段落/标题/列表/代码的启发式分支跳变，和 Virtuoso 的真实测量形成双重高度来源；content effect 又可能早于最新测量发出旧 total-height 的 scroll command，造成双阶段位移。冻结 hint、保留真实测量并把滚动收敛到 measurement event 可消除这两个竞态。

**Rejected alternatives**:

- 每个 token 重算并传入新的 estimate：把初始 hint 误用成实时高度，制造可见位移。
- 关闭 Virtuoso measurement 或新增消息级 ResizeObserver/轮询：破坏虚拟列表的测量所有权并引入第二套循环。
- finish 后立即把最终高度写入 hint：字体、图片和迟到 Markdown layout 尚未稳定。

## D020 — Streamdown 渲染模式生命周期稳定

**Decision**: 同一文本 part 始终使用 mode=streaming 和同一个 animated 配置；流式结束只切换 isAnimating。不在 finish 的相邻 React 提交中切换 mode 或把 animated 改为 false。

**Rationale**: streaming/static 是不同的解析和 block-state 路径，finish 时切换会重建 Markdown 子树；未闭合语法从普通文本升级为 heading/strong 时，树重建叠加 fade-in 会被感知为字号/字重闪动。固定 mode/animated 可让 parser 和动画配置保持连续，保留动画同时减少无意义重建。

**Rejected alternatives**:

- finish 时 streaming -> static：会触发 AST/DOM 路径切换。
- animated={isStreaming ? config : false}：props/context 改变，与 mode 切换叠加。
- 删除动画作为本阶段默认修复：超出用户“暂时保留动画”的范围；若仍有视觉问题另行评估动画参数。

## D021 — Base UI Messages 与持续故障按区域归属

**Decision**: 使用 shadcn Base UI Toast 的单一全局 manager/Portal 封装顶部居中 Messages，项目链接复制等短暂操作反馈使用稳定业务 id 原位更新。保留项目现有 Radix preset 和 Button，只增加 `@base-ui/react`，不执行会覆盖现有组件的整项 registry 安装。持续会话故障放在桌面 Sidebar/移动 Sheet 的会话列表区域，只读缓存放在 Composer，hydration 失败放在消息占位，生图限额沿用对应 assistant error reply。移动会话导航位于消息 viewport 外，Virtuoso Header 默认留空。

**Rationale**: 短暂反馈需要全局可见、自动消失且不改变聊天列表几何；持续故障需要和受影响内容及恢复动作保持空间关联。Base UI 已提供 manager、Portal、a11y announcement、timeout、close、stack 和同 id update，项目无需维护第二套通知状态。导航作为 viewport 兄弟由 flex 布局自然占位，避免把非消息内容混入虚拟列表总高。

**Rejected alternatives**:

- Sonner：能力可满足，但用户最终选择 shadcn Base UI Toast；同时引入两种 Toast 实现没有收益。
- 把导航、复制反馈、会话错误和只读状态集中到 Virtuoso Header：滚动后持续故障不可见，且将非消息 UI 纳入虚拟列表几何。
- 页面自建 Message 队列、Portal 或计时器：重复 Base UI 已有能力并增加生命周期竞态。
- 同时在顶部和具体回复显示生图限额：重复反馈，且失去与失败请求的关联。

## D022 — 已有历史的新问题使用 CSS reply runway

**Decision**: 新问题 send 被接受且提交前已有稳定历史时，当前流式轮次启用 CSS reply runway。其长度为 `clamp(10rem, calc(72dvh - bottomInset - 4rem), 48rem)`，使用已有 Footer inset 抵消 Composer 高度差异，并通过上下界约束极端视口。`submitted`/`streaming` 阶段由一个仅供列表展示的 `TurnEntry` 同时承载 user 消息和 assistant loading slot；无 assistant 时 slot 显示思考态，assistant 出现后只替换 slot 内容，并在 slot 上持续使用相同的 `min-height`。内容通过 CSS intrinsic sizing 自然占用 runway，超过后才增加列表总高；完成/失败/取消后移除 runway。TurnEntry 不进入真实 `messages` 数组、hydration、disclosure 或本地高度 hint 持久化。accepted-turn 仍恢复 following 并走现有公共 `scrollToEnd`，不新增定位方法。

**Rationale**: 短时 hold 会被首个 assistant measurement 立即打断；按回复高度实时递减 Footer 会引入第二个高度账本，并且 Virtuoso 总高包含 Footer，容易形成反馈循环。让 TurnEntry 内的 slot 使用 `min-height`，浏览器直接执行 `max(content, runway)`，既保持初始留白，也让现有 measurement/follow 在边界外自然接管。首包只更新同一 item 内的 slot 内容，不插入新的 assistant item，也不会叠加 Virtuoso 默认行高；短回复在 runway 内保持外部尺寸，长回复才交给原有 measurement 增长。

**Rejected alternatives**:

- accepted-turn 后短时禁止 follow：首个回复或迟到布局会在 hold 结束时突然拉底，时长没有可靠事实来源。
- 动态 Footer reserve 按 assistant 高度递减：需要持续区分 content 与 Footer 增量，重复 Virtuoso measurement 所有权。
- sticky user message：改变长回复的阅读模型，并与虚拟 item 的挂载/卸载边界冲突。
- 固定 Footer 不递减：assistant 增长时空白仍保留，following 会持续把 user 消息向上推，不能形成自然填充。

## D023 — 正向总高测量不等待迟到 at-bottom 状态

**Decision**: Scroll Policy 以 presentation-local `lastObservedTotalListHeight` 识别 Virtuoso 已报告的实际正向总高变化。首个总高回调只建立基线；之后 following 中的增长将既有 follow rAF 标为 force，使下一帧通过公共 `scrollToEnd('auto')` 回底，即使 `atBottomStateChange` 仍保留增长前的 `true`。force 不跨越 reading、pending conversation entry、presentation 代次或空列表 guard；同帧多次变化仍合并为一个命令，下降或未变化保持原有 bottom 判断。

**Rationale**: Chrome 逐帧采样显示流式内容与 Virtuoso 总高先增长、再由迟到 at-bottom 状态触发回底；该空档让新内容先出现在输入框下方，随后产生一次明显的单向拉动。实测未发现 `scrollTop` 反向或 Virtuoso 与业务层双控制器冲突。总高是库已完成真实 measurement 的事实，使用它仅提前唤醒已有 rAF，不引入第二个高度计算或定位所有者。

**Rejected alternatives**:

- 每次 content render 直接滚动：会回到 measurement 前使用旧高度的竞态。
- 增大 `atBottomThreshold`：会改变用户阅读和回底按钮的真实底部语义。
- 动态尾部 reserve、token 高度预测或消息级 observer：需要第二套高度账本，且不能覆盖 Markdown/图片的实际尺寸。
- 启用 `followOutput` 或直接写原生 `scrollTop`：会破坏 D017 的单一业务策略与 Virtuoso 坐标边界。

## D024 — Accepted：大粒度流式 delta 按字符阈值提前 rAF flush

**Decision**: 保留 `useStreamTextBuffer` 的 40ms 合并 timer；同一 pending text/reasoning Map 累计达到 48 个 Unicode code point 后提前请求既有 rAF flush。代码围栏的结构性提前路径保持不变。

**Rationale**: DeepSeek 等模型可能在一个 40ms 窗口内返回多个大 delta。提前请求已有 rAF 能缩短这些内容等待 timer 的时间，但仍只将合并后的 pending Map 一次交给 reducer；不引入展示队列或按字符拆分。

**Boundary and follow-up**: D024 不改 `useChatScrollPolicy`、Virtuoso 配置、滚动命令数或 following/reading 语义。此前快速 Chrome fixture 曾观测到更高的 measurement 提交频率；该现象与当前待排查的像素残影不能等同。按照当前决定先保留早刷，残影及高压快速流的视觉优化单独调查和验收。
