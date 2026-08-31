# Feature Specification: Long Message Virtualization

**Feature Branch**: `codex/v0.5.3-message-virtualization`

**Created**: 2026-08-27

**Status**: Implementation and product-owner browser acceptance passed; D027 keeps CLS, DOM count, fixed iterations and 4x CPU as non-blocking diagnostics. Release actions still require explicit authorization.

**Input**: User description: "优化长消息列表，减少同时存在的消息节点数量，正确处理动态消息高度，并确保底层滚动与业务滚动策略只有一个控制边界。"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 稳定浏览超长会话 (Priority: P1)

用户打开包含大量且高度差异明显的历史消息时，应直接看到该会话的最新内容；快速上下浏览过程中，消息区保持连续、可读且响应及时，不因完整历史同时参与页面布局而明显卡顿。

**Why this priority**: 超长会话是本版本要解决的核心性能问题。若历史进入、快速滚动或内容连续性不稳定，其余滚动策略都没有可靠基础。

**Independent Test**: 准备一组包含 1,000 条文本、Markdown、代码、图片、工具结果和可展开卡片的历史消息，进入会话并反复快速滚动，可独立验证首帧位置、内容连续性、节点上限和交互响应。

**Acceptance Scenarios**:

1. **Given** 一个包含 1,000 条混合高度消息的历史会话，**When** 用户进入该会话，**Then** 首次可见内容位于真实末尾，且不会先显示顶部再跳到底部。
2. **Given** 用户正在浏览该长会话，**When** 用户连续快速向上、向下滚动并跨越大段历史，**Then** 可见消息连续，无空白断层、重叠、明显位置跳变或不可恢复的滚动停顿。
3. **Given** 一个非空会话已经稳定显示，**When** 用户停在任意位置，**Then** 同时参与页面呈现的消息根节点数量保持在约定上限内，而完整消息仍保留在当前会话数据中并可继续浏览。

---

### User Story 2 - 流式输出与动态高度遵守阅读意图 (Priority: P2)

用户停留在消息末尾时，新回复的流式内容以及稍后加载或展开导致的高度变化应持续跟随最新内容；用户主动上滑阅读历史后，本轮输出不得把视口抢回底部，直到用户明确返回底部或开始新一轮请求。

**Why this priority**: AI 消息会在同一条记录中持续增高，图片、Markdown、工具卡片和 Composer 也会在稍后改变布局。性能优化不能破坏已经建立的阅读意图规则。

**Independent Test**: 在一轮包含持续 Markdown 增长、延迟图片和可展开卡片的回复中分别测试“保持底部”“主动上滑”“点击回到底部”和“下一轮请求”，即可独立验证跟随策略。

**Acceptance Scenarios**:

1. **Given** 用户位于真实末尾且未暂停跟随，**When** 当前消息持续流式增长或内容稍后增高，**Then** 视口持续显示最新内容。
2. **Given** 当前回复正在流式输出，**When** 用户通过滚轮、触摸、键盘或滚动条主动向上浏览，**Then** 本轮自动跟随立即暂停，后续内容增长不改变其阅读位置。
3. **Given** 自动跟随已经暂停，**When** 用户点击“回到底部”，**Then** 视口到达最新内容并恢复本轮跟随。
4. **Given** 上一轮跟随因用户阅读而暂停，**When** 用户发送、重新生成或恢复下一轮请求，**Then** 新一轮重新启用底部跟随。
5. **Given** Composer 高度发生变化，**When** 用户仍在末尾，**Then** 最新消息继续完整可见；**When** 用户正在上方阅读，**Then** 其阅读位置不被改变。

---

### User Story 3 - 离屏往返保持重要消息状态 (Priority: P3)

用户展开一条消息中的推理、Agent 轨迹、工作流或调试详情后，即使该消息滚出可见区再返回，具有阅读意义的展开状态仍应保持；复制提示和悬停等短暂反馈可以重置。

