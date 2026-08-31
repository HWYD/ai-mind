# Implementation Plan: Long Message Virtualization

**Branch**: `codex/v0.5.3-message-virtualization` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/v0.5.3-message-virtualization/spec.md`

## Summary

v0.5.3 将所有非空消息列表统一迁移到免费、MIT 许可的 `react-virtuoso@4.18.12`。Virtuoso 负责消息项动态测量、可视区范围、节点回收和所有实际滚动命令；AI Mind 只保留业务 Scroll Policy，并把 Virtuoso 已报告的稳定 completed-history size 保存为可失效的本地暖缓存，供同布局后续 initial estimates 使用。现有 `scrollTop` / `scrollHeight` 定位、手工 180ms 动画以及消息内容 `ResizeObserver` 跟随逻辑必须退出，避免两个控制者争夺同一滚动容器。

本版继续在客户端保留完整消息数组，不增加 cursor pagination、服务端窗口化或协议变更。v0.5.2 的全高消息视口、浮动 Composer、真实高度加 54px 安全区、稳定 scrollbar gutter 和历史隐藏揭示机制继续作为兼容基础；Virtuoso 使用该外层视口作为 `customScrollParent`，安全区改由列表 Footer 参与测量。

## Technical Context

**Language/Version**: TypeScript 5.x、React 19.2.4、Next.js 16.1.6

**Primary Dependencies**: `react-virtuoso@4.18.12`（MIT、免费版）；沿用现有 Tailwind CSS、shadcn/ui 与消息渲染组件。明确禁止引入商业 `@virtuoso.dev/message-list` / `VirtuosoMessageList`。

**Storage**: 服务端数据库和 API 不变；现有 `ai-mind-local-chat` IndexedDB 从 version 2 升为 3，新增独立、可丢弃的 `message-height-hints` store。重要展开状态仍只保存在当前页面生命周期内。

**Testing**: Vitest、Testing Library、jsdom；Chrome 桌面/移动视口手工验收。4x CPU slowdown 仅保留为后续性能诊断，不阻塞本版本收口。

**Target Platform**: 现代桌面/移动浏览器及现有 Electron desktop host。

**Project Type**: Turborepo 中的 Next.js web application，复用同一前端构建进入 Electron。

**Performance Goals**: 保持有界消息 DOM、快速滚动无空白/重叠/错误复用与 O(n) 消息预处理。DOM count、CLS、hint hit rate 与 cold/warm 降幅是诊断目标；本版本收口以自动化回归和产品负责人确认的真实浏览器行为通过为准，不设这些数值门槛。

**Constraints**: 动态高度不可预知；流式输出主要增长最后一项；底层滚动只能由 Virtuoso 执行；所有非空列表走同一路径；保留 120px 返回入口阈值与 Composer 高度 + 54px 安全区；不做分页。

**Scale/Scope**: `InstantMindPage` 消息区、`ChatMessageList`、滚动策略 hook、消息详情展开状态、本地高度提示 store 及其定向测试；不进入服务端数据库、API、stream-core、Agent Runtime 或 Electron IPC。

## Constitution Check

### Pre-design gate

| Principle / constraint                | Assessment                                                                                                   | Result |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Controlled Agent / Runtime boundaries | 纯前端展示优化，不改变 Agent、Tool、Skill、MCP 权限或运行态                                                  | Pass   |
| Stream compatibility                  | 消费现有 `MindMessage[]` 和状态，不修改 chunk、schema 或 reducer 契约                                        | Pass   |
| Minimal Abstraction                   | 只新增 Virtuoso adapter、disclosure provider 与一项有界 local height-hint cache；不引入通用虚拟列表/学习框架 | Pass   |
| Tests Before Broad Integration        | 先用可控 Virtuoso test double 固化 adapter / Scroll Policy 合约，再迁移页面和详情组件                        | Pass   |
| Public DTO safety                     | 不新增 public DTO 或网络输出；高度提示只进独立本地 UI cache，不进入消息/会话契约                             | Pass   |
| Version workspace continuity          | v0.5.2 已 release closing；`.specify/feature.json` 唯一指向本 `v0.5.3` canonical 工作区                      | Pass   |
| Documentation truth                   | spec、plan、research、contracts、tasks、acceptance 和 decisions 在同一目录维护                               | Pass   |

### Post-design re-check

| Design choice                 | Constitutional effect                                                        | Result |
| ----------------------------- | ---------------------------------------------------------------------------- | ------ |
| Free `react-virtuoso` adapter | 一项直接解决动态高度与节点回收的依赖，边界限定在 webapp 消息区               | Pass   |
| `useChatScrollPolicy`         | 承载已有业务规则并移除 DOM 位置算法，不形成第二个 virtualizer                | Pass   |
| Disclosure provider           | 仅解决虚拟卸载导致的真实状态丢失；不持久化、不全局化                         | Pass   |
| Per-message height hints      | 只保存 Virtuoso 已报告的稳定 size；签名失效即回退，不保存正文或 scroll state | Pass   |
| Full client message array     | 保持当前数据边界，分页另版处理，不预埋未使用协议                             | Pass   |
| Browser limitation disclosure | 明确离屏内容不参与原生 Ctrl+F / accessibility tree，不伪装为完整 DOM         | Pass   |

无需要例外说明的 Constitution violation。

## Architecture and Ownership

### Single-owner rule

| Concern                              | Owner                             | Allowed mechanisms                                                                    | Forbidden mechanisms                                             |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runtime item measurement / size tree | React Virtuoso                    | 内建 `ResizeObserver`、`itemsRendered` 与 size tree                                   | AI Mind 对消息内容重复测高                                       |
| Cross-mount warm height hints        | AI Mind local cache adapter       | 消费稳定 `itemsRendered.size`，按 message/layout signature best-effort 写 IndexedDB   | 保存/恢复 `scrollTop`、逐 token 写入、把 hint 当真实高度         |
| Visible range / overscan / recycling | React Virtuoso                    | `rangeChanged`、`increaseViewportBy`、`minOverscanItemCount`                          | 页面自行 slice 消息或绝对定位                                    |
| Physical scroll execution            | React Virtuoso adapter            | `VirtuosoHandle.scrollToIndex(...)`                                                   | 业务 hook 写 `scrollTop`、调用 `window.scrollTo`、自建 rAF tween |
| Follow / pause / restore decision    | `useChatScrollPolicy`             | 业务状态、用户意图事件、Virtuoso 回调                                                 | `followOutput` 内置策略与业务策略同时生效                        |
| History reveal coordination          | `InstantMindPage` + Scroll Policy | 会话 generation、hidden layout、bottom/range observation、Virtuoso Item layout commit | 可见后再纠正或按像素猜测高度                                     |
| Disclosure persistence               | Message disclosure provider       | 会话 + message + part key 的页面内状态                                                | 组件各自只存会随卸载丢失的本地状态                               |

### Component boundaries

```text
InstantMindPage
├── owns conversation-entry generation and visible/hidden presentation
├── owns existing full-height message viewport and Composer geometry
├── useChatScrollPolicy (business decisions only)
└── ChatMessageList
    ├── local height-hint controller (read/merge/stable batch only)
    ├── MessageDisclosureProvider
    └── Virtuoso adapter (measurement, range, recycling, scroll commands)
        └── ChatMessageItem (existing message renderer)
