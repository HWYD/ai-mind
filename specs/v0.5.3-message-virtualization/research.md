# Research: Long Message Virtualization

**Date**: 2026-08-27

## Research Questions

1. ChatGPT、豆包等主流 AI 产品对长会话表现出的可复用交互原则是什么？
2. `react-virtuoso` 免费版、TanStack Virtual 和自研方案的学习成本与开发成本如何重新评估？
3. 免费版 `react-virtuoso` 是否覆盖 AI Mind 的动态高度、外部滚动容器、末尾定位和可观测状态需求？
4. 如何避免 Virtuoso 与现有手工滚动逻辑争夺控制权？

## Evidence Boundary for ChatGPT and Doubao

ChatGPT 与豆包网页端没有公开、权威的前端虚拟列表库和内部滚动算法说明；压缩后的 bundle、运行时 DOM 或某次黑盒观察都不足以证明其长期使用某个具体 library。因此本研究不声称“ChatGPT/豆包使用 React Virtuoso、TanStack Virtual 或某个自研算法”。

可作为产品体验对标的只是可观察原则：

- 对话区使用独立滚动视口，输入区保持可用；
- 首次进入历史优先展示最新上下文；
- 位于末尾时流式输出持续可见，主动上滑后不应反复抢回；
- 提供明确的返回最新内容入口；
- 富消息高度在渲染后仍可能变化，滚动策略必须尊重用户阅读锚点。

AI Mind 采用这些原则，但具体工程方案以项目源码、可验证的开源库契约和本版 acceptance 为事实来源。

## Option Re-evaluation

| Option                           | Learning cost                                                           | Development cost                                                                                                         | Dynamic-height responsibility                 | Scroll-policy integration                            | v0.5.3 assessment            |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Free `react-virtuoso`            | Low–Medium：主要学习声明式 props、callbacks 与 handle                   | Low–Medium：列表、测量、range、外部 scroll parent、Footer 已具备                                                         | 库内建测量与 size tree；AI Mind 处理业务事件  | 通过关闭 `followOutput`，AI Mind policy 单独决定命令 | **Recommended**              |
| TanStack Virtual                 | Medium：当前官方已提供 chat/end-anchor 指南，学习差距比早期评估明显缩小 | Medium–High：仍需自行组织 inner container、item positioning、measureElement、scroll margin、range markup 与更多边界 glue | 提供强大 primitives，但消费方承担更多组合代码 | 灵活度最高，也更容易把测量与业务策略写在同一 hook    | Viable, but not fastest path |
| Self-built                       | High                                                                    | High–Very High：需要维护 size index、二分查找、anchor correction、ResizeObserver、overscan、浏览器差异与测试基建         | 全部由 AI Mind 负责                           | 完全可控，但双滚动算法与回归风险最大                 | Rejected for v0.5.3          |
| Commercial Virtuoso Message List | Low                                                                     | Low                                                                                                                      | 面向 chat 的高级抽象                          | 内建更多消息列表行为                                 | Explicitly excluded          |

### Updated cost conclusion

TanStack Virtual 的现行官方能力已经包括 dynamic `measureElement`、stable item key、end anchoring、chat guide、`scrollToEnd` 与 end-distance helpers；因此不再把它评价为“能力不足”或“极高学习成本”。但它仍是 headless primitives：AI Mind 需要自己维护虚拟容器高度、行定位、测量 ref、scroll margin、range markup 和更多浏览器滚动胶水。

