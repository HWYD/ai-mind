# Tasks: Long Message Virtualization

**Input**: Design documents from `specs/v0.5.3-message-virtualization/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/chat-message-viewport.md`, `quickstart.md`

**Tests**: 本版本改变长列表、动态高度与用户滚动行为，必须测试先行。每组新增断言先在当前实现或上一步实现上观察到预期失败，再做最小生产改动；真实几何不能只靠 jsdom mock 证明。

**Scope rule**: 只使用免费 `react-virtuoso`；不引入 commercial Message List、pagination、API/DB/stream/Electron 变更或 production test mode。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可与同 Phase 其它任务并行，修改文件不存在编辑冲突。
- **[Story]**: 对应 `spec.md` 的 US1 / US2 / US3。
- 每个 Step 完成后先运行列出的 checkpoint，再进入下一 Step。

## Phase 1: Setup and Red Baseline

**Purpose**: 固定免费依赖边界和测试入口，在生产滚动实现变化前建立失败证据。

- [x] T001 在 `apps/webapp/package.json` 与 `pnpm-lock.yaml` 加入精确版本 `react-virtuoso@4.18.12`，确认没有 `@virtuoso.dev/message-list`、license wrapper 或 license key。
- [x] T002 [P] 在 `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx` 建立测试侧 Virtuoso mock/fake，可捕获 props、执行 handle 并主动触发 bottom/range/height/scrolling callbacks；不得向生产代码加入 test branch。
- [x] T003 [P] 将 `apps/webapp/tests/components/instamind/use-chat-auto-scroll.test.tsx` 重命名为 `use-chat-scroll-policy.test.tsx`，先写失败契约：policy 只调用 `ChatMessageListHandle.scrollToEnd`，不读写 raw scroll metrics、不调用 `window.scrollTo`、不实现自定义像素动画。
- [x] T004 [P] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败结构回归：外层仍是唯一全高 message viewport、非空列表接收当前 scroll parent、Composer inset 进入 list contract，旧 `messageContentRef` 不再承担滚动测量。
- [x] T005 运行 T002–T004 的定向 Vitest，记录新断言按预期失败、既有无关断言仍通过的 red baseline。

**Checkpoint**: 免费依赖已锁定，adapter、policy 与 page 的目标契约已有失败测试；尚未允许 Virtuoso 与旧手工滚动同时进入可交付状态。

---

## Phase 2: Single Scroll Owner Foundation

**Purpose**: 先建立唯一物理滚动所有权，作为三个用户 Story 的阻塞基础。

- [x] T006 在 `apps/webapp/components/chat/message-list/chat-message-list.tsx` 使用 React 19 `ref` prop 接入 `Virtuoso`，实现最小 `ChatMessageListHandle.scrollToEnd('auto' | 'smooth')`；handle 内部使用 `'LAST'`、end alignment 和当前 Footer inset，不泄漏 Virtuoso instance 或 pixel metrics。
- [x] T007 在 `apps/webapp/components/chat/message-list/chat-message-list.tsx` 接入 `customScrollParent`、stable external `Item` / `Footer` 和规范化 callbacks，强制 `followOutput={false}`；空消息继续显示现有 suggestions，不挂载 Virtuoso。
- [x] T008 将 `apps/webapp/components/instamind/use-chat-auto-scroll.ts` 重命名为 `use-chat-scroll-policy.ts`，删除 `getDistanceFromBottom`、`getBottomScrollTop`、所有 `scrollTop` / `scrollHeight` 定位、180ms rAF tween、programmatic pixel flags 和 message-content `ResizeObserver`，保留 Composer 实测高度和业务状态清理。
- [x] T009 在 `apps/webapp/components/instamind/instantmind-page.tsx` 提交稳定 `scrollViewportElement` 给 `ChatMessageList`，改用 list handle 与 policy callbacks，移除 `messageContentRef` 滚动职责，同时保留 scrollbar width 测量、full-height viewport、Composer overlay 和现有 hydration presentation。
- [x] T010 运行 `chat-message-list.test.tsx`、`use-chat-scroll-policy.test.tsx`、`page.test.ts`，并用 `rg` 检查消息定位代码不再存在手工 `scrollTop` / `scrollHeight`、`window.scrollTo`、custom tween 或启用的 `followOutput`。

**Checkpoint**: 任意消息物理滚动只能经 `ChatMessageListHandle -> VirtuosoHandle` 执行；若仍存在双 owner，不得进入 US1。

---

## Phase 3: User Story 1 — 稳定浏览超长会话 (Priority: P1) MVP

**Goal**: 所有非空会话用同一动态高度虚拟列表，1,000 条消息保持有界 DOM，并在历史首次揭示时直接位于末尾。

