# Decisions: Long Message Virtualization

## D001 — v0.5.3 is the new canonical version workspace

v0.5.2 已完成 release closing 并进入 `main`。用户明确要求在同步后的 `ai-mind-dev` 创建 v0.5.3 分支并按 Spec Kit 推进，因此 `specs/v0.5.3-message-virtualization` 是本版唯一 canonical workspace；不得创建 `v0.5.3-1-*` 等 sibling 规格目录。

## D002 — Use free `react-virtuoso`, not the commercial Message List

采用 `react-virtuoso@4.18.12` MIT package。禁止引入 `@virtuoso.dev/message-list`、`VirtuosoMessageList`、license wrapper 或商业 license key。若未来需要商业组件，必须作为新的显式决策和依赖评审处理。

## D003 — Virtuoso is the only physical scroll owner

Virtuoso 负责消息 item 测量、范围计算、节点回收与所有物理滚动命令。AI Mind Scroll Policy 只决定 when/why/behavior，不计算或写入像素位置。该决定 supersede v0.5.2 中 `useChatAutoScroll` 的 `scrollTop`、`scrollHeight`、手工 180ms 动画和消息内容 `ResizeObserver` 滚动实现；v0.5.2 的产品语义继续保留。

## D004 — All non-empty lists use one virtualized path

不设置 20 条或其他 threshold，也不保留短列表完整渲染分支。所有 `messages.length > 0` 的列表使用同一 Virtuoso adapter；空会话建议区保持现有路径。统一实现减少两套滚动状态机的组合回归。

## D005 — Keep the full client message array; pagination is deferred

v0.5.3 只优化 DOM 与布局工作量，不改变消息获取和内存模型。cursor pagination、tail-first server query、向上加载和 client data eviction 是后续独立版本范围，本版不预埋 cursor DTO 或 API。

## D006 — Reuse the v0.5.2 full-height viewport through `customScrollParent`

保留唯一 `chat-message-viewport`、stable gutter、mobile selector/alerts、floating Composer 和列宽测量。Virtuoso 不创建第二个独立滚动区，而是使用该元素作为 `customScrollParent`。Composer 实际高度加 54px 由 Virtuoso Footer 表达，避免外层 padding 与虚拟总高度分离。

## D007 — Disable `followOutput`; Scroll Policy owns follow semantics

`followOutput={false}`。Scroll Policy 以现有状态划分三个互斥区间：pending history entry 仅由 entry retry 通过 handle 定位尾部；streaming output 才允许内容、`totalListHeightChanged` 与 Composer 高度以 64ms / immediate policy 跟随；已完成 static reader 不得因为 `atBottom`、重测或布局变化发送任何回底命令。用户向上阅读锁定当前 turn；显式 wheel/touch/key 向上意图无论是否流式、即使尚未越过 120px `atBottom` 阈值，都必须立即取消已排 follow 并建立该 lock。manual return 或 next turn reset 才恢复。不得同时启用 Virtuoso 内建 auto-follow。

## D008 — Use stable identity and linear message preparation

Virtuoso item key 使用 `message.id`。assistant 的最近 user composer 在一次正向遍历中计算，替代每项 `slice().reverse().find()` 的 O(n²) 前缀扫描。该优化留在 `ChatMessageList`，不为一次映射新增通用 mapper/service。

## D009 — Persist only meaningful disclosure state in page memory

Reasoning、Agent Trace、Workflow、Resource/Raw/Delivery 等重要展开状态提升到 message-list provider，以 conversation + message + part/slot key 隔离。copy、hover、短时 loading 等瞬态状态允许在回收后重置。状态不写 localStorage、ThreadState、API 或数据库。

## D010 — Hidden history reveal uses Virtuoso readiness, not pixel correction

历史首次揭示等待同一 sequence 的 Footer inset committed、last item in range、last Item mounted、at-bottom、non-scrolling 与连续双 animation frame 稳定。旧 sequence 可取消。`initialTopMostItemIndex` 从尾部建立窗口，最终定位只走 handle 的 `auto` 命令；不得恢复可见后像素校正。刷新竞态暴露后的 retry、generation observation 与稳定窗口细节由 D015 补充。

