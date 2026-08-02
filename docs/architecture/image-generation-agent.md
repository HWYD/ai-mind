# 图像生成 Agent 架构

## 目标与边界

v0.4.12 为 AI Mind 增加受控的单张文生图路径。它由 `/image` 显式触发，使用固定的 `doubao-seedream-5.0-lite` 服务端 Provider，并在当前页面提供一次性预览和下载。

它不是专业图像工具链：不支持编辑、局部重绘、扩图、去背景、参考图、多候选图、成本估算、对象存储、长期媒体库或人工确认。

## 主链路

```text
/image description
  -> POST /api/chat
  -> StreamRun(kind=image_generation) + ImageGenerationRun active lease
  -> chat-service facade
  -> ImageGenerationRunCoordinator
  -> Image Generation LangGraph StateGraph
       ImageBrief -> PromptDraft -> PromptInspect
                                 -> optional one PromptRevision -> PromptInspect
  -> fixed Seedream provider (at most once)
  -> publish temporary server-side result
  -> public stream: ImageBrief + workflow progress + image-result-ready
  -> GET /api/chat/runs/{runId}/image
  -> validated bytes -> browser Blob preview/download
```

## Graph boundary

`ImageGenerationGraphState` 只包含原始描述、ImageBrief、公开摘要、Prompt 检查结果、受限计数和终态。`StateGraph` 负责命名节点和 conditional edges；Coordinator 负责 Repository、Provider、AbortSignal 与 stream writer 等副作用。

## 每日配额与防刷

生图请求使用独立于普通聊天的服务端自然日配额：同一浏览器 Session 默认每天最多 3 个被接受的新 `/image` 任务；同一 IP 默认每天最多 10 个作为防刷上限，部署时可在 10–20 范围内调整。无效请求、幂等重放和活动任务冲突不计数，已接受任务后续失败仍计数。当前配额沿用进程内存计数，重启清零且多实例不共享；严格生产配额需要后续接入 Redis/KV。

固定上限：

- `planningModelCalls <= 5`
- `promptRevisionCount <= 1`
- `generationCount <= 1`

结构化输出只有一次严格校验。校验失败会消耗当前规划调用并终止为安全失败，不会调用隐藏修复模型。图中不使用 checkpoint、interrupt、resume 或 HITL。

## Provider 与临时内容边界

固定模型和 endpoint 位于服务端 image provider config；密钥复用 `AI_MIND_DOUBAO_API_KEY`，不会进入模型选择 UI、公开 DTO、日志或浏览器。

Provider URL 仅保留在 `ImageGenerationRun` 中。内容路由先验证当前 browser session 的所有权和逻辑过期，再使用固定 host allowlist、HTTPS、无重定向、15 秒超时、20 MiB 上限、MIME 与 magic bytes 校验读取字节。返回使用 `private, no-store` 与 `nosniff`。

浏览器不持久化 Blob/object URL；刷新后不承诺恢复预览。临时结果的过期时间取可靠 Provider expiry 与 ready 后十分钟中的较早值。

## Stream 与可观测性

`workflow-progress-start/step/end` 复用统一协议。图片运行记录画面需求、提示词、生成、预览等安全阶段耗时，并在 terminal workflow event 写入服务端总耗时。超过 120 秒时，若 Provider 仍未返回，客户端仍保留“生成中”状态；只有明确终态才停止。

公开流只包含 ImageBrief 摘要、同源 content path、临时标记、过期时间、允许的 MIME/尺寸、进度、耗时和安全错误码。它不包含 internal Prompt、检查细节、GraphState、Provider URL、图片字节、API Key 或原始 Provider 错误。

## 取消与恢复

图像 run 复用 StreamRun 的幂等和显式 cancel intent。取消会 abort 活动 Provider 请求、释放 active lease，并丢弃晚到结果。Stream event replay 只恢复安全的公开事件；它不会恢复或重复 Provider 调用，也不会从本地聊天快照恢复 Blob。
