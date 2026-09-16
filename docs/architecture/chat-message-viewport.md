# 聊天消息视口与滚动边界

## 定位

聊天消息区是一个独立的可视区渲染边界。完整消息序列属于会话展示数据，页面 DOM 只挂载当前可见范围及有限缓冲的消息项。

该边界适用于所有非空聊天会话，不按短列表或长列表切换两套物理滚动实现。

## 职责划分

| Layer                   | Responsibility                                                                  | Must not do                                            |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `react-virtuoso`        | 消息视口的物理滚动、可见范围、item 回收和真实 DOM 尺寸测量                      | 不承担 AI Mind 的业务跟随策略                          |
| ChatMessageList adapter | 将稳定消息 identity、结构化初始高度、footer inset 与业务 item 渲染交给 Virtuoso | 不读取或写入像素 `scrollTop` 来纠正列表                |
| Scroll Policy           | 决定历史进入定位、流式跟随、用户阅读锁定、显式返回底部与下一轮重置              | 不与 Virtuoso 并行实现 scroll animation 或 auto-follow |
| Message presentation    | 渲染文本、图片和执行过程卡片，管理有阅读意义的 disclosure 状态                  | 不把短暂 hover / copy 反馈持久化为会话状态             |

## Scroll Policy

用户意图与生成状态分离，持久保存在同一展示生命周期：

1. 历史进入先确认尾项 mount、range、bottom 和停止滚动，再揭示列表。
2. following 时，Virtuoso `totalListHeightChanged` 是流式增量后的主要测量完成信号；首个总高观测只建立当前展示代次基线，后续正向增长会在同一个事件驱动 rAF 内强制一次回底，不等待可能迟到的 `atBottom=false`。完成后的 Markdown/建议/图片、Footer 和 viewport 变化同样进入该路径，不使用完成时间窗口。content render 本身不再发出独立回底命令。
3. 用户上阅或手动展开进入 reading；布局、finish 和内容缩短不能恢复。接受的新轮次、到底按钮或用户实际向下回底恢复 following。
4. 回底按钮依据阅读意图显示，following 的短暂离底不使按钮反复出现。显式恢复时保留已有按钮至首次确认到底，此后增量和延迟布局保持隐藏；重新进入 reading 时结合当前位置更新。

固定 react-virtuoso@4.18.12 的 followOutput=false。它支持部分同项尺寸跟随，但不能承担完整阅读锁与延迟布局契约。list handle 缓存库总高，以公共 scrollTo({top: totalHeight, behavior: 'auto'}) 到底，避免 scrollToIndex 内部重试在上翻后抢回位置。所有交互统一 auto。

外部 viewport 关闭 overflow-anchor；浏览器锚定与 Virtuoso 补偿不能并行。移动会话导航位于 viewport 外并由 flex 布局占位；短暂操作反馈由根级 Messages Portal 固定在顶部；持续故障显示在会话列表、消息占位、Composer 或具体回复。它们都不进入 Virtuoso 几何，Header 默认留空。Footer 只计 Composer 实测 +54px 一次。策略不测量消息 DOM，仅在用户滚动事件中读取当前容器位置/底部距离以识别向下回底。

已有历史的新问题 send 在当前流式轮次使用 CSS reply runway：submitted/streaming 使用同一个 `TurnEntry`，其 assistant loading slot 从思考态到首个 assistant 内容始终保持同一个 `min-height`。runway 由 viewport 和已有 Footer `bottomInset` 派生，不读取回复高度；短回复由 CSS intrinsic sizing 填充这段空间，越过边界后继续由既有 Virtuoso measurement 与 following 策略接管。首问、regenerate、resume 和终态不使用 runway。

## Dynamic Height

初始高度由消息结构、内容类型与消息列宽度估算；真实 DOM measurement 始终具有最终裁决权。流式 assistant 在同一 message 生命周期内冻结启发式 estimate，避免 Markdown 语法逐步成形时初始 size-tree 反复跳变；Virtuoso 仍持续测量真实 DOM 并覆盖 estimate。图片状态必须保留一致的卡片几何，卡片估算需要包含固定 chrome 和内容区。

对已完成、稳定且默认展示的历史消息，可保存浏览器本地高度提示。流式期间不写入 hint；finish 后需经过稳定 render fingerprint、连续两次 item size、字体 ready、非 busy 和无 disclosure 偏差才可保存。提示必须同时匹配会话、消息 identity、渲染指纹、精确列宽、geometry version 和展示状态；不匹配、不可用或读取超时必须回退结构化估算，不能阻塞会话显示。

流式 text/reasoning 默认按 20ms 合并窗口，并在最近 `requestAnimationFrame` 提交；仅经过 token 粒度与 Markdown 成本评估的模型可在受控 allowlist 中覆盖 timer 窗口，仍复用同一 rAF 和 terminal flush。出现代码围栏结构变化时，提前请求既有 rAF flush。该路径只提交已合并的内容，不读写 following/reading、`scrollTop` 或 Virtuoso 接口，因此不形成第二个滚动来源。

高度提示不保存消息正文、图片 Blob、滚动位置或完整 virtualizer state，也不进入服务端、API 或跨设备同步。

## Presentation Lifecycle

- 历史首屏 hints bootstrap 最多等待 500ms；列表一旦挂载，宽度变化和 promotion 只能回退结构估算，不能卸载或重显 skeleton。历史尾部就绪后一次性揭示列表。
- Composer、消息列和原生 scrollbar gutter 必须共享稳定的坐标边界，避免 hydration 或测量时的横向偏移。
- presentationKey 由会话层拥有，真实新建/切换更新；草稿获得持久 ID 保持该 key，不依赖 streaming/ready 清理。
- Reasoning、Agent、Workflow 和原始详情等阅读状态按会话与稳定内容 identity 隔离，在离屏回收后可恢复；删除消息或切换会话时清理失效状态。

## Non-goals

- 不在此层实现服务端 cursor pagination、向上加载、消息数据淘汰或阅读位置恢复。
- 不保证离屏消息可被浏览器原生全文查找或同时存在于可访问树。
- 不以扩大渲染缓冲、关闭虚拟化、恢复手工像素滚动或启用第二个 `ResizeObserver` 作为动态高度问题的默认修复。

## References

- [v0.5.3 Version](../versions/v0.5.3-message-virtualization.md)
- [v0.5.4 Chat Scroll Policy](../../specs/v0.5.4-token-aware-memory-compaction/contracts/chat-scroll-policy.md)