## D011 — Use conservative two-dimensional render buffers

初始采用 top/bottom 像素缓冲 600/400 与最少 item 缓冲 2/2，同时满足高矮混合 item 的快速滚动。参数必须以真实 1,000 条场景校准，硬门槛是无空白/重叠且稳定消息根节点不超过 50；未验证前不加入 height estimates。

## D012 — Smooth only for nearby explicit user return

历史进入、stream follow、layout correction 和远距离 return 均为 `auto`。只有用户点击“回到底部”且 visible range 距 last index 不超过 5 时才用 `smooth`，避免跨大量未测 item 的长动画性能风险。

## D013 — Native find and offscreen accessibility limits are accepted

虚拟化意味着离屏消息不在 DOM，因此浏览器原生 Ctrl+F 和 accessibility tree 只覆盖当前挂载范围。本版接受这一限制，但当前可见消息、message viewport region 与所有可见操作必须保持语义和键盘可用。全会话搜索或专用无障碍索引不在本版范围。

## D014 — TanStack remains a viable fallback, not the v0.5.3 choice

TanStack Virtual 当前已有 dynamic measurement 和 chat/end-anchor primitives，能力足够；但它需要 AI Mind 自行组合更多布局、测量与位置胶水。以尽快稳定交付为目标，免费 React Virtuoso 的学习和开发成本更低。只有 Virtuoso 经真实 spike 无法满足外部 scroll parent 或动态高度 acceptance 时，才在同一 canonical workspace 记录证据并重新评审，而不是并行实现两套方案。

## D015 — Pending history entry retries and waits for the committed tail Item

真实 Chrome 首先捕获到 history items 已挂载但父容器仍为 `visibility: hidden`、末项不在 range、距底部 9340px 且无 console error 的刷新竞态；随后又捕获到 Virtuoso bottom/range observation 早于最后消息 DOM commit，以及 ready 后动态测量、Item unmount 或旧列表延迟 callback 使新会话提前揭示/再次隐藏的窗口。首次定位因此使用 generation-scoped observations：bottom、range、height、scrolling 与 Item mount/unmount 全部绑定 `conversationId + sequence`；旧代 callback 不得推进当前 entry。pending entry 把非末尾、末项未挂载/卸载和 total height change 视为重新协调信号，合并到下一 animation frame 再调用 `ChatMessageListHandle.scrollToEnd('auto')`；height 可升级已排 retry 为 forced，命令后无需等待重复 observation 即可重新检查 readiness。reveal 必须等待同代 bottom、tail range、末项挂载、非 scrolling 全部成立，且 readiness revision 连续两个 animation frame 稳定。完成或 cancel 后取消 pending work。该决定不授权 Scroll Policy 读取像素、启用 `followOutput`、增加固定 timeout 或绕过 Virtuoso。

## D016 — Use a test-only IndexedDB seed for real-page long-history acceptance

1,000 条 fixture 继续保留 standalone Vite harness，用于确定性的延迟图片、流式增长和 Composer 高度变化；同时新增只在 Chrome DevTools 手动粘贴运行的 seed/cleanup scripts，用现有浏览器的最大 local snapshot 生成真实 `/instant-mind` hydration 测试数据。选择固定 fixture-prefixed conversation id，并在 seed 前备份 local index/selection/draft；request blocking 仅阻断 thread/registry API，以既有 read-only cache 路径加载，避免 server reconcile 删除本地 fixture。普通稳定写入仍裁剪 120 条且 AgentInterrupt 不可恢复，因此工具不支持真实发送、生图或 Agent/HITL 执行。脚本只复制一个已经缓存的图片 Blob 到 fixture run id，保证不触碰用户原图 cache；若文本、图片或 completed agent donor 缺失则零写入失败。该决定只增加 `tests/fixtures` 与 specs 资产，不修改 production bundle、API、schema 或 Runtime。

## D017 — Local reproducible fixture uses a server-backed test conversation