参考：[TanStack Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)、[TanStack Virtual Chat guide](https://tanstack.com/virtual/latest/docs/chat)。

`react-virtuoso` 对当前目标更务实：它直接提供列表组件、动态测量、`customScrollParent`、stable key、初始末尾 index、Footer、range/bottom/height/scrolling callbacks 和 imperative `scrollToIndex`。团队学习重点可集中在少量受控配置与 ownership contract，而不是实现虚拟列表布局。因此在“尽快稳定做出来”的目标下，Virtuoso 的学习成本和开发成本均比 TanStack 低一个等级。

## Free React Virtuoso Capability Check

截至 2026-08-27，官方仓库中的 `react-virtuoso` package 为 `4.18.12`、MIT license，peer dependency 覆盖 React 19。所需能力均位于免费 `react-virtuoso`：

| Requirement             | Free API                                        | Use in AI Mind                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Variable/dynamic height | automatic item measurement / `itemSize` default | 让 Markdown、图片和卡片真实高度替换测量值       |
| Existing viewport       | `customScrollParent`                            | 保留 v0.5.2 全高 message viewport               |
| Stable identity         | `computeItemKey`                                | 使用 `message.id`                               |
| Start at tail           | `initialTopMostItemIndex`                       | 历史隐藏布局从最后一项开始                      |
| Short list at bottom    | `alignToBottom`                                 | 保持短会话尾部语义                              |
| Bottom state            | `atBottomStateChange` + `atBottomThreshold`     | 驱动业务 follow/button 状态                     |
| Dynamic total height    | `totalListHeightChanged`                        | 通知 Scroll Policy，末尾跟随时合并到底命令      |
| Visible range           | `rangeChanged`                                  | 首次揭示 readiness、短/长距离到底选择、DOM 验收 |
| Scrolling state         | `isScrolling`                                   | 区分用户拖动时机与布局静止                      |
| Safe-area spacer        | `components.Footer` + `context`                 | Composer 实际高度 + 54px 进入总列表高度         |
| Imperative positioning  | `VirtuosoHandle.scrollToIndex`                  | 唯一实际滚动命令                                |
| Render buffer           | `increaseViewportBy` / `minOverscanItemCount`   | 防止快速滚动白屏且保持节点上限                  |

参考：

- [React Virtuoso API](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)
- [React Virtuoso dynamic list overview](https://virtuoso.dev/react-virtuoso/)
- [React Virtuoso troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting/)
- [Scroll to Index](https://virtuoso.dev/react-virtuoso/virtuoso/scroll-to-index/)
- [react-virtuoso package metadata](https://raw.githubusercontent.com/petyosi/react-virtuoso/main/packages/react-virtuoso/package.json)

商业 `VirtuosoMessageList` 需要 license wrapper/key，生产环境没有有效 license 会报错；它不属于本版依赖范围。参考 [Virtuoso Message List licensing](https://virtuoso.dev/message-list/licensing/)。

## Decision: One Physical Scroll Owner

### Chosen

`Virtuoso` 负责所有物理滚动、尺寸树和虚拟窗口；`useChatScrollPolicy` 只接收语义事件并调用 adapter 的 `scrollToEnd(behavior)`。

### Required removals

- 删除所有消息定位用途的 `scrollTop` / `scrollHeight` 读取与写入。
- 删除 `getDistanceFromBottom`、`getBottomScrollTop` 和手工 180ms rAF 动画。
- 删除消息内容根节点的 `ResizeObserver`；动态 item 高度交给 Virtuoso。
- 禁用 `followOutput`，避免库内自动跟随和业务 policy 同时发命令。
- 不调用 `window.scrollTo`，不提供 document fallback。

### Kept business semantics

- 当前轮用户主动上滑后锁定自动跟随。
- 点击“回到底部”或开始下一轮恢复跟随。
- 64ms 流式命令合并，避免 token 级重复到底。
- Composer 真实高度与 54px 额外安全区。
- 历史会话隐藏到末尾 readiness 完成后揭示。

## Dynamic Height and Layout Findings

Virtuoso 通过 `ResizeObserver` 测量 item，垂直 margin 不包含在 `contentRect` 中，会导致总高度偏小和到底失败。消息 row 的间距必须放在 Virtuoso item wrapper 的 padding；消息内部可继续使用自身布局，但 item 根不得依赖折叠/逃逸 margin。零高度 item 也必须避免。

图片、异步 Markdown/代码高亮、Tool/Resource/Skill 卡片和 disclosure 展开会让同一 item 改高。`totalListHeightChanged` 是通知业务 policy 的信号，不是第二个测量系统。后续真实 Chrome 证据已经支持 D020/D023/D024 的结构化 `heightEstimates`，并进一步支持 D025 的 per-message stable warm hint；两者都只改善 initial size tree，真实 measurement 仍为最终事实。

官方同时提醒跨大量 item 的 smooth scroll 会伤害性能并可能与加载/测量冲突。因此只有用户手动点击且距离列表末尾不超过 5 个 index 时使用 `smooth`；历史定位、流式跟随、布局校正和远距离返回全部使用 `auto`。

## Initial Render Buffer

选择 `increaseViewportBy={{ top: 600, bottom: 400 }}` 与 `minOverscanItemCount={{ top: 2, bottom: 2 }}` 作为可验证起点：

- 向上缓冲略大，适配聊天用户常见的回看方向；
- item 数下限覆盖极高/极矮混合内容时仅像素缓冲不足的情况；
- 不是不可调整的产品常量，最终以“20 次快速跨段滚动无空白 + 消息根节点 ≤50”双重门槛决定。

## Risks and Mitigations

| Risk                                                         | Mitigation                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing outer content before the list changes scroll offset | 通过 `customScrollParent` 的真实浏览器验证覆盖 mobile selector、alerts、skeleton/ready 切换；不假设 list 从 scroll parent 顶部开始                                           |
| Footer or margin produces incorrect end                      | Footer 进入 Virtuoso context；item 根使用 padding；用真实 Composer 多行/收起变化验证                                                                                         |
| Library callback timing reveals history too early            | 使用 generation-scoped bottom/range/height/scrolling/Item lifecycle observation，并要求 tail range + tail mount + at-bottom + non-scrolling 连续双帧稳定；旧 sequence 可取消 |
| Local component state is lost on recycle                     | 仅将重要 disclosure 提升到 message-list provider，瞬态状态允许重置                                                                                                           |
| Tests over-mock geometry                                     | jsdom 只验证 contract/policy；1,000 items、真实 ResizeObserver 和滚动表现必须做 Chrome acceptance                                                                            |
| Dependency drifts into commercial package                    | package manifest、lockfile 和测试只允许 `react-virtuoso`；验收显式检查无 `@virtuoso.dev/message-list`                                                                        |
| Native find/accessibility behavior regresses                 | 在 spec 与 acceptance 中公开虚拟化边界，并确保可见区域、滚动 region 与交互控件仍具语义                                                                                       |

## Decision Outcome

采用免费 `react-virtuoso@4.18.12`。TanStack Virtual 保留为未来需要更深度 headless 控制时的备选；自研和商业 Message List 均不进入 v0.5.3。

## Persisted Measurement Pattern Research

公开资料没有披露 ChatGPT、豆包聊天页是否把 per-message height 写入本地数据库，因此不能把不可验证的商业产品内部实现当作事实。可验证的主流库/聊天 SDK 均采用“estimate + rendered measurement/cache”模式：

- 免费 React Virtuoso 的 `StateSnapshot` 明确包含 measured size ranges 和 `scrollTop`，用于相同 data/totalCount 的恢复；AI Mind 会发生追加、删除和重新生成，且历史默认进入末尾，所以 D025 不恢复完整 snapshot，只消费公共 `itemsRendered.size`。
- TanStack Virtual 对未测 item 使用 `estimateSize`，测量后由 cached size 取代，说明复用真实尺寸是成熟 virtualizer 的标准模式；它同时警告不能让手工 size 与动态 measurement 争夺同一 item。
- Stream Chat 的 `VirtualizedMessageList` 公开说明不准确的默认高度会导致 scrollbar/scroll jump，并建议用代表性高度减少 recalculation。AI Mind 的消息异构度更高，因此采用 per-message exact-match hint，而非单一 default height。

参考：

- [Virtuoso StateSnapshot](https://virtuoso.dev/react-virtuoso/api-reference/common/)
- [Virtuoso getState](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)
- [TanStack Virtualizer measurement cache](https://tanstack.com/virtual/latest/docs/api/virtualizer)
- [Stream Chat VirtualizedMessageList](https://getstream.io/chat/docs/sdk/react/components/core-components/virtualized-list/)

D025 的关键差异是缓存只作为本地、可失效的 initial hint：key 使用精确 message column width 和 UI geometry version；streaming、latest assistant、非默认 disclosure 不写；cache miss 无条件回退结构化 estimator；不保存正文、scroll position 或跨设备状态。
