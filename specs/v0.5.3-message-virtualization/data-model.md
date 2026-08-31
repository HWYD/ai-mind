# Data Model: Long Message Virtualization

本版本不新增数据库实体、API DTO 或 stream chunk。以下模型均为 webapp 页面生命周期内的 UI 状态，用于明确所有权与状态转换。

## MessageEntry

Virtuoso 消费的线性消息条目。

| Field             | Type                               | Meaning                                         |
| ----------------- | ---------------------------------- | ----------------------------------------------- |
| `message`         | `MindMessage`                      | 现有完整消息对象                                |
| `requestComposer` | `ChatComposerPayload \| undefined` | assistant 消息对应的最近一条 user composer 快照 |

### Invariants

- 顺序必须与 `messages` 完全一致。
- key 必须来自 `message.id`，不能使用数组 index。
- 通过一次正向遍历构建；遇到 user 消息时更新 `latestUserComposer`，遇到 assistant 消息时读取该快照。
- 不复制或改写 message parts，不形成第二份消息事实源。

## ScrollPolicyState

AI Mind 业务 Scroll Policy 的最小可见状态；高频、中间态值优先保存在 ref 中，只把影响 UI 的派生值放入 React state。

| Field                           | Type                                                | Lifetime                | Meaning                                                                                                                         |
| ------------------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `followMode`                    | `'following' \| 'locked-for-turn'`                  | current request turn    | 是否允许内容增长触发到底命令                                                                                                    |
| `atBottom`                      | `boolean`                                           | current list            | Virtuoso 按 120px threshold 报告的末尾状态                                                                                      |
| `showScrollToBottom`            | `boolean`                                           | derived UI state        | 通常为 `!atBottom`，供按钮展示                                                                                                  |
| `visibleRange`                  | `{ startIndex: number; endIndex: number } \| null`  | current list            | 最近一次 Virtuoso range，用于 readiness 和手动返回行为选择                                                                      |
| `isListScrolling`               | `boolean`                                           | transient ref           | Virtuoso 是否正在滚动                                                                                                           |
| `isStreamingOutput`             | `boolean`                                           | current request turn    | 当前是否 submitted/streaming                                                                                                    |
| `programmaticCommandPending`    | `boolean`                                           | transient ref           | 当前滚动是否由 policy 已批准的 handle 命令触发                                                                                  |
| `entryTarget`                   | `ConversationEntryTarget \| null`                   | current navigation      | 当前等待首次末尾揭示的会话 generation                                                                                           |
| `entryObservationsByGeneration` | `Map<generationKey, ConversationEntryObservations>` | conversation transition | 按 `conversationId + sequence` 保存 bottom/range/scrolling 与当前 mounted item indexes，供 position 前后的同代 observation 协调 |

### State transitions

| Event                                 | Precondition                   | Transition                                                          | Scroll command                                        |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------- |
| new turn starts                       | any                            | `followMode = following`                                            | `auto` to end                                         |
| stream content / total height changes | following                      | state unchanged                                                     | coalesced `auto` to end                               |
| user upward intent                    | streaming                      | `followMode = locked-for-turn`                                      | none                                                  |
| user drags away from end              | streaming and not programmatic | `followMode = locked-for-turn`                                      | none                                                  |
| user clicks return-to-bottom          | locked or away from end        | `followMode = following`                                            | `smooth` only when within 5 indexes; otherwise `auto` |
| Composer height changes               | following and at bottom        | state unchanged                                                     | `auto` to end after Footer commit                     |
| Composer height changes               | reading history                | state unchanged                                                     | none                                                  |
| conversation changes                  | any                            | cancel pending entry/follow work and reset list-scoped observations | none until new entry target is ready                  |

## ConversationEntryTarget

| Field                | Type      | Meaning                                                                 |
| -------------------- | --------- | ----------------------------------------------------------------------- |
| `conversationId`     | `string`  | 目标历史会话                                                            |
| `sequence`           | `number`  | 同一会话 retry/再次进入也唯一的单调 generation                          |
| `lastMessageIndex`   | `number`  | 本次消息树最后一项 index                                                |
| `lastItemInRange`    | `boolean` | `rangeChanged.endIndex` 已覆盖最后一项                                  |
| `lastItemMounted`    | `boolean` | 自定义 Virtuoso Item 的 layout effect 已确认最后消息 DOM commit         |
| `atBottom`           | `boolean` | Virtuoso 已报告处于末尾                                                 |
| `isScrolling`        | `boolean` | Virtuoso 当前是否仍在滚动                                               |
| `readinessRevision`  | `number`  | 任一同代 readiness/height/mount 生命周期变化时递增，用于取消过期 reveal |
| `revealFramePending` | `boolean` | readiness 满足后等待连续两个 animation frame 确认                       |
| `retryFramePending`  | `boolean` | 未 ready 或 height 变化后等待下一 animation frame 合并 retry            |
| `retryForce`         | `boolean` | 已排 retry 是否被 height change 升级为必须执行                          |

