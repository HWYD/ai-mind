# Contract: Local Image Result Cache

## Scope

`image-result-ready` 仍是仅含元数据的 public stream chunk。服务端继续拥有临时结果、到期时间、session ownership check 和唯一允许的上游 Provider URL。本契约仅为已经经严格同源内容路由读取的 Blob 增加当前浏览器/Electron profile 内的恢复能力：

```text
image-result-ready metadata in local conversation snapshot
  + IndexedDB Blob keyed by runId
  -> refresh/reopen preview and download in the same trusted Origin profile
```

不新增 API DTO、StreamRun 字段、Provider URL、服务端 retention rule 或 Electron IPC。

## Record and Capacity

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

- 缓存位于当前 trusted Origin 的 IndexedDB，只属于该 browser/Electron profile。
- 最多 30 条或 100 MiB，任一先达到即淘汰；写入前按 `lastAccessedAt`、`createdAt`、`runId` 的稳定顺序删除 LRU。
- 缓存读取会更新 `lastAccessedAt`；替换同一 `runId` 不占第二个槽位。
- browser quota、IndexedDB 不可用或缓存写入失败不会中断当前临时预览。

## Retrieval and UI Rules

1. 按 `runId` 先读缓存，再检查服务端到期或发起网络请求。
2. 命中时创建组件临时 Object URL，显示“本地缓存”及 hover tooltip；替换或卸载时 revoke。
3. 未命中且未过期时才读取既有 strict `contentPath`；成功后展示并异步缓存。
4. 缓存不可用/未命中且临时结果过期或返回 `IMAGE_RESULT_EXPIRED` 时，保留结果卡片并显示固定比例“图片已失效”占位和 `/image` 恢复提示。
5. Provider URL、Base64、Object URL 不持久化；会话快照只含严格的 ImageBrief/ImageResult 公共字段。

## Lifecycle and Security

- 服务端确认删除会话后清除其关联缓存记录；未关联记录仅受 LRU 管理。
- site-data 清理及已确认的 Desktop Session Profile reset 都会清除缓存。
- 缓存不跨设备、browser profile 或 OS user 同步，也不延长临时结果到期或授予新的 server read。
- Electron 下载策略不变：只有用户触发、trusted-Origin 的 Blob URL 可经 native save dialog 保存；缓存 Blob 仅因它来源于同一 strict content route 而被允许。
