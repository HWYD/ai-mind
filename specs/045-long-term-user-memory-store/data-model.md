# Data Model: AI Mind v0.4.5 Long-term User Memory Store Baseline

## UserMemoryDocument

表示当前 browser session 范围内的一条长期用户记忆。它保存于 LangGraph Store，不属于 conversation `ThreadState`。

### Fields

| Field                        | Type                   | Required | Notes                                                                               |
| ---------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------- |
| `schemaVersion`              | string                 | yes      | v0.4.5 初始为 `user-memory.v1`。                                                    |
| `stableKey`                  | string                 | yes      | deterministic normalized identity，用于 dedupe、update、suppression。               |
| `type`                       | UserMemoryType         | yes      | 只允许 v0.4.5 白名单类型。                                                          |
| `text`                       | string                 | yes      | 干净的长期记忆文本；单条 context injection 最多使用 300 中文字符。                  |
| `tags`                       | string[]               | yes      | 检索辅助标签，必须经过 normalization。                                              |
| `confidence`                 | number                 | yes      | `0..1`；写入和 retrieval MVP 要求 `>= 0.7`。                                        |
| `identity`                   | UserMemoryIdentity     | yes      | stable key 的结构化 identity；程序基于它生成 stable key。                           |
| `status`                     | UserMemoryStatus       | yes      | `active`、`inactive`、`suppressed`。retrieval 只使用 `active`。                     |
| `source`                     | UserMemorySource       | yes      | `eligible_completed_turn` 或 `pinned_decision_promotion`。                          |
| `sourceSignal`               | UserMemorySourceSignal | no       | 例如 `explicit_memory_intent`、`implicit_stable_preference`、`forget_or_negation`。 |
| `sourceConversationId`       | string                 | yes      | persisted conversation identity；不得来自 draft。                                   |
| `sourcePinnedDecisionHash`   | string                 | no       | promotion 来源的 pinnedDecision normalized hash。                                   |
| `createdAt`                  | string                 | yes      | ISO timestamp。                                                                     |
| `updatedAt`                  | string                 | yes      | ISO timestamp。                                                                     |
| `lastUsedAt`                 | string                 | no       | 仅当 retrieval 成功使用时更新；可在实现 Step 中延后，但字段模型保留。               |
| `suppressedAt`               | string                 | no       | forget / negation suppression 时间。                                                |
| `suppressedByConversationId` | string                 | no       | 触发 suppression 的 source conversation。                                           |
| `reason`                     | string                 | no       | candidate 提取或 promotion reason 的安全摘要，不保存 raw prompt。                   |

### UserMemoryType

```text
user_preference
communication_preference
workflow_preference
standing_instruction
recurring_constraint
stable_user_context
project_context
risk_preference
```

- `user_preference`: 承接长期、非敏感、可复用的用户偏好，例如喜欢吃什么、穿什么、做什么、不喜欢什么。
- `stable_user_context`: 承接长期稳定、非敏感、对后续协作有帮助的用户背景，例如职业、年龄、身高、常用操作系统、终端或长期工作背景。

### UserMemoryStatus

```text
active
inactive
suppressed
```

### UserMemorySource

```text
eligible_completed_turn
pinned_decision_promotion
```

### UserMemorySourceSignal

```text
explicit_memory_intent
implicit_stable_preference
standing_instruction_signal
forget_or_negation
pinned_decision_signal
```

### UserMemoryIdentity

```text
subject: string
facet?: string
polarity?: prefer | avoid
```

- `subject`: 该长期记忆的稳定核心对象或主题，例如 `桃子`、`技术解释`、`Windows PowerShell`、`AI Mind 版本规划`。
- `facet`: 可选的稳定补充限定，例如 `先大白话再专业`、`中文可复制`、`spec阶段优先`。
- `polarity`: 主要用于 `user_preference`，明确区分 `prefer` / `avoid`，替代程序从中文句子里硬编码猜测喜欢或不喜欢。

### Validation Rules

