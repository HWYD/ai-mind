# Data Model: Token-aware Memory Compaction

**Feature**: [spec.md](./spec.md)

## Overview

本版不新增数据库实体。`AiMindThreadState` 继续使用现有 checkpoint namespace 和字段；新增对象均为 server runtime 内部派生值、request-local value object，或 FR-028 定义的最小只读 browser projection。

## Existing Persisted Entity: AiMindThreadState

```ts
interface AiMindThreadState {
    messages: ChatThreadMessage[]
    summary: string
    pinnedDecisions: string[]
    lastCompactedAt?: string
}
```

### Invariants

- `messages` 仍为 text-only user/assistant messages。
- durable checkpoint 可以在 compaction failure 时临时超过 operational target；读取不能因固定四条上限拒绝旧或失败后的 checkpoint。
- successful compaction 后 retained messages 必须由零个或多个完整 user/assistant pairs 组成。
- `summary` 和 `pinnedDecisions` 继续遵守现有严格文本/schema 安全边界。
- `pinnedDecisions` 的 durable 数组顺序解释为 oldest-to-newest，最新项位于末尾；legacy checkpoint 沿用现有数组顺序，不做 migration。
- `lastCompactedAt` 只在 valid candidate 成功保存时改变。
- hydration DTO 继续从该 state 构造现有 public shape，不增加 budget/token 字段；用量展示走独立的只读聚合接口，不改变 hydration shape。

### State transitions

```text
load checkpoint
  -> request preflight
       -> below trigger and complete input fits: use loaded state
       -> eligible compaction:
            -> valid candidate + save success: use compacted durable state
            -> generation/validation failure: preserve loaded durable state; use ephemeral fit
            -> candidate save failure: preserve loaded durable state; use ephemeral fit
  -> final answer completed
       -> independently append raw turn from last durable state
            -> append success: durable raw state
            -> append failure: preserve last durable state + sanitized diagnostic
```

Candidate write 与 raw final-turn append 是两个明确写入阶段。Generation/validation failure 不能丢失 completed turn；candidate saver failure 后必须独立尝试 raw append。若 raw append saver 也不可用，则系统只能保留 last durable checkpoint、记录脱敏失败并保持已生成回答有效，不能伪造持久化成功。

## Internal Entity: ModelContextCapability

```ts
interface ModelContextCapability {
    contextWindowTokens: number
}
```

该字段直接归 `AiMindModelCatalogItem` 所有并为正整数。它不属于 `PublicChatModel`、API response、stream chunk 或 provider config response。

## Internal Value Object: ContextBudget

```ts
interface ContextBudget {
    compactionTriggerTokens: number
    effectiveWindowTokens: number
    hardInputTokens: number
    maxOutputTokens: number
    operationalCapTokens: number
    physicalWindowTokens: number
    postCompactionTargetTokens: number
    runtimeReserveTokens: number
}
```

### Validation

- 所有字段为 safe positive integers；target < trigger < hard input < effective window。
- physical/operational cap 至少能容纳 output reserve + runtime reserve + 1 input token，否则配置启动失败。
- exact default cloud budget：128000 / 12800 / 111104 / 77772 / 38886。
- exact default Ollama budget：32768 / 8192 / 20480 / 14336 / 7168。

## Internal Value Object: TokenEstimate

```ts
interface TokenEstimate {
    estimatedTokens: number
    framingTokens: number
    messageTokens: number
    safetyMarginTokens: number
    structuredPayloadTokens: number
}
```

该对象只保存数字，不保存 encoded tokens、raw input 或可反推出消息正文的摘要。`estimatedTokens` 是其他字段 subtotal 加 10% safety margin 后向上取整的最终 admission value。

## Internal Entity: CompactionCandidate

```ts
interface CompactionCandidate {
    messages: ChatThreadMessage[]
    pinnedDecisions: string[]
    summary: string
    estimatedTokens: number
}
```

### Candidate invariants

