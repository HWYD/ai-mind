# Contract: Chat Message Viewport

## Purpose

定义 v0.5.3 消息可视区、React Virtuoso adapter 与 AI Mind Scroll Policy 之间的内部契约。该契约不是网络 API，不修改 `@ai-mind/stream-core`。

## Dependency Contract

- 允许的 runtime dependency：`react-virtuoso@4.18.12`。
- 必须是免费 MIT package `react-virtuoso`。
- 禁止依赖 `@virtuoso.dev/message-list`、`VirtuosoMessageList`、license wrapper 或商业 license key。
- 依赖只加入 `apps/webapp/package.json` 及 workspace lockfile。

## Imperative Handle

```ts
export interface ChatMessageListHandle {
    scrollToEnd(behavior: 'auto' | 'smooth'): void
}
```

### Semantics

- `scrollToEnd` 必须委托 `VirtuosoHandle.scrollToIndex`，目标为 `'LAST'`、`align: 'end'`，并包含当前 Footer bottom inset。
- handle 不暴露 Virtuoso instance、像素 offset、DOM scroll metrics 或任意 item 定位能力。
- `auto` 用于历史进入、流式跟随、布局变化、下一轮恢复与远距离返回。
- `smooth` 只用于用户明确点击返回且当前 visible range 距最后一项不超过 5 个 index。
- `messages.length === 0` 时命令必须安全 no-op。

## Observation Contract

`ChatMessageList` 向 Scroll Policy 规范化以下事件：

```ts
interface ChatMessageListScrollEvents {
    onAtBottomChange(atBottom: boolean): void
    onItemMounted(itemIndex: number): void
    onItemUnmounted(itemIndex: number): void
    onRangeChange(range: { startIndex: number; endIndex: number }): void
    onTotalHeightChange(height: number): void
    onScrollingChange(isScrolling: boolean): void
}
```

- `onAtBottomChange` 来自 `atBottomStateChange`，threshold 为 120px。
- `onItemMounted` / `onItemUnmounted` 来自自定义 Virtuoso `Item` 的 layout effect 生命周期，只上报 `data-item-index`，不暴露 DOM node 或像素 metrics。
- `onRangeChange` 来自 `rangeChanged`，只提供 index range，不把库内部 item record 泄漏到业务层。
- `itemsRendered` 只在 `ChatMessageList` 内部向高度提示 controller 提交当前 item identity/index/size；它不得进入 Scroll Policy、不得触发滚动命令，也不得逐 callback 写 IndexedDB。
- `onTotalHeightChange` 来自 `totalListHeightChanged`，它是“布局已变”的通知，不授权 adapter 自行跟随。
- `onScrollingChange` 来自 `isScrolling`，与用户 wheel/touch/key intent 共同区分阅读行为。
- 回调可高频触发；Scroll Policy 必须通过稳定 callback/ref 消费，不能让整个页面按每个 scroll tick 重渲染。
- `InstantMindPage` 必须在把 bottom、range、height、scrolling、Item mount/unmount observation 交给 Scroll Policy 前绑定当前 `conversationId + historyEntryReady.sequence`。Scroll Policy 必须按 generation 存储首次定位 observation；旧 generation 的延迟 observation 只能被忽略，不能修改当前 pending entry、触发 retry 或移动当前列表。

## Configuration Contract

