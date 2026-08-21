# Decisions: AI Mind Chat Experience & Image Reliability

## D001 — 近期会话固定为 50 条

选择 50 条而非无限列表。当前 registry 在每次更新时整体读写并一次性返回；无限增长需要独立服务端索引、cursor pagination 和搜索，不能仅移除常量。

## D002 — 图片仅缓存已验证 Blob

选择 IndexedDB Blob 而非持久化上游 URL。缓存只属于当前 profile，既支持刷新恢复，也不扩大临时内容路由、Provider URL 或会话授权边界。

## D003 — 重试只覆盖确定的可恢复情形

单次 run 最多 5 个逻辑规划节点；每个节点仅对 timeout、rate-limit、connection 错误执行最多 3 次底层模型请求。首次 `block` 额外复核；Provider 只重试明确 429/5xx。网络投递状态未知时不重发，接受已确认 5xx 重试可能带来的重复生成/计费风险。

## D004 — 单一结果框承载加载和结果

选择同一固定画幅的流光占位替换普通灰色骨架，避免 generation 开始和结果 Blob 读取间出现两个连续卡片或布局跳动。无可见 loading 文案，读屏状态仍保留。

## D005 — v0.5.1 与 v0.5.0 的关系

用户明确授权建立独立 `v0.5.1` 版本工作区。v0.5.0 继续只描述 Electron Desktop Host；长期架构文档以当前代码为准。既有 v0.5.0 `acceptance.md` 不因本版本迁移而修改。

## D006 — 侧栏项目入口按运行环境分流

桌面侧栏和移动会话抽屉底部均使用“访客用户”而非 session id，避免展示不可由客户端读取的 `HttpOnly` cookie。头像采用中性用户图标，避免“访”与“访客用户”重复；GitHub 操作以“GitHub 项目”展示，完整地址只在悬浮提示中可见。浏览器以用户手势新开 GitHub 标签；Electron 保持既有外链拒绝策略，只复制同一地址并通过页面顶部状态提示反馈结果，移动抽屉在结果返回后关闭以露出提示。该入口不属于会话变更，流式生成或本地只读时仍保持可用。
