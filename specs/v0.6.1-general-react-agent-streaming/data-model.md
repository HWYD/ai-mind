# Data Model: v0.6.1 General ReAct Agent Streaming

## Overview

本版本不新增数据库实体。新增的是 public stream entity、browser message Part 与 Run-local projection state。所有新增状态必须是 JSON-safe、strict-schema validated，不包含 writer、AbortSignal、raw provider event、raw reasoning、raw Tool output 或 secret。

## 1. AgentModelTurn

一次逻辑模型调用的完整边界。

| Field                | Type             | Rule                                                                                                                            |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `modelTurnId`        | non-empty string | Run 内唯一；model retry 必须使用新的 attempt identity，但只允许首次 public delta durable publish 前发生，逻辑调用归属保持可观测 |
| `runId`              | non-empty string | 与 General Agent Run 一致                                                                                                       |
| `ordinal`            | positive integer | 逻辑模型调用顺序，从 1 开始                                                                                                     |
| `toolCalls`          | ordered list     | 完整 Tool Call；按模型 ordinal 排序                                                                                             |
| `finishClass`        | enum             | `natural/length/content_filter/error/cancelled/deadline/unknown`；明确非自然 metadata 可否决 `natural`                          |
| `messageComplete`    | boolean          | 是否同时具有完整 AIMessage 与正常 stream 闭合证据                                                                               |
| `publicTextNonEmpty` | boolean          | 只计算公开 text/content，不计算 reasoning                                                                                       |
| `kind`               | enum             | `loop/finalizer`                                                                                                                |

### Validation

- `kind=loop` 的最大 ordinal 为 10；`kind=finalizer` 每 Run 最多一次且总模型调用不得超过 11。
- `finishClass=natural` 不等价于 final answer；仍需 no Tool、完整消息、正常 stream 闭合、非空正文和 Run 未取消/未超时。Provider 缺失 finish metadata 不会单独令 `finishClass` 变为 `unknown`；明确的非自然 metadata 必须否决 `natural`。空白 natural no-Tool 轮次不得提交 final，但可进入 constrained finalizer eligibility 判定。
- Tool Call 参数必须先通过既有 server Tool schema/policy，AgentModelTurn 本身不授予权限。

## 2. AgentTextPart

General Agent 一个模型轮次的 public-safe 正文投影。它不复用普通 `TextPart`。

| Field         | Type    | Rule                                   |
| ------------- | ------- | -------------------------------------- |
| `id`          | string  | 等于 stream `partId`；稳定且全消息唯一 |
| `type`        | literal | `agent-text`                           |
| `runId`       | string  | 必须匹配所属 `AgentRunPart`            |
| `modelTurnId` | string  | 一个 AgentTextPart 只属于一个模型轮次  |
| `phase`       | enum    | `pending/commentary/final_answer`      |
| `status`      | enum    | `streaming/completed/interrupted`      |
| `text`        | string  | 按 delta 顺序累积的 public text        |
| `format`      | literal | `markdown`                             |

### State transitions

| From                           | Event                                | To                                    | Allowed                                        |
| ------------------------------ | ------------------------------------ | ------------------------------------- | ---------------------------------------------- |
| absent                         | phase-less `agent-text-start`        | pending + streaming                   | yes, all v0.6.1 model text including finalizer |
| streaming                      | matching delta                       | same phase + appended text            | yes                                            |
| pending + streaming            | end(outcome=commentary, completed)   | commentary + completed                | yes, turn has Tool                             |
| pending + streaming            | end(outcome=final_answer, completed) | final_answer + completed              | yes, natural no-Tool terminal                  |
| pending/commentary + streaming | end(outcome=commentary, interrupted) | commentary + interrupted              | yes, partial/non-natural                       |
| final_answer + streaming       | end(outcome=final_answer, completed) | final_answer + completed              | yes                                            |
| any terminal                   | any delta/end/phase change           | unchanged + protocol violation signal | no                                             |
| final_answer + completed       | later Tool Call                      | Run contract violation                | no                                             |

`phase` 是 reducer 物化的客户端状态：收到无 outcome 的 start 后为 `pending`，收到 end 后才按后端 outcome 解析。`pending` 不能以 completed 状态长期存在；Tool-only turn 不创建 AgentTextPart。

### AgentRunPart completion provenance

