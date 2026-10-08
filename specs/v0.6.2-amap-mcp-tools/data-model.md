# Data Model: v0.6.2 AMap MCP Tools

## General ReAct budget overlay

- `maxLogicalToolCalls=21` 是每个 Run 的累计 admission 上限；`_toolCallCount` 汇总所有 Tool-bearing rounds 已预占的 logical calls，不能按 `maxToolBearingRounds=9` 相乘。
- `ActionBatchAdmission` 依据 `21 - _toolCallCount` 分配当前 batch 的剩余 slots；第 22 个及其后的调用保持既有 `tool_call_limit` public-safe failure，不进入 Provider。
- 本次保留 `_toolBearingRoundCount`（9）、`_toolRetryCount`（4）、`maxToolConcurrency`（3）与 observation counter/DTO；`_preFinalizationDeadlineAtMs` 固定为 Run 起点后 240 秒，仅供行动/Tool 阶段截止，constrained finalizer 不携带该 deadline；不新增 StreamEvent、数据库或地图存储字段。

## Summary

本版不新增持久化实体、Prisma migration、GraphState、AgentRun 表或公开 stream 类型。下列是单次 General ReAct Run 内的受控概念模型，具体 TypeScript 类型由产生它的模块拥有。

## Entities

### AMapServerConfig

- `serverId`: 固定 `amap-maps`。
- `endpoint`: 固定 `https://mcp.amap.com/mcp`，不接受模型、请求或任意 env host。
- `key`: server-only `AI_MIND_AMAP_MCP_KEY`，不得进入 public DTO、模型 schema、日志、错误和持久化状态。
- `availability`: 只有 Key 非空、固定 endpoint 有效且代码内存在 T001 已验证的静态远端映射时，能力才能进入 active map；不在启动或每 Run 动态读取 `tools/list` 决定可用性。
- `requestBatchPolicy`: 仅服务端内部使用的可选策略。`amap-maps` 固定为 `maxBatchSize=3` 与 `cooldownMs=800`；它不是模型参数、public DTO、持久化状态或账号级配额配置。

### MCPToolBatchScheduler

- `serverId`: 由 MCP Client Manager 持有的进程内键，同一 `serverId` 共享一条队列。
- `queue`: 等待启动的 Tool 请求及其 AbortSignal；取消或 deadline signal 触发后移除，不保存请求参数、Key、URL 或结果。
- `activeBatch`: 最多三条同时执行的请求；只有该批全部 settled 后才开始 800ms 冷却。
- `cooldown`: 只在一批完成且仍有可执行队列项时存在；结束后再取下一批最多三条。该概念不进入 GraphState、Memory、snapshot、PostgreSQL 或 StreamEvent。

### AMapToolContract

- `localName`: AI Mind 固定名称，九项之一。
- `remoteName`: 实际 `tools/list` 与官方 Key smoke 核对后的固定映射；不是每 Run 动态选择。
- `inputSchema`: 针对该语义的 strict Zod schema，限制坐标、地址、城市、关键词、半径、路线方式等字段。
- `executionPolicy`: 对齐 `web-search` / `read-url` 的 `standard-tool` / `remote-readonly` / `retrySafe: true`；Tool Runtime 对明确的 retryable 瞬态失败在 permit、预算和 deadline 允许时最多重试两次。高德 adapter 对已通过 schema 但无法归类的 `isError` 只传递一次同参兜底重试许可；schema/4xx 参数失败由下一 Action 的模型新参数修正，adapter 与 MCP client 不增加自己的等待、重试或恢复规则。
- `outputProjection`: 只保留回答需要的有限地点/路线字段，不包含原始 MCP content/metadata。

### AMapPublicTraceProjection

- `toolKind`: 固定九项中的本地 Tool 名称或其固定中文类别；不得由远端 `tools/list`、模型或返回文本决定。
- `phase`: `started`、`completed`、`no-result`、`failed`、`cancelled` 之一。
- `resultCount`: 仅完成/无结果时可选的非负整数；不携带候选内容。
- `failureCategory`: 仅失败时的既有安全类别；不得附带远端错误原文、URL 或 cause。
- 除以上字段及固定展示文案外，`tool-start`、`tool-end` 与 `error(scope=tool)` 不允许携带用户参数、原始 query、完整地址、坐标、路线细节、POI 字段、Key、含 Key URL 或 raw MCP payload。它只用于 public Trace/`StreamEvent`，不改变内部 observation 与既有最终回答、Memory 或 PostgreSQL 策略。

### ToolInputCandidate

- `value`: 用户表达、模型任务推导或已成功 observation 都可提供的业务参数候选；城市、地址、坐标、POI ID、路线端点和公开 URL 都属于候选。
- `validation`: Provider 前必须通过对应 Tool 的 strict schema、长度/范围、GCJ-02 与公开 URL policy；任何 remote-readonly 参数还须通过 known-secret 防护。
- `factStatus`: 候选永远不是外部事实。只有成功且输出校验通过的 observation 可以支持地点、页面、路线、距离或时间结论。
- `intentBoundary`: 未给出“附近/这里/从我这出发”等任务所需的位置锚点时要求澄清；不通过 IP、浏览器定位、用户 Profile、Memory 或模型猜测补全当前位置或私人位置。

### PlaceObservation

- `name`、`poiId`、`address`、`location`、`city` 等字段只在服务真实返回且校验通过时存在。
- 列表长度与文本长度有上限；详情只使用真实 POI ID，不从自然语言生成 ID。
- 多候选保留歧义，不自动宣称唯一准确地点。

### RouteObservation

- `mode`: walking / driving / bicycling / transit。
- `origin`、`destination`: 由用户显式位置和/或本轮编码结果构成。
- `distance`、`duration`、`summary`: 只投影真实返回且能解释的有限摘要字段。
- 不投影路线多候选、完整逐步指引或道路限制详情。
- 不保存整条路线原始响应或生成导航/打车唤端链接。

## Lifecycle and State

`unavailable (missing Key / schema mismatch) -> available -> requested -> validated -> executing -> succeeded | denied | timed_out | provider_error | cancelled`。`validated` 失败时形成安全 repair observation；模型可在后续 Action 发送不同候选参数。明确的 retryable transport/provider transient failure 最多同参重发两次；已通过 schema 的未分类高德 `isError` 只允许一次同参兜底重发。

每个 Tool Call 保持现有 `tool-start`、`tool-end` 或同 Part 的安全 `error` 事件，不引入新公开状态。`succeeded` 才能向模型回填事实；`denied`、`timed_out` 与 `provider_error` 均不能产生“已查到”的事实。Tool 的重试/取消由现有 Tool Runtime 记录在 Run 内，不新增可跨 Run 恢复的地图状态。

## Persistence and Privacy

原始 MCP 请求/响应、含 Key URL 与中间 Place/RouteObservation 不新增长期持久化实体或缓存。高德 Tool 的 `formatInput`、`formatPublicOutput` 只产生 `AMapPublicTraceProjection` 允许的固定安全摘要；远程错误使用既有 `remote-readonly` 的固定安全分类文案。除该 public 投影外，不为地图 Tool 建立特殊存储策略：用户**主动输入**的地址/坐标、最终文字，以及既有 Tool 相关的 PostgreSQL、Chat Memory/快照行为，继续按 v0.6.1 通用规则处理；最终文字也可能含派生地点与路线事实。用户在公开上线前据当前服务条款自行核对最终文字保留、展示与来源标注的适用性；若需改变当前保留策略，必须在本 canonical workspace 同步修订 spec/plan/tasks/acceptance 后再发布。
