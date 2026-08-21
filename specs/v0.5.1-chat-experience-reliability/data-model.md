# Data Model: AI Mind Chat Experience & Image Reliability

**Feature**: v0.5.1 Chat Experience & Image Reliability
**Date**: 2026-08-21

## Conversation Registry

```ts
type ConversationRegistryPayload = {
    selectedConversationId: string | null
    conversations: ConversationListItem[] // newest first, max 50
    limit: 50
}
```

- 服务端 checkpoint registry 与浏览器 `LocalConversationIndex` 都以 50 条为最大容量。
- registry 是近期导航索引，不是全历史目录；第 51 条会淘汰最早未活跃会话。
- 现有 `LOCAL_CHAT_SCHEMA_VERSION` 保持不变，先前的 10 条索引仍是有效数据。

## Local Image Result Cache

```ts
type LocalImageResultCacheEntry = {
    runId: string
    conversationId?: string
    blob: Blob
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
    byteLength: number
    createdAt: string
    lastAccessedAt: string
}
```

- Blob 只来自已验证的同源内容路由；Provider URL、Base64、Object URL、Prompt、cookie 和原始错误不得持久化。
- 写入前按 `lastAccessedAt`、`createdAt`、`runId` 淘汰，满足最多 30 条和 100 MiB 两个约束。
- 消息快照只包含公开图片元数据；`Object URL` 是组件临时运行态，替换和卸载时释放。

## Image Retry Envelope

```ts
type ImageRetryPolicy = {
    maxPlanningNodeCallsPerRun: 5
    maxPlanningAttemptsPerNode: 3
    maxProviderAttemptsPerRun: 3
    planningRetryable: 'timeout' | 'rate-limit' | 'connection'
    providerRetryable: '429' | '5xx'
}
```

- 规划 block 复核、退避时钟、原始 Provider 错误、尝试序号和 AbortSignal 只存在于运行时；规划请求上限按单个逻辑节点计算，不与整次 run 的五节点上限混淆。
- 一个逻辑 run 只有一个 `generationCount` 增量和最多一个最终图片结果；不扩展 public DTO。

## Sidebar Project Link Notice

```ts
type ProjectLinkNotice = {
    id: number
    type: 'copied' | 'copy-failed'
}
```

- 该状态只存在于 `InstantMindPage` 内存，用于重新触发同类提示的 2.5 秒计时；不会写入会话快照、IndexedDB、cookie 或 API。
- “访客用户”是静态展示身份，不读取或截断 `HttpOnly` session id；头像使用中性用户图标，不以“访”字重复身份语义。
