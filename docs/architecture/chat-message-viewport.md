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

业务策略只有三个互斥场景：

1. 历史首次进入：通过列表 handle 定位尾部，确认尾部消息已挂载并稳定后再揭示内容。
2. 流式输出：仅当用户仍位于末尾且未锁定阅读时，合并后续内容、列表高度和 Composer 高度的跟随意图。
3. 已完成的静态阅读：测量、图片、详情和 Composer 高度变化都不能自动调用回底；只有用户显式返回底部或开始下一轮请求才能恢复相应语义。

`followOutput` 保持关闭，避免 virtualizer 的内建自动跟随与业务策略竞争。

## Dynamic Height

初始高度由消息结构、内容类型与消息列宽度估算；真实 DOM measurement 始终具有最终裁决权。图片状态必须保留一致的卡片几何，卡片估算需要包含固定 chrome 和内容区。

对已完成、稳定且默认展示的历史消息，可保存浏览器本地高度提示。提示必须同时匹配会话、消息 identity、渲染指纹、精确列宽、geometry version 和展示状态；不匹配、不可用或读取超时必须回退结构化估算，不能阻塞会话显示。

高度提示不保存消息正文、图片 Blob、滚动位置或完整 virtualizer state，也不进入服务端、API 或跨设备同步。

## Presentation Lifecycle

- 历史会话在尾部定位完成前显示与消息列对齐的非滚动骨架；随后一次性揭示真实列表。
- Composer、消息列和原生 scrollbar gutter 必须共享稳定的坐标边界，避免 hydration 或测量时的横向偏移。
- Reasoning、Agent、Workflow 和原始详情等阅读状态按会话与稳定内容 identity 隔离，在离屏回收后可恢复；删除消息或切换会话时清理失效状态。

## Non-goals

- 不在此层实现服务端 cursor pagination、向上加载、消息数据淘汰或阅读位置恢复。
- 不保证离屏消息可被浏览器原生全文查找或同时存在于可访问树。
- 不以扩大渲染缓冲、关闭虚拟化、恢复手工像素滚动或启用第二个 `ResizeObserver` 作为动态高度问题的默认修复。

## References

- [v0.5.3 Version](../versions/v0.5.3-message-virtualization.md)
- [Chat Message Viewport Contract](../../specs/v0.5.3-message-virtualization/contracts/chat-message-viewport.md)
