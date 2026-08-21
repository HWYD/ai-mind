# Contract: Conversation Registry

## Public Payload

```ts
type ConversationRegistryPayload = {
    selectedConversationId: string | null
    conversations: Array<{
        id: string
        title: string
        createdAt: string
        lastActiveAt: string
        selected: boolean
        hasMessages: boolean
    }>
    limit: 50
}
```

`GET`、`POST` 和 `DELETE /api/chat/conversations` 都返回这一 payload。`conversations` 以 `lastActiveAt` 降序排列，最多 50 条，只包含正式会话。

## Invariants

- 第 51 条正式会话进入 registry 时淘汰最早未活跃项；被裁掉的项目不再能通过 registry 选择或删除。
- 前端必须验证 `limit === 50`，将 payload 写入同样上限为 50 的本地会话索引。
- 桌面与移动导航不得对已过滤的正式会话再按数量截断；继续使用既有 `ScrollArea`。
- 这不是 cursor API 或全历史 API。全历史、加载更多和搜索属于后续独立版本。