**Why this priority**: 长列表优化会让离屏消息退出页面结构。若重要阅读状态随之丢失，用户将无法可靠地对照长链路结果。

**Independent Test**: 展开不同类型的持久展示区，滚动到足够远使其离屏后再返回，可独立验证状态保持；同时确认复制、悬停等短暂状态无需恢复。

**Acceptance Scenarios**:

1. **Given** 用户已展开推理、Agent 主详情或调试详情、工作流详情或原生详情区，**When** 该消息离屏后再次进入可见区，**Then** 对应展开状态保持不变。
2. **Given** 用户触发了复制成功或悬停反馈，**When** 对应消息离屏后返回，**Then** 该短暂反馈允许恢复为默认状态，且不影响内容与操作。
3. **Given** 用户切换到另一会话或消息被删除，**When** 原会话展示状态不再适用，**Then** 失效状态不会污染新会话或其他消息。

### Edge Cases

- 空会话仍显示现有建议区，不需要创建长列表滚动状态。
- 只有一条但持续增长的流式消息，仍遵守底部跟随与用户上滑暂停规则。
- 图片缺少预先尺寸、代码块高亮完成、字体替换、工具结果到达或详情展开导致消息高度在首次显示后变化时，列表必须重新稳定布局。
- 用户从末尾一次跳到很远的历史位置，再手动返回末尾时，不应执行会持续很久的跨大距离动画。
- 快速 A→B 会话切换时，A 的待处理定位、跟随或展开状态不得作用于 B。
- 历史会话在隐藏定位期间发生 Composer 高度或滚动条宽度变化时，必须等待最终可见布局稳定后再揭示。
- 移动端触摸滚动、桌面滚轮、键盘 PageUp/PageDown/Home/End/Space 以及原生滚动条拖动均需要保持一致的用户意图语义。
- 离屏消息不参与浏览器原生全文查找和可访问树是本版本接受的虚拟列表约束；当前可见消息及滚动区域仍必须可操作且有明确语义。
- 浏览器本地快照只是 hydration cache；常规稳定写入仍会裁剪为最近 120 条。为保证本机复现，先创建标题为“1000条测试数据”的正常会话使其进入服务端 registry，再只替换该会话的本地 completed snapshot；seed 后不得继续在该会话发送、生图、Agent 执行或恢复 pending HITL。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-531**: 系统 MUST 对所有非空消息列表采用统一的可视区呈现方式，不按消息数量切换两套滚动实现。
- **FR-532**: 系统 MUST 保留当前会话的完整消息数据，同时只让可见区及其有限缓冲范围内的消息根节点参与页面呈现。
- **FR-533**: 对 1,000 条混合高度消息，稳定状态下同时挂载的消息根节点 MUST 不超过 50 个。
- **FR-534**: 每条消息 MUST 使用在增删、流式更新和离屏往返期间稳定的身份，避免错误复用另一条消息的内容或状态。
- **FR-535**: 系统 MUST 支持首次显示后发生的消息高度变化，并在变化后保持内容顺序、间距和当前阅读锚点正确。
- **FR-536**: 历史会话首次揭示 MUST 直接位于真实末尾，不得出现可见的顶部到末尾跳转，也不得先揭示旧会话内容。
- **FR-537**: 消息区 MUST 只有一个底层滚动执行者；业务层仅决定何时跟随、暂停、恢复、定位或显示“回到底部”入口。
- **FR-538**: 消息定位 MUST 只作用于专用消息视口，不得滚动文档窗口或引入第二套并行的消息定位逻辑。
- **FR-539**: 当用户位于末尾且未暂停跟随时，流式内容、延迟内容布局和 Composer 高度变化 MUST 保持最新内容可见。
- **FR-540**: 用户在流式输出期间主动向上浏览后，系统 MUST 锁定本轮自动跟随，并保持其阅读位置不受后续内容增长影响。
- **FR-541**: 用户明确点击“回到底部”时，系统 MUST 到达最新内容、隐藏该入口并恢复跟随。
- **FR-542**: 新一轮发送、重新生成或恢复执行开始时，系统 MUST 清除上一轮的阅读锁定并恢复默认跟随。
- **FR-543**: “回到底部”入口 MUST 继续以距末尾 120px 的现有产品阈值呈现一致行为。
- **FR-544**: 长距离返回末尾 MUST 避免持续时间不可控的长动画；短距离用户触发返回可以保留平滑反馈。
- **FR-545**: Composer 的真实高度与额外 54px 安全区 MUST 继续保证最后一条消息不被浮层遮挡。
- **FR-546**: 桌面与移动端 MUST 保持 v0.5.2 已建立的全高消息视口、稳定原生滚动条沟槽、Composer 与消息列对齐及底部手势穿透行为。
- **FR-547**: 推理、Agent 主详情与调试详情、工作流详情、资源/原始内容详情等具有阅读意义的展开状态 MUST 在同一会话的离屏往返中保持。
- **FR-548**: 展开状态 MUST 以会话与稳定内容身份隔离，并在消息删除或会话替换后清理失效记录。
- **FR-549**: 复制成功、悬停、短时加载提示等瞬态展示状态 MAY 在离屏往返后重置。
- **FR-550**: 空会话、消息操作、推荐问题、错误与只读提示、会话切换及流式协议现有行为 MUST 保持兼容。
- **FR-551**: 系统 MUST 对消息预处理保持线性复杂度，不能随消息数量增长而对历史前缀执行重复扫描。
- **FR-552**: 本版本的验证 MUST 同时覆盖自动化回归、1,000 条混合消息性能场景、动态高度场景、桌面与移动端真实滚动行为。
- **FR-553**: 历史首次定位在 Virtuoso 尚未就绪、首次到底命令未生效或动态测量使 readiness 回退时 MUST 通过同一 Virtuoso handle 重试；bottom、range、height、scrolling 与 Item mount/unmount observation MUST 绑定当前 `conversationId + sequence`，旧 generation 不得推进或移动新会话；reveal readiness MUST 同时包含 bottom、tail range、最后消息 Item 的当前 DOM commit、非 scrolling，并在连续两个 animation frame 保持稳定，不得因一次性命令丢失、范围状态早于 DOM commit、末项再次卸载或动态高度变化而让历史容器永久隐藏或提前显示空白。
- **FR-554**: 项目 MUST 提供仅供本地验收使用的 IndexedDB seed/cleanup 工具：Chrome DevTools Snippet 是完整的 donor preflight、fixture image cache、backup/cleanup 通用路径；开发服务器另提供不进入 production runtime 的 `/dev/message-virtualization` 一次性准备页，便于无法打开 DevTools Console 时向当前选中的 server-backed 测试会话写入确定性的 1,000 条混合 fixture，或以 `target=real` 准备最长真实会话。该页面不得挂载聊天 runtime provider、调用 API、成为产品入口或暴露给 production 用户。
- **FR-555**: 已完成的 static reader MUST 在用户向上阅读时保持阅读锚点；离屏 item 首次挂载、图片 cache loading→ready/error/expired、宽度重排或 Virtuoso 重测不得把视口向更新消息方向反向推回。图片结果卡的所有资源状态必须预留等比例图片区和等高 Footer；列表 MUST 为每项提供仅由现有消息结构和消息列宽导出的初始高度估算，文本估算必须区分 prose、heading、list、fenced code 与 Markdown table，卡片估算必须包含稳定 chrome；真实测量仍由 Virtuoso 接管。
- **FR-556**: 非空消息列表 MUST 等待唯一 `chat-message-viewport` 的 HTMLElement 已提交后才首次挂载 Virtuoso；该视口 MUST 使用 CSS `scrollbar-gutter: stable both-edges`，Composer 与消息列 MUST 处于同一外层坐标轴，不得以 hydration 后的 JS scrollbar-width state、`requestAnimationFrame` 或 `ResizeObserver` 修正水平位置。
- **FR-557**: 历史会话从 hydration 到首次尾部定位完成期间，消息视口 MUST 显示非滚动骨架；若存在 D025 高度提示读取，Virtuoso 只可延迟到当前 conversation + width generation 的本地读取完成，随后从 initial size tree 建立到 reveal 必须保持挂载和可编程滚动。该期间不得显示会随总高度变化而形变的原生 scrollbar；骨架 MUST 作为该视口的非滚动布局同级层显示，并在历史 reveal 完成后一次性移除。
- **FR-558**: Composer 的底部渐变遮罩 MUST 限制在聊天内容列及其必要水平留白内，不能覆盖 `chat-message-viewport` 右侧的原生 scrollbar gutter；用户停在会话末尾时仍必须看见并可拖拽 scrollbar thumb。
- **FR-559**: 切换会话的 hydration、history-entry positioning 或 hydration failure 期间，页面 MUST 不显示上一会话遗留的“回到底部”入口；该入口仅能在当前会话真实历史已揭示后，再由现有 Scroll Policy 的 `showScrollToBottom` 决定显示与可用性。
- **FR-560**: history bootstrap 的非滚动骨架层 MUST 与当前 `chat-message-viewport` 使用相同的 desktop conversation-sidebar 左侧边界和内容列坐标；不得按整页宽度居中而偏离消息区或 Composer，移动端保持无 sidebar 的全宽布局。
- **FR-561**: Instant Mind 的全高独立消息视口 MUST 占满浏览器可用宽度；该页不得同时保留根文档 `scrollbar-gutter` 和消息视口 scrollbar gutter 而在最右侧产生冗余空槽。消息视口自身继续负责其 native scrollbar 的稳定几何。
- **FR-562**: v0.5.3 的真实浏览器回归 MUST 同时使用两套本地数据：标题为“1000条测试数据”的 1,000 条混合 fixture 用于压力与边界覆盖；排除该 fixture 后、本地有效 snapshot 中消息数最多的真实会话用于真实内容结构回归。开发环境可仅在 IndexedDB 的 index/snapshot 中将后者标记为“最长真实会话”，不得上传、输出或持久化其消息正文，也不得写入服务端标题。
- **FR-563**: `heightEstimates` MUST 与当前 `ChatMessageItem` 的实际展示条件一致：关闭 reasoning 时不得预估 reasoning，高度仅在 delivery-chain 或 image generation 呈现 workflow 时才计入 workflow；对 CJK 全角 prose MUST 使用比半角 ASCII 更宽的换行单位。该估算不得改变 Scroll Policy、Virtuoso buffer、physical scroll owner 或真实 measurement 的最终裁决权。
- **FR-564**: 系统 MUST 将已完成消息的稳定实测高度作为可丢弃的本地性能提示，保存到独立的 IndexedDB `message-height-hints` object store；该提示不得进入 `MindMessage`、conversation snapshot、API、服务端数据库或跨设备同步。
- **FR-565**: 高度提示命中 MUST 同时校验 conversation/message identity、render fingerprint、精确消息列宽、geometry version、reasoning 展示条件和默认 disclosure presentation。任一条件不匹配、读取失败或缓存缺失时 MUST 回退到现有结构化 `estimateMessageHeight`，不能阻断会话显示。
- **FR-566**: 高度提示 MUST 只消费 Virtuoso `itemsRendered` 已报告的 item size，并在非 scrolling、非 streaming、字体就绪、默认 disclosure 且同一尺寸稳定后批量写入；不得新增消息内容 `ResizeObserver`、逐 token 写 IndexedDB、同步读取消息 item 几何或手工滚动位置修正。既有 scroll parent 宽度测量只用于 layout key，不属于第二个 item measurement owner。
- **FR-567**: 暖缓存只能替换匹配项的初始 `heightEstimates`，真实 DOM measurement 仍为最终事实；系统 MUST NOT 持久化或恢复 Virtuoso `scrollTop` / 完整 `StateSnapshot`，也不得改变历史进入尾部、Scroll Policy、`followOutput={false}` 或物理滚动所有权。
- **FR-568**: 第一版高度提示只覆盖 completed、稳定历史态、默认 disclosure 的消息；当前 streaming item、仍可能出现 follow-up/action 的最新 assistant、非默认展开态和不稳定异步几何 MUST 跳过。缓存 MUST 随会话删除清理，并对每个会话限制布局变体数量，quota/unavailable 只能静默降级。
- **FR-569**: 高度提示上线前 MUST 对 1,000 条 fixture 与“最长真实会话”执行同环境冷缓存/暖缓存 A/B，确认缓存命中不会破坏列表正确性、阅读锚点或既有滚动所有权。CLS、最大单项高度修正、总高度变化、命中率、写入次数和 DOM 峰值属于可选诊断证据，不作为本版本 release closing 的数值门槛。

