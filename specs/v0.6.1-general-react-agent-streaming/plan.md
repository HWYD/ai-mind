# Implementation Plan: v0.6.1 General ReAct Agent Streaming

**Branch**: `codex/v0.6.1-general-react-agent-streaming` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/v0.6.1-general-react-agent-streaming/spec.md`

**Status**: Completed on 2026-09-24. The observed Tool-truth gap was corrected in this canonical workspace, then accepted through the recorded automated and real-environment evidence. Local release closing and AC-039 are closed; no Git tag, GitHub Release, push, commit, or merge has been created.

## Summary

v0.6.1 用一个 phase-aware General ReAct loop 替代 v0.6.0 的固定 Action + Answer 双阶段：模型正文到达即流式公开，前端在 start 到 end 的窗口派生 `pending`；模型轮次含 Tool Call 时后端解析为 `commentary`，完整 AIMessage 正常闭合、无 Tool 且正文非空时解析为 `final_answer` 并结束。明确的非自然 provider metadata 否决 normal final，缺失 metadata 不阻塞。普通成功路径不再进行第二次模型调用，异常停止仅在剩余预算允许时最多运行一次未绑定 Tool finalizer。

2026-09-23 correction: a model-declared ToolCall rejected before provider execution must still form a public-safe failed Tool row, instead of leaving the model with a denied ToolMessage that the user cannot audit. The loop's direct-final text and finalizer share an observation-only fact policy. Current-request URLs remain automatically readable after existing safety validation; same-thread reuse is limited to eight revalidated URLs from trusted server-side raw user turns. This catalog neither grants arbitrary historical data nor proves a prior Tool execution.

协议采用 additive `agent-text-*` chunks 与独立 `AgentTextPart`，避免改变普通 `text-*` 和专用 Agent 语义。前端通过稳定 Part 身份完成 pending→commentary/final answer 解析：所有可见模型文字从首 delta 起走正文 Markdown、无图标；已有 Trace detail 时 pending/commentary/Tool 按事件顺序共用同一时间线，最终正文继续在 Trace 外显示。工具级 detail 与 provider 提前探测在本版明确 Deferred。

## Technical Context

**Language/Version**: TypeScript 5.x；Node.js runtime；React 19 / Next.js App Router

**Primary Dependencies**: LangChain JS `createAgent(version='v2')`、LangGraph、Zod、React、shadcn/ui Collapsible、`@ai-mind/stream-core`

**Storage**: PostgreSQL `StreamEvent` 作为 resumable stream durable source of truth；现有浏览器 IndexedDB `conversation-snapshots` 保存完成态 public-safe Trace；无 schema migration

**Testing**: Vitest；stream-core schema/writer tests；scripted model Runtime tests；durable projection/replay tests；React reducer/component tests；snapshot/Memory tests；typecheck/lint/build；人工浏览器与 Pencil 对照

**Target Platform**: 现有 Next.js/Node.js web application 与现代浏览器

**Project Type**: pnpm workspace / Turborepo web application + shared stream protocol package

**Performance Goals**: 无 Tool 正常问答只进行 1 次模型调用；正文首 delta 立即进入 durable projection；后续保持 40ms/256 chars server microbatch 与 browser rAF buffer；不新增第二条流或第二套队列

**Constraints**: public event persist-before-publish；正常 final 由完整模型轮次与正常 stream 闭合判定，明确的非自然 provider finish metadata 必须集中规范化为否决证据；raw reasoning/secret/raw Tool detail 不公开；普通与专用 Agent contract 不回归；270s hard deadline；最多 8 active General Runs/process

**Scale/Scope**: General `routeType=chat`；最多 9 个含 Tool 轮次、14 个逻辑 Tool Call、10 个普通 loop 模型调用、1 个异常 finalizer、48,000 chars cumulative observations；Tasklist/Delivery/Image Agent 不在范围

## Constitution Check

### Pre-design gate

| Principle                              | Gate result | Evidence / required handling                                                                                                         |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Controlled Agent First                 | PASS        | Tool allowlist、权限、取消、deadline 与专用 Agent 排除范围不变；只改变正文 authority 与预算。                                        |
| GraphState Is Runtime Source of Truth  | PASS        | General ReAct 继续使用现有 Agent state；新增 turn/phase 状态只保存 JSON-safe ID、enum、counter，不保存 writer、signal 或 raw event。 |
| Review Node Side-effect Free           | PASS        | 不修改 Tasklist review node。                                                                                                        |
| Business State / Checkpoint Separation | PASS        | 不新增 AgentRun 表字段、checkpoint 或数据库 schema。                                                                                 |
| Stream Compatibility                   | PASS        | 使用 additive `agent-text-*`，保留普通 `text-*`；contracts 和所有 producer/consumer tests 同步。                                     |
| Strict Safe Public DTO                 | PASS        | phase contract 使用 strict schema；raw reasoning、raw provider event、raw Tool detail 明确禁止。                                     |
| Minimal Abstraction                    | PASS        | 只新增有明确协议边界的 Agent text projector/Part，不建立通用事件总线或第二套 Agent framework。                                       |
| Tests Before Broad Integration         | PASS        | 先 schema/contract 与 scripted provider spike，再 Runtime、projection、reducer、UI、snapshot/Memory。                                |
| Spec Drift Blocked                     | PASS        | 当前 workspace 同步 spec、plan、research、data-model、contracts、decisions、acceptance、tasks；实现后再同步长期 docs/Pencil。        |
| Official Spec Kit Workflow             | PASS        | 已执行 specify、clarify、plan、checklist、tasks、analyze 与 implement；收口前仍须执行 converge 与 Step audit。                       |
| Language Policy                        | PASS        | 英文文件名/section/标识符保留，中文正文描述决策。                                                                                    |
| Complex Work Delegation                | PASS        | 已完成可委派性判断；共享 Runtime 由单一 owner 集成，协议、前端、Runtime 评估与审查按文件边界拆分，最终由 owner 验证一致性。          |
| Evidence-based Revalidation            | PASS        | `research.md` 比较固定 Answer、完整缓冲、phase-aware 直出，并以 OpenAI、DeepSeek、豆包官方协议和当前代码为证据。                     |

### Post-design gate

PASS。Phase 1 产物未引入新权限、存储或部署组件；新增 public contract 是 additive 且提供完整 producer/consumer、replay、Memory、安全与迁移验证。唯一有意推翻的既有决策是 v0.6.0 D032，并在 `decisions.md`、contracts 与 tasks 中显式标记 superseded。

## Project Structure

### Documentation (this feature)

```text
specs/v0.6.1-general-react-agent-streaming/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── decisions.md
├── acceptance.md
├── quickstart.md
├── contracts/
│   ├── agent-text-stream.md
│   ├── runtime-loop.md
│   ├── frontend-presentation.md
│   └── memory-and-snapshot.md
├── checklists/
│   ├── requirements.md
│   └── agent-streaming.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/stream-core/
├── src/protocol/chat-stream-chunk.ts
└── tests/