| Prop                      | Required value / rule                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`                    | 线性构建的 `MessageEntry[]`                                                                                                                                                                                                                                  |
| `heightEstimates`         | 与 `data` 等长；匹配的 completed history/default-presentation 本地 stable hint 优先，未命中项由当前可见 part、`enableReasoning`、request composer、Markdown 结构、CJK 宽字符、图片宽高和当前列宽导出；只用于 initial size tree，真实 item measurement 覆盖它 |
| `computeItemKey`          | `entry.message.id`                                                                                                                                                                                                                                           |
| `customScrollParent`      | v0.5.2 的唯一、已提交的 `chat-message-viewport` HTMLElement；非空列表不得先传空值再切换                                                                                                                                                                      |
| `followOutput`            | `false`                                                                                                                                                                                                                                                      |
| `initialTopMostItemIndex` | last item aligned to end for a newly mounted non-empty conversation                                                                                                                                                                                          |
| `alignToBottom`           | `true`                                                                                                                                                                                                                                                       |
| `atBottomThreshold`       | `120`                                                                                                                                                                                                                                                        |
| `increaseViewportBy`      | initial `{ top: 600, bottom: 400 }`                                                                                                                                                                                                                          |
| `minOverscanItemCount`    | initial `{ top: 2, bottom: 2 }`                                                                                                                                                                                                                              |
| `fixedItemHeight`         | 不设置                                                                                                                                                                                                                                                       |
| `defaultItemHeight`       | 不设置；不得以单一 probe 高度替代 heterogeneous estimates                                                                                                                                                                                                    |
| `Footer`                  | stable component with `composerOverlayInset + 54` height                                                                                                                                                                                                     |
| item spacing              | item wrapper padding; no vertical margin on measured root                                                                                                                                                                                                    |

初值只有在 acceptance 同时满足“快速滚动无空白”和“根节点 ≤50”时才可保留；若需调整，必须同步本 contract、plan、decisions 与 acceptance。

## Scroll Ownership Invariant

以下任一生产代码均构成 contract violation：

- 消息定位用途直接读取/写入 `scrollTop` 或 `scrollHeight`；
- 调用 `window.scrollTo` / `document` scroll fallback；
- 业务 hook 实现 rAF/timeout 像素动画；
- `followOutput` 为 `true` / `smooth` / callback，同时业务 policy 仍会发送到底命令；
- 对消息内容根增加第二个 `ResizeObserver` 并据此写滚动位置；
- 持久化/恢复 Virtuoso `scrollTop` 或把完整 `StateSnapshot` 用于会话历史进入；
- 在 streaming/submitted、scrolling 或非默认 disclosure 时写入 `history-default` 高度提示；
- 在 Virtuoso 之外自行 slice、绝对定位或回收非空消息列表。

允许保留的 DOM 几何读取仅限现有布局职责，例如测量 Composer 高度；这些值不得直接写消息 scroll position。native scrollbar gutter 必须由 CSS 处理，不能建立 hydration 后的宽度 state。

`InstantMindPage` 必须在 `chat-message-viewport` callback ref 已提交后才挂载非空 `ChatMessageList`。该视口使用 `scrollbar-gutter: stable both-edges`，固定 Composer 保持外层 `left: 0; right: 0`，不得读取 `offsetWidth - clientWidth`、用 `requestAnimationFrame` 重测 gutter 或以 `ResizeObserver` 更新 Composer 的水平 CSS variable。

全高 Instant Mind 页面不应再保留根文档的 stable gutter：`main[data-slot='instant-mind-page']` 必须在 SSR DOM 中存在，供全局 CSS 将 `html` gutter 覆盖为 `auto`。这只移除与页面自身 scrollbar 重复的外层空槽；`chat-message-viewport` 的 `stable both-edges` 不得删除。

Composer shell 不得以全宽不透明或渐变背景覆盖 `chat-message-viewport` 的右侧 gutter。若需要底部遮罩，必须使用受聊天内容列宽度限制的独立装饰层，交互 Composer 列置于其上；用户位于顶部、中段或末尾时都必须能够看到并拖拽 native scrollbar thumb。

“回到底部”入口属于当前历史 presentation 的交互，而不是跨会话持久 UI。当前会话仍在 hydration、history-entry positioning 或 hydration failure 时，它不得挂载，即使 Scroll Policy 异步观察尚保留前一会话的 `showScrollToBottom=true`；当前历史 reveal 后，该入口才重新遵循既有 Policy 的 120px 阈值、disabled 和 click 行为。

## History Entry Contract

历史会话揭示必须满足：

1. 当前消息 ownership 与 selected conversation 一致。
2. 当前 `historyEntryReady.sequence` 尚未消费或失效。
3. `scrollParent` 与当前 Composer Footer inset 已提交。
4. Virtuoso visible range 覆盖最后一项。
5. 自定义 Virtuoso Item 已在 layout commit 中上报最后消息 index。
6. Virtuoso 报告当前位于末尾。
7. Virtuoso 当前未报告 scrolling。
8. 同一 generation 的 readiness revision 在连续两个 animation frame 内保持不变后，页面才移除 `visibility: hidden`。

在 hydration 或上述定位尚未完成时，`chat-message-viewport` 可临时使用 `overflow-y-hidden` 屏蔽原生 scrollbar thumb 的初始尺寸收敛。若当前 conversation + width generation 需要读取 D025 height hints，骨架期间允许在本地读取完成前暂缓首次 Virtuoso mount；读取完成或降级后，列表必须以该 generation 的 estimates 一次挂载，并持续使用同一 `customScrollParent` 完成既有 history-entry command，不得再次卸载或改写滚动位置。`ConversationHydrationSkeleton` 必须作为 `chat-layout` 的非滚动同级绝对层显示。

该骨架层在 desktop 必须从 `--conversation-sidebar-width` 开始，右侧到聊天区域末端，并在其内部复用消息内容列的 max width；不能用整页 `inset-x-0` 作为最终水平边界。移动端 sidebar 不存在时保持 `left: 0`。

旧 generation 的 callback、height change 或 pending scroll command 不得揭示或移动新会话。

首次 `scrollToEnd('auto')` 不是完成证据。pending entry 期间如果 Virtuoso 报告 `atBottom=false`、visible range 未覆盖最后一项、最后 Item 未挂载/再次 unmount，或 total height 再次变化，Scroll Policy 必须合并到下一 animation frame 重发同一 Virtuoso 到底意图。height change 必须能把已排队的普通 retry 升级为 forced retry；forced command 后即使 Virtuoso 没有重复发出同值 observation，也必须从当前 readiness 重新启动双帧确认，不能永久隐藏。retry 只能调用 adapter handle，不得读取像素位置；entry 完成或 conversation cancel / 卸载后必须清理 retry rAF。

## Scroll Policy Contract

- Scroll Policy 决定是否发送命令；adapter 不根据新增 item 自行 follow。
- streaming follow 以 64ms 合并，不按 token 逐次调用；`isStreamingOutput=false` 时必须取消该类 pending follow。
- 用户主动向上阅读在当前 turn 内设置 lock，布局变化不得清除。wheel/touch/key 的显式向上意图必须在 `atBottom` 仍为 `true`（120px 阈值内）且非流式时同样取消已排 follow；不能等待 bottom callback 才承认用户阅读。
- manual return 与 next-turn reset 是清除 lock 的唯二产品动作。
- non-streaming static reader 不因 Composer、图片、Virtuoso `totalListHeightChanged` 或 disclosure 高度变化被强制到底；这些观察仅在 pending history entry 或 streaming output 状态可触发滚动命令。
- static reader 的图片 loading→ready/error/expired 必须保持同一 Card Header、比例预览区与 Footer 几何；助手 part 的既有纵向 margin 必须由其 block formatting context 包含在 item 测量内。估值和真实测量的差异允许由 Virtuoso 校正，但不得由业务 policy 发出向尾部的滚动命令。
- “回到底部”展示由 120px bottom state 驱动。

## Disclosure Contract

- 重要 disclosure state key 必须包含 conversation、message 与 part/slot identity。
- 受控组件必须继续提供现有 `aria-expanded` / `<details open>` 语义。
- 默认开闭状态不得因接入 provider 改变。
- 离屏往返保留；消息删除/part replacement 后 prune；会话间隔离。
- copy/hover 等瞬态 state 不得为了虚拟化被提升为持久状态。

## Compatibility Contract

不得改变：

- `MindMessage`、ThreadState、stream chunks 或 reducer；
- conversation hydration、local-first selection、read-only cache 与 retry；
- empty-state suggestions、follow-up questions、copy/feedback/delete/regenerate；
- full-height viewport、stable gutter、Composer column alignment、gradient mask 与 pointer pass-through；
- desktop/mobile/Electron routes and IPC。

## Test Contract

- 测试侧可以 mock `react-virtuoso` 并显式触发 observation callbacks；生产代码不得包含 test-only branch。
- jsdom 测试覆盖 ownership、policy transitions、stable keys、configuration 与 stale sequence cancellation。
- jsdom 必须覆盖图片 loading/ready/expired/error 的比例预览与预留 Footer，以及 1,000 条 mixed fixture 的 `heightEstimates.length === data.length`、part-type 差异和图片宽高估值。
- jsdom 必须覆盖 hint 精确命中优先于 estimator、width/fingerprint/geometry/presentation mismatch 回退、streaming 零写入、稳定两次后单 batch 写入、每会话三变体淘汰及会话 cleanup。
- jsdom 必须覆盖首次到底命令未生效、bottom/range ready 但最后 Item 尚未 commit、最后 Item 在 reveal 前 unmount、height change 升级 forced retry 且无重复 observation 时仍可完成、旧 generation 的 bottom/range/height/scrolling observation 被忽略、ready 后在 reveal frame 前回退，以及 cancel 后 retry 不得移动下一会话。
- 真实浏览器覆盖动态 `ResizeObserver`、1,000 items、快速滚动、DOM count 与移动触摸；4x CPU 首帧是可选性能诊断，不阻塞本版本收口。
- IndexedDB 真实页面验收默认通过 tests-side DevTools snippet 完成 donor preflight、fixture-prefixed records、backup 与 cleanup；开发服务器另有一次性 `/dev/message-virtualization` 页面作为 Console 不可用时的 deterministic mixed-fixture / real-session preparation fallback。dev route 不得声称完成 donor preflight、image cache 或 cleanup，但两条路径都必须以 local snapshot hydration 加载，且不得为测试改变正常写入的 120-message trim 与 pending `agent-interrupt` 排除规则。
- 真实 Chrome 回归必须在 fixture 之外运行一次 `target=real` 准备：从已有 local snapshot 中稳定选择最大真实会话、仅本地标记为“最长真实会话”，再验证真实结构。该准备不得引入生产测试模式、修改 Scroll Policy/Virtuoso 配置、写消息正文、写 server title 或把 fixture 当作真实样本。
- 真实 Chrome 必须为 fixture 与“最长真实会话”各执行 cold/warm 同宽度 A/B；warm 只允许使用页面真实渲染产生的 hint，不得由 seed 伪造高度。可记录 hit rate、CLS、最大 item/total-height delta、write count 和 DOM peak 用于后续调优；这些数值不作为本版本 release closing 门槛。
