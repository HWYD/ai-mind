# Contract: General ReAct Runtime Loop

## Authority

本契约 supersede v0.6.0 D032。`createAgent(version='v2')` 仍是唯一普通 Tool loop，但 loop 的自然 no-Tool AIMessage 现在直接拥有最终回答 authority。不得以 `RunnableSequence`、手写 `bindTools` 链或 legacy `AgentExecutor` 重建该 loop；它们可以承载确定性的外围准备步骤，但不得拥有本契约的 Tool 调度、预算或终止 authority。

## Normal loop algorithm

1. 完成既有确定性 context preparation，发布 `agent-run-start`。
2. 为逻辑模型调用创建 `modelTurnId`，检查 loop deadline/model budget。
3. 绑定现有 `GeneralToolPolicy` tools 运行模型；public text 由 Agent text projector 立即输出，raw reasoning 只留 provider/internal context。
4. 完整模型轮次后执行 phase resolution：
    - 有 Tool Calls：正文→commentary；执行 batch admission 和 Tool Runtime；继续 loop。
    - 无 Tool、natural、complete、正文非空：正文→final_answer；结束 loop。
    - 其他：进入 abnormal termination policy。
5. final answer durable completed 后，生成 runner `assistantText`，结束 Trace 与 Run；不得调用固定 Answer。

## Model retry boundary

现有每 Run 最多一次模型 retry 只适用于首次 public Agent text delta durable publish 前的 attempt 失败。一个 attempt 已发布任一 public delta 后，Runtime/Middleware MUST 禁止 retry；不得撤回 durable event，也不得以新 attempt 拼接、替换或重放正文。已公开正文必须以 `agent-text-end(outcome=commentary, status=interrupted)` 收口，随后仅按既有 abnormal finalizer gate 或安全终态处理。

## Required scenario matrix

| Scenario                        | Model turns                        | Public order                            |    Calls |
| ------------------------------- | ---------------------------------- | --------------------------------------- | -------: |
| Tool → final text               | tool-only；natural text            | Tool → final_answer                     |        2 |
| text → Tool → final text        | text+Tool；natural text            | commentary → Tool → final_answer        |        2 |
| Tool → text → Tool → final text | tool-only；text+Tool；natural text | Tool → commentary → Tool → final_answer |        3 |
| only final text                 | natural text                       | pending stream → final_answer           |        1 |
| parallel Tools → final          | multi-Tool；natural text           | Tool rows by ordinal → final_answer     |        2 |
| empty text + Tool               | Tool turn                          | Tool only                               | continue |

## Finish normalization

完整 AIMessage 加 Agent stream 正常闭合是 natural 的主证据：它们与 no Tool、non-empty、未取消/未越界共同允许 normal final。Provider metadata 缺失时不得仅因此归类 `unknown`；Provider 明确给出的 `length`、content filter、error、abort 或其他非自然值必须否决 natural。只有消息/闭合证据无法证明，或 provider 明确给出 unknown 且无法判明执行状态时，才可进入 `unknown`。

| Normalized class     | Can be normal final?          | Policy                                                  |
| -------------------- | ----------------------------- | ------------------------------------------------------- |
| `natural` + complete | yes, only no Tool + non-empty | commit final                                            |
| `length`             | no                            | interrupted; optional finalizer                         |
| `content_filter`     | no                            | fail closed；不得用 finalizer 绕过 provider safety stop |
| `error`              | no                            | interrupted; optional finalizer if state known          |
| `cancelled`          | no                            | stop immediately; no finalizer                          |
| `deadline`           | no                            | stop immediately; no finalizer                          |
| `unknown`            | no                            | fail closed; no finalizer if execution status unknown   |

Provider adapters may map provider-specific values into these classes, but Runtime/UI may not branch on provider names.

## Abnormal finalizer gate

Finalizer MAY start only if all are true:

