# UI Feedback Contract

## Scope

FR-032/SC-012 的前端本地契约，无 wire、API、ThreadState、数据库或会话快照变化。D021 与 plan 的 Messages amendment 为事实源。

## Feedback Classification

| 类型          | 宿主与位置                                         | 生命周期                                       | 示例                                       |
| ------------- | -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| 短暂操作反馈  | 根 layout 的单一 `Messages`，Portal 固定在顶部居中 | Base UI Toast 管理关闭、超时、堆叠与同 id 更新 | 项目链接复制成功/失败                      |
| 持续功能故障  | 所属功能区域的 shadcn `Alert`                      | 条件存在期间持续，保留可用恢复入口             | 会话列表服务不可用、只读缓存、历史加载失败 |
| 回复/结果故障 | 对应 assistant reply 或结果卡片                    | 随会话消息生命周期                             | 生图限额、模型调用失败                     |

## Placement and Ownership

- 应用只挂载一个 `Messages` 宿主；业务通过 `message` manager 发送短暂反馈，不创建页面级队列、Portal 或计时器。
- Messages 使用稳定业务 id 合并同一操作的重复反馈，最多展示三个，短文案保持紧凑宽度，长文案在窄屏安全边距内换行；其 stacking layer 高于 Sheet/Dialog。
- 会话服务 Alert 在桌面 Sidebar 最近会话区和移动 Sheet 最近会话区显示；折叠侧栏以错误图标提示用户展开查看。
- 本地只读缓存 Alert 位于 Composer 实测容器内；会话 hydration 失败位于消息内容占位；生图限额由对应 assistant error reply 承载，不能再复制为页面顶部提示。
- 移动会话导航是聊天布局的固定兄弟节点，不能进入消息 viewport 或 Virtuoso Header。Header 保持可选扩展位，但默认不承载导航、全局通知或持续故障。

## Verification

- 组件/页面测试验证持续故障的区域归属、恢复入口和空 Header。
- Chrome fixture 验证 Portal、类型、同 id 更新、关闭、超时、紧凑宽度、窄屏换行、顶部居中、Sheet stacking 与移动导航几何。
- 通知出现和消失不得改变 `chat-message-viewport` 的 `scrollHeight`、following/reading 意图或 Virtuoso 实例。