## ConversationEntryObservations

| Field            | Type                                               | Meaning                                                   |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `conversationId` | `string`                                           | observation 所属历史会话                                  |
| `sequence`       | `number`                                           | observation 所属进入 generation                           |
| `atBottom`       | `boolean \| null`                                  | 同代 Virtuoso bottom observation                          |
| `visibleRange`   | `{ startIndex: number; endIndex: number } \| null` | 同代 Virtuoso range observation                           |
| `isScrolling`    | `boolean`                                          | 同代 Virtuoso scrolling observation                       |
| `itemIndices`    | `Set<number>`                                      | 当前实际挂载的同代 Item indexes；mount 添加，unmount 删除 |

### Readiness invariant

只有 Composer Footer inset 已在 position 启动前提交、`conversationId + sequence` 仍为当前目标，且 `lastItemInRange && lastItemMounted && atBottom && !isScrolling` 时才能排队 reveal。readiness revision 必须连续两个 animation frame 不变；任一新会话、hydration failure、height change、同代 observation 变化或末项 unmount 都会使旧 reveal 失效。`rangeChanged` 不得替代 Item DOM commit，旧 generation observation 不得写入当前 target。

## DisclosureState

页面内的重要消息展开状态。

```ts
type DisclosureStateKey = `${conversationId}:${messageId}:${partOrSlotKey}`
type DisclosureState = Record<DisclosureStateKey, boolean>
```

### Key construction

1. 会话：当前 `conversationId`；draft 使用明确 draft scope，晋升后由现有 conversation identity 重新建立 scope。
2. 消息：`message.id`。
3. 内容区：优先 `part.id`；没有时使用 `${part.type}:${partIndex}`；消息级固定区域使用 `delivery`、`resource-raw` 等稳定 slot。

### Included state

- Reasoning open/closed
- Agent Trace main details open/closed
- Agent Trace debug summary open/closed
- Workflow progress details open/closed
- Resource / raw / delivery native details open/closed

### Excluded state

- copy-success timer
- hover/focus decoration
- transient loading indicator
- image object URL/cache（继续由现有资源生命周期管理）

### Lifecycle and pruning

- 同一会话消息离屏/回屏：保留。
- 会话切换：新 scope 不读取旧 scope；Provider 可直接随列表 key 重建。
- 删除消息或替换 parts：根据当前有效 key 集合 prune。
- 页面刷新或关闭：不保证保留。
- 不进入 localStorage、数据库、API 或 ThreadState。

## VirtuosoViewportSnapshot

不持久化或恢复 Virtuoso `getState()` / `restoreStateFrom` snapshot。历史会话始终按产品规则进入最新内容，不恢复旧阅读位置；D025 只保存按 message identity 绑定的稳定高度提示，不保存 index-coupled ranges 或 `scrollTop`。

## DerivedMessageHeightEstimate

仅在 `ChatMessageList` 当前 render 的 `useMemo` 中存在的 derived array；它不是 `MindMessage` 字段，也不进入 localStorage、API 或 Virtuoso state snapshot。其每一项优先使用匹配的本地 `MessageHeightHintEntry`，未命中时使用结构化 estimator。