- trigger 是非自然/预算停止，或完整正常闭合但 natural no-Tool 正文为空；
- no completed final answer exists;
- Run not explicitly cancelled;
- hard deadline signal not aborted;
- underlying model/Tool execution state is known and settled;
- remaining time can reserve 5,000ms terminal window;
- reserved finalizer call unused and total calls < 11;
- reliable messages/observations exist or a safe limitation answer can be produced.

Finalizer uses same selected model, no Tools, `maxRetries=0` at provider layer plus existing single logical model retry ownership only if remaining budget permits and before its first public delta, timeout `min(30,000ms, hardDeadlineAt-terminalReserve-now)`。它的 prompt 必须只允许使用可靠 observations，并禁止声称未执行/失败的操作成功。

## Stop and provenance

| Outcome                                | `finalizationMode`       | Memory eligible                                       |
| -------------------------------------- | ------------------------ | ----------------------------------------------------- |
| loop natural final                     | `normal`                 | yes, subject to existing policy                       |
| abnormal finalizer complete            | `constrained`            | no；正文为 final answer，Trace 显示“处理未完成”并展开 |
| deterministic safe fallback            | `deterministic_fallback` | no                                                    |
| cancel/deadline/failure without answer | none/failure             | no                                                    |

正常 loop final 与 constrained finalizer complete 都必须以 `agent-run-end(status=completed, finalizationMode=normal|constrained)` 结束。`finalizationMode` 是 public DTO：前端以它选择“已完成思考”或“处理未完成”，Memory 以它拒绝 constrained，snapshot 以它保留恢复语义；不得仅存于 runner 内部 state。

## Rejected Tool transcript and URL provenance

模型已发出、且名称可安全映射到当前 General Tool definition 的 ToolCall，即使在 provider 执行前被 budget、scope、schema、secret/web policy、duplicate 或 URL provenance 拒绝，也必须按发生顺序写出同一 Tool part 的 `tool-start` 与 tool-scope `error`。它代表“模型请求未执行”；不得发布 `tool-end`，因为现有 consumer 会把它解释为 completed。start 的显示字段和 error message 都必须是固定脱敏文案，禁止 raw input、URL/query、secret、fingerprint、internal error、raw provider result 和 sources。对应 provider 调用数为零，ToolMessage 仍只服务后续模型轮次。

`read-url` 不需要交互式授权：当前 user message 中每个通过 existing public-web/secret policy 的 URL 自动可读。同会话后续请求最多可获得 8 个由服务端、已验证 conversation ownership 的 Chat Memory 原始 user turn 提供的 URL；每次使用前重新 canonicalize。assistant text、summary、pinned decision、UserMemory、Tool result、client history 和被 compaction 删除的 raw turn 均不是 grant source。URL catalog 只允许一次新的、明确请求的读取；不证明先前 Run 是否调用或成功读取过 Tool，也不能触发自动补读。

## Fixed budget

```text
maxToolBearingRounds = 9
maxLogicalToolCalls = 14
maxLoopModelCalls = 10
reservedFinalizerModelCalls = 1
maxModelCalls = 11
loopDeadlineMs = 235000
maxFinalizerMs = 30000
terminalReserveMs = 5000
hardDeadlineMs = 270000
maxObservationCharsPerCall = 12000
maxObservationChars = 48000
maxNoProgressRounds = 2
recursionLimit = 24
maxToolConcurrency = 3
maxToolRetries = 4
maxModelRetries = 1
```

## Unchanged policies

- admitted logical Tool Call retry 不重复计数；
- remote readonly 单调用最多 retry 2、Run 实际 Tool retries 最多 4；
- local deterministic 5s、calculator/datetime 1s、remote readonly 20s；
- effective timeout 取 Profile/Tool/loop/Run 剩余最小值；
- active runs/process=8，无内存排队；
- Tool allowlist、URL grant、secret block、source projection、maxConcurrency=3 不变。

## Contract violations

以下必须 fail closed：final 后 Tool；未解析 pending 就完成 Run；第 10 个 loop call 仍请求 Tool；第 15 个 logical Tool；第二个 finalizer；模型/Tool result 在 abort 后进入 stream/state；Tool ordinal/message pairing 不一致；raw reasoning 被当 public text。