用户明确要求本机测试不受原只读隔离约束、可在正常刷新后持续显示且标题为“1000条测试数据”。因此本地验收采用一个先由正常聊天创建、已进入 server registry 的独立测试会话；seed 仅替换这个会话的 IndexedDB snapshot，并继续从其他 local snapshot 读取 completed text/image/Agent donors。这样 server registry 不会将目标 snapshot 作为 stale 清除，thread hydration 又会优先使用 valid local snapshot，故不再需要 Request Blocking。seed 前备份目标原 snapshot、index/selection/draft；cleanup 恢复它们并清理专属 image cache，但不删除服务端测试会话。D017 仅 supersede D016 的固定 fixture id/request-blocking 载入策略，保留其测试侧脚本、donor preflight、唯一 identity 与 standalone harness 边界。

## D018 — Add a development-only seed page for browser execution (route topology superseded by D026)

聊天页自身挂载 `useChatStream` 后会持续把当前 React 消息状态写回 IndexedDB；在该页直接写入 1,000 条数据再刷新，旧 hydration/persistence 竞态可能把 fixture 覆盖回原快照。为保证用户能在本地浏览器稳定复现，开发服务器提供一次性 preparation page：它不挂载聊天 runtime，只读取当前选中的“1000条测试数据”会话、写入已验证的 fixture snapshot，然后跳转回聊天页。该入口在 production runtime 通过 `notFound` 禁用；DevTools seed/cleanup 仍作为通用手工路径保留。D026 supersedes 本决策最初的 `/instant-mind/v053-seed` 路径与“等价完整 seed”表述，保留其“脱离聊天 hydration/persistence”的必要性。

## D019 — Show a positioning skeleton during the hidden tail reveal window

**Superseded by D021.** 保留“隐藏列表期间必须提供骨架”的产品目标，但不再将骨架置于可滚动 `chat-main-column` 内；尾部定位可把该内容层滚离屏幕，导致 Composer 上方出现白色空区。

## D020 — Stabilize static-reader geometry before changing scroll policy

真实 Chrome 的“1000条测试数据”复现表明：completed static reader 已没有业务 follow queue，轻微上滚后仍会在 image/resource/agent 混合区域向尾部方向回跳。图片缓存命中由 loading 转 ready 时，原实现追加约 65px Footer；error 又从比例图片区收缩成一行 Alert。离屏卡片重新挂载和这类几何变化会让 Virtuoso 用较差的初始 size tree 校正总高度，视觉上类似自动滚动，但不应通过恢复 `scrollTop`、扩大 buffer 或修改 static Scroll Policy 掩盖。

因此使用免费 `react-virtuoso` 的 per-item `heightEstimates`：在既有线性 `messageEntries` 遍历中，按 part 类型、文本量、图片宽高和当前列宽生成一一对应的初始估值；真实 measurement 仍覆盖估值。图片的 loading、ready、expired、error 统一保留 Header、比例预览和等高 Footer，下载按钮仅在 ready 交互，其他状态用 `aria-hidden` 占位。`customScrollParent` 的 ResizeObserver 只更新列宽估值，不读写 scroll position。该决定 supersedes D011 中“验收前不使用 height estimates”的限制；不设置 `defaultItemHeight`、`fixedItemHeight`、`skipAnimationFrameInResizeObserver` 或测量持久化。若仍复现，先记录 `rangeChanged`、总高度和图片状态；只有确认无 measurement event 仍发生移动，才单独 A/B `overflow-anchor: none`。

## D021 — Use CSS both-edge gutter and a non-scrolling history bootstrap screen

保留 `scrollViewportElement` callback ref 已提交后才挂载非空列表的 parent-handoff 防护。但先前用 React `chatScrollbarWidth` state 从 `0px` 读到 native `offsetWidth - clientWidth`，再用 rAF/ResizeObserver 修正 Composer 的办法本身会造成 SSR 初始 HTML 与 hydration 后首帧在不同水平坐标系中渲染；它无法消除用户可见的横向闪动。