- `text` 不能为空，不能过长，不能包含完整 transcript、raw tool result、MCP raw envelope、GraphState、RuntimeArtifact、workflow progress、raw prompt、raw provider response、stack、API key、cookie 或 provider config。
- 敏感个人信息默认拒绝。
- `stability` 为 `temporary` 或 `speculative` 的 candidate 必须被 deterministic validation 拒绝；只有 `stable` candidate 才可能进入持久化。
- `identity.subject` 不能为空；`identity` 中的 `subject/facet` 不能包含 raw runtime、full transcript、敏感个人信息或 provider internals。
- `type` 必须在白名单内。
- `confidence >= 0.7` 才能写入 active memory 或参与 retrieval。
- `sourceConversationId` 必须存在，且必须是已转正 persisted conversation。
- `stableKey` 必须由程序基于 structured `identity` deterministic normalization 生成或规范化，不能只信模型输出，也不应引入中文句子语义解析作为主路径。
- `status !== active` 的 document 不参与 retrieval。

## UserMemoryCandidate

表示尚未入库的候选长期记忆。

### Fields

| Field                  | Type                                 | Required | Notes                                                                 |
| ---------------------- | ------------------------------------ | -------- | --------------------------------------------------------------------- |
| `type`                 | UserMemoryType                       | yes      | 候选类型。                                                            |
| `text`                 | string                               | yes      | 候选 memory text。                                                    |
| `tags`                 | string[]                             | yes      | 候选标签。                                                            |
| `confidence`           | number                               | yes      | 模型或规则给出的置信度；最终由程序验证。                              |
| `stability`            | `stable \| temporary \| speculative` | yes      | 模型对长期稳定性的结构化判断；程序消费该字段，不再用窄 regex 猜语义。 |
| `identity`             | UserMemoryIdentity                   | yes      | stable key 的结构化 identity；模型提供、程序规范化。                  |
| `source`               | UserMemorySource                     | yes      | eligible completed turn 或 pinnedDecision promotion。                 |
| `sourceConversationId` | string                               | yes      | 必须已持久化。                                                        |
| `sourceText`           | string                               | yes      | 仅用于当前 validation，不直接原样入库。                               |
| `action`               | `add \| suppress`                    | yes      | 结构化 extraction 建议的动作；最终执行由程序决定。                    |
| `sourceSignal`         | UserMemorySourceSignal               | no       | explicit intent、隐式稳定偏好、forget/negation 等语义信号。           |
| `reason`               | string                               | no       | promotion / extraction reason。                                       |
| `conflictSignal`       | boolean                              | no       | 是否表达对旧 memory 的否定或更新。                                    |

### Lifecycle

```text
eligible completed turn or pinnedDecision diff
  -> structured candidate extraction (0..N candidates)
  -> deterministic validation
  -> stable key normalization over structured identity
  -> duplicate / conflict check
  -> put active document OR suppress existing document OR reject
```

## UserMemoryExtractionJob

表示 assistant final turn 完成后异步运行的内部后台 job。v0.4.5 中它是 in-process best-effort job，不是 durable queue job，不需要 worker system 或 retry scheduler。它不是 stream chunk，不进入 frontend reducer，也不是主 assistant 可调用 tool。

### Fields

| Field                  | Type                                           | Required | Notes                                                             |
| ---------------------- | ---------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `sessionId`            | string                                         | yes      | 用于派生 browser-session namespace；不得写入 raw id。             |
| `sourceConversationId` | string                                         | yes      | persisted conversation identity。                                 |
| `latestUserText`       | string                                         | yes      | 本轮 user text；只用于 extraction，不直接持久化。                 |
| `assistantFinalText`   | string                                         | yes      | 本轮 assistant final text；只用于 extraction，不直接持久化。      |
| `path`                 | `ordinary_chat \| tool_assisted_ordinary_chat` | yes      | Tasklist / Delivery 不允许。                                      |
| `safeShortTermContext` | object                                         | no       | 可包含 bounded summary / pinnedDecisions，不包含 raw transcript。 |

### Rules

