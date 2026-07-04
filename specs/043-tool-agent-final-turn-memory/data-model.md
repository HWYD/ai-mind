# 数据模型：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**功能**：[spec.md](./spec.md)  
**日期**：2026-07-03

## AiMindThreadState

表示当前浏览器会话可恢复的 current-chat memory。

### 字段

- `messages: ChatThreadMessage[]`
    - 最近的、仅文本的、用户可见消息。
    - 继续使用 v0.4.2 基于 recent turns 推导出的最大值。
- `summary: string`
    - 对更早 text-only final turns 的有界摘要。
- `pinnedDecisions: string[]`
    - 有界的重要决策与稳定上下文。
- `lastCompactedAt?: string`
    - 成功 compaction 的本地时间戳。

### 校验规则

- v0.4.3 中必须保持 text-only。
- 不得包含 final-turn source metadata、turn identity、display kind、raw runtime state、raw prompt、raw provider response、GraphState、checkpoint、RuntimeArtifact、workflow progress、subagent raw invocation/result、API key、cookie value 或 provider config。
- 可以包含 ordinary chat、tool/MCP/resource final answers、Tasklist final answer text summary 和 Delivery final report text 这几类最终 user/assistant 文本回合。

## ChatThreadMessage

表示一条已持久化、可恢复的消息。

### 字段

- `id: string`
    - 稳定的 message id，在可用时用于 hydration 与 duplicate checks。
- `role: "user" | "assistant"`
    - persisted role 仍只允许 user 和 assistant。
- `text: string`
    - 支持 Markdown 的用户可见文本。
- `createdAt: string`
    - 用于排序和 hydration 的时间戳。

### v0.4.3 中明确不存在的字段

- `source`
- `turnId`
- `displayKind`
- `toolCall`
- `toolResult`
- `resourceContent`
- `artifact`
- `graphState`
- `runtimeArtifact`
- `workflowProgress`
- `subagentResult`

### 校验规则

- `text` 在 trim 后必须非空。
- assistant message 必须代表 completed/final/controlled blocked 的最终回答。
- failed、exception、cancelled、paused、interrupted、transient 或空的 assistant outputs 必须被拒绝。
- Tasklist 的 assistant text 只允许是 final answer text summary；tasklist artifact markdown 必须排除。
- Delivery 的 assistant text 只允许是确定性截断后的 final report text，上限 8000 字符；`RuntimeArtifact` 对象和 manager trace 必须排除。

## FinalTurnCandidate

仅在 append 阶段使用，用来决定 final turn 是否可持久化的输入。

### 字段

- `source`
    - 不持久化的分类，例如 `chat`、`tool`、`mcp-resource`、`tasklist-agent`、`delivery-chain` 或未来受控 `agent`。
- `userText`
    - 该轮用户最新输入文本。
- `assistantText`
    - 经过必要 bounding 后，最终用户可见的 assistant 文本。
- `userMessageId?`
    - 可选，用于创建或去重 user message。
- `assistantMessageId?`
    - 可选，用于创建或去重 assistant message。
- `completionStatus`
    - append-time 状态分类，例如 `completed`、`final`、`blocked`、`failed`、`paused`、`cancelled` 或 `interrupted`。

### 校验规则

- 该实体不会按原样持久化。
- `source` 和 ids 可以用于 logging 或 guardrail，但不能写入 ThreadState message fields。
- 只有 completed/final/controlled blocked candidates 才允许 append。
- duplicate check 必须先对比当前 ThreadState：优先按相同 message id，缺失时按相同 user/assistant final text pair。
- 长 Delivery `assistantText` 必须在 append 前先做确定性截断，上限 8000 字符。Tasklist 只使用 final answer text summary，不持久化 artifact markdown。

## ThreadHydrationDTO

当前 chat thread route 返回的安全公开恢复 payload。

### 字段

- `threadId: string`
- `messages: HydratedMindMessage[]`
- `summaryPreview?: string`
- `pinnedDecisions: string[]`
- `restored: boolean`

### 校验规则

- 结构保持与 v0.4.2 兼容。
- hydrated messages 仍然是普通 completed user/assistant text messages。
- 不得包含 source metadata、tool/resource/agent/workflow/artifact parts、raw checkpoint、GraphState、RuntimeArtifact、provider response、stack、cookie、API key 或 provider config。

## ChatMemoryContext

针对符合条件的 ordinary chat path，由 ThreadState 组装出的 model-visible context。

### 字段

- `summaryMessage?`
- `pinnedDecisionsMessage?`
- `recentMessages: ChatThreadMessage[]`
- `currentUserMessage`

### 校验规则

- 如果 tool/MCP/Tasklist/Delivery final turns 已经以 text-only `ChatThreadMessage` 持久化，那么它们可以出现在 recent text messages 里。
- 不得包含 source metadata 或 raw runtime state。
- structured runtimes 即使能写 final turns，也不会自动获得 ordinary chat memory context。

## 状态生命周期

```text
Runtime completes final visible answer
  -> builds append-time FinalTurnCandidate from safe text only
  -> rejects failed / paused / cancelled / empty / raw runtime candidates
  -> bounds long Tasklist or Delivery final text
  -> reads current ThreadState
  -> skips duplicate message id or identical user/assistant final pair
  -> appends user + assistant ChatThreadMessage
  -> compacts if over threshold
  -> hydration later maps messages to ordinary text MindMessage[]
```

## 关系

- `FinalTurnCandidate` 只存在于 append 阶段，不会持久化。
- `AiMindThreadState.messages` 拥有可恢复的已持久化文本回合。
- `ThreadHydrationDTO` 由 `AiMindThreadState` 派生，绝不暴露 raw checkpoint 或 metadata。
- Tasklist 的 `GraphState`、`AgentRun`、`AgentInterrupt`，以及 Delivery 的 `RuntimeArtifact` 和 subagent traces，仍然是独立的 runtime/business state，与 `AiMindThreadState` 无直接关系。