```

`ChatMessageList` 继续是消息渲染公开入口，并在 React 19 的 `ref` prop 上暴露最小命令契约：

```ts
export interface ChatMessageListHandle {
    scrollToEnd(behavior: 'auto' | 'smooth'): void
}
```

它不暴露 `scrollTop`、`scrollHeight` 或 Virtuoso 实例。`useChatScrollPolicy` 通过稳定 ref 调用这一命令，并接收 `atBottomStateChange`、`rangeChanged`、`totalListHeightChanged`、`isScrolling` 与自定义 Virtuoso Item layout commit 的规范化事件。

## Virtuoso Configuration

对所有 `messages.length > 0` 的消息树采用同一配置起点：

- `data={messageEntries}`，并用 `computeItemKey` 返回 `message.id`。
- `customScrollParent={scrollViewportElement}`，复用 v0.5.2 唯一的全高消息视口和 CSS `scrollbar-gutter: stable both-edges`；非空列表只在该 HTMLElement ref 已提交后首次挂载，禁止先以库默认 scroller 挂载再切换外部 parent。
- 全局 `html` 的 `scrollbar-gutter: stable` 继续服务普通文档页面；Instant Mind 的 SSR `main[data-slot='instant-mind-page']` 通过 CSS `:has()` 仅在本页将根 gutter 设为 `auto`。该页没有 document scroll，因此只保留消息视口的 stable gutter，避免双重预留使 scrollbar 离浏览器右边缘 15px。
- `initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}`，让首轮测量从末尾开始，不先构造顶部窗口。
- `alignToBottom`，短会话保持底部对齐。
- `followOutput={false}`，禁止 Virtuoso 内置跟随与 AI Mind Scroll Policy 并行决策。
- `atBottomThreshold={120}`，复用现有“回到底部”产品阈值；流式期的用户向上意图仍会立即锁定，即使尚未超过该阈值。
- `increaseViewportBy={{ top: 600, bottom: 400 }}` 与 `minOverscanItemCount={{ top: 2, bottom: 2 }}` 作为保守初值；以 1,000 条验收中的空白率和节点上限校准，但不得超过 50 个消息根节点。
- 不设置 `fixedItemHeight` 或单一 `defaultItemHeight`。`heightEstimates` 在同一次正向 `messageEntries` 构建中优先读取与 message/render/layout/presentation 全部匹配的本地稳定高度提示；未命中时才由现有 part 类型、当前 `enableReasoning`、request composer、图片宽高、当前消息列宽，以及 prose / heading / list / fenced code / Markdown table 结构导出。CJK 全角 prose 按更宽视觉单位估算，Tool、Resource、Prompt、Agent 和图片计入稳定 card chrome。item 挂载后仍由真实动态测量覆盖任何 hint/estimate。证据与边界见 D020、D023、D024、D025。
- 使用稳定、组件外定义的 `Item` / `Footer`，消息间距放在 item padding 中；助手消息内容建立独立 block formatting context，使 card 的既有纵向 margin 不能逃逸 Virtuoso 的 item 测量根。
- Footer 高度为 `composerOverlayInset + 54`，使安全区进入 Virtuoso 总高度；到底定位使用 `scrollToIndex({ index: 'LAST', align: 'end', offset: bottomInset, behavior })`。
- `InstantMindPage` 不维护 native scrollbar width 的 React state。`stable both-edges` 在外部视口两侧预留同等 gutter，固定 Composer 保持 `left: 0; right: 0` 的同一外层坐标轴；该 CSS 不依赖 hydration 后的布局测量，因此不会引入首帧 `0px → native width` 的横向闪动。
- `conversationHydrationPending || shouldPositionHistoryEntry` 时，外部视口切为 `overflow-y-hidden` 并显示 `chat-layout` 同级骨架。D025 的当前 conversation + width hint read 完成后，列表首次挂载并持续保留，让 Virtuoso 测量和执行既有 history-entry command；读取前不建立错误 generation 的 size tree。定位 reveal 完成后恢复 `overflow-y-auto` 并移除骨架，不改变 Scroll Policy。
- Composer 的渐变遮罩不是全宽 shell 的背景，而是内容列宽度加固定水平留白的绝对层；Composer 交互列以更高 stacking level 显示。这样保留底部阅读遮罩，同时不覆盖外部视口右侧的 native scrollbar，末尾 thumb 仍可见和拖拽。
- “回到底部”控制的挂载还必须受当前会话 presentation reveal 门控：hydration pending、history-entry positioning 或 hydration failure 时不渲染，避免上一会话的 `showScrollToBottom` 在 skeleton 中闪现；revealed 后才继续使用原有 Policy 状态与 120px 阈值。

## Scroll Policy

现有 `useChatAutoScroll` 更名并收敛为 `useChatScrollPolicy`：

1. 删除 `getDistanceFromBottom`、`getBottomScrollTop`、所有 `viewport.scrollTop = ...`、180ms 自定义动画、programmatic pixel flags 与 message-content `ResizeObserver`。
2. 保留 Composer `ResizeObserver`，但它只发布 `composerOverlayInset`；由 Virtuoso Footer 触发列表总高度变化。
3. 保留 64ms 流式批处理，但它只属于正在输出的状态。`contentSignal` 或 `totalListHeightChanged` 到来时，仅当 `isStreamingOutput=true` 且本轮未锁定时，才合并调用 `scrollToEnd('auto')`；流式结束时必须取消尚未执行的 follow timer。
4. 用户滚轮向上、触摸上滑、PageUp、Home、Shift+Space，或在非程序命令期间把列表从末尾拖离，立即设置本轮 lock；该显式阅读意图不依赖 `atBottom` 已越过 120px 阈值，也不依赖当前是否流式输出。它必须立即取消已排队的 follow，避免静态历史在动态测量后抢回视口；wheel/touch listeners 使用 passive 模式。
5. “回到底部”清除 lock。若 `rangeChanged.endIndex` 距最后一项不超过 5 个 index，可使用 `smooth`；更远距离使用 `auto`，避免跨大量未测项的长动画。
6. 新一轮发送、重新生成或恢复执行调用 `resetForNewTurn()` 清除上一轮 lock，并以 `auto` 对齐末尾。
7. 三态必须互斥处理：pending history entry 只使用 entry retry 定位尾部；streaming output 才允许内容、列表高度和 Composer 高度触发 follow；已完成的 static reader（既非 pending entry、也非 streaming）不得因 `atBottom`、列表测量、图片/详情或 Composer 高度变化发送任何 `scrollToEnd`。static reader 只响应用户的滚动、显式“回到底部”及下一轮请求。

## Dynamic Height Flow

```text
initial `heightEstimates`
  -> matching local stable height hint when available
  -> otherwise part/text/image/current-width structural estimate
  -> Virtuoso builds a closer initial size tree
  -> mounted item real measurement replaces its estimate