**Independent Test**: 使用 1,000 条混合高度消息进入历史并快速跨段滚动；首次可见位于末尾，消息连续且稳定挂载根节点不超过 50。

### Tests for User Story 1

- [x] T011 [P] [US1] 在 `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx` 先写失败测试：1 条与 1,000 条消息均使用 Virtuoso、`computeItemKey` 返回 `message.id`、`alignToBottom`、tail initial index、600/400 viewport buffer、2/2 item buffer 与 Footer inset 正确。
- [x] T012 [P] [US1] 在同一测试文件先写失败测试：最近 user composer 映射在一次正向遍历中保持正确，append/update/delete 不复用错误消息；移除现有 `slice().reverse().find()` 行为。
- [x] T013 [P] [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：同一 history sequence 只有在 inset committed、last index in range、at-bottom 和下一 rAF 后揭示；A→B、retry、unmount 的旧 callbacks 失效。

### Implementation for User Story 1

- [x] T014 [US1] 在 `apps/webapp/components/chat/message-list/chat-message-list.tsx` 用单次正向遍历生成 `MessageEntry[]`，配置 stable key、tail initial index、bottom alignment 和初始 buffers；将原 `gap-5` 行间距迁移到 Virtuoso measured item wrapper 的 padding，确保 measured root 无垂直 margin/零高度 item。
- [x] T015 [US1] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 与 `instantmind-page.tsx` 实现 sequence-scoped history readiness：commit Footer inset、发出 `auto` 到底命令、等待同代 tail range + tail Item mount + at-bottom + non-scrolling 连续双帧稳定后揭示，并取消 stale generation；最终时序强化见 T040–T041。
- [x] T016 [US1] 运行 US1 定向测试；用 1,000 条 test fixture 验证 mock 可见范围只渲染 bounded entries，并确认现有 copy/feedback/delete/regenerate/follow-up 断言不回归。

**Checkpoint**: US1 可独立展示长历史、从尾部首次揭示并保持稳定 identity；真实浏览器 DOM/视觉门槛在 Phase 6 最终确认。

---

## Phase 4: User Story 2 — 流式输出与动态高度遵守阅读意图 (Priority: P2)

**Goal**: 动态 item / Composer 高度变化只在业务 policy 允许时跟随；用户上滑后本轮不再被抢回。

**Independent Test**: 同一流式消息连续增高并触发图片/卡片/Composer 变化，分别验证 pinned、user lock、manual return 和 next-turn reset。

### Tests for User Story 2

- [x] T017 [P] [US2] 在 `apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx` 先写失败测试：`contentSignal` 与 `totalListHeightChanged` 在 following 状态以 64ms 合并为 `auto` 到底；locked 或 non-streaming reader 不发命令。
- [x] T018 [P] [US2] 在同一测试文件先写失败测试：wheel up、touch upward、PageUp、Home、Shift+Space 和非程序 scrollbar drag 锁定当前 turn；click return 与 send/regenerate/resume reset 恢复。
- [x] T019 [P] [US2] 在 `chat-message-list.test.tsx` 与 `page.test.ts` 先写失败测试：120px bottom callback 驱动按钮；manual return 距 last index ≤5 使用 smooth，更远使用 auto；Composer inset 变化先提交 Footer 后再按 policy 决定是否到底。

### Implementation for User Story 2

- [x] T020 [US2] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 实现稳定 callback/ref、64ms 合并、follow lock、用户意图和程序命令区分；wheel/touch listeners 使用 passive，且不重新引入 pixel distance 算法。
- [x] T021 [US2] 在 `apps/webapp/components/chat/message-list/chat-message-list.tsx` 转发 `atBottomStateChange`、`rangeChanged`、`totalListHeightChanged`、`isScrolling`，并在 `instantmind-page.tsx` 将回到底部按钮、新 turn/reset 与 list handle 串接。
- [x] T022 [US2] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 仅观察 Composer 实际高度；`ChatMessageList` Footer 使用 `composerOverlayInset + 54`，删除 outer message-content bottom padding 的重复计数，并保持空会话安全区。
- [x] T023 [US2] 运行 US2 定向测试和既有 streaming/hydration/session 回归，确认 token growth、finish correction、Composer grow/shrink、user lock 和 next-turn reset 全部通过。

**Checkpoint**: 动态高度只由 Virtuoso 测量，Scroll Policy 只决定命令；pinned 与 reader 两种状态均有自动化证据。

---

## Phase 5: User Story 3 — 离屏往返保持重要消息状态 (Priority: P3)

**Goal**: 虚拟回收不丢失重要 disclosure，也不把短暂反馈提升为不必要的全局状态。

**Independent Test**: 展开四类详情，滚出挂载范围再返回两次；状态保持且会话/消息删除后不串位。

### Tests for User Story 3

- [x] T024 [P] [US3] 在 `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx` 先写失败测试：Reasoning、Agent 主详情/debug、Workflow、native details 离屏卸载/重挂后保持默认与用户选择。
- [x] T025 [P] [US3] 在同一测试文件先写失败测试：conversation switch、message deletion、part replacement 隔离并 prune key；copy success/hover 等瞬态状态允许重置。

### Implementation for User Story 3

- [x] T026 [US3] 新增 `apps/webapp/components/chat/message-list/message-disclosure-provider.tsx` 与 `message-disclosure-state.tsx`，实现 message-list scoped provider 与 `useMessageDisclosureState(key, defaultOpen)`；状态 key 遵循 `data-model.md`，provider 是唯一存储实现边界。
- [x] T027 [US3] 在 `parts/reasoning-panel.tsx`、`parts/agent-trace-panel.tsx`、`parts/workflow-progress-panel.tsx`、`parts/part-panels.tsx` 与 `messages/assistant-message.tsx` 将重要 disclosure 改为 provider-controlled，保留现有 default 和 ARIA / `<details open>` 语义。
- [x] T028 [US3] 在 provider/list 边界实现 conversation isolation 与基于当前 message/part keys 的 prune；不持久化、不增加全局 store、不迁移 copy/hover state。
- [x] T029 [US3] 运行 US3 定向测试，检查虚拟回收两次往返、删除、part replacement 和会话切换均不串状态。

**Checkpoint**: US3 的持久/瞬态状态边界与 `data-model.md` 一致，新增抽象仅服务真实虚拟卸载语义。

---

## Phase 6: Real-browser Performance and Compatibility

**Purpose**: 用真实 ResizeObserver、滚动容器和 1,000 条 fixture 验证 jsdom 无法证明的几何与性能要求。

- [x] T030 [P] 在 `apps/webapp/tests/fixtures/message-virtualization.ts` 创建稳定、可复用的 1,000 条混合消息 fixture；只服务测试/本地验收，不增加 production route、provider、env flag 或 runtime branch。
- [x] T031 用户确认 Chrome 桌面和 324×534 的静态长会话跨段滚动通过，未见空白、重叠、错误复用或不可恢复跳变。D027 将次数与 DOM count 从收口门槛降为诊断信息。
- [x] T032 按 `quickstart.md` 验证 Markdown/code、延迟图片、tool/card、disclosure 与 Composer 高度变化的 pinned/reader 行为，以及 near smooth / far auto 手动返回；记录证据。
- [x] T033 正常速度下历史首次揭示、A→B cancellation、desktop/mobile gutter、Composer alignment、安全区和 pointer pass-through 已由自动化与用户浏览器验收通过；4x CPU slowdown 按 D027 转为非阻塞后续诊断。
- [x] T034 仅在 T031 观察到白屏或节点超限时，基于证据调整 `increaseViewportBy` / `minOverscanItemCount`，并同步 `plan.md`、contract、`decisions.md` 与测试；不得通过 height estimates 掩盖未定位的测量问题。实测无白屏且节点最大 15，条件未触发，保持既定 buffer。
- [x] T040 [US1] 在 `apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx` 先补失败回归：首次到底命令未生效且 Virtuoso 报告非末尾/末项不在 range 时必须重试；bottom/range ready 但最后 Item DOM 未 commit 或 reveal 前 unmount 时不得揭示；height change 必须升级 queued retry 且 forced command 后不依赖重复 observation 自恢复 reveal；A 的 stale bottom/range/height/scrolling 不得推进 B；cancel 后 pending retry 不得移动下一会话。
- [x] T041 [US1] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 与 `instantmind-page.tsx` 实现 generation-scoped、可取消、事件驱动的 history entry retry/reveal state machine：全部 list observations 绑定 generation，自定义 Item layout effect 维护 mounted index Set，forced retry intent 可合并升级，reveal 等待 non-scrolling readiness 连续双帧稳定；只调用 `ChatMessageListHandle.scrollToEnd('auto')`，不得增加 fixed timeout、raw scroll metrics、`followOutput` 或第二滚动 owner。
- [x] T042 [US1] 在真实 Chrome 对当前持久化会话完成最终实现连续 10 次刷新、离尾与返回底部 smoke；每轮均先观察本轮 `positioned=false` 再在 mounted range 7–13、节点数 7 时揭示，揭示瞬间与 350ms 后一致，按钮隐藏/禁用；最终实现后的 console 无 warning/error。真实 4x CPU 仍由 T033 单独验收。

**Checkpoint**: A531–A548 均已有自动化或用户确认的浏览器证据。D027 将真实 4x CPU 与额外 DOM/次数采样降为非阻塞诊断；出现新的用户可见回归时才返回对应 Story 修复。

### Phase 6.1: Real-page IndexedDB Fixture Remediation

**Purpose**: 在不改变 production persistence 或 Runtime 的前提下，为 Google Chrome 最终门槛提供由现有本地会话扩充得到的 1,000 条真实页面数据。

- [x] T043 [P] 在 `apps/webapp/tests/fixtures/message-virtualization-indexeddb-fixture.test.ts` 先写失败测试：最大 snapshot 选择、缺失 text/image/agent donor 时零 payload、精确 1,000 条扩容、主样本比例、唯一 identity、单 fixture image cache、Agent Interrupt 排除与 cleanup scope。
- [x] T044 实现 `apps/webapp/tests/fixtures/message-virtualization-indexeddb-fixture.ts` pure builder；它只构造 payload，不直接访问 production Runtime 或写 IndexedDB。
- [x] T045 实现 tests-side `message-virtualization-indexeddb-seed.devtools.js` 与 `message-virtualization-indexeddb-cleanup.devtools.js`，以同源 Chrome DevTools Snippet 对既有 IndexedDB/localStorage 执行预检、将当前 server-backed 测试会话替换为 fixture snapshot、backup/restore 和专属 image-cache cleanup；不得输出原消息文本。
- [x] T046 更新 quickstart/acceptance，明确 request blocking、桌面/移动/4x 验收、standalone harness 分工和 cleanup；真实 Chrome 运行后才填写 browser evidence。
- [x] T047 运行 fixture 定向 Vitest、相关现有回归、typecheck、lint 与 diff check，并将自动化证据写入 acceptance。
- [x] T048 用户确认真实 Chrome fixture 的桌面/移动浏览器回归通过；本机 fixture 按既有测试需要保留，cleanup 不是收口前置条件。4x CPU 与 DOM 峰值记录按 D027 作为非阻塞诊断。

---

## Phase 6.2: Static Reader Intent Remediation

**Purpose**: 保留 120px “回到底部”展示阈值，但让已完成历史中的显式向上阅读立即优先于动态高度 follow，避免轻微滚动被 64ms 合并命令拉回末尾。

- [x] T049 [US2] 在 `apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx` 先写失败回归：非流式会话仍处于 `atBottom=true` 的阈值区间时，wheel up 必须取消已排的 `totalListHeightChanged` follow，后续高度变化也不得发送 `scrollToEnd`。
- [x] T050 [US2] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 将显式用户向上 intent 的 follow lock 与 `isStreamingOutput` 解耦；只复用既有 ref、pending-command 清理和 timeout 清理，不增加像素计算、第二滚动 owner 或 Virtuoso 配置变更。
- [x] T051 [US2] 运行 Scroll Policy 定向 Vitest、webapp typecheck/lint 与 `git diff --check`；将 red/green 及浏览器复测要求写入 `acceptance.md`。全量 lint 已执行，但仍被本次范围外的 fixture 格式错误阻断；本次两个文件的定向 lint 通过。

---

## Phase 6.3: Static Reader Has No Follow Queue

**Purpose**: 将 pending history entry、streaming output 与 completed static reader 作为互斥业务状态；静态会话不得因测量、Composer 或流式结束残留而自动回底。

- [x] T052 [US2] 在 `apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx` 先写失败回归：静态且 `atBottom=true` 的 `totalListHeightChanged` 不得排队；static Composer resize 不得发命令；流式结束前尚未执行的 64ms follow 必须被取消。
- [x] T053 [US2] 在 `apps/webapp/components/instamind/use-chat-scroll-policy.ts` 让 follow scheduler、total-height 与 Composer 路径只在 streaming output 运行；保留 pending entry retry、manual return 与 new-turn reset 的既有 handle 命令，不增加 raw scroll metrics 或新状态 store。
- [x] T054 [US2] Scroll Policy 定向 Vitest 25/25、webapp typecheck、lint（0 error）与 `git diff --check` 通过；用户确认“1000条测试数据”静态轻微上滚后无回跳。

---

## Phase 6.4: Static Long-Conversation Geometry Remediation

**Purpose**: 在不改变 static Scroll Policy、滚动 owner、buffer 或免费 Virtuoso 依赖的前提下，降低离屏异构卡片挂载与图片状态转换带来的总高度校正。

- [x] T055 [P] [US1] 在 `image-result-part.test.tsx` 与 `chat-message-list.test.tsx` 先写失败回归：图片 loading/ready/expired/error 都有比例预览和 Footer；1,000 条 mixed fixture 的 `heightEstimates` 与消息等长、类型有差异、图片宽高会影响估值。
- [x] T056 [US1] 在 `image-result-part.tsx` 保持图片卡 Header + 比例预览 + 等高 Footer；在 `chat-message-list.tsx` 的既有单次正向 message 遍历中生成 structured `heightEstimates`，仅以 `customScrollParent` 宽度重算响应式图片估值；不新增滚动读写或 policy command。
- [x] T057 [US1] 运行图片组件、ChatMessageList、Scroll Policy 定向 Vitest、webapp typecheck、定向 lint 与 `git diff --check`；将自动化结果写入 `acceptance.md`。图片/list 2 files / 21 tests、policy 1 file / 25 tests、typecheck 与 diff check 均通过；定向 lint 0 error，保留 `image-result-part.tsx` 两个既有 warning。
- [x] T058 [US1] 用户确认真实 Chrome 桌面和 `324×534` 的“1000条测试数据”在尾部与混合区轻微上滚、图片缓存、详情、刷新和拖拽均无向更新消息方向的回跳。D027 使固定次数、时序样本与 DOM 峰值成为诊断信息。

### Phase 6.4.1: CLS Scroll-time Attribution

**Purpose**: 在继续改动动态高度实现前，区分 Virtuoso measurement 校正、流式 tail 增高与非预期业务滚动，避免以 CSS 或 Scroll Policy 掩盖 CLS。

- [x] T072 [US1] 在真实 Chrome 的 1,000 条 fixture 执行静态滚动几何采样；记录 range、`scrollHeight`、锚点和 0/250/500ms 稳定性。证据表明跨入离屏异构 item 时总高度会立即校正，详见 `acceptance.md` 的 “CLS Scroll-time Attribution”。
- [x] T073 [US1] 在同一 Chrome DevTools `PerformanceObserver` 记录静态轻微滚动 / 跨段区域的 Layout Shift source；63 条 `hadRecentInput=false` 样本显示多次 `+85.59375px → -85.59375px` 的可见 item 成对平移，归因收敛至 Virtuoso size tree / spacer 的双提交，而非静态 Scroll Policy。后续单变量 A/B 证明 `overflow-anchor:none` 仍会产生 CLS，而移除 `heightEstimates` 会令初始总高度失真，详见 `acceptance.md` 的 “Static A/B attribution”。
- [x] T074 [US2] 用户确认真实普通文本流式输出在底部跟随、主动离底阅读两种行为均通过。Layout Shift/range/height/token 对齐保留为可选诊断，不将静态结论外推到流式。
- [x] T075 [US1] 先写失败回归：排除“1000条测试数据”fixture 后，按有效 snapshot message count / lastActiveAt / id 稳定选择真实样本；本地标记只更新目标 index/snapshot title 和 revision，不修改 messages 或其他会话。该回归现由 `apps/webapp/tests/lib/dev/message-virtualization/session-preparation.test.ts` 维护。
- [x] T076 [US1] 扩展既有 development-only seed page：`target=real` 并行读取 local snapshots、选择并本地标记“最长真实会话”、先显示无正文的聚合摘要再由用户进入聊天页；默认 fixture seed 路径保持不变，不写服务端标题、正文或生产 Runtime 状态。该页面后续由 T093–T096 迁移至 `/dev/message-virtualization`。
- [x] T077 [US1] 用户确认“1000条测试数据”与“最长真实会话”的轻微上滚、拖拽、刷新与已展开内容回归通过；正文未进入日志或 acceptance。DOM peak 与固定次数记录按 D027 不再阻塞收口。

### Phase 6.4.2: Estimate Calibration After CLS Attribution

**Purpose**: 用真实的已渲染几何缩小离屏 item 首次 measurement 的误差，不改变 static Scroll Policy、滚动 owner、buffer、`followOutput` 或免费 Virtuoso 依赖。

- [x] T078 [US1] 对“1000条测试数据”和“最长真实会话”执行临时、无正文的 item 实测/estimate 采样；覆盖 reasoning + text、Skill + Prompt、Agent、图片、Tool、Resource、Workflow 及最长真实 Markdown，并在结束前移除诊断标记。
- [x] T079 [US1] 先补失败回归，再在 `chat-message-list.tsx` 将文本估算拆为 prose、heading、list、fenced code、Markdown table，并为 Tool、Resource、Prompt、Agent、图片加入稳定 card chrome；助手内容容器建立 block formatting context，避免 part margin 逃逸 item 测量。
- [x] T080 [US1] 运行双数据集 Chrome 回归：fixture 连续 5 次、真实会话连续 3 次轻微上滚均在输入后的 settle 位置稳定；误差样本和无 `skipAnimationFrameInResizeObserver` 的结论记录于 `acceptance.md`。该记录早于 D027；后续 T058/T077 的完整行为矩阵已由产品负责人确认通过，固定次数和 4x CPU 保留为非阻塞诊断。
- [x] T081 [US1] 以真实与 fixture 的 CLS 差异为输入，先在 `chat-message-list.test.tsx` 建立失败回归：隐藏的 reasoning / 非实际展示 workflow 不得进入估算；等长未换行 CJK prose 的估算必须大于 ASCII prose。
- [x] T082 [US1] 在既有单次 `MessageEntry` 正向遍历中把 `enableReasoning` 与前序 request composer 传入 `heightEstimates`；仅计入实际会展示的 reasoning/workflow，并以 CJK 宽字符单位修正文本换行估算；不增加生产诊断、持久化、scroll command 或 buffer。
- [x] T083 [US1] 重载真实 Chrome 后执行双数据集最小静态 smoke：fixture 尾部及“最长真实会话”连续轻微上滚均在 300ms settle 后不回跳；不将该 smoke 记为 T058/T077 的完整 CLS、移动端、拖拽、刷新、disclosure 或 4x 验收。

### Phase 6.4.3: Persisted Stable Height Hints

**Purpose**: 对已真实渲染过的 completed history 保存可失效的 per-message 高度提示，使刷新/切回/重新挂载时的 initial size tree 更接近真实几何；不保存 scroll state，不改善性宣称首次流式冷渲染。

- [x] T084 [US1] 在 `local-chat-persistence.test.ts` 先写 IndexedDB red：version 3 创建独立 `message-height-hints` store/index；valid record 可按 conversation/layout 读取；invalid、missing、quota/unavailable/blocked 降级；每会话只保留最新三个 layout variants；删除会话同步清理 hints、使在途旧写失效且允许同 ID 新 generation 重建，且不改 strict conversation snapshot。
- [x] T085 [US1] 在 `local-chat-persistence/schema.ts` 与 `store.ts` 实现 `LocalMessageHeightHintRecord`、DB v3 upgrade、`readLocalMessageHeightHints`、`writeLocalMessageHeightHints`、`deleteLocalMessageHeightHints`、blocked fallback、deletion generation 和三变体淘汰；记录只含 identity/signature/height/timestamp，不含正文、Blob、scrollTop 或服务端字段。
- [x] T086 [US1] 新建 `message-height-hints.test.ts` red，覆盖 exact CSS column width layout key、geometry version、reasoning/history-default presentation、render fingerprint、finite normalized height、completed-history eligibility，以及 message/width/fingerprint/presentation mismatch 必须 miss。
- [x] T087 [US1] 新建 `message-height-hints.ts` 的纯函数，并在 `chat-message-list.test.tsx` 建立 cache precedence red：有效 hint 替换对应 estimate，未命中项保持 D024 estimator，异步旧 width generation 与 500ms 后的迟到 read 均不得注入，hint read 完成前历史 Virtuoso 不建立 size tree，read unavailable/timeout 后可继续挂载。
- [x] T088 [US1] 在 `ChatMessageList` 接入 pre-mount hint read 与 per-index merge；scroll parent 已提交时以实际列宽初始化 generation。不得恢复 Virtuoso state/scrollTop，不改变 `initialTopMostItemIndex`、history readiness、Scroll Policy 或 empty state。
- [x] T089 [US1] 在 `chat-message-list.test.tsx` 与 disclosure tests 建立 capture red：`itemsRendered` 同尺寸稳定两次、non-scrolling、非 streaming、fonts ready、completed history/default disclosure 后才提交一次 batch；streaming、latest assistant、展开态、尺寸变化和 unmount generation 必须零写入/取消旧写入。
- [x] T090 [US1] 实现内存 candidate reducer、idle batch persistence 与 `MessageDisclosureProvider` 默认偏离上报；只消费 Virtuoso callback size，不新增 message `ResizeObserver`、同步 `getBoundingClientRect`、逐 token IDB write 或 Scroll Policy event。
- [x] T091 [US1] 运行定向 Vitest、local persistence tests、Scroll Policy 25 项回归、typecheck、lint 与 `git diff --check`；确认新增缓存代码不改变普通问答、120 条 snapshot trim、1,000 fixture seed、DOM 上限配置或免费 `react-virtuoso@4.18.12`。
- [x] T098 [US1] 高度提示的写入淘汰与会话清理均使用现有 `conversationId` index 查询，避免扫描其他会话的 hint records；定向回归证明保留三变体、删除隔离和 deletion generation 语义不变。
- [x] T092 [US1] 用户确认 fixture 与“最长真实会话”在固定桌面与 `324×534` 的 cold/warm 路径行为通过。CLS、item/total delta、hit rate、write count、DOM peak 与固定次数按 D027 为后续调优诊断，不作为缓存保留或版本收口门槛。

---

### Phase 6.4.4: Development Fixture Route Boundary

**Purpose**: 将一次性本地准备页从产品 `/instant-mind` 路由分离，消除版本缩写和 app-to-tests import，同时保留 Console 不可用时不挂载聊天 hydration/persistence 的验收入口。

- [x] T093 [US1] 先在新的 dev module 路径建立 red：mixed fixture snapshot 仍精确生成 1,000 条 completed、唯一 identity 的消息并重写图片 content path；真实样本选择继续只重标记 index/snapshot，不改 messages。
- [x] T094 [US1] 将 `v053-seed` 迁移为 development-only `/dev/message-virtualization`：页面继续 production `notFound()`、默认模式只写当前选中 `1000条测试数据` 的 deterministic mixed snapshot 后返回聊天页，`target=real` 保持先显示无正文摘要再交由用户返回；不得新增 API、聊天 Runtime、菜单入口或 production test mode。
- [x] T095 [US1] 将可执行 fixture/session helper 迁移到 `apps/webapp/lib/dev/message-virtualization/`，更新测试和 route imports；production app code 不得再从 `tests/fixtures/` 导入可执行 fixture，旧 `/instant-mind/v053-seed` 路径不保留 redirect。
- [x] T096 [US1] 同步 `spec/plan/tasks/data-model/contracts/decisions/quickstart/acceptance`：文档明确 DevTools 是完整 donor/backup/cleanup 路径，dev route 是确定性 mixed fixture/真实会话准备 fallback；历史证据保留旧 URL 事实并记录迁移说明。
- [x] T097 [US1] 运行 route/helper/chat-message-list 定向 Vitest、webapp typecheck/lint、`pnpm test:stable` 与 `git diff --check`；在既有开发服务器对 `/dev/message-virtualization` 的只读 HTTP smoke 返回 `200` 且渲染准备状态；production `notFound()` 继续由 server page 的环境门禁和 typecheck/lint 覆盖，未启动第二个 Next 实例以避免占用既有 `.next/dev/lock`，未读取或写入浏览器会话正文。

---

## Phase 6.5: External Scroll Parent and Gutter Refresh Remediation

**Purpose**: 消除刷新时 Composer 因 hydration 后 JS gutter state 产生的横向闪动，并在 Virtuoso 初始总高度收敛期间屏蔽可见 scrollbar thumb 形变；不改变 Scroll Policy 或物理滚动 owner。

- [x] T059 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：`ChatMessageList` 的所有首次 props 都必须携带已提交的 `scrollParent`，不得出现 `null` 后切换到真实 HTMLElement。
- [x] T060 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 保留 viewport callback-ref 后首次挂载非空列表，并用 `scrollbar-gutter: stable both-edges` 取代 JS gutter state、layout rAF 和 ResizeObserver；Composer 保持 `left-0 right-0`，禁止发送任何滚动命令。
- [x] T061 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：history entry bootstrap 时 viewport 隐藏原生 scrollbar，骨架存在且不是该 viewport 的子节点；reveal 后恢复滚动条并移除骨架。
- [x] T062 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 实现 `isHistoryLayoutBootstrapping`：保留 Virtuoso 挂载与 entry positioning，把骨架移到 `chat-layout` 的非滚动同级层，并仅在 bootstrap 时使用 `overflow-y-hidden`。
- [x] T064 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：Composer shell 不得拥有全宽 gradient；独立 gradient mask 必须受内容列宽度限制，避免覆盖右侧 native scrollbar gutter。
- [x] T065 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 将 Composer gradient 从全宽 shell 移到受限的装饰层，并让交互 Composer 列位于其上；不恢复 JS scrollbar-width 补偿。
- [x] T066 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：新会话 skeleton/history-entry positioning 期间，即使 Policy 仍报告 `showScrollToBottom=true`，也不得挂载“回到底部”按钮；history reveal 后恢复该入口。
- [x] T067 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 以 `isHistoryPresentationRevealed` 门控“回到底部”入口；不修改 Scroll Policy state、120px 阈值、按钮点击动作或 Virtuoso 命令。
- [x] T068 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：desktop history skeleton 必须使用 `--conversation-sidebar-width` 左边界，不能相对整页宽度居中。
- [x] T069 [US1] 在 `apps/webapp/components/instamind/instantmind-page.tsx` 为非滚动骨架层添加 desktop sidebar 左边界，保持移动端 `left-0`，不改变列表挂载和 history-entry 时序。
- [x] T070 [US1] 在 `apps/webapp/tests/app/instant-mind/page.test.ts` 先写失败回归：全高 Instant Mind `main` 必须提供 SSR `data-slot`，供 CSS 精确移除重复的根 document gutter。
- [x] T071 [US1] 在 `instantmind-page.tsx` 与 `app/globals.css` 对 Instant Mind 页面以 `html:has(main[data-slot='instant-mind-page'])` 覆写 root gutter 为 `auto`；保留消息视口 `stable both-edges` 与其他页面全局 stable gutter。
- [x] T063 [US1] 用户确认真实 Chrome 桌面与 `324×534` 刷新视觉回归通过：骨架居中、Composer/消息列无横向闪动、无 thumb 突变或白屏，且原生 scrollbar 在顶部/中段/末尾均可见和可拖拽。固定刷新次数与 4x CPU 观察按 D027 为非阻塞诊断。

---

## Phase 7: Verification, Analysis and Release Closing

- [x] T035 运行受影响的定向 Vitest、`pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint`、根 `pnpm test:stable` 与 `git diff --check`，将实际 counts 和 warning 写入 `acceptance.md`。
- [x] T036 运行 `speckit-analyze` 与 `speckit-converge`，修复 spec/plan/tasks/acceptance/decisions 与真实实现之间的 drift；确认 `.specify/feature.json` 和 managed AGENTS plan pointer 仍指向本目录。
- [x] T037 按 `ai-mind-step-audit` 对最终 Step 做阶段工程审计，处理 P0/P1 finding，并在 `acceptance.md` 给出是否允许 release closing 的判断。
- [x] T038 用户已授权本地 release closing 资产同步：根、webapp、desktop、project-assistant-service、stream-core 和 database package version 已 lockstep 为 `0.5.3`；README、公开 version / release / tasklist 与消息视口 architecture 已同步。数值诊断不阻塞本地收口，未创建 commit、tag 或 GitHub Release。
- [x] T099 使用独立 Docker PostgreSQL 完成迁移与 runtime schema setup，并以该隔离库执行 `pnpm test:integration`：database 2、webapp 30、desktop 20 tests 通过，Turbo 5/5 tasks 成功；测试清理不触及开发会话或浏览器 IndexedDB fixture。
- [ ] T039 在用户明确授权发布后，完成 release commit、tag 与 GitHub Release，并把远端 CI / release evidence 回写 `acceptance.md`。

## Dependencies & Execution Order

1. Phase 1 必须先建立 red baseline。
2. Phase 2 是阻塞基础；必须一次性消除旧物理滚动 owner，不能让旧 hook 与 Virtuoso 并存后进入下一 Step。
3. US1 依赖 Phase 2；US2 依赖 US1 的 callbacks/handle；US3 依赖 US1 的真实虚拟卸载。
4. Phase 6 依赖 US1–US3 自动化 checkpoint，通过真实浏览器校准而不改变产品边界。
5. T040–T042 的真实刷新白屏保护与自动化契约必须在 T038/T039 前完成。
6. T084–T091 完成后执行 T092；warm 仍只能使用同环境页面真实渲染产生的 hint，不得用 seed 预填伪造高度，但其数值为 D027 诊断。
7. Phase 7 在自动化与用户确认的浏览器行为通过后执行；4x CPU 与数值诊断不阻塞 release closing。

## Parallel Opportunities

- T002、T003、T004 修改不同测试文件，可并行准备。
- T011、T012、T013 可并行建立 US1 red tests。
- T017、T018、T019 可并行建立 US2 red tests。
- T024、T025 可并行建立 US3 red tests。
- T030 fixture 准备可在 US3 后期开始，但 T031–T033 必须等待全部 Story 集成稳定。

## Implementation Strategy

### MVP First

1. 完成 Phase 1–2，先保证 single scroll owner。
2. 完成 US1，得到所有非空消息的动态高度虚拟化和 tail-first history。
3. 停止并验证 US1；不要在基础滚动仍不稳定时迁移 disclosure。

### Incremental Delivery

1. US1：有界 DOM 与稳定历史浏览。
2. US2：流式/动态高度 Scroll Policy。
3. US3：重要 disclosure 状态连续性。
4. Browser acceptance：校准 buffers 并证明兼容性。

## Notes

- 每个新增断言必须先观察 red，再实施 green；不得只补实现后的 snapshot。
- `tasks.md` 的 checkbox 是开发记录，不替代 `acceptance.md` 证据。
- 每个 Step 只做该阶段最小改动；除 D025 明确允许的 per-message local height hints 外，不实现 pagination、完整 Virtuoso state/scroll-position persistence、自学习高度模型或全会话搜索。
- 任何对 package、scroll threshold、Footer 算法、buffer 或 disclosure 范围的改动都必须同步同一 canonical spec workspace。