- 每个 eligible completed ordinary turn 必须 enqueue 一个 job，且只在 completed turn 后运行。
- failed / cancelled / rejected / draft 未转正请求不创建 job。
- job input 只能包含本轮 user text、assistant final text 和 allowlisted safe short-term context，不能包含 full messages、raw transcript、raw tool/runtime/provider data。
- job 可以输出 0 条 candidate。
- job failure 不影响用户可见回答。

## UserMemoryNamespace

LangGraph Store namespace。

### Shape

```text
["ai-mind", "user-memory", "v1", "<sessionScopeHash>"]
```

### Rules

- `<sessionScopeHash>` 必须从 browser session id 派生，但不得暴露 raw session id。
- namespace 不包含 conversation id、checkpoint id、API key、cookie 或 provider config。
- 同一 browser session 下多个 conversations 共享同一 namespace。

## StableKey

用于同一长期记忆的 dedupe 和 update/suppression。

### Shape

```text
<type>:<normalized-identity-segments>
```

### Rules

- 由程序基于 structured `identity` normalization 生成。
- 必须大小写、空白、常见标点归一化。
- 对 `user_preference`，优先使用 `polarity + subject (+ optional facet)`，例如 `prefer-桃子`、`avoid-香菜`。
- 对 instruction-like 类型，应优先使用 `subject + optional facet`，例如 `技术解释-先大白话再专业`。
- 对 context-like 类型，应优先使用稳定主题 anchor，例如 `windows-powershell`、`ai-mind-版本规划`。
- 不包含 raw source text hash 作为唯一身份；hash 可作为辅助字段。

## SelectedUserMemory

表示一次 eligible chat request 被选中的 UserMemory。

### Fields

| Field       | Type           | Required | Notes                          |
| ----------- | -------------- | -------- | ------------------------------ |
| `stableKey` | string         | yes      | 来源 document identity。       |
| `type`      | UserMemoryType | yes      | 用于 context label。           |
| `text`      | string         | yes      | 注入文本，最多 300 中文字符。  |
| `tags`      | string[]       | yes      | 可用于测试断言。               |
| `score`     | number         | yes      | 规则相关性分数，不暴露给用户。 |

### Selection Rules

- 当前 browser session scope only。
- `status === active`。
- `confidence >= 0.7`。
- 与 latest user input 相关。
- 最多 3 条，总注入最多 900 中文字符。

## UserMemoryRuntimeConfig

### Fields

| Field                 | Type                 | Default                                            | Notes                              |
| --------------------- | -------------------- | -------------------------------------------------- | ---------------------------------- |
| `storeMode`           | `memory \| postgres` | development/test: `memory`, production: `postgres` | 来自 `AI_MIND_USER_MEMORY_STORE`。 |
| `postgresSchema`      | string               | `langgraph_user_memory`                            | 可由实现保留常量，不必开放 env。   |
| `maxSelectedMemories` | number               | `3`                                                | v0.4.5 固定 MVP 上限。             |
| `maxMemoryChars`      | number               | `300`                                              | 中文字符上限。                     |
| `maxTotalChars`       | number               | `900`                                              | 总注入上限。                       |
| `minConfidence`       | number               | `0.7`                                              | validation / retrieval 共用。      |

## Relationships

- 一个 browser session namespace 包含多条 `UserMemoryDocument`。
- 一个 `UserMemoryDocument` 必须关联一个 source persisted conversation。
- 一个 chat request 可选择 0..3 条 `SelectedUserMemory`。
- `ThreadState` 与 `UserMemoryDocument` 没有嵌套关系；只在 context assembly 时并列进入 model-visible context。

## State Transitions

```text
Candidate rejected
Candidate accepted -> UserMemoryDocument(active)
UserMemoryDocument(active) -> UserMemoryDocument(active updated)
UserMemoryDocument(active) -> UserMemoryDocument(suppressed)
UserMemoryDocument(suppressed) -> not selected by retrieval
```

## Non-Persisted Runtime Objects

- model extraction raw output
- extraction job payload
- validation diagnostics
- retrieval intermediate score details
- raw latest user input
- raw assistant final text
- raw pinnedDecision diff input

这些对象只允许在当前请求内使用，不能作为 UserMemory document 原样保存。