Markdown / code / image / tool card / disclosure changes height
  -> image result keeps Header + proportional preview + Footer in every resource state
  -> Virtuoso measures affected item
  -> totalListHeightChanged(height)
  -> useChatScrollPolicy checks current-turn follow lock
       ├── following: coalesce 64ms -> ChatMessageListHandle.scrollToEnd('auto')
       └── reading history: no scroll command
  -> Virtuoso preserves measured range and executes any approved command
```

AI Mind 不再观察整个消息内容节点，也不根据 `scrollHeight` 计算增量。动态图片可由其既有加载生命周期自然触发 item measurement；loading、ready、expired 与 error 都保留同一张 Card 的 Header、按 `width / height`（或已有 aspect ratio）确定的图片区和 Footer，避免缓存命中后追加操作区造成 card 外层高度突变。`ChatMessageList` 只观察 `customScrollParent` 的宽度来重算图片估值，不读取或写入滚动位置。若实测发现某类异步资源未触发可靠测量，只允许在该资源边界通知 Virtuoso 重新测量，不恢复全局手工滚动算法。

## Measured Height Hint Warm Cache

### File boundaries

| File                                                                       | Responsibility                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apps/webapp/components/instamind/local-chat-persistence/schema.ts`        | 定义 `LocalMessageHeightHintRecord` / entry 的严格本地 schema 与 cache version                                        |
| `apps/webapp/components/instamind/local-chat-persistence/store.ts`         | IndexedDB version 3 upgrade、hint read/write、通过 `conversationId` index 完成每会话三变体淘汰和 conversation cleanup |
| `apps/webapp/components/chat/message-list/message-height-hints.ts`         | 纯函数：精确 `layoutKey`、render fingerprint、eligibility、hint merge 与稳定 candidate reducer                        |
| `apps/webapp/components/chat/message-list/chat-message-list.tsx`           | 在首次 Virtuoso size tree 前读取 hints；用 `itemsRendered` 收集候选并在 idle boundary 请求批量保存                    |
| `apps/webapp/components/chat/message-list/message-disclosure-provider.tsx` | 报告偏离默认值的 message identity，使 expanded/collapsed 用户态不会覆盖 `history-default` hint                        |