### Key Entities

- **Conversation Presentation**: 当前会话完整消息序列及其展示生命周期；负责隔离会话切换前后的可见内容和局部状态。
- **Message Identity**: 一条消息在流式更新、增删和离屏往返中的稳定身份，用于保证内容与展示状态不串位。
- **Scroll Policy State**: 用户是否位于末尾、当前轮是否暂停跟随、是否需要显示返回入口，以及历史首次定位是否完成。
- **Disclosure State**: 与会话、消息及具体内容区关联的持久展开/收起选择；不包含复制、悬停等瞬态反馈。
- **Message Height Hint**: 由 Virtuoso 已测 item size 产生、按会话和布局签名隔离、可随时失效或删除的本地性能提示；不属于消息业务事实。

### Non-goals

- 不在 v0.5.3 引入会话消息 cursor pagination、服务端窗口化、尾部优先查询或消息数据淘汰。
- 不修改服务端数据库 schema、API、流式协议、Provider Runtime、Agent Runtime 或 Electron host；只允许为本地性能提示升级现有 IndexedDB 并新增独立 object store。
- 不保存跨刷新阅读位置、未读游标或跨设备同步的展开偏好。
- 不保证离屏消息可被浏览器原生全文查找或同时出现在可访问树中。
- 不同时维护“短列表完整渲染”和“长列表可视区渲染”两套非空消息实现。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-531**: 含 1,000 条混合高度消息的会话稳定后，同时挂载的消息根节点不超过 50 个。
- **SC-532**: 在桌面和移动端对 1,000 条混合消息执行至少 20 次快速跨段滚动，观察不到空白断层、消息重叠、错误复用或不可恢复的位置跳变。
- **SC-533**: 历史会话在正常速度下的首次可见帧直接显示最新内容，不出现“顶部 → 底部”或旧会话残留；4 倍 CPU 降速作为后续性能观察，不阻塞本版本收口。
- **SC-534**: 流式文本、延迟图片、代码块、工具结果及详情展开至少五类高度变化场景全部通过“末尾跟随、上滑不抢夺、手动恢复”验收。
- **SC-535**: 推理、Agent、工作流和原生详情四类重要展开状态经过至少两次离屏往返后保持一致，且不会串到其他消息或会话。
- **SC-536**: v0.5.2 的全高视口、Composer 安全区与列对齐、稳定滚动条沟槽、空会话及现有消息操作回归全部通过。
- **SC-537**: 现有稳定测试集保持通过，并新增覆盖底层滚动单一所有权、动态高度、用户阅读锁定和历史首次定位的自动化证据。
- **SC-538**: IndexedDB seed 在 donor 完整时替换当前 server-backed test conversation 的本地 snapshot，生成精确 1,000 条唯一身份消息和一个专属图片缓存；donor 不完整时零写入退出，cleanup 能恢复原 selection/index/snapshot 并只删除 fixture image cache。
- **SC-539**: 在桌面和 324×534 视口的 completed 1,000 条会话中，用户手动确认从尾部和混合卡片区轻微向上阅读时无向更新消息方向的自动回跳，并覆盖图片缓存命中、详情展开、刷新后首次进入和滚动条拖拽。次数和时序采样可作为诊断记录，不是 release closing 的数值门槛。
- **SC-540**: 在桌面有原生滚动条的环境连续刷新 10 次后，消息列与 Composer 列的左右边缘保持对齐；服务端初始 HTML、hydration 和下一 animation frame 后均不得出现水平偏移。
- **SC-541**: 在 1,000 条会话刷新与历史首次定位时，用户只会先看到非滚动的加载骨架，随后看到最终 Virtuoso 滚动条；不得出现可见滚动条从长条骤变短条，或因骨架随内容滚离而出现白屏。4x CPU slowdown 观察不阻塞本版本收口。
- **SC-542**: 在桌面长会话的顶部、中段和末尾，Composer 显示时 scrollbar thumb 均保持可见；不得只在 thumb 离开 Composer 高度后才出现。
- **SC-543**: 连续切换任意两个历史会话时，从 skeleton 开始到当前会话 reveal 前均不得出现“回到底部”按钮；reveal 后该按钮仍保持既有 120px 阈值语义。
- **SC-544**: 展开与折叠会话侧栏后进入历史会话时，桌面骨架、消息内容列和 Composer 内容列的水平中心一致；在 `324×534` 视口中骨架不引入额外左侧空白。
- **SC-545**: 在桌面有 native scrollbar 的 Instant Mind 页面，`main` 与 `chat-message-viewport` 的 right edge 均等于窗口可用宽度；消息 scrollbar 不得因根文档预留 gutter 而距离最右边额外 15px。
- **SC-546**: v0.5.3 真实 Chrome 回归覆盖 1,000 条 fixture 与“最长真实会话”，并只记录聚合结构和几何观察，不包含原消息正文。DOM 上限、次数、part 分布等数值可用于后续调优，不作为 release closing 门槛。
- **SC-547**: 在已预热的同宽度测试路径中，高度提示仅在 conversation/message identity、width、geometry version、render fingerprint 与 presentation 全部匹配时使用；任一不匹配必须自动回退结构化估算。命中率是诊断指标，不设本版本 release closing 阈值。
- **SC-548**: 冷/暖缓存对照不得引入位置恢复、第二个滚动 owner、手工 `scrollTop` 或新的 message `ResizeObserver`。CLS 对照用于评估优化空间，不设本版本 release closing 阈值。
- **SC-549**: 流式输出期间高度提示 IndexedDB 写入次数为 0；completed message 成为 eligible history/default presentation 并满足稳定门槛后，每个 idle batch 最多执行一次写事务。缓存不可用、quota 或记录失效时普通问答、滚动和历史进入不退化。
- **SC-550**: 暖缓存 A/B 后仍保持同时挂载消息根节点不超过 50、静态 reader 无业务 follow command、无 `scrollTop` 写入、无新增消息内容 `ResizeObserver`，移动宽度不得误用桌面提示。

## Assumptions

- v0.5.3 继续以当前客户端已加载的完整消息数组作为会话数据来源，1,000 条消息用于本版性能与稳定性验收。
- 所有非空会话统一采用新的消息呈现路径；空会话建议区继续走现有非列表路径。
- 120px 返回入口阈值、54px Composer 额外安全区以及 v0.5.2 的首次历史揭示语义继续有效。
- 用户已明确选择优先稳定交付，并接受免费开源依赖的能力边界；具体依赖与适配方案在 implementation plan 中记录。
- 重要展开状态只要求在当前页面会话生命周期内保持，不写入服务端或长期本地存储。
- 高度提示只作为本机暖缓存；用户首次看到的新消息仍依赖结构化估算和 Virtuoso 实测，清除缓存不影响任何功能正确性。
