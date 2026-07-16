# Data Model: AI Mind v0.4.7 浏览器本地聊天会话持久化

## Authority Boundaries

| 数据对象                     | 事实来源           | v0.4.7 用途                                                                    | 不承担的职责                                 |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Local Conversation Snapshot  | 浏览器 IndexedDB   | 恢复完整用户可见 UI 历史和富展示部件                                           | 不负责会话 ownership、模型上下文或跨设备同步 |
| Local Conversation Index     | 浏览器 IndexedDB   | 恢复最近会话列表、selected conversation 和 draft hint                          | 不授权发送、不替代服务端 Registry            |
| Server Conversation Registry | 现有 PG checkpoint | 校验会话身份、当前 browser session ownership、最近 10 个会话                   | 不保存完整消息历史                           |
| Server ThreadState           | 现有 PG checkpoint | 为 AI 提供 bounded recent text、summary、pinned decisions 和 final-turn memory | 不恢复完整富 UI transcript                   |

## Local Conversation Index

本地索引是浏览器离线/只读恢复所需的最小元数据集合。建议字段：

| 字段                     | 类型                          | 规则                                       |
| ------------------------ | ----------------------------- | ------------------------------------------ | --------------------------------------------- |
| `schemaVersion`          | number                        | 当前本地格式版本；不兼容时整条索引安全失效 |
| `selectedConversationId` | string                        | null                                       | 只能指向索引内仍存在的 persisted conversation |
| `isDraft`                | boolean                       | draft 不进入 persisted conversation 名额   |
| `conversations`          | `LocalConversationMetadata[]` | 最多 10 条，按 `lastActiveAt` 从新到旧排列 |
| `updatedAt`              | ISO string                    | 索引最后一次稳定更新时间                   |
| `revision`               | number                        | 索引写入版本，用于防止旧索引覆盖新索引     |

`LocalConversationMetadata` 复用服务端 Registry 的公开字段：`id`、`title`、`createdAt`、`lastActiveAt`、`hasMessages`。`selected` 应在消费时根据 `selectedConversationId` 派生，不作为独立事实保存。

多标签页更新共享索引时，`conversations` 必须按 `conversationId` 合并元数据，不能因为标签页 A 更新会话 A 而删除标签页 B 最近写入的会话 B 元数据。`selectedConversationId` 与 `isDraft` 只是当前浏览器 UI hint，不承担服务端授权语义；当多个标签页先后写入这些 hint 时，按有效索引 `revision` 保留最后一次稳定写入，不做消息级合并或实时同步承诺。

## Local Conversation Snapshot

每个 `conversationId` 保存一条快照记录，建议字段：

| 字段             | 类型                          | 规则                                                     |
| ---------------- | ----------------------------- | -------------------------------------------------------- |
| `schemaVersion`  | number                        | 用于版本兼容和迁移判断                                   |
| `conversationId` | string                        | 与记录 key 一致；必须通过 `conversationIdSchema`         |
| `title`          | string                        | 来自最近一次有效 Registry 元数据，长度受现有标题边界约束 |
| `createdAt`      | ISO string                    | 会话创建时间                                             |
| `lastActiveAt`   | ISO string                    | 最近一次稳定 UI 状态时间                                 |
| `snapshotAt`     | ISO string                    | 本地快照提交时间                                         |
| `revision`       | number                        | 同一会话快照的单调版本；旧版本不能覆盖新版本             |
| `messages`       | `RecoverableVisibleMessage[]` | 按原 UI 顺序保存，容量不足时从最旧完整消息裁剪           |

快照记录按 `conversationId` 独立存储。不同会话的 `messages` 不共享、不去重、不合并；共享索引更新必须保留其他会话的元数据。

## RecoverableVisibleMessage

它是受控的 `MindMessage` UI 快照，而不是任意 runtime state：

- 保留 `id`、`role`（仅 `user` / `assistant`）、`createdAt` 和稳定的 `parts` / `artifacts`。
- 只接受消息状态为未设置或 `completed` 的消息。
- 保留稳定的 text、reasoning、tool、resource、skill、prompt、workflow-progress、agent-step 和已完成 text artifact 展示。
- 排除 streaming、failed、paused/resuming、半成品 artifact、pending/submitting `AgentInterrupt` 和 `thread-memory-status`。
- 不持久化 raw checkpoint、raw GraphState、session cookie、API key、provider config、raw error 或其他服务端内部字段。
- schema 校验失败的消息或部件应被安全忽略；单条坏记录不得阻塞其他会话恢复。

## Lifecycle

```text
blank draft
    └─ 首条消息发送成功并获得 conversationId
        └─ active in-memory messages
            ├─ streaming / pending / failed / aborted → 不提交当前快照
            └─ stable completed UI state → 写入本地快照
                ├─ delete turn / regenerate completed → 写入新版本快照
                ├─ browser refresh/restart → 先恢复本地展示
                ├─ server validated → interactive
                └─ server unavailable → read-only local cache
```

## Reconciliation Rules

### Ordinary local write

An ordinary local index write merges metadata by `conversationId`, protects newer revisions, and preserves entries written by another tab. This mode is used by local snapshot promotion and UI hint updates.

### Server-authoritative reconciliation

The registry request captures a `baseline` consisting of the local index revision and conversation IDs observed before the request. A valid server response produces the following result:

1. server conversation metadata becomes authoritative for all IDs in the response;
2. baseline IDs absent from the response are removed from the local index and their snapshots are hard-deleted;
3. a response ID keeps its existing local snapshot, even when its title or timestamps change;
4. entries created after the baseline by another tab are preserved in storage to avoid losing a concurrent write;
5. an empty valid response removes all baseline IDs, while an invalid or failed response performs no cleanup.

The local snapshot store is never reconciled against registry metadata or bounded `ThreadState`. Server reconciliation changes session identity/retention metadata only; the local snapshot remains the complete user-visible history source.

## Conversation Deletion

Deletion is a coordinated operation across three records:

| Record                            | Successful delete result                                                                                                     | Failure result                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Server Conversation Registry      | The `conversationId` is removed and selected state falls back to another retained conversation or blank draft                | The registry remains unchanged                                      |
| Server ThreadState/checkpoint     | The thread identified by the current session and `conversationId` is physically deleted through the chat-memory checkpointer | The server reports failure and the client does not clean local data |
| Local Conversation Index/Snapshot | The index entry and complete UI snapshot are hard-deleted after server success                                               | The local index and snapshot remain available                       |

The Delete operation is not a transcript synchronization feature. It removes one conversation's server identity, runtime context and browser-local display cache as a single user-visible action. Other conversation IDs and snapshots remain isolated.

1. 本地快照先用于 UI 展示；服务端 hydration 不覆盖本地消息，也不补写本地完整历史。
2. 没有本地快照时，可使用 bounded server hydration 作为降级展示，但必须标记为非完整历史。
3. Registry 返回有效会话后，同步标题、时间和最近 10 条元数据；服务端已 prune 或拒绝的快照清理掉。
4. Registry 或 ThreadState 不可用时，本地快照可以只读展示；发送、新建和切换均禁用。
5. 服务端会话和 ThreadState 恢复后，继续发送使用服务端 ThreadState；本地展示历史不要求与其完整一致。
6. 同一会话并发写入比较快照版本；不同会话记录独立写入，不产生消息级覆盖。
7. 共享索引的会话元数据按 `conversationId` 合并；`selectedConversationId` 与 draft hint 按最新有效索引 revision 覆盖旧 hint。