### Read flow

```text
committed scrollParent
  -> synchronously resolve exact messageColumnWidth in CSS px
  -> build layoutKey(geometryVersion, width, enableReasoning, history-default)
  -> read message-height-hints(conversationId, layoutKey)
       ├── valid/matching entries -> merge into per-index heightEstimates
       └── missing/invalid/unavailable、IndexedDB blocked 或 500ms read budget 到期 -> structural estimates only（迟到结果丢弃）
  -> mount Virtuoso once for this width generation
  -> existing history-entry positioning/reveal continues
```

高度 hint read 是 history bootstrap 的本地准备步骤，只在匹配 conversation + width generation 时生效。读取不得发网络请求；失败立即回退。为保证 hint 能参与 initial size tree，历史列表在该次本地读取完成前不挂载 Virtuoso，但继续显示现有非滚动 skeleton；读取完成后仍按原 bottom/range/tail-mounted/double-frame contract 定位和 reveal。宽度在读取期间改变时丢弃旧 generation 结果。

### Capture/write flow

```text
Virtuoso itemsRendered(items with index/data/size)
  -> keep eligible completed history/default-disclosure candidates in memory
  -> same message + size observed stable twice
  -> isScrolling=false AND status not submitted/streaming
  -> document.fonts.ready AND one idle batch boundary
  -> write one conversation/layout record
  -> keep max three layout variants for that conversation
```

