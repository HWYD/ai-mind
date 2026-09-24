# Contract: Agent Text Stream

## Scope

本契约只适用于 General ReAct Agent 的模型可见正文。现有普通 `text-start/delta/end`、`reasoning-*`、`agent-run-*`、`agent-graph-*` 与 Tool/Resource/Prompt chunks 不改变。

## Public types

```ts
type AgentTextResolution = 'commentary' | 'final_answer'
interface AgentTextStartChunk {
    type: 'agent-text-start'
    partId: string
    runId: string
    modelTurnId: string
}

interface AgentTextDeltaChunk {
    type: 'agent-text-delta'
    partId: string
    delta: string
}

type AgentTextEndChunk =
    | {
          type: 'agent-text-end'
          partId: string
          outcome: 'commentary'
          status: 'completed' | 'interrupted'
      }
    | {
          type: 'agent-text-end'
          partId: string
          outcome: 'final_answer'
          status: 'completed'
      }
```

所有对象必须由 strict schema 校验。ID 为非空字符串，delta 为非空字符串，不允许未知字段。`final_answer/interrupted` 在类型层即为非法组合。

`pending` 不是 wire enum：客户端在收到 start、尚未收到匹配 end 时派生它；只有后端能在 end 上写入 `outcome`。

`agent-run-end` 保持 additive，并为 completed General Agent Run 新增可选 public 字段：

```ts
finalizationMode?: 'normal' | 'constrained'
```

v0.6.1 producer 对已产生 `agent-text-*` 的 completed Run MUST 写入该字段；它是 `constrained` Trace header、Memory 与 snapshot 的唯一 public provenance。历史没有 AgentTextPart 的 completed `agent-run-end` 可缺失该字段；若同 Run 已有 AgentTextPart 却缺失该字段，v0.6.1 reducer MUST fail closed。`cancelled`/`failed` end 不得携带该字段。

## Producer invariants

1. 每个 `partId` 恰好一个 start、零到多个 delta、恰好一个 end；Tool-only turn 可以完全没有 Agent text chunks。
2. 所有 loop/finalizer 正文 start 只携带身份，不得提前携带 commentary/final_answer 的裁决；客户端据此进入 `pending` 暂态。
3. turn 含 Tool Call 时，若有正文，end 必须为 `outcome=commentary/status=completed`，并在该 turn 的首个 `tool-start` 之前 durable append。
4. natural no-Tool complete turn 的非空正文 end 必须为 `outcome=final_answer/status=completed`；append 成功后 loop 结束。
5. partial/non-natural正文只能以 `commentary/interrupted` 收口，不得成为 final answer。一个 attempt 已发布任一 public delta 后不得 retry、撤回或由新 attempt 覆盖该 Part。
6. constrained finalizer 虽未绑定 Tools，仍必须先发布无 outcome 的 start；只有完整自然结束才发布 completed final end，失败或截断按 interrupted/failed policy 收口。
7. raw `reasoning_content`、reasoning item、encrypted reasoning、Tool argument delta、unknown content block 不得映射为 AgentTextDelta。
8. terminal `finish` 之前所有已 start Part 必须 end 或使整个 Run fail closed；不得留下未解析的客户端 `pending`。
9. completed `agent-run-end` 必须在 final AgentText end 之后 durable append，并保留 `finalizationMode` 到 replay/snapshot；不得让 UI 从正文内容或 arrival timing 推断 constrained。

## Consumer invariants

1. reducer 按 `partId` 幂等 upsert；重复 durable replay 不得重复文字。
2. delta 只接受已 start 且未 terminal Part；end 必须匹配合法 transition。
3. `modelTurnId` 在同一 Run 内只关联一个 AgentTextPart。
4. end 的 outcome 一经应用为 Part phase 即不可改变；final answer completed 后收到 Tool event 是 runtime contract violation。
5. 未识别 `agent-text-*` 的旧客户端可忽略 additive chunk，但 v0.6.1 webapp 必须完整消费；普通 `text-*` 行为不变。

## Pre-execution Tool rejection

本契约不新增 Tool terminal enum。对已知 Tool 的 pre-execution rejection，producer 使用现有 `tool-start` 后紧随现有 `error(scope='tool', partId=...)`；consumer 因而复用已有 failed Tool part，而不是收到 `tool-end` 后错误地把该行标记为 completed。两事件均遵循 persist-before-publish、同 `partId`、脱敏固定内容和正常 top-level ordinal。没有模型 ToolCall 的 Run 不得创建 synthetic Tool row。

## Durable projection

- start、首 delta、end 都是 durable StreamEvent；start 必须先于首 delta。
- 首 delta 立即 persist-and-publish；后续 delta 复用 40ms/256-char microbatch，batch key 必须包含 stream/run/part，不能与普通 TextPart 或另一 model turn 合并。
- end 前必须 flush 同 part pending delta；end 和后续 Tool start 的 sequence 顺序必须稳定。
- replay 从任意 sequence 恢复时，若缺少更早 start，现有 resume protocol 必须补足必要前缀或 fail closed；不得凭 delta 猜 resolved outcome。

## Valid examples

### Only text

```text
agent-run-start
agent-text-start
agent-text-delta("答案")
agent-text-end(outcome=final_answer, status=completed)
agent-run-end(completed)
finish
```

### Text then Tool

```text
agent-text-start
agent-text-delta("我先查一下。")
agent-text-end(outcome=commentary, status=completed)
tool-start
tool-end
agent-text-start
agent-text-delta("结果是……")
agent-text-end(outcome=final_answer, status=completed)
```

### Interrupted

```text
agent-text-start
agent-text-delta("当前可以确认……")
agent-text-end(outcome=commentary, status=interrupted)
agent-run-end(failed)
finish
```

## Invalid examples

- `agent-text-start(phase=pending)` 或 `agent-text-end(outcome=pending)`；
- delta before start；
- same part second end；
- final_answer completed followed by tool-start；
- commentary written with ordinary `text-*`；
- reasoning_content written as agent-text-delta；
- end persisted before unresolved delta flush。
