# Feature Specification: AI Mind Chat Experience & Image Reliability

**Version**: `v0.5.1`
**Feature Branch**: `main`（用户指定主工作区）
**Created**: 2026-08-21
**Status**: 发布候选；所有 workspace package version 已锁步更新为 `0.5.1`，本地 CI 等价验证已通过，待提交后由 GitHub Actions 完成远端 macOS 验证

## Summary

v0.5.1 是独立于 v0.5.0 Electron Desktop Host 的 webapp 体验与可靠性小版本。它集中收口会话历史导航、长标题可见性、图像生成阶段反馈、生成图片刷新恢复、图像生成偶发失败的分层重试，以及桌面侧栏与移动抽屉底部项目入口；不改变 Desktop Host 的安全、发布或原生 IPC 边界。

## Goals

- 最近会话从 10 条统一扩至 50 条，桌面侧栏与移动抽屉完整展示服务端返回的近期列表。
- 桌面侧栏的溢出标题在悬浮或键盘聚焦后单次平滑展示末尾内容，短标题静止。
- 生成图片在同一浏览器/Electron profile 刷新后仍可预览和下载，并在生成中、临时读取中和失效时给予连续、克制的反馈。
- 降低普通 `/image` 提示词被偶发误拦截或临时 Provider 限流/服务故障导致的失败率。
- 在桌面会话侧栏和移动会话抽屉提供固定的访客菜单，让浏览器和 Electron 都能安全访问项目 GitHub 地址。

## Non-goals

- 不提供无限会话历史、跨设备会话同步、会话搜索、服务端会话索引迁移或 cursor pagination。
- 不持久化 Provider URL、Base64、Object URL、Prompt、cookie、Provider 原始错误或图片二进制到消息快照。
- 不变更 Stream DTO、Prisma schema、公开图片内容路由安全校验、Desktop Host IPC 或下载权限。
- 不为 Provider 投递状态不明确的网络异常自动重发；不试图通过客户端重试保证幂等。
- 不引入真实账户资料、读取 `HttpOnly` session cookie、Electron 外链白名单或新的 IPC。

## Functional Requirements

- **FR-501**: 同一服务端会话的 `ConversationRegistry` 与本地 `LocalConversationIndex` 必须最多保存最近活跃的 50 条正式会话；`ConversationRegistryPayload.limit` 固定为 `50`，桌面侧栏和移动抽屉不得再做 10 条二次截断。
- **FR-502**: 会话标题必须始终保留完整文本和完整 `aria-label`。仅在桌面端标题实际溢出、且悬浮或键盘焦点持续 400ms 后，才从开头平滑移动到结尾一次；离开或失焦立即复位，`prefers-reduced-motion: reduce` 禁用动画。
- **FR-503**: 已通过严格同源 `/api/chat/runs/<runId>/image` 内容路由读取的图片 Blob 可保存到当前 Origin 的 IndexedDB。缓存最多 30 张或 100 MiB，按 LRU 淘汰；同一 `runId` 替换不重复占用容量。
- **FR-504**: 图片结果卡片必须依次读取本地缓存、未过期临时内容路由和固定比例的失效占位。缓存命中显示“本地缓存”并可下载；缓存、临时内容均不可用时提示重新执行 `/image`，不暴露或重用 Provider URL。
- **FR-505**: 图像 workflow 进入 `generation` 步骤后必须直接使用结果卡片的流光占位，画幅按 ImageBrief 映射为 4:3、3:4 或 1:1。结果 Blob 尚在读取时使用同一占位，不叠加第二张 loading 卡片或可见加载文案；减少动态效果时静止。
- **FR-506**: 每个结构化图像规划节点的固定规划模型仅对 timeout、rate-limit、connection 错误进行最多 3 次底层请求（首次加 2 次重试）。单次 run 最多执行 5 个逻辑规划节点调用。首次 `block` 必须经一次字面冲突复核；除非复核能定位两段明确互斥的原始要求，否则继续生成。
- **FR-507**: 同一逻辑图片生成仅标记一次 generation。Provider 仅对已确认 HTTP `429` 或 `5xx` 最多请求 3 次，优先采用 1–10 秒 `Retry-After`，否则采用带抖动的 1–2 秒、2–4 秒退避；取消立即中止等待。4xx、内容拒绝、无效结果、发布失败和投递状态不明确的网络异常不得重试。
- **FR-508**: 桌面 `ConversationSidebar` 与移动 `ConversationMobileSelector` 必须分别在会话滚动区域之外固定显示带中性用户头像的“访客用户”入口；桌面折叠后仅保留头像。菜单向上展开，唯一操作项显示“GitHub 项目”，完整项目地址仅在悬浮提示中可见。普通浏览器点击必须新开标签页；Electron 点击必须复制 `https://github.com/HWYD/ai-mind`、不发起外链导航，并在聊天区顶部显示短暂的成功或失败状态提示；移动抽屉在复制结果后关闭以露出该提示。

## Acceptance Criteria

- 第 51 个正式会话创建后只保留最近 50 条；旧 10 条格式的本地索引仍可读取，且两种导航视图均能显示第 11 条及以后项目。
- 缓存命中的图片刷新后不发网络请求；缓存缺失、结果过期时显示失效占位；Object URL 在替换或卸载时释放。
- 生成中的流光占位、结果读取占位和正式卡片只出现一个结果框；失败或取消时不残留占位。
- 规划误拦截经复核放行；每个规划节点的瞬时错误最多三次底层请求，Provider 的 429/5xx 最多三次尝试并保持单个 generation 标记。
- 会话列表滚动或进入禁用状态时，桌面侧栏和移动抽屉底部访客菜单仍可用；“访客用户”不会重复显示“访”字，GitHub 项不会常驻裸 URL；浏览器不写剪贴板，Electron 不调用 `window.open`，复制提示在约 2.5 秒后消失。