不使用完整 `getState()` / `restoreStateFrom`，因为它把 measured ranges 与 index 和 `scrollTop` 绑定，消息追加/删除后不安全，也违反历史默认进入末尾的产品语义。缓存记录不保存正文；`renderFingerprint` 只用于失效。第一版仅写 `history-default`，最新 assistant、当前流式 item、非默认 disclosure 和尚未稳定的异步几何跳过。缓存命中后也只是 `heightEstimates` 的输入，Virtuoso real measurement 永远覆盖它。

### Failure and retention

- IndexedDB missing/invalid/quota/unavailable/blocked，或本次 height-hint read 超过 500ms：无 UI error，继续结构化 estimator；late read 不得在 Virtuoso 已挂载后替换初始 generation。
- message、width、reasoning、geometryVersion、fingerprint、presentation 任一变化：单项 miss，不复用近似值。
- 会话删除或 stale snapshot cleanup：通过 `conversationId` index 同步删除该 conversation 的 hint variants，并递增该会话的内存 deletion generation，使已在途的旧写入失效；同 ID 后续重新进入时可建立新的 generation。单独清理失败不阻断聊天。
- 每会话最多三种 layout variants；按 `updatedAt` 删除更旧记录。物理 screen height、DPR 和 scroll position 不进入 key。
- 清除全部 hints 后功能与冷启动行为必须和 D024 完全一致。

### A/B diagnostic check

在同一 Chrome、同一窗口/zoom/DevTools 状态、同一消息列宽下分别执行 cold 与 warm。fixture 固定回归 975–987 混合区；“最长真实会话”覆盖完整真实 part/Markdown 组合。可在相同滚动与拖拽路径下记录 CLS、最大 item delta、total height delta、hint hit rate、write transaction count 与 DOM peak，用于后续调优。D027 已将这些数值从本版本 release closing 门槛降为诊断信息：只要用户确认两条路径行为正确，缓存不改变 correctness/ownership 边界，即可保留实现；数值异常应建立后续优化项，不自动要求撤回 cache。

## Historical Entry Flow

```text
historyEntryReady { conversationId, sequence }
  -> mount target history invisible
  -> commit scroll parent + Composer footer inset
  -> Virtuoso starts from LAST and measures tail window
  -> policy issues scrollToEnd('auto')
  -> if bottom/range/height observations show not ready, coalesce another Virtuoso auto command
  -> last item is inside range AND atBottom is true AND last Item DOM committed for same sequence
  -> wait one requestAnimationFrame for committed measurement
  -> reveal target history
```

会话 A→B、retry 或卸载会使旧 sequence 失效；`InstantMindPage` 给 bottom、range、height、scrolling、Item mount/unmount observation 全部绑定 `conversationId + sequence`，旧代 observation 和旧 retry rAF 不得揭示或滚动新会话。首次定位不是一次性命令：pending entry 收到 `atBottom=false`、last item 不在 range、最后 Item 未挂载/再次 unmount 或 total height 变化时，必须合并到下一 animation frame 再通过同一 Virtuoso handle 发出 `auto` 到底意图；height change 能把已排普通 retry 升级为 forced，forced command 后从当前 readiness 自恢复 reveal，不依赖库重复发同值 callback。`rangeChanged` 只代表 Virtuoso 内部范围已计算，最后消息 Item 必须通过自定义 `Item` 的 layout effect 生命周期确认当前挂载。reveal 只在同代 bottom + tail range + tail mounted + non-scrolling 成立且 readiness revision 连续两个 animation frame 稳定后完成。历史定位、流式跟随、Composer 校正均使用 `auto`；首次可见前不使用 `smooth`，也不读取或写入像素位置。

