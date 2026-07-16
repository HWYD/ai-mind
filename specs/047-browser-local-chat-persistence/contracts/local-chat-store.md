# Local Chat Store Contract

## Purpose

定义浏览器本地聊天持久化模块与 `useConversationSessions` / `useChatStream` 之间的最小契约。该契约只服务浏览器本地 UI 恢复，不构成服务端聊天历史或模型上下文协议。

## Read Results

本地读取必须区分以下结果：

| 结果          | 含义                             | UI 行为                                           |
| ------------- | -------------------------------- | ------------------------------------------------- |
| `missing`     | 没有对应索引或会话快照           | 继续服务端恢复；没有服务端数据时显示 draft/空状态 |
| `valid`       | schema 校验通过的本地数据        | 恢复对应会话列表或完整 UI 展示                    |
| `invalid`     | 数据存在但版本不兼容或无法校验   | 丢弃该条记录，不阻塞其他会话                      |
| `unavailable` | IndexedDB 被禁用、损坏或访问失败 | 聊天主链继续，不能依赖本地恢复                    |

## Write Contract

- 只接受 stable completed UI state。
- 写入按 `conversationId` 独立记录；写入会话 A 不得删除或覆盖会话 B。
- 同一会话写入必须带 `revision`，旧版本写入不得覆盖新版本。
- 本地索引更新必须按会话 ID 合并，不能用单个标签页的旧索引覆盖其他标签页最近产生的会话元数据。
- 超出容量时只删除最旧的完整消息；不得写入半条消息或半个 UI part。
- 写入失败不得抛入聊天请求主链；调用方获得 `unavailable` / `quota` 结果后继续现有服务端聊天流程。

## Delete Contract

- 本地删除不是服务端删除的前置步骤；只有 DELETE API 返回有效成功 Registry payload 后，调用方才硬删除目标 conversation 的 index entry 和 UI snapshot。
- 删除成功时必须保留其他 conversation 的 metadata、snapshot、revision 和消息内容；删除当前会话的 selected/draft 结果以服务端 payload 为准。
- DELETE 请求失败、响应非法或服务端返回错误时，本地 index 与目标 snapshot 必须保持不变，以便用户重试。
- 对已经不存在的本地 index entry 或 snapshot 重复清理应视为幂等成功，不得影响其他 conversation。

## Security and Validation

- 读写边界必须使用严格版本化 schema。
- 本地数据不包含 API key、session cookie、raw checkpoint、raw GraphState、provider config 或 raw runtime error。
- 本地数据是浏览器用户可见的本地明文，不提供账号级安全或跨设备恢复承诺。

## Server-authoritative Reconciliation Contract

- `writeLocalConversationIndex` remains the ordinary merge operation and MUST preserve independent conversation metadata writes by `conversationId`.
- The store MUST expose a separate authoritative reconciliation operation that accepts the server-derived index and the pre-request local index baseline.
- On a valid server response, the authoritative operation MUST replace baseline metadata with server metadata and MUST NOT retain baseline local-only IDs merely because ordinary merge behavior would retain them.
- The authoritative operation MUST preserve entries created after the baseline by another tab, so an in-flight registry response cannot erase a concurrent different-conversation write.
- The caller MUST delete snapshots only for baseline IDs absent from a valid server response. A matching server ID MUST never cause snapshot deletion or message-level merge.
- Invalid, failed or unavailable server responses MUST NOT invoke authoritative cleanup.

## Concurrency Contract

- 不承诺跨标签页实时 UI 同步。
- 不同 `conversationId` 的快照写入互不冲突。
- 同一 `conversationId` 的快照按版本保留较新的稳定写入，不进行消息级合并。