- output schema strict-valid。
- retained `messages` 是完整 turn pairs。
- `estimatedTokens <= postCompactionTargetTokens`。
- `estimatedTokens < originalMemoryTokens`。
- candidate 由 Runtime 计算 `lastCompactedAt`，模型不能提供。
- candidate invalid 时没有持久化副作用，也不能 promotion pins。

## Request-local Entity: PreparedModelInput

```ts
interface PreparedModelInput {
    budget: ContextBudget
    estimatedTokens: number
    fallback: 'none' | 'persistent-compaction' | 'ephemeral-fit'
    messages: BaseMessage[]
}
```

`PreparedModelInput` 只活在单次 request 中，不进入 ThreadState、GraphState、stream 或 usage persistence。`messages` 已经在 hard input budget 内；Provider 不再二次静默裁剪。

## Request-local Entity: ChatMemoryCompactionExecutionOptions

```ts
interface ChatMemoryCompactionExecutionOptions {
    signal?: AbortSignal
}
```

该对象只传递当前请求的取消控制权，不进入 checkpoint、hydration DTO、stream chunk 或日志。`signal` 被原样传给 compaction generator 的模型 invocation；取消时 `AbortError` 向上抛出，不能被转换成 request-local `EphemeralMemoryProjection`。

## Client-local Value: StreamCompletionRevision

```ts
type StreamCompletionRevision = number
```

该 revision 由浏览器内 `useChatStream` 在收到 protocol `finish` 时单调递增，仅供同一页面的 memory usage 刷新辨识“正常完成”。它不是 `AiMindThreadState`、hydration DTO、stream chunk 字段、API response 或 local snapshot 数据；取消、错误与暂停不改变它。

## Client-local Value: Pending Stream Text Flush

`useStreamTextBuffer` 以现有 `Map<messageId:partType:partId, PendingTextDelta>` 保存尚未提交给 reducer 的文本。普通 text/reasoning delta 由 40ms timer 合并后请求 rAF；pending Map 累计达到 48 个 Unicode code point，或出现代码围栏等结构性变化时，可提前请求该 rAF。flush 仍清空并完整提交该 Map，不保留第二个展示队列、不切分 `delta`，因此不引入新的持久化、snapshot、stream 或 API 数据形状。

## Client-local Values: Presentation and Accepted Turn

- presentationKey 由会话层拥有，初始值及每次真正新建/切换形成新展示代次；服务端确认草稿 ID 与后台对账保持代次不变。
- acceptedTurnRevision 在 stream hook 接受 send/regenerate/resume 后立即递增；空输入、已有请求、无可重新生成 turn、无 pending interrupt 的拒绝路径和重连不递增。
- shouldPositionAcceptedTurn 是当前 accepted turn 的浏览器瞬态资格：仅新问题 send 且提交前已有稳定历史为 true；首问、regenerate 和 resume 为 false。它随每次 accepted turn 覆盖，不进入消息、snapshot、hydration、stream 或 API。
- scroll intent 是 following/reading，与 stream status 正交。pending rAF 与历史 entry readiness 是局部控制状态，无持久化。
- `lastObservedTotalListHeight` 是按 presentationKey 重置的 policy-local 数值：首个 Virtuoso `totalListHeightChanged` 只建立基线；仅正向变化可在 following 的既有 rAF 内标记 force。它不进入 React 展示状态、业务消息、snapshot、hydration、stream 或 API。
- showScrollToBottom 是本地交互展示状态，不等同于 !atBottom：following 不从隐藏变可见，显式回底可保留已显示按钮至首次确认底部；reading 根据是否离底更新。无新增持久字段、计时器或 wire contract。

## Client-local Presentation: Accepted Turn Reply Runway