## Message Preparation and Disclosure State

`ChatMessageList` 当前为每条 assistant 消息执行 `slice().reverse().find()` 查找最近 user composer，长会话会退化为 O(n²)。本版在一个 `useMemo` 的单次正向遍历中同时维护 `latestUserComposer` 并产生 `messageEntries`，保持 O(n)。

虚拟卸载会清空组件局部 state，因此新增仅限消息区的 disclosure provider：

- key：`conversationId + message.id + part.id`；没有 `part.id` 时使用稳定的 `part.type + partIndex`，固定的消息级 `<details>` 使用明确 slot 名。
- value：布尔展开状态；默认值仍由现有组件决定。
- 覆盖：Reasoning、Agent Trace 主详情/Debug、Workflow、Resource/Raw/Delivery 等原生 `<details>`。
- 不覆盖：copy success、hover、短时 loading 等瞬态反馈。
- 生命周期：会话切换时隔离；消息删除或 parts 被替换时 prune 不再有效的 key；不写 localStorage、API 或数据库。

Provider 是唯一知道状态存储方式的边界，子组件只通过 `useMessageDisclosureState(key, defaultOpen)` 读取和更新，避免跨层 prop drilling。更新频率低，且可见消息已受上限约束，不引入额外全局 store。

## Project Structure

### Documentation (this feature)

```text
specs/v0.5.3-message-virtualization/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── decisions.md
├── acceptance.md
├── contracts/
│   └── chat-message-viewport.md
├── checklists/
│   ├── requirements.md
│   └── performance-and-scroll-policy.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/webapp/
├── package.json
├── components/
│   ├── chat/message-list/
│   │   ├── chat-message-list.tsx
│   │   ├── message-disclosure-provider.tsx
│   │   ├── message-disclosure-state.tsx
│   │   ├── messages/assistant-message.tsx
│   │   └── parts/
│   │       ├── agent-trace-panel.tsx
│   │       ├── part-panels.tsx
│   │       ├── reasoning-panel.tsx
│   │       └── workflow-progress-panel.tsx
│   └── instamind/
│       ├── instantmind-page.tsx
│       └── use-chat-scroll-policy.ts
└── tests/
    ├── app/instant-mind/page.test.ts
    ├── components/
    │   ├── chat/message-list/chat-message-list.test.tsx
    │   └── instamind/use-chat-scroll-policy.test.tsx
    └── fixtures/
        ├── message-virtualization-harness.tsx
        ├── message-virtualization.html
        ├── message-virtualization.ts
        ├── message-virtualization-indexeddb-fixture.ts
        ├── message-virtualization-indexeddb-fixture.test.ts
        ├── message-virtualization-indexeddb-seed.devtools.js
        ├── message-virtualization-indexeddb-cleanup.devtools.js
        └── message-virtualization.vite.config.ts
```

**Structure Decision**: 保持现有 webapp 结构。Virtuoso adapter 直接收敛在 `ChatMessageList`，不新建通用虚拟列表包；只有跨多种消息 part 的 disclosure 状态形成独立模块。滚动 hook 原位更名，测试同步迁移。

## Real-page IndexedDB Acceptance Fixture

该验收层只服务本地 Chrome，不作为 production route 或开发模式。一个 tests-side pure builder 从 `conversation-snapshots` 选择消息数最多的 valid snapshot；它至少提供 90% 的复制消息。builder 再从所有 local snapshots 选择文本、已缓存 image result 与 completed `agent-step` donor，缺任一 donor 时抛出可读错误且不产生写入 payload。它精确构造 1,000 条 completed messages：message / part identity、Agent run/thread/node identity 均为 fixture-unique；图片 parts 复用一个 fixture image run id。