因此外部视口改为 `scrollbar-gutter: stable both-edges`，消息列和固定 Composer 都以同一 `left: 0; right: 0` 外层坐标轴居中；不再读取 gutter、创建布局 state 或安排 rAF/ResizeObserver。Virtuoso 初次用估算高度建立外层 scrollable wrapper 后仍会以真实测量修正总高度，原生 thumb 会从初始长条变成最终短条。为避免把这个正常收敛暴露给用户，`conversationHydrationPending || shouldPositionHistoryEntry` 期间只隐藏 viewport 的原生 scrollbar，保留列表与 `customScrollParent` 供测量和既有 entry command 使用；骨架作为 `chat-layout` 的非滚动同级层显示。定位 reveal 完成后恢复 `overflow-y-auto` 并移除骨架。

同一坐标轴不等于 Composer 的装饰背景可以覆盖整个外层宽度：全宽 gradient 会挡住位于右侧 gutter 的末尾 scrollbar thumb，使它只有滚到中段后才露出。因此渐变改为内容列加固定水平留白的独立绝对层，Composer 交互层置于其上，右侧 gutter 保持透明。该决定 supersedes D019 的骨架位置和旧 D021 的 JS gutter 结算；不改变 `followOutput={false}`、Scroll Policy、buffers、物理滚动 owner 或免费 Virtuoso 依赖。

切会话时 `showScrollToBottom` 的 Policy observation 可能比新会话 hydration 更晚清理；它在 skeleton 期间并不构成当前会话的可用交互。页面因此以当前 history presentation 是否已 reveal 作为额外的 UI 挂载门控：未 reveal 或 hydration failed 不渲染入口，revealed 后才读取既有 Policy 状态。这不是新的 follow 或滚动命令，也不改变 120px 阈值。

骨架虽已脱离 scrollable content 以避免被尾部定位滚离，但 `chat-layout` 本身带有 desktop sidebar padding；绝对同级层若仍使用整页 `inset-x-0`，会按全页而非聊天区域居中。骨架层因此在 `lg` 断点显式复用 `--conversation-sidebar-width` 作为 left boundary，和 Composer shell/消息视口共享同一横向区间；移动端不增加此偏移。

真实浏览器几何显示 `html { scrollbar-gutter: stable }` 在全高、`overflow-hidden` 的 Instant Mind 页面仍预留 15px document gutter；页面自身 `chat-message-viewport` 又有独立 native scrollbar，导致 `main` 和 viewport 在窗口右侧前结束，thumb 看起来没有贴边。这不是 `both-edges` 的额外左侧 gutter，也不是 Virtuoso。保留全局规则对普通文档页的价值，并以 SSR 可见的 `main[data-slot='instant-mind-page']` 和 `html:has(...)` 仅在本页覆写为 `auto`；外部消息视口的 `stable both-edges` 保持不变。

## D022 — Regress with both a stress fixture and the longest real local snapshot

1,000 条 fixture 是故意合成的混合压力集合，适合稳定覆盖图片、Tool、Resource、Workflow、Skill、Prompt 与 Agent 等高差结构；它不能替代真实会话的实际内容组合、默认展开状态与 Markdown/card 堆叠。因此 v0.5.3 的浏览器验收固定采用两套集合：fixture 用于最坏路径、DOM 上限和可重复 CLS 比较；排除 fixture 后，消息数最多的有效本地 snapshot 用于真实结构回归与估算校准。

development-only `/dev/message-virtualization?target=real` 只选择并本地标记该真实会话为“最长真实会话”，不复制、不扩容、不输出正文，也不改服务器标题。当前 hydration 会继续以 server registry 为最终标题事实源，所以该本地标记是测试准备/选中提示，不构成产品级重命名承诺；实际回归身份由 selected conversation id 保持。候选选择按 message count、`lastActiveAt`、id 稳定排序，排除专用“1000条测试数据”fixture。该决定不改变 `MindMessage`、IndexedDB schema、Scroll Policy、Virtuoso 或外部滚动所有权。

