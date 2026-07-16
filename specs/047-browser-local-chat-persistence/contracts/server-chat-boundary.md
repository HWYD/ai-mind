# Server Chat Boundary Contract

## `GET /api/chat/conversations`

现有 Registry response 继续作为服务端会话元数据契约：

- 返回当前 browser session 可用的最近 10 个 persisted conversations。
- 返回 `selectedConversationId`、会话标题、创建时间、最近活跃时间和 `hasMessages`。
- 服务器返回成功后，前端同步本地索引；服务器返回失败时，若本地索引有效，前端进入只读缓存状态。
- 该接口不返回完整聊天消息。

### Client reconciliation after `GET /api/chat/conversations`

The client may render the local conversation index before this request completes. A valid successful response then becomes authoritative for the local index: baseline local-only IDs and snapshots are hard-deleted, retained IDs receive server metadata, and retained IDs keep their local complete UI snapshots. The response does not contain or authorize a complete chat transcript.

If the request fails, times out, or returns an invalid payload, the client MUST keep the local index and snapshots and use the existing read-only fallback behavior. No cleanup is allowed on an unsuccessful validation attempt.

## `DELETE /api/chat/conversations`

请求体必须是严格 JSON object：

```json
{
    "conversationId": "conversation-id"
}
```

- 服务端必须以当前 browser session 校验会话 ownership；不存在或不属于当前 session 时返回 `404 CONVERSATION_NOT_FOUND`。
- 成功删除必须同时完成两件事：从当前 session 的 Conversation Registry 移除该 ID，并通过 `ChatMemoryService` 删除 `buildChatConversationThreadId(sessionId, conversationId)` 对应的 ThreadState/checkpoint。
- 删除当前 selected conversation 时，服务端返回新 Registry 选择的 fallback conversation；删除最后一个会话时返回 `selectedConversationId: null` 和空列表。
- 成功响应复用 Conversation Registry payload schema。客户端只有在收到有效成功 payload 后，才删除目标本地 index entry 和 UI snapshot。
- 请求体非法返回 `400 INVALID_CONVERSATION_REQUEST`；ThreadState、Registry 或其他服务端删除失败返回 `500 CONVERSATION_REGISTRY_UNAVAILABLE`。失败时客户端不得清理本地数据。
- 该接口只删除单个会话的 Registry metadata 与 runtime ThreadState，不读取、不写入完整聊天历史业务表，也不返回聊天 transcript。

## `GET /api/chat/thread?conversationId=...`

- 先通过当前 browser session 的 Conversation Registry 校验 `conversationId` ownership。
- 404 `CONVERSATION_NOT_FOUND`：本地会话不可恢复为可交互会话，前端不得发送或切换到该会话。
- 200：返回现有严格 `ThreadHydrationDTO`，其中 `messages` 仍是 bounded text-only runtime hydration；前端不得用它覆盖已有本地完整 UI 历史。
- 200 且 `restored: false`：表示当前 ThreadState 没有可恢复的 bounded state，不表示服务端拥有完整历史。
- ThreadState 读取失败返回 5xx `CHAT_THREAD_HYDRATION_UNAVAILABLE`，不得将失败伪装为成功空状态；若本地快照存在，前端只读展示并禁用发送。
- 响应不得包含 raw checkpoint、raw GraphState、session cookie、provider config 或 raw error。

## `POST /api/chat`

- 继续使用现有 `conversationId` / `createConversation` 边界和 `X-AI-Mind-Conversation-Id` promotion header。
- 前端可以继续携带当前 UI 消息 payload 以保持兼容，但服务端仍只按现有规则消费当前 user turn 和服务端 ThreadState。
- 本版本不新增 stream chunk、不改变 `@ai-mind/stream-core`，也不把本地快照上传为服务端完整 transcript。
- 只有服务端 Registry ownership 和 ThreadState 可用时才允许交互式发送；本地快照与 ThreadState 不要求完整一致。