为在正常刷新下可复现，先通过正常页面创建并完成标题为“1000条测试数据”的 server-backed test conversation；完整 seed 只在 donor preflight/build 全部成功后，替换该已选会话的 IndexedDB snapshot、更新其 local index 标题并写入一份 fixture image cache Blob。它备份 index、selected conversation、draft localStorage 与被替换的原 snapshot。服务端 registry 因为已包含该会话，不会把其 local snapshot 当作 stale 删除；thread hydration 仍优先采用 valid local snapshot。通用路径是 DevTools Snippet。无法使用 Console 时，开发服务器提供独立 `/dev/message-virtualization` 一次性准备页，避免聊天页自身的 hydration persistence 在刷新前覆盖刚写入的 snapshot；它写入确定性的 mixed fixture snapshot，不承担 donor、image-cache、backup 或 cleanup 等完整 seed 职责。cleanup 只由 DevTools 工具恢复 backup snapshot/index/selection/draft 并删除 fixture image cache，不删除服务端测试会话。seed 后不在该会话继续 send/stream/Agent/HITL；延迟图片、持续流式增长和 Composer 变化继续由 standalone Vite harness 覆盖。

同一开发环境入口还提供 `target=real` 的只读真实样本准备：并行读取现有 index 所列 snapshot，排除“1000条测试数据”fixture，按消息数量（同数时按 `lastActiveAt`、再按 id）选择最大有效本地会话；只更新该会话的 local index/snapshot 标题为“最长真实会话”并选中它，不改写 messages、图片缓存、服务端标题或聊天 Runtime。完成后页面先显示 message count 与 part-type aggregate，再由用户点击进入聊天页；禁止记录或输出消息正文。该标题是本机测试标签，下一次成功的 server registry reconcile 可以恢复服务端原标题；回归身份以保存的 conversation id 为准。

## Verification Strategy

1. 先写失败测试：免费包依赖边界、稳定 item key、单次消息预处理、Virtuoso 配置、handle 只暴露到底命令。
2. 用测试侧 mock / fake Virtuoso 触发 `atBottomStateChange`、`rangeChanged`、`totalListHeightChanged`、`isScrolling`，验证 Scroll Policy，不向生产代码加入测试模式。
3. 回归历史 readiness / sequence、快速 A→B、Composer inset、空会话、推荐问题、消息操作和只读错误状态。
4. 运行定向 Vitest、`pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint`、根 `pnpm test:stable` 和 `git diff --check`。
5. 按 [quickstart.md](./quickstart.md) 在真实 Chrome 验收 1,000 条混合消息、动态高度、用户上滑、远距离返回与桌面/移动端历史首次揭示；4x CPU 仅作可选诊断。
6. 在真实 `/instant-mind` 页面使用 IndexedDB seed fixture 重复刷新、跨段滚动、图片和 completed Agent Trace/disclosure 验收；DOM 上限、CLS 与 4x CPU 数据可写入 acceptance 供后续调优，不构成本版本数值门槛。cleanup 按本机 fixture 保留需求执行。
7. 在同一 Chrome 先通过 `/dev/message-virtualization?target=real` 选中“最长真实会话”，再以其真实内容结构执行刷新、轻微向上阅读、滚动条拖拽与已展开内容往返；与 fixture 的结果分开记录。该步骤只读取消息结构/几何，禁止复制正文到日志、规格或测试产物。

### Development Fixture Route Boundary

`/dev/message-virtualization` 是与产品 `Instant Mind` 路由并列的 development-only 本地准备页，而非 `/instant-mind` 子页面。它只加载必要的 local persistence 与 deterministic fixture helper，不导入聊天页面、Provider、Stream 或 API；生产环境通过 `notFound()` 拒绝访问。可执行的 mixed fixture 与 session preparation helper 放在 `lib/dev/message-virtualization/`，避免 app code 从 `tests/fixtures/` 反向导入。该目录的源注释只记录“为何脱离聊天 hydration persistence”与“真实样本仅本地重标记”两条边界，具体操作步骤以本 quickstart 为唯一说明。

## Deferred Release-Closing Work

实现与验收完成后再执行 v0.5.3 lockstep package version、公开 version/release/tasklist、README 事实同步、release commit、tag 与 GitHub Release。本轮规格文档不提前修改 package version 或发布资产。