| Field              | Type                 | Rule                                                                                                 |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `status`           | existing enum        | `running/completed/cancelled/failed`；不新增 wire `incomplete`                                       |
| `finalizationMode` | optional public enum | `normal/constrained`；completed v0.6.1 AgentText Run 必填，历史无 AgentText chunk 可缺失并沿用旧行为 |

`finalizationMode=constrained` 使 UI 派生 `headerStatus=incomplete`，但 AgentRun status 仍为 `completed`；它也是 Chat Memory/UserMemory 排除、同会话 history 准入和 constrained snapshot 恢复的权威依据。若同 Run 已收到 `agent-text-*` 却收到没有 finalizationMode 的 completed end，reducer 必须 fail closed。

## 3. Public chunk entities

### AgentTextStartChunk

`type/partId/runId/modelTurnId`。不携带 `phase` 或 outcome；reducer 由 start 到 end 未解析的窗口派生 `pending`，commentary/final_answer 只能由 end 的 outcome 解析。

### AgentTextDeltaChunk

`type/partId/delta`。delta 必须非空；只追加既存 streaming Part。

### AgentTextEndChunk

`type/partId/outcome/status`。采用 discriminated union：`commentary` 允许 `completed/interrupted`；`final_answer` 只允许 `completed`。partial finalizer 必须 fail closed，不得发布 `final_answer/interrupted`。

### AgentRunEndChunk extension

既有 `agent-run-end` 新增可选 `finalizationMode`：`normal|constrained`。它只允许与 `status=completed` 同时出现；v0.6.1 producer 对已产生 AgentTextPart 的 completed Run 必须发送该字段。历史无 AgentText 的 completed end 允许缺失，以保持 additive parsing。

## 4. ModelTurnProjectionState

Run-local、非持久化对象，用于把 provider stream 归一化到 Agent text contract。

| Field                 | Type                    | Purpose                                                                    |
| --------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `partId`              | string or null          | 首个 public delta 时创建                                                   |
| `modelTurnId`         | string                  | 当前模型轮次 identity                                                      |
| `publicText`          | string buffer/segments  | 仅用于最终 assistantText 与校验；durable stream 仍增量写                   |
| `textStarted`         | boolean                 | 防止重复 start                                                             |
| `publicTextPublished` | boolean                 | 首个 public delta durable publish 后置为 true；一旦 true，禁止 model retry |
| `textEnded`           | boolean                 | 防止重复 end                                                               |
| `sawToolCall`         | boolean                 | 完整/增量 Tool 结构的存在证据                                              |
| `finishClass`         | normalized enum or null | turn end 后必填                                                            |
| `resolvedPhase`       | resolved phase or null  | 只在完整 turn resolution 时设置                                            |

该 state 不得跨 Run 共享，不进入 GraphState checkpoint，不记录 raw reasoning。

## 5. GeneralReActAgentState changes

v0.6.0 的 Action/Answer 命名应迁移为 loop/finalizer 语义。

| v0.6.0 field/meaning                                          | v0.6.1 replacement                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `_actionDeadlineAtMs`                                         | `_loopDeadlineAtMs`                                                            |
| `_actionModelCallCount`                                       | `_loopModelCallCount`                                                          |
| `_actionRoundCount`                                           | `_toolBearingRoundCount`                                                       |
| `_runPhase=acting/answering`                                  | `_runPhase=looping/finalizing`                                                 |
| `_finalizationMode=normal/constrained/deterministic_fallback` | 保留值，但 `normal` 来自 loop final_answer；`constrained` 只来自异常 finalizer |
| fixed Answer reservation                                      | abnormal-only finalizer reservation                                            |

新增/更新 counters 上限：loop model 10、tool-bearing rounds 9、logical tools 14、total model 11、observation 48k、recursion 24。

## 6. GeneralAgentTraceView

Trace row union 保留 detail 行，并增加携带完整 Agent text 的正文行：

```text
GeneralAgentTraceRow =
  | { kind: agent-text, part: AgentTextPart, ordinal, status }
  | { kind: prompt | resource | skill | tool, label, ordinal, status, toolName?, readSources? }
```