## D023 — Calibrate estimates by rendered Markdown structure and stable card chrome

双数据集的临时只读测量证明，之前“字符量 + 单一基础值”的估算会把完成态长 Markdown 的首轮高度少估约 2,000px；Tool、Resource、Skill + Prompt、Agent 及图片 fixture 也有可重复的固定差值。根因不是 static Scroll Policy：它在 completed reader 不发 follow command；而是离屏首次进入 range 时，Virtuoso 需要对过大的 estimate 与真实高度差做 size-tree / spacer 校正。

因此文本估算按可从现有正文结构推导的 prose、heading、list、fenced code 和 Markdown table 分解，不把 code/table 原始字符宽度当作普通可换行段落；Tool、Resource、Prompt、Agent 与图片估算包含稳定 Card chrome。助手内容容器建立 block formatting context，使现有 panel `mb-3` 不会从 item 测量边界逃逸。真实 DOM measurement 仍为最终事实，估算不持久化、不读取或写入滚动位置。

临时浏览器诊断标记只在本机归因期间存在，已移除。修复后 fixture 的 Tool/Resource 误差各为 8px，Skill + Prompt 为 -12px，Agent 为 0px，图片为 -1px；最长真实会话两条最重 completed Markdown 从约 +2,000px 少估收敛为 +446px / -287px。以真实用户式轻微上滚复测时，fixture 连续 5 次、真实会话连续 3 次均在输入后 300ms（fixture 亦核对 500ms）保持同一 scroll position，故没有证据支持启用 `skipAnimationFrameInResizeObserver`。该开关保持未设置，除非后续在“误差已收敛但仍双跳”的新证据下再进行单变量 A/B。

## D024 — Height estimates mirror current presentation context and CJK visual width

真实会话的 CLS 仍高于合成 fixture，不能以消息数解释：fixture 的 shift cluster 数更多而单次影响面积更小。D023 之后的静态代码比对也发现两个确定性不一致：`enableReasoning=false` 时 AssistantMessage 不渲染 reasoning，但估算仍加入它；普通 workflow 仅在 delivery-chain 或 image generation 分支渲染，估算却对所有 workflow 计入高度。两种误差都会让 Virtuoso 的初始 spacer 与最终 item 几何偏离。

此外，原 prose 换行一律按半角 `8px` 字符单位计算；中文实际字形明显更宽，未换行 CJK 文本会被系统性少估。故初始估值改为接收当前 `enableReasoning` 与前序 request composer，且仅计入实际会显示的 reasoning/workflow；CJK 全角范围按两个半角视觉单位计算。该改动只提高 initial size-tree 接近度，实际 measurement 仍为事实来源。

本决策不声称已消除真实会话 CLS：不启用 `skipAnimationFrameInResizeObserver`、不修改 Scroll Policy、`followOutput`、buffer、anchor 或任何手工 `scrollTop`。完整桌面/移动 CLS 对照、拖拽、展开、刷新和流式矩阵继续由 T058、T074、T077 负责。

## D025 — Persist per-message stable height hints, not Virtuoso scroll state

真实会话本地 CLS 仍约为 `0.98–1.04`，而 fixture 约为 `0.64`；两者均失败，且 D023/D024 后真实长 Markdown 仍有数百像素残余估值误差。用户批准把新产生、已真实渲染且稳定的消息高度与本地会话关联，用于后续刷新、切换和离屏重建时的 initial estimate。该决定 supersedes D020、D023、D024 与 `data-model.md` 中“本版不持久化任何测量提示”的限制，但保留“真实 measurement 最终裁决、不持久化滚动位置”的边界。

不保存或恢复完整 Virtuoso `StateSnapshot`：其 `ranges` 以 index 为单位且包含 `scrollTop`，官方恢复契约要求相同 data/totalCount，不适合会追加、删除、重新生成的会话，也会与历史进入尾部语义混合。AI Mind 只消费免费 `react-virtuoso@4.18.12` 公共 `itemsRendered` callback 的 item `size`，在同一尺寸稳定、列表停止滚动、非 streaming、字体 ready、completed history/default disclosure 条件成立后，把 `messageId + renderFingerprint + layoutKey + height` 批量写入独立 IndexedDB `message-height-hints` store。不得新增消息内容 `ResizeObserver` 或同步 DOM 测量。