reply runway 由 `shouldPositionAcceptedTurn`、当前 busy 状态和最新 message role 派生，不保存为业务消息字段。已有历史的新问题在 submitted/streaming 阶段由一个仅供 Virtuoso 展示的 `TurnEntry` 承载 user 消息和 assistant loading slot，稳定复用 `accepted-turn-runway:{userMessageId}` item key；无 assistant 时 slot 显示思考态，有 assistant 时只替换 slot 内容。runway 通过同一个 CSS 长度作用于 assistant slot 的 `min-height`，ready/失败/取消后没有 runway 或 slot。TurnEntry 不改变真实 `messages` 数据、snapshot、hydration、stream、disclosure 或本地高度 hint。长度由 viewport 与已有 `bottomInset` 派生为 `clamp(10rem, calc(72dvh - bottomInset - 4rem), 48rem)`，不读取回复实际高度，且不改变 following/reading、Footer 或 Virtuoso handle 契约。

## Client-local Transition: Draft Promotion

服务端确认 ID 后会话层立即采用 selected identity，后台 registry 对账由 selection generation 隔离，失败不退回 draft。presentationKey、列表实例、折叠状态和阅读意图保持，无需页面按 streaming 判断 promotion 特例。

## Request-local Entity: EphemeralMemoryProjection

```ts
interface EphemeralMemoryProjection {
    pinnedDecisions: string[]
    recentMessages: ChatThreadMessage[]
    summary: string
}
```

### Selection order

1. 从 oldest-to-newest durable pins 的数组末尾向前加入能完整容纳的 pins；放不下的 pin 仅在当前 projection 中省略，不裁剪单条 pin。
2. 加入 summary；必要时只对当前 projection 做 token-safe shortening。
3. 从新到旧加入完整 turns。
4. 不写回 persisted state；被当前 projection 省略的 pins 仍完整保留在 checkpoint。

## Read-only Entity: ChatMemoryUsageSummary

```ts
interface ChatMemoryUsageSummary {
    effectiveWindowTokens: number
    usedPercent: number
}
```

- `usedPercent` 是 `estimateChatMemoryTokens(AiMindThreadState) / effectiveWindowTokens * 100` 的非负整数展示值；圆环绘制时可将视觉进度 clamp 到 100，但 tooltip 保留真实百分比。
- 分子仅含 `summary`、`pinnedDecisions` 与 complete raw `messages`，不含 system prompt、latest pending user input、UserMemory、tool/capability payload 或 output reserve。
- 这是由 `chat-memory/context-usage-contract.ts` strict schema 同时约束生产者与消费者的最小浏览器 DTO；不包含 thread ID、raw token count、memory content、model capability 或 Provider config，额外字段也必须拒绝。
- 草稿会话和安全读取失败没有该对象，Composer 直接隐藏 indicator。

## Compatibility and Migration

- 无 Prisma migration、checkpoint schema/table migration 或 backfill。
- 旧 checkpoint 仍可读取；固定 message-count validation 退出并不会改变 JSON field shape。
- `GET /api/chat/thread`、`threadHydrationDtoSchema`、`ChatStreamChunk` 和 frontend `MindMessage` 不增加字段；独立只读 usage endpoint 只返回 `ChatMemoryUsageSummary`。
- model catalog 新字段为 server source metadata；public model resolver 必须继续显式映射现有四个 public fields。

## Chat Scroll Presentation State

前端 presentationKey 与持久 intent 定义见 [contract](contracts/chat-scroll-policy.md)。无持久数据 migration；completion revision 保留 memory usage 刷新。

## Client-local Entity: TransientMessage

`TransientMessage` 由 shadcn Base UI Toast manager 在浏览器内管理，包含库定义的 `id`、`type`、`title`、可选 `description`、`timeout` 和 action。项目使用稳定业务 id 更新同一次操作；该对象不进入 React 页面状态、会话快照、Virtuoso items、ThreadState、stream 或 API。

持续故障不是 `TransientMessage`：它们继续由现有会话/hydration/cache/error 状态派生为所属功能区域的 `Alert`。详细位置见 [UI feedback contract](contracts/ui-feedback.md)。