AgentText row 使用 AgentTextPart identity 与 ordinal；`pending` 与 commentary 都必须保存正文 renderer 所需的完整 Part，而不是压成带 label 的状态行。它没有自身 chevron、child detail 或 Tool ownership。`web-search` Tool 的 `label` 只从该 Part 的安全 discovered source 去重得到，不得使用 Trace 聚合计数或 raw input/query。`readSources` 只属于产生安全 read source 的 Tool row，按 Tool 的 source 顺序紧随该 row 渲染，不创建 Trace footer 或独立顶层 ordinal。`foldableDetails = commentary + current prompt/resource/skill/tool rows + readSources`；pending 仅在已有 foldable details 时加入顶层时间线，不独立制造 disclosure。

## 7. DisclosureState (UI-local)

| Field                   | Type               | Rule                                                                                           |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `open`                  | boolean            | active+details 默认 true；completed restored 默认 false                                        |
| `userOverride`          | `none/open/closed` | 同一 live message 生命周期内 sticky，不写稳定 snapshot                                         |
| `autoCollapsedForFinal` | boolean            | 每 Run 最多从 false→true 一次                                                                  |
| `hasFoldableDetails`    | boolean derived    | pending/final 不计入；commentary/Tool/etc 计入                                                 |
| `headerStatus`          | enum               | `running/completed/cancelled/failed/incomplete`；`constrained` finalizer 成功使用 `incomplete` |

无详情时不得实例化可交互 disclosure trigger；只渲染状态标题。`constrained` finalizer 的 Run completion 与 `DisclosureState.headerStatus=incomplete` 独立：前者允许保留 final answer，后者保证 Trace 不被误标为完整成功。

## 8. FinalAnswerProjection

从一个 completed assistant message 中选择正文：

1. 若消息属于 General Agent：只按 parts 顺序选择 `type=agent-text && phase=final_answer && status=completed && text.trim() !== ''`；必须恰好一个。
2. 若不是 General Agent：沿用普通 `TextPart` 规则。
3. pending/commentary/interrupted 永远排除。

同一 projector 语义必须被 copy、feedback、follow-up、Chat Memory、UserMemory、history adapter、snapshot completion 和 message actions 复用；允许在模块边界内共享有业务语义的类型守卫/选择器。

## 9. Snapshot projection

completed General Agent snapshot 可包含：含 finalizationMode 的 completed AgentRunPart、completed commentary AgentTextParts、completed Tool/Skill/Resource/Prompt public projections、completed final_answer。`constrained` 仅保留 completed public-safe rows 与 final answer；不得包含 pending、interrupted、raw Tool fields、cancelled/failed Run、UI disclosure state。

snapshot schema version 和 message geometry fingerprint 必须升级；旧 snapshot 按既有 TextPart 继续读取，不被迁移成 AgentTextPart。

## 10. Budget invariants

```text
maxLoopModelCalls              = maxToolBearingRounds + 1 = 10
maxModelCalls                  = maxLoopModelCalls + reservedFinalizerModelCalls = 11
loopDeadlineMs + maxFinalizerMs + terminalReserveMs = hardDeadlineMs
235000 + 30000 + 5000 = 270000
maxLogicalToolCalls            = 14
maxObservationChars            = 48000
maxObservationCharsPerCall     = 12000
```

retry attempts 不增加 logical Tool/model call counter，但分别受现有 Run retry permit 约束。模型 retry 还必须受 `publicTextPublished=false` 限制；不得撤回或覆盖已发布 AgentTextPart。finalizer 即使未产生正文，只要实际调用模型也消耗 reserved call。

## 11. TrustedUserUrlCatalog (run-local)

不新增数据库表或 public stream entity。每个 General ReAct Run 在服务端构造一个 run-local URL catalog，供 `_authorizedUrls` 和 loop system prompt 使用：

| Field             | Rule                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonicalUrl`    | 每次通过 existing public-web/secret policy canonicalize 的公开 URL                                                                                                                |
| `origin`          | `current-user` 或 `thread-raw-user`; 不公开到 Trace/Memory/snapshot                                                                                                               |
| `maxEntries`      | 最近 8 个去重 URL，current user URL 优先                                                                                                                                          |
| `source boundary` | current request user text + 同一已验证 conversation 的 server Chat Memory 原始 `user` messages；不读 client history、assistant、summary、pinned decision、UserMemory、Tool output |

catalog 不是 Tool execution record。没有可用原始 user turn 或用户只追问旧 Run 是否执行时，Runtime 不创建历史事实、不自动 read-url，并要求用户重新给出 URL 或明确要重新读取。