| Field                | Type       | Meaning                                                                                                                                                                                                                                                                      |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heightEstimates`    | `number[]` | 与当前 `MessageEntry[]` 一一对应的初始高度；有效暖缓存优先，否则文本按 prose / heading / list / fenced code / Markdown table 的结构与 CJK 宽字符估算，图片按已有宽高比与消息列宽，卡片按稳定 chrome 估算；只计入当前 `enableReasoning` 与 request composer 实际会展示的 part |
| `messageColumnWidth` | `number`   | 从现有 `customScrollParent` 宽度和现有列边距推导；仅宽度 ResizeObserver 可更新它                                                                                                                                                                                             |

### Invariants

- 每次 `messages` 或消息列宽变化时，在同一正向遍历内重建 entries 与 estimates，长度始终相同，保持 O(n)。
- estimates 只降低未挂载或刚挂载 item 的初始总高度误差；助手消息内容通过 block formatting context 将 part 的纵向 margin 包含在 item 真实高度内。真实 DOM measurement 始终优先，不设置 `fixedItemHeight`、单一 `defaultItemHeight` 或恢复完整测量快照。
- 它不得读取 `scrollTop`、`scrollHeight` 或写任何滚动位置，也不产生 Scroll Policy command。

## LocalMessageHeightHintRecord

存放于 `ai-mind-local-chat` 的独立 `message-height-hints` object store；数据库版本由 `2` 升为 `3` 时只创建该 store 和 `conversationId` index，不迁移或改写既有 index/snapshot/image records。

| Field                | Type                       | Meaning                                                                                             |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `key`                | `string`                   | `conversationId + layoutKey` 的确定性复合 identity                                                  |
| `conversationId`     | `string`                   | 本地会话 identity；用于会话删除和变体淘汰                                                           |
| `layoutKey`          | `string`                   | `geometryVersion + exact messageColumnWidth + enableReasoning + history-default presentation`       |
| `geometryVersion`    | `number`                   | 手工递增的消息 UI 几何版本；字体、行高、item padding 或 card chrome 改变时失效                      |
| `messageColumnWidth` | `number`                   | 实际消息内容列宽，单位为 CSS px；不使用物理屏幕宽高或 DPR                                           |
| `entries`            | `MessageHeightHintEntry[]` | 当前 layout variant 下已稳定测量的消息提示；fixture 可到 1,000，正式 snapshot 通常受 120 条上限约束 |
| `updatedAt`          | ISO datetime               | 用于 LRU/变体清理，不作为消息事实                                                                   |

### MessageHeightHintEntry

| Field               | Type                | Meaning                                                                            |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `messageId`         | `string`            | 与 Virtuoso stable key 相同的消息 identity                                         |
| `renderFingerprint` | `string`            | 只由 render-relevant part/content/status/composer 条件派生的本地摘要；不得保存正文 |
| `presentation`      | `'history-default'` | 第一版只接受 completed history 与默认 disclosure                                   |
| `height`            | `number`            | Virtuoso `itemsRendered` 最终稳定 size，按 0.25 CSS px 归一化并限制为有限正数      |
| `measuredAt`        | ISO datetime        | 诊断和淘汰时间，不上传                                                             |

### Invariants

- cache miss、invalid、quota、unavailable、IndexedDB blocked、500ms read budget 到期或任意签名不匹配必须静默回退结构化 estimator；缓存不是 correctness dependency，迟到读取结果不得注入已挂载的 generation。
- `itemsRendered` 候选只保存在内存；同一 message/size 至少连续稳定两次，并在 `isScrolling=false`、非 streaming、`document.fonts.ready`、默认 disclosure 后才允许一次 idle batch write。
- streaming/submitted 期间写事务为 0；最新 assistant、非默认 disclosure、size 为 0/非有限值或仍改变的 item 不得污染 `history-default` 记录。
- 每个会话最多保留三个 `layoutKey` 记录；删除/清理会话时同步删除其 height hints 并递增内存 deletion generation，使在途旧写入不能复活记录，但同 ID 的后续会话 generation 仍可重新预热。记录中不得出现正文、prompt、图片 Blob、Agent detail、scrollTop 或服务端字段。
- 初始渲染只使用在 Virtuoso 首次建立 size tree 前已完成读取的 hints；宽度 generation 改变时取消旧读取，避免异步结果注入错误布局。

## ChatViewportGeometry

只在 `InstantMindPage` 页面生命周期内存在的布局派生状态；它不属于消息、会话或滚动策略状态。

| Field                           | Type                     | Meaning                                                                                                                     |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `scrollViewportElement`         | `HTMLDivElement \| null` | 唯一 `chat-message-viewport` 的 callback-ref state；非空消息 Virtuoso 仅在其为非空时挂载                                    |
| `isHistoryLayoutBootstrapping`  | `boolean`                | `conversationHydrationPending \|\| shouldPositionHistoryEntry` 的页面派生值；只控制 viewport scrollbar 可见性和布局同级骨架 |
| `isHistoryPresentationRevealed` | `boolean`                | 当前历史已完成 hydration、尾部定位且未失败；控制“回到底部”入口是否允许挂载，不改变 Scroll Policy 状态                       |

### Invariants

- 外部视口以 CSS `scrollbar-gutter: stable both-edges` 解决原生 gutter；不得有 scrollbar-width React state、布局 rAF 或为 Composer 水平位置设置的 `ResizeObserver`。
- `main[data-slot='instant-mind-page']` 存在时，根 `html` gutter 为 `auto`；full-height chat 只保留外部消息视口的 gutter，保证其 right edge 等于窗口可用宽度。
- `isHistoryLayoutBootstrapping=true` 时视口仅隐藏原生 scrollbar，Virtuoso data、`customScrollParent` 与既有 history-entry command 保持可用；骨架必须在该视口外的 `chat-layout` 同级层，不能进入可滚动消息内容。
- 骨架层在 desktop 以 `--conversation-sidebar-width` 作为左边界，在移动端为 `0`；其内部内容列必须与 `chat-message-viewport` / Composer 内容列共享同一可用宽度。
- Composer gradient 是无状态的受限装饰层，最大宽度为消息内容列加水平留白；它不得覆盖右侧 native scrollbar gutter，也不承载 Composer 交互。
- `isHistoryPresentationRevealed=false` 时不得挂载“回到底部”入口，即使 Scroll Policy 尚持有上一会话的 `showScrollToBottom=true`；该派生值不读写 Policy 或物理滚动位置。
- 列表不得以 `scrollViewportElement=null` 先挂载，再在同一会话中切换到 `customScrollParent`。

## TestOnlyIndexedDbFixture

只在 Chrome DevTools Snippet 手动运行期间存在的浏览器本地验收数据；它复用既有 `ai-mind-local-chat` stores，不改变 schema、API 或正式会话持久化语义。

| Field               | Type                          | Meaning                                                                                                           |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `conversationId`    | fixed fixture-prefixed string | 仅测试会话的 snapshot/index identity                                                                              |
| `messages`          | `MindMessage[1000]`           | 由最大 local snapshot 循环复制并用 donor 补齐的 completed 消息                                                    |
| `fixtureImageRunId` | fixed fixture-prefixed string | 唯一复制 Blob 的 image cache key，所有 fixture image parts 复用它                                                 |
| `backup`            | localStorage JSON             | 仅由 DevTools seed 在写入前保存 conversation index、selected conversation 和 draft selection，供 cleanup 原样恢复 |

### Invariants

- preflight 必须先确认文本、已缓存 `image-result` 和 completed `agent-step` donor；任一缺失时不得写入任何 store 或 localStorage。
- 主样本必须贡献至少 90% 的消息；最终长度严格为 1,000。
- 所有 message / part identity 必须唯一；Agent run/thread/node identity 必须重写；image parts 只使用 fixture image run id。
- seed 后只读刷新，使页面以既有 local snapshot hydration 路径加载 fixture；不得发送或触发 Agent Runtime。`/dev/message-virtualization` 仅写确定性的 mixed snapshot 后跳回 `/instant-mind`，不建立 backup/image cache，production runtime 不可用。
- cleanup 只删除 fixture conversation snapshot、fixture image cache 和 backup key，并恢复原 index / selection / draft 状态。

## TestOnlyRealConversationTarget

仅在 development-only `/dev/message-virtualization?target=real` 的一次性本地回归准备中计算，并以本机 localStorage 的聚合摘要保存供手工验收引用；不是聊天 Runtime 状态，也不写入服务端。

| Field            | Type                     | Meaning                                                                                      |
| ---------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `conversationId` | `string`                 | 排除 fixture 后、来自有效 local snapshot 的最大真实会话 identity；后续回归以此 identity 为准 |
| `messageCount`   | `number`                 | 该 snapshot 的完整本地消息计数，只用于选择和验收记录                                         |
| `partTypeCounts` | `Record<string, number>` | 所有消息 part 的聚合类型计数；不得包含正文、message id、标题以外的内容字段                   |
| `localTitle`     | `'最长真实会话'`         | 仅写入本机 index/snapshot 的测试可辨识标签；server registry reconcile 可恢复服务端原标题     |

### Invariants

- 候选必须同时存在于有效 local index 与有效 local snapshot；标题为“1000条测试数据”的专用 fixture 不得作为真实样本候选。
- 最大消息数相同则按 `lastActiveAt` 倒序、再按 conversation id 升序稳定选择，保证同一 local state 可复现。
- 准备操作只更新目标 index/snapshot 的 title、revision 与 selected conversation id；不得修改 messages、image cache、draft、API、server title 或 schema。
- 测试报告与本机 localStorage summary 只保存 `conversationId` 的本地测试标签、messageCount、partTypeCounts 与浏览器几何观测；不得输出消息正文、图片 Blob、prompt 或 Agent detail 内容。