`layoutKey` 使用实际消息内容列的精确 CSS pixel width，而非物理屏幕分辨率，并包含显式 `geometryVersion`、reasoning 和 presentation。宽度变化、渲染结构变化、非默认 disclosure、最新 assistant/streaming、fingerprint 不匹配、缓存缺失、quota 或 IndexedDB unavailable 均回退现有结构化 estimator。读取到的 hint 只替换对应 `heightEstimates[index]`；Virtuoso 挂载后的真实测量继续覆盖它，Scroll Policy、`followOutput={false}`、buffer、DOM 上限和物理滚动 owner 不变。

高度提示属于可删除的 UI performance cache，不进入 strict conversation snapshot、`MindMessage`、localStorage、API、服务端或日志正文。每会话最多保留三个 layout variants，并随本地会话清理。方案是否保留必须以 fixture + 最长真实会话的冷/暖 A/B 决定：暖缓存命中路径 CLS 至少下降 50%，第一阶段不高于 `0.25`，最终目标 `0.1`；若失败，不得通过扩大 buffer、恢复 scroll state 或写像素位置掩盖。

为维持“cache 不是 correctness dependency”，height-hint read 在 IndexedDB `blocked` 时立即降级，并有 500ms 的仅本次 bootstrap budget；超时后的迟到结果直接丢弃，不能在 Virtuoso 已建立 size tree 后改写初始 generation。会话清理使用每会话内存 deletion generation 使已在途的旧写入失效，不采用永久 tombstone，以便同 ID 后续重新出现时仍能重新预热。

## D026 — Isolate the browser fixture fallback under a semantic dev route

`/instant-mind/v053-seed` 把一次性开发验收页放在产品入口下，并用不可自解释的版本缩写命名；它实际既会写确定性的 mixed fixture，也会以 `target=real` 只读准备真实会话，已经不是单一 seed。路径迁移为 `/dev/message-virtualization`，版本号保留在 v0.5.3 canonical specs，而不是应用路由。该页继续只在 `NODE_ENV=development` 时可见，production 一律 `notFound()`；它不挂载 Instant Mind Runtime，仍避免聊天 hydration/persistence 覆盖刚写入的本地 snapshot。

此外，现有实现的默认页面路径并不承担 DevTools Snippet 的 donor preflight、fixture image cache、backup 或 cleanup。为避免把本机测试保证写得超过真实实现，完整可恢复的 donor seed/cleanup 只归 DevTools scripts；新 dev route 仅提供确定性的 mixed fixture 写入和 `target=real` 本地重标记 fallback。可执行 helper 从 `tests/fixtures/` 移到 `lib/dev/message-virtualization/`，使 app route 不再反向依赖测试目录；`tests/` 仍可消费该 deterministic helper 作为测试输入。旧 URL 不留 redirect，避免形成两个可写本地 snapshot 的入口。

## D027 — Manual browser acceptance is qualitative; diagnostic metrics do not block release closing

用户明确决定：本版已完成的四组真实浏览器手动回归（静态长会话、刷新视觉、height-hint cold/warm、普通流式输出）以“行为通过、未复现空白/重叠/回跳/布局闪动”为收口事实。CLS、DOM peak、hint hit rate、item/total-height delta、写入次数、固定滚动次数与 4x CPU slowdown 继续保留为性能诊断信息，但不再作为 v0.5.3 release closing 的数值或必做门槛。

该决定不放宽运行时正确性边界：Virtuoso 仍是唯一物理滚动 owner，`followOutput={false}`、无手工 `scrollTop`、无第二个 message `ResizeObserver`、高度 hint 真实 measurement 最终裁决与本地可删除缓存边界均保持不变。若后续诊断发现用户可见回归，应作为独立 follow-up 修复，不追溯否定本版已获确认的手动验收。