apps/webapp/
├── lib/ai/
│   ├── stream-chunk-schema.ts
│   ├── types/message.ts
│   └── runtime/
│       ├── general-react-agent/
│       │   ├── runtime-config.ts
│       │   ├── agent-state.ts
│       │   ├── create-general-react-agent.ts
│       │   ├── general-react-agent-runner.ts
│       │   ├── stream-adapter.ts
│       │   └── middleware/run-policy-middleware.ts
│       ├── chat-memory/message-adapter.ts
│       └── user-memory/
├── components/
│   ├── instamind/
│   │   ├── chat-stream/
│   │   │   ├── message-factory.ts
│   │   │   ├── message-operations.ts
│   │   │   └── stream-message-reducer.ts
│   │   └── local-chat-persistence/
│   │       ├── schema.ts
│   │       └── stable-snapshot.ts
│   └── chat/message-list/
│       ├── messages/assistant-message.tsx
│       ├── message-height-hints.ts
│       └── parts/general-agent/
│           ├── general-agent-trace-panel.tsx
│           ├── general-agent-trace-row.tsx
│           └── general-agent-trace-view.ts
├── tests/
└── scripts/

design/pencil/agent-ui.pen
docs/architecture/
docs/versions/
docs/releases/
```

**Structure Decision**: 继续在 `@ai-mind/stream-core` 拥有 public chunk contract，在 webapp Runtime 拥有模型轮次判定，在 frontend reducer 拥有可回放 `AgentTextPart`，在 General Agent presentation 组合 Trace 与最终正文。不得把 phase 判定放到 React 组件，也不得让 stream-core 知道 provider/LangChain 细节。

## Technical Plan

### 1. Additive Agent text contract

新增 `agent-text-start`、`agent-text-delta`、`agent-text-end`，只供 General Agent 模型正文使用；普通 `text-*` 保持原语义。start 只包含 `partId/runId/modelTurnId`，delta 只追加同一 Part，end 以后端 `outcome=commentary|final_answer` 和合法 terminal status 完成解析；前端将未收到 end 的 Part 派生为 `pending`。严格 schema 禁止额外字段。

为使 `constrained` 收口可回放地驱动 header、Memory 和 snapshot，扩展既有 `agent-run-end`：completed General Agent Run MUST 携带 `finalizationMode=normal|constrained`。该字段对历史 chunk 保持 optional/additive；但 v0.6.1 reducer 一旦已收到同 Run 的 `agent-text-*`，又收到缺失该字段的 completed end，必须 fail closed。AgentRunPart、durable replay 和 snapshot 必须原样保留此 public provenance。

选择独立事件而不是给普通 `text-*` 加可选 phase，原因是现有静态回答、Tasklist、Delivery、Image 和其他消费者都把 TextPart 当最终正文；独立 contract 能让遗漏消费者 fail closed，而不是静默污染 Memory/复制。

### 2. Model-turn projector and provider normalization

在 model call 边界为每次逻辑调用创建唯一 `modelTurnId` 与 `partId`。stream adapter 只抽取 provider 的 public text/content blocks，忽略 `reasoning_content`、reasoning item、encrypted reasoning 和未知内容类型；首个非空 delta 发布无 outcome 的 start 后立即 durable projection，客户端据此派生 `pending`。

完整 AIMessage/response 到达后，统一 normalizer 输出：

- `toolCalls`：已完整解析的 Tool Calls；
- `finishClass`: `natural | length | content_filter | error | cancelled | deadline | unknown`；其中 `natural` 可由正常 stream 闭合与完整消息推导，明确非自然 metadata 必须覆盖该推导；
- `messageComplete`: 是否具有完整 AIMessage 与可验证的正常 stream 闭合边界；
- `publicTextNonEmpty`：归一化正文是否非空。

若 `toolCalls.length > 0`，在 Tool dispatch 前 awaited 发布 `agent-text-end(outcome=commentary, status=completed)`；无 Tool 且满足“完整消息、正常闭合、非空正文、未取消/超时且无明确非自然 metadata”时发布 `agent-text-end(outcome=final_answer, status=completed)` 并终止 loop。Provider metadata 缺失不阻止这一分支。非自然部分正文发布 `commentary/interrupted`，不得进入 final projection。finalizer 也先发布无 outcome 的 start，只有满足相同 normal-final 条件时才解析为 final answer。

现有 `model retry=1` 只可覆盖首次 public Agent text delta durable publish 前的 attempt 失败。首个 delta 已公开后，retry middleware/runner MUST 禁止再次调用模型；不得撤回、清空或用新 attempt 覆盖已 durable 的 Part。该 Part 以 `commentary/interrupted` 结束，后续只可进入已有 abnormal finalizer gate 或安全终态。

### 3. Single loop and abnormal finalizer

删除 runner 中每个正常 outcome 都调用 `runAnswerPhase` 的固定路径。`createAgent(version='v2')` 仍是唯一普通 Tool loop；自然 no-tool 轮次的 public text 直接生成 `assistantText` 和 normal provenance。不得将 loop 改写为 `RunnableSequence`、手写 `bindTools`/`tool.batch` 链或 legacy `AgentExecutor`：这些链可以用于确定性外围准备，却不会提供动态 Tool 循环、turn state、admission、per-profile timeout、logical-vs-retry 计数与 durable ordering。任何未来在 Agent 外增加 StateGraph 拓扑，必须只作为明确的路由/确定性节点，General ReAct control plane 仍由本 `createAgent` middleware 负责。

预算、no-progress、observation 或 loop cutoff 导致的非自然终止，以及空白 natural no-Tool 结果，仅在以下条件同时成立时运行一次 constrained finalizer：Run 未取消、不是 hard deadline、底层状态已知、距 hard deadline 至少保留 terminal reserve、总模型调用仍有 1 次预留。finalizer 不绑定 Tools，最长 30 秒。否则使用现有安全 deterministic fallback 或失败终态；两者均不得写入 Memory。

### 4. Budget rebase

Runtime config 重命名以移除 Action/Answer 双阶段假设：

- `loopDeadlineMs=235_000`
- `hardDeadlineMs=270_000`
- `maxLoopModelCalls=10`
- `reservedFinalizerModelCalls=1`
- `maxModelCalls=11`
- `maxToolBearingRounds=9`
- `maxLogicalToolCalls=14`
- `maxObservationChars=48_000`
- `recursionLimit=24`
- `maxFinalizerMs=30_000`
- `terminalReserveMs=5_000`

其余 concurrency、retry、per-observation、Tool Profile timeout、active Run、microbatch、watermark、browser buffer 和 pool 不变。config constructor 必须校验 `235s + 30s + 5s = 270s`、`10 = 9 + 1 natural terminal decision`、`11 = 10 + 1 finalizer`。

### 5. Frontend Part and chronological presentation

新增 `AgentTextPart`，字段与状态见 `data-model.md`。reducer 在 start 时按消息 parts 的当前顺序插入 Part，delta 原位追加，end 原位解析 phase；这使 Tool/commentary 的时间顺序无需额外 trace tree。

`assistant-message.tsx` 按 phase 分区但不重排底层 identity：

- `pending`：无 foldable detail 时在标题下显示；有 detail 时由 `buildGeneralAgentTraceView` 与其他事件一起按 part ordinal 生成正文行；不构成 disclosure details；
- `commentary`：与 pending 复用正文 Markdown renderer，按相同 part ordinal 留在 Trace；
- `final_answer`：Trace 外复用 Markdown text view；是 action bar/copy/feedback/follow-up 的唯一 General Agent 文本。

当前 `GeneralAgentTracePanel` 的 manual/auto disclosure 状态保留，trigger 条件只看 foldable details。无详情的 running/completed 仍渲染标题，无 chevron、非 button；有详情时每个新顶层 part 必须追加在现有行之后，不能把 pending 抽到 panel 顶部。安全 read source list 作为所属 Tool 的 child 直接跟随该 Tool，不能滞后聚合到 panel 底部；它是顶层顺序的唯一 owner-child 例外。每个 `web-search` 行只显示自身安全 discovered source 的去重计数，不公开 query 或 raw input，避免多个真实搜索复用 Trace 聚合总数而被误认为重复事件。pending 直到 end 才能判为 final，因此 v0.6.1 的自动折叠统一发生在解析点；本版不新增 raw Responses/provider 提前探测。

`constrained` finalizer 成功时，final answer Markdown 仍在 Trace 外正常显示，便于用户立即使用；但 Trace header 必须为“处理未完成”、保持默认展开且不因该 final 自动收起。不得在正文外增加技术 badge；finalizer prompt 必须在正文中清楚标明可依据的已完成范围与限制。该 final answer 继续排除在 Chat Memory/UserMemory 外。

### 6. Memory, snapshot, and height projection

所有 `getMessageTextContent` 类消费者必须显式选择 completed `AgentTextPart.phase === 'final_answer'`；不能把所有 Agent text 串接。copy、feedback、follow-up 与同会话 history 可消费 `normal|constrained` final answer（后者保留正文限制说明）；Chat Memory 与 UserMemory 仍额外要求 `finalizationMode=normal`。message completion 与 assistantText 共享同一 final projection rule。

`normal|constrained` completed Run 均可被 local snapshot 恢复：保留 finalizationMode、final answer 与 completed public-safe commentary/Tool Trace；pending/interrupted AgentTextPart、失败或取消 Run 不写稳定 snapshot。constrained 恢复后 header 仍为“处理未完成”，有剩余详情时默认收起。snapshot schema version 和 message-height fingerprint 必须升级，使旧 schema 不会把 Agent text 错当普通 TextPart；展开的 pending/commentary Trace 估高也必须按正文 Markdown 高度而不是固定 Tool 行高计算。无 server Trace storage 变化。

### 7. Tool detail remains deferred

Tool row 不新增 children/detail/summary 字段，不解析 raw Tool output，不将 commentary 归属到工具。Pencil 中 `Nested Trace Row Disclosure` 标记 Deferred；实现稿只需覆盖 flat rows、run-level commentary 与 source list。未来触发条件必须先回到文档：副作用回执、长时任务诊断、可复用 artifact 或用户明确证据需求。

### 8. Test and rollout order

1. stream-core contract/schema tests 与 provider finish normalizer spike。
2. model-turn projector + Runtime loop scripted tests，证明 4 个核心序列和异常矩阵。
3. durable microbatch/replay 与 terminal invariant tests。
4. frontend reducer/Part/snapshot/Memory projection tests。
5. Trace disclosure/accessibility/component tests。
6. 更新 Pencil、architecture/version/release docs。
7. typecheck、lint、unit/integration、build、quickstart smoke 与人工浏览器验收。

不提供双运行时 feature flag；在 contract/reducer/runtime 同一版本完成后一次切换 General ReAct。因为新 chunk 是 additive，专用 Agent 与普通 `text-*` 可独立回归。

## Complexity Tracking

无 Constitution violation。新增 `AgentTextPart` 与 `agent-text-*` 是避免最终正文污染所需的明确协议边界；没有引入第二套 Agent loop、数据库或队列。

## Implementation Boundary

用户已批准本 workspace 的决策并授权实施。v0.6.1 仅修改本计划列出的 General ReAct Runtime、additive stream contract、前端 presentation/restore、Pencil 与长期文档；不得扩展到 Tasklist、Delivery、Image Agent，不新增 server Trace storage、Tool nested detail、raw reasoning/Tool detail、数据库 schema 或双运行时 feature flag。任何预算、phase、finalizer、Memory、工具级 detail 或折叠决策变化仍必须先更新本目录并取得用户确认。
