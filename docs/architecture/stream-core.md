# Stream Core

## Summary

`@ai-mind/stream-core` 是 AI Mind 的内部 workspace 包，用来承载稳定流式内核。

它是在聊天 runtime 边界足够清楚之后才抽出来的，用来区分稳定流式基础设施和 app 内业务编排。

## Package Boundary

Package 位置：

- `packages/stream-core`

Package 名称：

- `@ai-mind/stream-core`

公开入口：

- `@ai-mind/stream-core`
- `@ai-mind/stream-core/protocol`
- `@ai-mind/stream-core/web`

该包输出 CommonJS、ESM 和类型声明。

## What It Owns

`stream-core` 负责稳定且弱业务耦合的流式基础能力：

- `ChatStreamChunk` 协议类型。
- stream error 协议类型。
- `StreamLifecycle`。
- stream error chunk helpers。
- static text part writer。
- static reasoning part writer。
- NDJSON web chunk writer。

这些能力描述的是 stream event 如何表示、如何写出，因此具备跨 webapp 和后续服务复用的价值。

## NDJSON Chunk Protocol

流式协议以 newline-delimited JSON chunks 表达聊天输出。

协议可以描述：

- 消息生命周期。
- Skill 命中。
- 文本输出。
- reasoning 输出。
- Tool 执行。
- Resource 读取。
- Prompt 消费。
- 统一错误。
- finish 事件。

这让前端可以增量、结构化地消费模型输出与运行时执行事实。

## Error Chunk

错误通过统一 `error` chunk 表达，而不是散落成多套临时错误事件。

重要字段包括：

- `scope`
- `errorCode`
- `retryable`
- `message`
- 可选 `stage`
- 可选 part 相关字段，例如 `toolName`、`resourceName`、`promptName`、`uri`、`source`、`location`、`serverId`

这样前端卡片可以把失败态落到正确位置，而不需要解析后端异常细节。

## Stream Lifecycle

`StreamLifecycle` 保护终态流行为。

它保证：

- `start` 最多写一次。
- `finish` 最多写一次。
- runtime fatal error 和 `finish` 不会同时成为终态事件。
- 已关闭或已取消的 stream 不会继续写终态 chunk。

## What It Does Not Own

`stream-core` 明确不包含：

- 聊天编排。
- session 或 prompt 构建。
- Skill routing。
- Tool execution。
- Resource execution。
- MCP client 或 server 逻辑。
- authoritative answer 策略。
- 业务 fallback policy。

这些职责仍然留在 app runtime，因为它们仍强依赖 AI Mind 当前聊天语义。

## Why It Became A Package

`stream-core` 被抽成 package，是因为流式协议、生命周期、错误 helpers 和 writer 工具已经足够稳定。

这不是把项目推进成完整平台 SDK，而是把最稳定的流式内核沉淀成一个小型内部复用包。

## Design Principle

只有当某个 stream primitive 足够稳定、可复用、并且弱耦合于 app runtime 决策时，才适合进入 `stream-core`。

如果某段逻辑还在决定“一个聊天请求应该怎么运行”，它就应该继续留在 app runtime。
