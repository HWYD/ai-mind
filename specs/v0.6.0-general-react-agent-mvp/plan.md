# Implementation Plan: v0.6.0 General ReAct Agent MVP

**Branch**: `codex/v0.6.0-general-react-agent-mvp` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/v0.6.0-general-react-agent-mvp/spec.md`

**Planning baseline**: `main@a770a1819afa22bcadce1153e3c2738a21ab5c48`

**Stage boundary**: `specify → clarify → plan → checklist → tasks` 与实施前验收/决策索引在同一 canonical workspace 收口；实现已按 `tasks.md` 的 Step 与 checkpoint 完成，当前处于 acceptance/release closing，保留已记录的性能与 external-smoke notes。

## Summary

v0.6.0 将所有 `routeType=chat` 请求统一交给一个 run-local、受预算约束的通用 ReAct Agent。现有 `/summary`、`/check`、`@resource`、Skill 与 MCP 上下文不再形成最终回答旁路，而是在确定性准备后作为消息或观察进入同一决策闭环。Tasklist Agent、Delivery Chain、Image Agent 保持专用运行时。

首选 ReAct 内核改为 LangChain v1 `createAgent`。它继续运行在 LangGraph runtime 上，但由官方 Agent loop 负责 model → tools → model 的标准循环，AI Mind 只通过 typed state/context、middleware、Tool Runtime adapter 和 stream adapter 保留自身的权限、预算、错误、可见性与 Memory 边界。MVP 不再自建一套并行的 `decide/act` StateGraph，也不在 `ChatOrchestrator` 中维护手写 while-loop。

MVP 的 `GeneralToolPolicy` 固定解析 `web-search`、`read-url`、`calculator`、`datetime`、`text-transform`、`unit-convert` 与 `city-weather`；Skill 只叠加可信系统提示词和输出风格，不再授予 Tool/MCP 权限或触发隐式上下文读取。所有七项 Tool 都在已有 availability、scope 与只读/确定性 execution policy 下解析；remote MCP Tool、`agent-tool` 和副作用能力默认不进入通用集合。Web Search 首个 adapter 使用 Tavily HTTP API，但由项目自有 provider interface 隔离，不引入 Tavily SDK。两个 Web Tool 共用一个窄范围 Outbound Secret Guard，只阻断可识别凭据和签名 URL；Tavily Extract 按远端托管抓取处理，不虚构逐跳 redirect 可见性。Tool Runtime 统一拥有普通 Tool 的 timeout/retry/budget，并以 Profile、Tool 自身限制和 Run 剩余预算中的最小值执行；同轮普通 Tool 使用 v2 原生并行，项目并发上限为 3，并在派发前预占 9 次上限内的 logical-call/observation 配额。retry 不预分配，只在实际 attempt 前竞争 Run 级原子 permit。委派完整 Agent 的 Tool 显式建模为 `agent-tool`，不套普通 Tool 短超时或整 Agent 自动重试，也不进入通用并行通道。运行态只存在于当前请求，不接 checkpointer、HITL 或 `AgentRun`。

Action 与 Answer 的 system prompt 也必须按阶段投影：Action 保留 Tool 决策、并行/依赖调用与不可信 observation 边界；Answer 只保留面向用户的回答基线、可信 Skill 输出风格、可靠观察/来源和不可信资料边界，绝不重用 Action-only 的 Tool 调用指令。普通问题的最终 Answer 采用结论优先、适中解释的默认表达；用户直接要求的简短、详细、步骤或特定格式可在安全边界内覆盖默认。此策略不改变 Tool Policy、预算、stream 或持久化。

通用聊天的过程展示只保留一个 `GeneralAgentTracePanel`：Agent Step、Tool、Skill、Resource、Prompt 和来源均投影为同一套扁平行，旧 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 不再在 Trace 外重复出现。Run 活跃期间“正在思考”使用 shadcn/ui 官方 `shimmer` 文字 utility；Tool action 收口不代表完成，首个最终 `text-start` 到达前继续 Shimmer，到达时原子切换“已完成思考”并自动收起。最终回答 UI 与三条专用 Agent presentation 不变。前端组件统一位于 `parts/general-agent/`，服务端 ReAct runtime 继续位于 `runtime/general-react-agent/`。

性能采用 B 平衡方案：General ReAct 在现有 Next.js/Node.js 进程内执行，每进程 active Run 上限为 8，不使用 Redis、Worker Thread 或独立任务队列。Action Phase 的模型文本只在 run-local 消费；固定 Answer Phase 使用同一 resolved model selection 的未绑定 Tool model，首个 Answer delta 立即 durable projection，后续同一 part 按 40ms 或 256 chars 微批量；每 Run 投影队列以 64 items/256KiB 提供高水位背压，数据库提交成功后才向当前连接投递。浏览器最终回答默认使用 20ms + `requestAnimationFrame` 的 ref-backed buffer；仅已评估 token 粒度与 Markdown 成本的模型可通过受控 allowlist 覆盖 timer 窗口，仍走同一 rAF/terminal flush 路径。该性能层不改变 180 秒、9 次 Tool Call、4 次 Tool retry 和单 Run 并发 3 等已确认规则。

## Technical Context

**Language/Version**: TypeScript 5.9.3；Node.js 22 server runtime；React 19.2.4

**Primary Dependencies**: Next.js 16.1.6、LangChain v1 `createAgent`、`@langchain/core`、`@langchain/langgraph`、`@langchain/openai`、Zod 4.3.x、现有 `@ai-mind/stream-core`、现有 shadcn/ui primitives 与官方 `shimmer` utility；Tavily Search/Extract HTTP API（原生 server-side `fetch`，无新增 SDK）

**Dependency Baseline**: 当前 webapp 为 `@langchain/core` 1.1.48、`@langchain/langgraph` 1.3.6、`@langchain/openai` 1.4.7，尚未直接依赖 `langchain`。实施时以 `langchain >= 1.5.9`、`@langchain/core >= 1.2.8` 的同一稳定兼容线为目标，原子升级 LangChain family 并避免 lockfile 中并存不必要的 core/langgraph 版本；最终精确版本以兼容性 Spike 和 lockfile 为准。

**Storage**: 沿用现有 Chat Memory/UserMemory 最终轮次写入与 StreamRun/StreamEvent 可恢复流事件投影；StreamEvent 采用 PostgreSQL-first durable microbatch，开发/生产每进程复用一个 Prisma/PrismaPg client 与最多 10 个数据库连接；同时复用浏览器 IndexedDB `ai-mind-local-chat/conversation-snapshots` 保存已完成 assistant message 的 public-safe Trace Parts 与最终回答。General ReAct Agent state、原始消息轨迹和原始工具数据不持久化；不新增服务端数据库、IndexedDB object store 或 migration，不引入 Redis

**Testing**: Vitest 4.1.x、Testing Library、LangChain fake model、provider fake、tool fake、stream reducer/component tests；外部 Tavily smoke 仅进入显式 external test 通道

**Target Platform**: AI Mind Next.js webapp server runtime；现有浏览器聊天 UI 与 Electron 同源宿主保持兼容；`createAgent` 只在 server-side runtime 使用

**Project Type**: pnpm + Turborepo monorepo 中的 full-stack web application

**Performance Goals**: 无工具问题不增加工具调用；单次后端 Run 总时长硬上限 180 秒，覆盖上下文准备到终态事件持久化投影，不包含 SSE 网络投递、客户端接收或重连等待；145 秒后停止新行动并为 Answer 收口预留最多 35 秒；普通 Tool 按 `local-deterministic=5s`、`remote-readonly=20s` 的 Profile 上限执行，`calculator` 可进一步限制为 1 秒；同轮普通 Tool 最多并发 3 个；最多 6 个携带 Tool 的行动轮次、7 次 Action 逻辑模型调用加固定预留的 1 次 Answer（总计 8 次）、9 次接纳的逻辑工具调用；每进程 active General ReAct Run 最多 8；首个 Answer delta 立即 durable flush，后续 40ms/256 chars；每 Run pending projection 最多 64 items/256KiB；browser buffer 默认 20ms+rAF，受控模型 allowlist 可覆盖 timer 窗口但不绕过 rAF/terminal flush；reference load 下 StreamEvent batch transaction p95 ≤20ms、event-loop delay p95 ≤50ms、本地确定性 Tool 同步 CPU p95 ≤5ms

**Constraints**: `route → chat-service facade → runtime` 分层不变；模型能力与权限分离；所有行动严格 allowlist/schema 校验；`createAgent(version='v2')` 以 `maxConcurrency=3` 受控并行调度普通 Tool，并在派发前完成 batch admission；`standard-tool` 与 `agent-tool` 使用判别式 execution policy，Agent Tool 排除在通用 effective tools 外，禁止通过模型 Tool schema 提交 timeout/retry；SSE transport signal 与 run-scoped cancellation signal 分离并兼容现有 resumable stream event；public event 必须 persist-before-publish 且 producer 可被背压；request-scoped state 不得进入 module singleton；通用聊天只允许一个 General ReAct Trace 过程展示；raw chain-of-thought、内部 prompt、raw Error、secret、网页全文不得公开或持久化

**Scale/Scope**: 单用户、单逻辑聊天 Run 内 ReAct 闭环；Run 可在一次 SSE 断线后继续但后端执行不超过 180 秒。每个 Node.js 进程最多 8 个 active General ReAct Run，容量不做跨实例协调；不包含 Agent checkpoint/resume、长期或队列化后台运行、多 Agent、浏览器自动化或高副作用工具

## Constitution Check

### Pre-Research Gate

| Principle                                        | Result     | Plan evidence                                                                                                                                     |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlled Agent First                           | PASS       | 入口、排除链路、工具 allowlist、URL 授权、预算、失败收口与 Non-goals 均已明确。                                                                   |
| GraphState Is Runtime Source of Truth            | PASS       | `createAgent` state 保存逻辑结果与预算快照；`RetryPermitPool` 只做 run-local 原子执行准入，grant 在 batch join 回写 state，不形成第二份业务状态。 |
| Review Node Must Be Side-effect Free             | PASS / N/A | MVP 无 HITL 和 review node；未来不得借本版本隐式加入。                                                                                            |
| Business State and Checkpoint Must Stay Separate | PASS       | 不配置 checkpointer，不新增 `AgentRun`、`AgentInterrupt`、checkpoint 或业务状态表。                                                               |
| Stream Compatibility Is a Hard Constraint        | PASS       | whitelist adapter 用 `agent-run-start/end` 表达 General Run，专用 Agent 保留 `agent-graph-*`；不输出 LangChain raw event/state。                  |
| Public DTO Must Be Strict and Safe               | PASS       | 内部 observation 与 public output 分离并经 strict schema/formatter 验证。                                                                         |
| Minimal Abstraction                              | PASS       | 新增一个 Agent runner、两个职责明确的 middleware、一个 stream adapter 和必要 Web Tool；不同时维护自有 ReAct Graph。                               |
| Tests Before Broad Integration                   | PASS       | dependency/Agent compatibility → state/middleware/tool contracts → orchestrator/route → reducer/UI → repository gates。                           |
| Spec Drift Must Be Blocked                       | PASS       | 本次已在同一 canonical workspace 覆盖旧 StateGraph 设计；实施期同步 ADR、architecture、env contract 和公开文档。                                  |
| Official Spec Kit / Language Policy              | PASS       | 使用 canonical semver workspace，英文文件名/section 与中文正文并存。                                                                              |

### Post-Design Gate

Phase 0/1 设计未引入 Constitution 例外。`createAgent` 内部 LangGraph state、runtime context、public DTO、Stream、Memory、Web 安全、进程容量、PostgreSQL durable projection/backpressure 和部署 env 已分别形成契约；process singleton 只保存基础设施 client/pool 或 permit 计数，不保存 request data；无 Complexity Tracking 条目。

## Project Structure

### Documentation (this feature)

```text
specs/v0.6.0-general-react-agent-mvp/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
├── data-model.md
├── quickstart.md
├── decisions.md
├── acceptance.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── general-react-runtime.md
    ├── runtime-performance.md
    ├── stream-and-memory.md
    └── tool-catalog.md
```

`tasks.md` 是实施任务唯一清单；`acceptance.md` 固定各 Step 退出证据，`decisions.md` 汇总已确认和已淘汰方案。三者均不得创建 sibling spec workspace 或维护第二套事实。

### Source Code (repository root)

```text
apps/webapp/
├── app/api/chat/route.ts                         # 路由与 StreamRun kind 保持兼容
├── lib/ai/
│   ├── capabilities/tool-binding.ts              # fixed GeneralToolPolicy resolution
│   ├── model-provider/                           # unbound model、显式 retry/timeout、provider 连续性
│   ├── tools/
│   │   ├── registry.ts                           # scope、standard/agent execution policy 与 public/internal output
│   │   └── web/                                  # Tavily provider、URL/Outbound Secret policy、search/read tools
│   ├── runtime/
│       ├── chat-session.ts                       # 会话、effective tools 与统一 system prompt
│       ├── chat-orchestrator.ts                  # 专用链路分流、context preparation、Agent 委派与 Memory
│       ├── assistant-stream.ts                   # 内部 reasoning metadata 与公开 stream 解耦
│       ├── general-react-agent/
│       │   ├── agent-state.ts                    # createAgent state schema；可合并 reducers + private policy fields
│       │   ├── agent-context.ts                  # run-local immutable dependencies
│       │   ├── create-general-react-agent.ts     # 唯一 createAgent composition root
│       │   ├── execution-gate.ts                 # process singleton；active General ReAct Run 最多 8
│       │   ├── general-react-agent-runner.ts     # private Action loop、unbound Answer stream、hard deadline
│       │   ├── retry-permit-pool.ts              # run-local 原子 Tool retry 准入；单 call 2、Run 4
│       │   ├── runtime-config.ts
│       │   ├── stream-adapter.ts                 # LangChain events → safe stream-core chunks
│       │   └── middleware/
│       │       ├── run-policy-middleware.ts      # batch admission、counts/deadline/stop/finalization policy
│       │       └── tool-runtime-middleware.ts    # validation/scope/execution/observation adapter
│       └── tool-runtime/                         # 保留唯一业务执行与 display/错误实现
│   └── stream-recovery/
│       ├── durable-stream-projection-buffer.ts  # 40ms/256 chars 微批量与 64 items/256KiB 背压
│       └── stream-event-store.ts                # appendEvents 批量事务、连续 sequence
├── components/
│   ├── instamind/chat-stream/                    # 兼容 reducer
│   └── chat/message-list/parts/
│       ├── general-agent/                         # GeneralAgentTrace* 独立扁平 Trace
│       ├── tasklist-agent/                        # Tasklist 专用 Graph UI
│       ├── delivery-agent/                        # Delivery 专用报告 UI
│       ├── image-agent/                           # Image 专用 UI
│       ├── shared/                                # 跨域安全基础部件
│       └── shared/                                # 跨域安全基础组件
└── tests/
    ├── lib/ai/runtime/general-react-agent/
    ├── lib/ai/tools/web/
    ├── app/api/chat/
    └── components/

packages/stream-core/
└── src/protocol/                                 # tool-end 增加 optional public sources

packages/database/
└── src/client.ts                                 # dev/prod process singleton + PrismaPg pool max 10

deploy/env/webapp.production.env.example          # 增加 Tavily server secret 占位
apps/webapp/.env.example                          # 增加本地 Tavily 配置说明
docs/adr/                                         # 新增 createAgent 通用 ReAct Agent ADR
docs/architecture/                                # 更新 runtime 与 production env 事实
```

**Structure Decision**: 新能力属于 webapp 的 Agent Runtime 和 Tool 层，不创建新 package。`runtime/general-react-agent/` 是 `createAgent` 的唯一 composition root；Tool 仍由 `lib/ai/tools/` 定义和注册；MCP 继续通过 capability adapter 进入；stream-core 只对现有 `tool-end` 做 optional source projection 扩展。禁止同时保留另一套通用 ReAct StateGraph、手写 loop 或重复 Tool executor。

## Technical Plan

### 1. Route Boundary And Ownership

`ChatOrchestrator` 继续作为单轮请求总调度器，先判定 Tasklist Agent、Delivery Chain、Image Agent。只有未被专用链路接管的 `routeType=chat` 才同步申请 `GeneralReActExecutionGate` permit；无 permit 时在上下文/provider/Tool 工作前返回标准化 retryable busy。获得 permit 后，由同一个 execution scope 包住确定性 preparation、`GeneralReActAgentRunner`、terminal projection/drain 和 `finally` release。API 请求 DTO、`resolveStreamRunKind()` 和客户端调用方式保持不变。

普通聊天模型选择必须请求 tool-calling capability。模型不支持、provider 无法被 `createAgent` 绑定工具或配置无效时 fail-closed；不得静默回到旧的一次性直答，因为这会使同一 routeType 出现两套权限语义。

### 2. `createAgent` Is The Single ReAct Core

```text
deterministic context preparation
  → createAgent(version = v2, unbound model, effective tools, middleware)
      → model
          ├─ no tool calls → Action terminal decision
          └─ tool calls → tools → model ...
  → Action terminal/limited → one unbound streaming Answer call
  → FinalTurnResult → existing Memory
```

组合规则：

- 传入未预绑定工具的 model instance；工具列表单独传给 `createAgent`，由框架负责标准 Tool Calling loop。
- 使用 `version: 'v2'`，让每个 tool call 保持独立任务、错误隔离和精确配对。
- 每个 Run 在 capability resolution 完成后创建 Agent；MVP 不使用运行中动态注册工具的双 hook 路径。
- invocation 配置 `maxConcurrency: 3`、`recursionLimit: 16` 和合并后的 run-scoped `AbortSignal`（显式取消 + hard deadline + Run terminal）。该值是项目拥有的硬上限，不依赖 provider 是否支持关闭 parallel tool calls；HTTP/SSE transport abort 不参与合并。
- 不配置 checkpointer/store，不把 Chat Memory 当作 LangChain conversation persistence；输入上下文仍由 AI Mind 在 Run 前确定性构建。
- 不使用自定义外层 StateGraph，不使用手写 while-loop。`GeneralReActAgentRunner` 只负责一次 Agent 执行、stream projection 和 terminal post-condition。

### 3. State And Runtime Context

`createAgent` 的 built-in `messages` 是精确模型轨迹的事实源，保留每个原始 `AIMessage` 与对应 `ToolMessage`。AI Mind 通过 `stateSchema` 增加 run-local policy 字段：行动/模型/工具计数、观察体积、授权 URL、sources、重复/no-progress 状态、stop reason 和 finalization mode。

这些扩展字段使用 JSON-serializable value，并由 middleware 通过明确 state update/`Command` 更新；不再建立平行的 coordinator state。批次 admission 在 `afterModel` 单次写入，并行 Tool task 只返回 delta；计数使用 sum、URL/source/fingerprint 使用 keyed union，Run 级 stop/no-progress 只在批次汇合后计算。`RetryPermitPool` 是 context 中的 run-local 原子执行门，只拥有最多 4 个不可返还 permit 的发放，不保存 observation、stop 或其他业务状态；grant 快照在 batch join/terminal 回写 state。仅用于内部策略的字段采用 private state 语义，不进入 runner 对外结果。

model factory、tool definition map、stream writer、`AbortSignal`、clock、provider error normalizer、Web client 和 `RetryPermitPool` 等执行依赖统一放入 `contextSchema` 定义的 typed runtime context，不进入 Agent state。runner 为每个 Run 创建一次 Pool 并传入不可替换的引用；只有 Pool 内部 permit ledger 单调变化。middleware closure 只允许保存不可变 server policy 配置，不得复制 Run 依赖、逻辑调用计数、URL 或 stop state。

### 4. Middleware Composition And Order

只保留两枚项目 middleware，加官方 retry middleware：

1. `GeneralReActRunPolicyMiddleware`（最外层）：初始化 deadline，统计逻辑 model/action round，并在 `afterModel` 为整个 Tool Call batch 按 ordinal 生成不可变 admission，只预占 logical-call 和 observation 配额；批次汇合后检查 abort、重复、无进展、观察体积和剩余时间，达到限制时停止新行动并设置固定 `stopReason`。
2. `GeneralReActToolRuntimeMiddleware`：在单个 tool call 边界完成 normalize、strict schema、allowlist/scope、execution kind/Profile 解析、Web Outbound Secret Guard、URL authorization、有效 attempt timeout、普通 Tool retry/退避和 transcript 收口；每次真实 retry 前调用 `RetryPermitPool` 原子准入，并把一个逻辑调用映射为一个 ToolMessage/状态 patch。内部 observation 与 public summary 分离。Web 参数必须先通过 Secret Guard，之后才能生成 fingerprint、public input preview 或触发 provider 调用。
3. LangChain `modelRetryMiddleware`（靠近模型调用）：只对明确 transient 的 model timeout、rate-limit、connection/5xx 最多 retry 一次，每个 Run 最多 1 次 model retry。普通 Tool retry 不叠加官方 `toolRetryMiddleware`，由项目 Tool Runtime 单点拥有，才能同时执行 Profile、Tool 自身限制、Run 总 retry budget、deadline 和一次 transcript 契约。

middleware 顺序必须由 composition root 固定并做单元测试。通用 ReAct model 与 `standard-tool` provider/client/transport 自带的隐藏 retry 设为 `0` 或关闭；它们只能执行一次底层 attempt、接受本次派生的 `AbortSignal` 并返回 typed error。`agent-tool` 内部继续服从专用 Agent Runtime，不受本条覆盖。schema、permission、unknown tool、duplicate、budget、auth、quota、context limit、outbound security denial 和 cancellation 等前置拒绝均不可重试；远端 retry-safe Tool 已进入执行后的 provider 4xx/5xx 或其他异常由 Tool Runtime 统一重试。

不直接叠加官方 `modelCallLimitMiddleware` / `toolCallLimitMiddleware` 作为主控制，因为其默认 exit 行为不能表达 AI Mind 的 Action 停止与固定 Answer Phase 契约；调用上限由项目 policy middleware 统一拥有，避免两套终止状态竞争。

### 5. Deadline And Guaranteed Terminal Result

总 Run 硬上限为 180 秒，并与 SSE transport 生命周期分离：

- `startedAt` 在确定性上下文准备前记录，`hardDeadlineAt = startedAt + 180s`；该后端预算止于终态事件完成既有 event store 投影。SSE network flush、客户端接收和重连等待不计入 180 秒。
- run-scoped signal 只合并显式用户取消、hard deadline 和 Run 级 terminal signal，并贯穿 Action/Answer model 与 Tool；当前 HTTP/SSE transport abort 只关闭该 response/writer，不得合并进 run-scoped signal。
- `actionDeadlineAt = startedAt + 145s`；达到后禁止新 model action/tool，进入 policy stop。
- 每个 action model call 的 timeout 取固定上限与 `actionDeadlineAt - now` 的较小值；不得让一次新调用侵占全部 finalization reserve。
- `standard-tool` 的单次有效 attempt timeout 为 `min(Profile maxAttemptTimeoutMs, Tool attemptTimeoutMs 或 Profile 默认值, actionDeadlineAt - now, hardDeadlineAt - now)`；Tool 自身值只能缩短，不能突破 Profile 或 Run 边界，也不进入模型可填写的 input schema。
- `local-deterministic` Profile 上限 5 秒、自动 retry 为 0；`calculator` 和 `datetime` 默认声明 1 秒自身上限。同步 CPU 工具必须用输入长度、允许语法和复杂度限制保证可终止，不能把无法抢占 event loop 的 `Promise.race()` 当成真正中止。
- `remote-readonly` Profile 上限 20 秒；显式 `retrySafe=true` 且已通过前置校验时，对任意 execution failure（timeout、网络、HTTP 4xx/5xx、provider typed、解析或未知异常）单逻辑调用最多 retry 2 次，即最多 3 次底层 attempt；每个 Run 最多 4 次普通 Tool retry。
- batch admission 先按 ordinal 接纳剩余的 logical-call slots；超额 call 不执行 provider，但仍由 Tool adapter 返回唯一配对的 `budget_blocked` ToolMessage。累计 observation 剩余额度在接纳调用间确定性分配，每调用仍受 12,000 chars 单次上限约束。
- 普通 Tool retry 不在 batch admission 中预分配。发生 retry-safe remote execution failure 后，Tool 先确认单调用尚未达到 2 次并计算取消感知退避；退避完成后重新检查 request/action/hard deadline，随后在不经过 `await` 的同步临界区调用 `RetryPermitPool.tryAcquire({ callId, retryOrdinal })`。获得 permit 后立即开始 retry attempt 并永久消费该 permit；未获得则收口当前逻辑调用。这样未失败或提前成功的 sibling 不占额度，同时全 Run grant 永不超过 4。该规则覆盖网络异常、HTTP 4xx/5xx、provider typed error、解析异常和其他执行异常；前置校验拒绝与 cancellation 不进入执行 retry。
- Tool retry 复用现有 Image provider 的有界指数退避形态：优先采用 1～10 秒合法 `Retry-After`，否则第一次等待随机 1～2 秒、第二次等待随机 2～4 秒；等待和 attempt 都响应取消，并在开始前重新检查 action/hard deadline 与 Run retry budget。
- `agent-tool` 不参与上述 1/5/20 秒普通 attempt policy，外层也不重试整个 Agent。其内部模型、阶段、工具、timeout/retry 由专用 Agent Runtime 管理；外层只做准入、父级取消/截止传播、一次逻辑委派和一次最终结果配对。v0.6.0 通用 effective tools 不绑定 Agent Tool。
- Action Phase 的每次 model 文本都只作为内部轨迹；无 Tool Call 表示 Action terminal decision，不代表用户最终回答。
- 除显式取消或 hard deadline 外，Action 因自然 terminal decision、预算、无进展或可恢复失败停止后，runner 必须使用同一 resolved model selection 的 unbound model 进入一次 Answer Phase；它不是第二个 Agent/Graph，不允许 tools。Answer 输入只由用户问题、可靠 observation、安全来源和 stop reason 重建，绝不携带 Action assistant text/reasoning/metadata；normal/constrained 只改变提示约束，仍是一条流式执行链。
- system prompt 同样按阶段重建：Action 输入可包含固定 Tool 集、何时调用、同批独立/跨轮依赖和 observation 处理规则；Answer 输入必须排除这些 Action-only 指令，只包含核心回答策略、可信 Skill 提示词/输出风格、可靠资料与来源、以及最终回答约束。网页、Tool observation、Resource 或 Prompt 内的嵌入指令只是不可信资料，不能改变系统规则、表达优先级、Tool 权限、授权 URL、预算或数据访问范围。
- Answer 的核心回答策略以真实用户目标为中心：普通问题先给直接可用结论和适中解释；只有用户直接要求时才转为极简、深入、步骤化、表格化或指定格式。确定性 Tool 的关键结果不得被改写；需要引用当前网页事实时，只能引用当前安全来源，来源冲突、空结果或读取失败必须如实说明，不能编造确定结论。
- Answer 最多占用剩余 hard budget 中的 30 秒，并至少保留 5 秒完成 stream/error/lifecycle 收口。其首个安全 delta 是唯一允许创建 public final `text-*` 的来源；未绑定 Tool response 若出现 Tool Call 即 fail-closed，绝不执行。
- 只有正常结束但返回空白的 Answer 才使用确定性安全 fallback。Answer provider error、Tool contract violation 或已经公开部分 delta 后的异常固定 failed，不追加 fallback，也不写 Memory/snapshot。显式取消或 hard deadline 不补写 final，也不写 Memory；仅发生 SSE 断流时不取消或重启 Answer，后端继续通过既有 projector 形成可回放事件，完成后仍按正常 terminal Memory 规则处理。

`maxModelCalls=8` 精确拆分为最多 7 次 Action 加预留 1 次 Answer；retry attempt 单独计数，每个 Run 最多 1 次 model retry、4 次普通 Tool retries，并受 hard deadline 约束。最多 6 个连续 Tool-bearing Action rounds 后允许第 7 次 Action 作无 Tool terminal decision；若第 7 次仍请求 Tool，则不再 admission，改由 constrained Answer 收口。

### 6. Bounded Parallel Tool Semantics On `createAgent`

MVP 使用 `createAgent(version='v2')` 的原生 Send task 调度，同轮最多并发执行 3 个 `standard-tool`。这里的并行只适用于模型在同一 assistant turn 已经声明的调用；`web-search → read-url` 这类依赖前序结果或新增 URL grant 的工作必须跨 Agent round，不能借同批执行顺序建立隐式依赖。通用 resolver 不绑定 `agent-tool`，当前封闭工具集合均为确定性或只读能力，因此本版不增加重复的 `parallelSafe` 字段。

`GeneralReActRunPolicyMiddleware.afterModel` 在 v2 派发前完成 action batch admission：

1. 校验 call ID 唯一性并固定 assistant ordinal；
2. 按 ordinal 接纳 Run 剩余的 9 个 logical-call slots，超额调用标记 `budget_blocked`；
3. 为接纳调用确定性分配 observation allowance；retry 在实际 attempt 前另行竞争 permit；
4. 写入一次不可变 batch admission，之后并行 Tool task 不再各自执行会竞态的 check-then-increment。

并行任务可以乱序完成，但必须以 `toolCallId` 关联同一个 public part，并在批次汇合后按 assistant ordinal 规范化下一轮 model request 的 ToolMessage 投影。UI 在模型声明批次时按 ordinal 建立稳定槽位，后续 start/result 只更新对应槽位；不要求网络完成事件人为串行化。单个 Tool 的失败不会取消已接纳的兄弟调用，只有显式 Run cancellation、hard/action deadline 或 Run 级 terminal signal 可以统一终止在途/排队任务；SSE transport disconnect 不在此列。

进入大范围集成前必须用 scripted model 同时返回至少四个 tool calls，证明：

- 三个慢 Tool 能并行、第四个必须等待，峰值并发严格为 3；
- 同批完成顺序反转时，每个 ToolMessage/public part 仍只出现一次且按 ID 配对；
- 下一轮 model request 和 UI 槽位按 assistant ordinal 稳定，public lifecycle 允许乱序更新；
- 9-call 与 4-retry 上限在并发失败下不会穿透，超额 call 不触发 provider，未失败 Tool 不占 retry permit；
- 两个并行 Web Search 的 URL/source state 使用 union 合并，`search → read-url` grant 只在后续独立 Agent round 使用。

若选定 LangChain JS 版本不能在官方 middleware/state reducer 扩展点满足上述 contract，应先调整/pin 依赖或使用 `createAgent` 官方支持的 tool execution extension；不得静默恢复第二套通用 StateGraph。仍无法满足时必须回到 Plan 评审，而不是把并发竞态带入实现。

### 7. Tool Resolution And Minimal Tool Set

通用基础集合固定为：

| Tool             | Purpose                | Execution policy                                           | MVP boundary                                                                             |
| ---------------- | ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `web-search`     | 查询当前公开网页信息   | `standard-tool/remote-readonly`，20s，retry-safe           | Tavily basic search，最多 5 条，仅 title/URL/snippet；关闭 provider answer/raw content。 |
| `read-url`       | 读取明确授权网页       | `standard-tool/remote-readonly`，20s，retry-safe           | Tavily basic extract，单 URL，Markdown，内部最多 12,000 chars。                          |
| `calculator`     | 确定性数学计算         | `standard-tool/local-deterministic`，Tool 自身 1s，0 retry | 复用现有工具并保持输入/计算复杂度有界。                                                  |
| `datetime`       | 当前日期时间与时区换算 | `standard-tool/local-deterministic`，Tool 自身 1s，0 retry | 复用现有工具。                                                                           |
| `text-transform` | 确定性文本格式转换     | `standard-tool/local-deterministic`                        | 复用现有工具；不由 Utility Skill 授权。                                                  |
| `unit-convert`   | 确定性单位换算         | `standard-tool/local-deterministic`                        | 复用现有工具；不由 Utility Skill 授权。                                                  |
| `city-weather`   | 指定城市天气查询       | `standard-tool/remote-readonly`                            | 复用受控 local MCP adapter；不由 Reader Skill 授权。                                     |

`GeneralToolPolicy` 只解析上表的已登记 Tool；它按 Tool 的 availability、`general-react-agent` scope 和 `standard-tool` execution policy 过滤后一次冻结本轮 allowlist。Skill overlay 只包含 `systemPrompt` 与 `outputPolicy`，不参与 Tool/MCP Resource/Prompt capability 选择。`validate_tasklist_structure` 仍仅属于 Tasklist Agent；remote MCP Tool 不做 `tools/list` discovery，也不被模型看见。

将现有 tool binding 重构为 general-chat 的固定 policy resolution；Tool Registry 是唯一 Tool contract/权限事实源。Resource/Prompt 只在 Composer 显式命令或 `@resource` 引用已要求的确定性 preparation 中读取，不伪装成动态 Tool，也不得由 Skill/自然语言自动触发。

`ChatToolDefinition` 增加 `general-react-agent` runtime scope、判别式 `executionPolicy` 和内部 observation/public output 的分离边界。现有 `resultIsAuthoritative` 不再允许普通聊天绕过 Agent final；字段如仍被其他专用运行时使用则保留，否则在调用方迁移完成后删除。

#### 7.1 Tool Execution Policy And Agent Tool Boundary

`ToolExecutionPolicy` 使用判别式 union，避免通过缺省值或 tool name 猜测执行语义：

```ts
type ToolExecutionPolicy =
    | {
          kind: 'standard-tool'
          profile: 'local-deterministic' | 'remote-readonly'
          attemptTimeoutMs?: number
          retrySafe: boolean
      }
    | {
          kind: 'agent-tool'
          profile: 'delegated-agent'
      }
```

- `attemptTimeoutMs` 是 server-side Tool Definition 元数据，不属于 Zod input schema；省略时使用 Profile 上限，填写时只能得到更短的有效 timeout。
- Tool/provider adapter 可以为 connect、request、parse 等子步骤使用更短 timeout，但必须从当前 attempt signal/deadline 派生；不得启动隐藏 retry，也不得在外层 timeout 后继续占用资源或发送迟到结果。
- `agent-tool` 分支不允许携带普通 Tool 的 `attemptTimeoutMs`/`retrySafe`，从类型上阻止整 Agent 被当成一次网络请求治理。当前代码中的 Delivery `*-subagent` Tool 是已知实例，实施时显式标记，但继续只属于 `delivery-chain-manager` scope。
- `validate_tasklist_structure` 仍是 `standard-tool/local-deterministic`，因为它只是确定性校验工具，不是 Tasklist Agent 本身；Tasklist 和 Image 是专用 route，不因本类型设计被包装为 Tool。
- v0.6.0 的 general-chat resolver 遇到 `agent-tool` 必须 fail-closed，不把它加入 effective tools。未来若允许通用 Agent 委派 Agent Tool，需要独立版本明确父子 Run budget、幂等性、持久化和观察契约。

#### 7.2 Minimal Outbound Secret Guard

本版本不建设通用 DLP、PII 分类、上下文 taint tracking 或外发审批 UI。`web-search.query` 与 `read-url.url` 在 schema/normalize 后、fingerprint/transcript/provider invocation 前经过同一个确定性 Guard：

- 拒绝结构化的 `Authorization`/Bearer/Basic 凭据、Cookie/Set-Cookie 值、带明确前缀或赋值结构的 API Key/Access Token/Refresh Token/JWT；
- 拒绝与本进程已配置 server secret 精确匹配的值；
- 拒绝 URL username/password 和 AWS、GCP、Azure、CloudFront 及通用已知签名参数组合；URL fragment 在外发前移除；
- 仅出现“token”“cookie”等普通词汇不构成拒绝，避免正常技术搜索误伤；无标识、非系统已知 secret 的任意随机字符串不在本版本保证范围；
- 命中后返回唯一配对的 `denied` ToolObservation，不调用 provider、不 retry、不把原值写入 fingerprint、stream、UI、log 或 Memory。Agent 可以基于安全失败摘要重新提出不含凭据的新逻辑调用。

Tavily adapter 自身使用的 `TAVILY_API_KEY` 是固定 server-side provider authentication，只能在 adapter 最内层加入请求，不进入模型参数、ToolObservation 或 public/log payload；它不受业务参数 Guard 阻断，但继续受 secret 管理和日志脱敏约束。

#### 7.3 Tavily Extract Redirect Boundary

`read-url` 首个 provider 是远端托管抓取：AI Mind 只向固定 Tavily HTTPS endpoint 提交一个已授权、已通过 URL/Secret policy 的初始 URL，目标网站请求和 redirect 由 Tavily 执行。Tavily adapter contract 不承诺提供 redirect chain，因此 v0.6.0 不实现或声称逐跳校验。

AI Mind 的可验证边界是：提交前校验 initial requested URL；把 provider 内容和 provider-reported URL 视为不可信输入；如果响应明确带回 URL，只有重新通过当前 URL/Secret policy 后才能进入 SourceRecord、public stream 或新的 URL grant。无法确认 final URL 时继续以已校验的 requested URL 作为来源 identity，不推断 redirect 过程。若未来要求逐跳控制，应另立 hardened local fetch 方案，不在本 MVP 暗中扩展。

### 8. Existing Context Becomes Agent Input

`runComposerContextAnswerStage()`、`runCapabilityContextAnswerStage()` 当前会自行调用模型并提前完成。实施时把它们重构为 preparation：继续复用既有权限、读取、prompt/resource stream 和 token-aware preflight，但只返回 `PreparedGeneralChatContext`，再与 Chat Memory/UserMemory、Skill system prompt、latest user message 一起进入 `createAgent`。

准备阶段失败可以 fail-closed 或生成安全 context observation；成功后不得旁路通用 Agent。上下文准备不是 Tool call，不占 Agent tool count，但耗时计入 180 秒 Run deadline。

### 9. Provider And Message Continuity

`createAgent` 必须接收 AI Mind Provider Registry 产生的 model instance，不能用字符串模型标识绕过 catalog、API key、usage observer 和错误标准化。

DeepSeek thinking + tool-calling 要求后续轮次回放先前 assistant message 的 `reasoning_content`。现有 `streamPlanningResponse(..., emitReasoning=false)` 会连同内部 metadata 一并剥离，实施时必须分离：

- `preserveReasoningMetadata=true`: 仅在当前 Agent messages 内保留 provider 连续性字段；
- `emitReasoning=false`: 不生成 public `reasoning-*` chunk，不写入 Memory/log。

OpenAI-compatible、豆包、Qwen、Ollama provider 继续通过统一 `BaseChatModel` 输入；模型来源不得改变 tools、middleware 或预算。每轮动态 timeout 和 `maxRetries=0` 通过现有 `createChatModel()` options 或一个有业务语义的 run-scoped model factory 提供，不创建第二套 Provider Registry。

### 10. Stream, UI And Memory Compatibility

`GeneralReActStreamAdapter` 消费 `createAgent` 的 typed stream/events，只允许白名单事件映射到 stream-core public chunk；不得把 LangChain raw event、state、middleware context、message metadata 或 error 直接序列化。General ReAct 的最小生命周期固定为 `agent-run-start/end`，不借用专用 LangGraph Agent 的 graph node 事件。

stream adapter 必须维持两条独立生命周期：run-scoped execution 继续由现有 `StreamExecutionCoordinator` 持有，public event 先投影到既有 event store，再对仍打开的 SSE writer 做 best-effort 投递；transport disconnect 只停止该 writer。重连沿用既有鉴权、cursor 和 replay contract，不创建第二个 executor，也不恢复或序列化 `createAgent` state。显式取消通过现有 cancel path 进入 coordinator 的 run-scoped signal；hard deadline 到达后禁止新的 Agent 工作，网络投递时间不反向延长或缩短该 deadline。

- Action Phase 只映射为“分析问题/整理已有信息”以及现有 Tool Runtime 的 `tool-*`/`resource-*`；它的模型文本/reasoning 不产生 `text-*`。
- 同一 resolved model selection 的未绑定 Tool Answer Phase 是唯一最终文本来源；它的真实安全 delta 使用现有 `text-*`，首个 delta 立即 durable flush。Action 文本、含 Tool Call 的中间模型文本和 reasoning 不作为最终答案持久化。
- stream-core 新增正式的 `agent-run-start/end`；web reducer 将其归并为 `AgentRunPart(type='agent-run')`。Tasklist 等专用 Agent 的 `agent-graph-*` 只归并为 `AgentGraphPart(type='agent-graph')`；`agentName` 仅是专用 Graph metadata，不参与 UI 路由。旧 `agent-step` 不再读取或迁移。现有 `tool-end` 增加 `sources?: PublicSourceRecord[]`，每次只携带当前逻辑调用新增或更新的最多 5 项安全来源。
- 新增独立 `GeneralAgentTracePanel`，不复用或泛化 Tasklist、Delivery Chain、Image Agent 的专用 presentation。对通用聊天，它是 Agent Run、Tool、Skill、Resource、Prompt 和来源过程信息的唯一展示容器；assistant message renderer 必须按 part 的判别字段把这些 Part 交给同一 Trace view model，并抑制 Trace 外的旧 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel`。Pencil 中的用户消息仅为页面上下文，现有 `UserMessage` 气泡、展示片段、复制和删除行为保持不变；三条专用 Agent 继续按原 presentation 分流。Skill 必须在 `agent-run-start` 之后以 `加载了{skill.name} Skill` 进入同一 Trace。
- 实现组合现有 shadcn/ui `Collapsible`、`CollapsibleTrigger`、`CollapsibleContent`、`Separator`、项目 disclosure state 和官方 `shimmer` 文字 utility；为精确匹配 Pencil 的无框 title trigger，使用语义 `<button>` 作为 `CollapsibleTrigger asChild`，不套有额外 padding/chrome 的 `Button` variant。图标只使用项目已安装的 Lucide，不引入 AI Elements、Motion 或第二套动画依赖，也不复用旧 `ThinkingText` 的私有动画作为新契约。
- 通用 Trace 使用浅色扁平内联布局：标题整行可点击，chevron 紧跟标题且不渲染 `durationMs`。active 状态只让“正在思考”标题文字 Shimmer，chevron、图标和状态行保持静态；Tool action 已全部收口但首个最终 `text-start` 尚未到达时仍保持 active。首个最终 `text-start` 到达时原子切换“已完成思考”并自动收起，自动收起只执行一次，用户之后可重新展开；用户在 active 期间主动收起后，后续事件不得强制重开。显式取消显示“已停止思考”，无最终回答的终态失败显示“处理未完成”，两者均不 Shimmer。
- 展开区只显示统一 Trace 行，不显示额外解释段落。Skill 只显示来自可信 capability catalog/selection 的名称与固定状态文案，样式、字重、间距和 Lucide 图标规则与其他 Trace 行一致；不得在 Trace 外显示独立 Skill 卡片。Resource/Prompt 同样仅以安全固定摘要进入 Trace，不把 raw content/input 投影到 UI。
- Tool 图标只表达类型，运行/成功/失败仅通过同一颜色与字重层级的“正在… / 已… / …失败”文案表达，失败可使用 error semantic color。同一 action batch 的槽位按 assistant ordinal 建立并保持稳定；并行 lifecycle 可以同时显示不同状态，retry 只更新同一逻辑行且不新建行。`web-search` formatter 输出安全去重后的确定数量；reducer 对 `tool-end.sources` 做 canonical URL union，派生“已读取 N 个页面”和条件展示的“已读取来源”，只列 `status='read'` 且最多 5 项。
- 来源项使用 ExternalLink 类型图标、规范化标题和安全 hostname；标题作为安全 URL 链接，新标签打开并设置 `noopener noreferrer`。长标题可换行或截断，完整签名参数和不可公开 URL 不得进入 href、可见文本或 tooltip；不生成“官方”判断。
- 零 Tool 直答不创建空 Tool 行，但正常完成后仍保留可展开的完成态 Trace；General ReAct Trace active 标题与旧 `ThinkingText` 不得同时出现。最多 9 个 Tool 行和 5 个来源由现有聊天消息滚动容器承载，不在 Trace 内增加第二个 `ScrollArea`。最终答案继续沿用现有 `text-*` UI。
- Web Tool 被 Secret/URL policy 拒绝时，前端只显示通用的安全拒绝或“该链接不可读取”，不展示原始 query/URL、命中规则、redirect 链或 Runtime 无法证明的安全检查细节。

General ReAct Trace 的 canonical 可编辑视觉原稿 MUST 使用 `design/pencil/agent-ui.pen`。进入 UI 实现前，Agent MUST 通过 Pencil MCP 打开该 `.pen`，读取节点层级、reusable components、各状态画板、布局与视觉属性，再结合本工作区 `spec.md`、`plan.md`、`data-model.md` 和 contracts 实现 shadcn/ui 组件；不得只根据 PNG 猜测交互或结构。`design/exports/v0.6.0-general-react-agent-ui/*.png` 仅用于评审与代码 Review，不是开发事实源。若 canonical `.pen` 缺失或 Pencil MCP 无法重新打开，UI Step MUST 暂停，先通过 Pencil 自身的 Save As/Move 能力恢复文件并验证；不得用普通脚本读取、改写或重建加密 `.pen`。行为冲突时以 specs/contracts 为准，视觉、层级和状态稿细节以 canonical `.pen` 为准；每次修改原稿后同步更新 PNG 快照。

服务端 Chat Memory/UserMemory 仍只接收 terminal `FinalTurnResult.assistantText`。`source` 依据 `executedToolCallCount > 0` 选择 `chat` 或 `tool`，而不是依据 model 是否绑定工具。浏览器侧复用现有 `LocalConversationSnapshot` 提交机制：只有正常完成且最终回答非空的 assistant message，才把最终回答和经过公开投影的完整 Trace Parts 一起提交到 `conversation-snapshots`；刷新时沿用现有 local-first hydration 恢复二者，完成态 Trace 默认收起且可手动展开，不保存 disclosure state。该投影不得包含 raw reasoning、provider metadata、raw Tool input/output/error、网页正文、内部 prompt、secret 或 Agent state。取消/失败/部分回答只可暂留当前 React state，不提交稳定本地快照；IndexedDB 不可用、超额或校验失败时，降级到既有服务端最终问答，不阻塞会话。继续沿用现有 50 会话、每快照 120 消息的保留边界与删除/重新生成同步语义，不新增 object store、DB version bump 或 server migration。

### 11. Balanced Runtime Performance And Backpressure

这一层只治理容量和数据流，不改写 ReAct 业务预算。实现分为以下九个可独立验证的单元，后续 `tasks.md` 必须保持这些边界而不是重新合并成一次大改：

1. **Process admission**：新增进程级 `GeneralReActExecutionGate`，同步 `tryAcquire()`，每进程最多 8 个 active General ReAct Run；无 permit 时在 context/provider/Tool 工作前复用 `STREAM_SERVICE_UNAVAILABLE`、`retryable=true` 和固定“服务繁忙，请稍后重试。”，不建立内存等待队列、不显示内部容量。gate 只保存计数，严禁保存 request/user/session data，三条专用 Agent 不进入该 gate。
2. **Run lifecycle ownership**：包住 preparation → runner → terminal projection/drain 的单个 General ReAct execution scope 拥有 permit、hard-deadline controller、projection buffer、timer、Abort listener 和 waiter；terminal projection 与 drain 完成后在 `finally` 幂等清理。transport disconnect 只关闭 writer，不释放 permit 或取消后端 Run。
3. **Async I/O event loop**：model、Tavily、MCP、Prisma 和 stream 投影全部使用 awaited async API 与 run-scoped `AbortSignal`。不使用同步 I/O、busy wait、阻塞 sleep、每 Run worker、child process；互不依赖的 I/O 只在已有权限/预算准入后并行。
4. **CPU Tool boundary**：calculator/datetime 继续运行于 Node.js 主事件循环，通过输入长度、允许语法和复杂度限制保证短同步任务，reference p95 ≤5ms；不能把 `Promise.race()` timeout 描述为 CPU 抢占。只有未来具体 CPU Tool 持续越过门槛时才单独设计共享有界 worker pool。
5. **Database client/pool**：修正 `@ai-mind/database` client 生命周期，使开发和生产都只创建一个 process singleton Prisma/PrismaPg client；pool 默认 `max=10`、`connectionTimeoutMillis=5000`、`idleTimeoutMillis=30000`，请求结束不得 `$disconnect()`。多实例数据库连接预算按 `instanceCount × 10` 核算。
6. **Batch persistence primitive**：为现有 `StreamEventStore` 增加 `appendEvents()`，在单 transaction 内 lock StreamRun 一次、为 public event 分配连续 sequence、批量 insert、更新 StreamRun 一次并至多 trim 一次。pool/transaction 等待分别取 `min(2s, Run remaining)` 与 `min(5s, Run remaining)`；terminal 只能是 batch 最后一项，transaction 失败不得把任何该批 event 投递给浏览器；不新增表或修改 Prisma schema。
7. **Server text microbatch**：每个最终回答 part 的首个 `text-delta` 立即 durable flush；后续相同 `runId/messageId/partId/type` 的连续 delta 按 40ms 或累计 256 chars 任一先到合并。Tool/Trace/source/structure/error/finish/cancel/terminal 到达时先 flush 更早 text，再保留独立 envelope。单个 provider delta 超过 256 时整体立即 flush，不拆包、不做人工 pacing。
8. **Bounded projection backpressure**：以 run-local `DurableStreamProjectionBuffer` 取代无界 Promise chain。高水位为 64 pending items/256KiB、低水位为 32/128KiB；General ReAct stream adapter await `publish/flush`，高水位时暂停拉取 Agent stream。禁止 drop/overwrite/reorder；projection failure 固定失败并阻止新 model/tool 工作。现有单 event `maxEventPayloadBytes=256KiB` 继续独立生效。
9. **Browser cadence and observability**：现有 `useStreamTextBuffer` 继续用 ref 保存 transient map/timer/rAF，把默认 final text cadence 调整为 20ms + 最近 `requestAnimationFrame`，并保留 code-fence early rAF 与 terminal/abort/unmount flush。仅允许在显式 `ChatModel` allowlist 中为已评估 token 粒度与 Markdown 成本的模型覆盖 timer 窗口；未命中一律回落 20ms，所有模型仍通过同一 rAF 和终态 flush。记录不含用户内容的 active Run、capacity rejection、queue high-water、batch chars/events/wait、DB transaction duration、event-loop delay 和 cleanup 指标；用 8 个 scripted 并发 Run 做 reference load，而不是依赖 Tavily latency。

写入与投递顺序固定为：

```text
LangChain typed event
  → public-safe projection/validation
  → DurableStreamProjectionBuffer (40ms | 256 chars | structural flush)
  → StreamEventStore.appendEvents() transaction
  → committed envelopes in sequence order
      ├─ writer open   → NDJSON/SSE-compatible delivery
      └─ writer closed → database only, later cursor replay
```

这意味着 v0.6.0 不采用“原始 delta 先推流、合并后异步入库”。后者在进程崩溃时会让浏览器已显示内容领先 durable cursor，必须依赖 Redis/WAL 等第二层才能补偿；本版通过 PostgreSQL persist-before-publish 直接消除该不一致窗口。

完整参数与失败语义见 [contracts/runtime-performance.md](./contracts/runtime-performance.md)。

### 12. Dependency Migration Gate

引入 `langchain` 是本版本必要依赖变更，但必须控制升级影响：

1. 在独立的首个实现 Step 更新 `apps/webapp/package.json` 与 lockfile，选择同一稳定兼容线；至少满足可标记 retryability 的 `langchain >= 1.5.9`、`@langchain/core >= 1.2.8`。
2. 检查 `pnpm why/list`，避免重复 core/langgraph runtime 导致 `instanceof`、message、schema 或 checkpoint 类型分裂。
3. 先运行现有 Tasklist、Image、Delivery、Chat Memory checkpointer 和 provider targeted suites，证明依赖升级未改变专用 Graph。
4. 用 fake model 完成 `createAgent` v2、`maxConcurrency=3`、9-call batch admission、actual-use `RetryPermitPool`、并行 state reducers、abort 和 stream event compatibility Spike。
5. Spike 通过后才迁移普通聊天控制流；失败则回到 Plan 决策，不把临时兼容 hack 扩散到业务代码。

### 13. Existing Code Change Map

| Existing area                                                                                                                                  | Planned change                                                                                                                                                                                  | Preserved boundary                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/webapp/package.json`, `pnpm-lock.yaml`                                                                                                   | 新增 `langchain` 并原子对齐 core/langgraph 兼容线                                                                                                                                               | 不引入 LangChain Classic、LangSmith 服务依赖或浏览器 bundle                                                       |
| `runtime/chat-session.ts`, `runtime/types.ts`                                                                                                  | 从 `toolBoundModel + planning/final prompts` 改为 unbound model、effective tools、统一 Agent prompt/context                                                                                     | Model Provider Registry 仍是唯一模型创建入口                                                                      |
| `runtime/chat-orchestrator.ts`                                                                                                                 | 删除普通聊天单次 planning/tool/final 和 composer/capability early-return；改为 preparation → runner → final memory                                                                              | Tasklist、Delivery、Image 分流和 StreamLifecycle 保持                                                             |
| `runtime/general-react-agent/`                                                                                                                 | 新增 createAgent composition root、state/context、batch admission、RetryPermitPool、process execution gate、两枚 middleware、runner、stream adapter                                             | gate 只存 permit 数，不保存 request data；不新增第二套 Graph 或 checkpoint                                        |
| `capabilities/tool-binding.ts`                                                                                                                 | 独立 `GeneralToolPolicy` 一次解析固定基础 Tool；Skill 不参与 Tool/MCP discovery                                                                                                                 | Tool Definition/availability/scope/execution policy 是唯一 Tool 权限来源                                          |
| `tools/registry.ts`、各 Tool Definition                                                                                                        | 增加 `general-react-agent` scope、判别式 `standard-tool/agent-tool` execution policy 和 public/internal output boundary                                                                         | Tool Definition/Registry 继续拥有 tool contract；timeout 不进入模型 schema                                        |
| `runtime/tool-runtime/*`                                                                                                                       | 拆出可取消的底层 attempt 与最终 transcript；统一解析 Profile/Tool/deadline 最小 timeout、普通 Tool retry/退避和 typed error                                                                     | Agent Tool 不套普通短超时/整 Agent retry；Tasklist/Delivery 行为不回归                                            |
| `runtime/delivery-chain/manager/subagent-tools.ts`                                                                                             | 将现有 `*-subagent` Tool 显式标记为 `agent-tool/delegated-agent`                                                                                                                                | 专用 Delivery Runtime 继续拥有内部阶段、模型 timeout/retry 与 scope                                               |
| `tools/web/*`                                                                                                                                  | 新增 Tavily adapter、search/read tools、初始/返回 URL policy 与共用 Outbound Secret Guard                                                                                                       | 不建设通用 DLP；不声称 Tavily redirect chain 可见                                                                 |
| `runtime/assistant-stream.ts`                                                                                                                  | 解耦 preserve provider metadata 与 public reasoning；为 Agent stream adapter 复用安全转换                                                                                                       | raw reasoning 永不公开/持久化                                                                                     |
| `chat-service.ts`、`stream-recovery/*`                                                                                                         | 用可 await 的 durable projection sink 替代无界 Promise chain；新增 40ms/256 chars text microbatch、64 items/256KiB 背压及 `appendEvents` 单事务批量投影；继续分离 transport close 与 run cancel | persist-before-publish、连续 sequence、terminal ordering 不变；不新增 checkpoint、第二 executor、route 或数据库表 |
| `packages/database/src/client.ts`                                                                                                              | 开发/生产均复用 process singleton Prisma/PrismaPg client；pool 固定 max 10、连接超时 5s、idle 30s                                                                                               | 不按请求 disconnect；不新增 Redis 或修改 Prisma schema                                                            |
| `model-provider/*`                                                                                                                             | Agent logical retry 与 provider hidden retry 分离；支持 run-scoped timeout                                                                                                                      | catalog、provider selection、usage observer、安全错误不变                                                         |
| `runtime/authoritative-answer.ts`, `prompts/tool-calling.ts`                                                                                   | 普通聊天不再 authoritative bypass 或二阶段 prompt；仅保留仍有真实调用方的部分                                                                                                                   | 删除前先确认专用运行时依赖                                                                                        |
| `components/chat/message-list/messages/assistant-message.tsx`                                                                                  | 按 `agent-run`/`agent-graph` 判别字段路由；通用聊天把 Agent Run/Tool/Skill/Resource/Prompt Part 统一交给 General ReAct Trace，并抑制外部旧面板                                                  | 不按 `agentName` 猜测；不改变 Tasklist/Delivery/Image 的 renderer                                                 |
| `components/chat/message-list/chat-message-list.tsx`                                                                                           | 仅 accepted follow-up 的 live compound turn 使用固定 `288px` response reserve，并在终态交接至最终 assistant item；按实际列表 key 匹配，不设置 viewport reply runway                             | 保留 Composer-safe footer inset、历史消息原有高度、Virtuoso ownership 和 user-reading scroll policy               |
| `components/chat/message-list/messages/user-message.tsx`                                                                                       | 不修改；Pencil 中的用户问题气泡只提供页面上下文                                                                                                                                                 | 保留现有气泡视觉、display segments、复制与删除行为                                                                |
| `components/chat/message-list/parts/general-agent/`                                                                                            | 新增唯一浅色扁平内联 `GeneralAgentTrace*` presentation、Shimmer active 标题、统一行、确定性计数/来源、并行稳定槽位、终态标题和自动折叠                                                          | 不复用或修改 Tasklist/Delivery/Image 专用 presentation；最终回答 UI 不变；不保留 legacy 通用面板                  |
| `components/instamind/local-chat-persistence/{schema,stable-snapshot,store}.ts`、`use-chat-stream.ts`、`chat-stream/use-stream-text-buffer.ts` | 复用 stable snapshot/local-first hydration；完成态 Trace+答案一起恢复；final text buffer 默认 20ms+rAF，允许受控模型 allowlist 覆盖 timer 窗口并保持 ref-backed queue 与 terminal cleanup       | 不人工切分服务端 delta；不新增 IndexedDB DB/object store/version；本地缓存失败继续降级服务端最终问答              |
| shadcn/Tailwind UI baseline                                                                                                                    | 按官方 shadcn 路径补齐 `shimmer` utility；使用现有 Collapsible/Button/Separator/Lucide                                                                                                          | 不引入 AI Elements、Motion 或新 UI 组件库                                                                         |
| `design/pencil/agent-ui.pen`                                                                                                                   | 作为 General ReAct Trace 唯一 canonical 可编辑视觉原稿；UI 实施前必须由 Pencil MCP 读取并验证                                                                                                   | PNG 仅作评审快照，不得替代 `.pen` 驱动开发                                                                        |
| `stream-core`、stream schema/reducer                                                                                                           | 增加 `agent-run-start/end` 与 `tool-end.sources`；分别投影 typed `AgentRunPart`、保留 `AgentGraphPart`，来源按 canonical URL union                                                              | 不新增 route/StreamRun kind；v0.6.0 采用新协议，不维护旧 `agent-step`/旧消费者兼容                                |
| route/Prisma schema                                                                                                                            | 以回归验证为主                                                                                                                                                                                  | request DTO、StreamRun kind、Prisma/checkpoint schema 不变                                                        |

## Compatibility And Migration

- Request DTO: 无变化。
- Route/StreamRun kind: 无变化。
- Stream protocol: `agent-run-start/end` 是 General ReAct 的正式 run lifecycle，并给 `tool-end` 增加 `sources`；同步 stream-core schema/writer、web reducer/UI tests 与 contracts。专用 Agent 的 `agent-graph-*` 不变；旧 `agent-step` 和旧通用消费者不在 v0.6.0 兼容范围内。
- Stream recovery: 保持现有 StreamRun owner、cursor replay 和显式 cancel 语义；普通 SSE disconnect 不再被通用 Agent 误解释为 run cancellation。内部 append 从逐事件事务升级为保持 envelope/sequence 的批量事务，属于实现优化，不改变客户端 cursor contract。
- Database/Prisma: schema/migration 无变化；client 生命周期改为 dev/prod process singleton，PrismaPg pool 默认最多 10 个连接。StreamEvent 仍是唯一 durable replay source，不引入 Redis。
- Browser local snapshot: 复用 `ai-mind-local-chat/conversation-snapshots` 与现有容量/清理策略；完成态 assistant message 增加 public-safe General ReAct Trace Parts 的恢复语义，不新增 object store 或 DB version。清空浏览器数据后 Trace 可丢失，服务端最终问答仍是兜底。
- Existing agents: Tasklist、Delivery Chain、Image 不迁移，也不共享通用 Agent middleware/state。
- Existing tools/skills/MCP: Tool Definition/Registry 是唯一 Tool 权限来源；普通聊天固定使用 GeneralToolPolicy 的七个基础 Tool，Skill 只提供 prompt/output overlay。已存在的 remote MCP mock Resource/Prompt/Tool 不再由 Skill 或自然语言隐式触发；保留 Composer 显式上下文入口。现有 MCP transport timeout 只能作为外层有效 attempt 内的更短子超时；General ReAct adapter 固定关闭 MCP client session recovery，隐藏 retry 不得绕过 Tool Runtime。
- Existing ordinary Tool/Skill/Resource/Prompt panels: v0.6.0 直接删除旧组件源码和 renderer 分支；通用 `routeType=chat` 的 Tool/Skill/Resource/Prompt 只能由 General ReAct Trace 展示。Delivery/Tasklist/Image 专用 presentation 保留各自域内组件。
- Existing Agent Tools: Delivery subagent Tool 仅补齐 `agent-tool` 类型标记，不改其专用 runtime budget、Graph/manager 流程或 UI；通用 ReAct 不绑定它们。
- Existing ordinary chat: 旧 planning → single tool batch → final/authoritative bypass、direct-answer 和兼容测试对象全部删除，由 `createAgent` 多轮 loop 取代。
- Package version: 仅 release closing 时统一提升到 `0.6.0`，不在当前计划阶段修改。

## Verification Strategy

1. Dependency Spike：单一 LangChain family、现有专用 Graph/provider/checkpointer 回归、`createAgent` server runtime import/build。
2. Agent contract：零工具直答、单工具、多轮、同批最多并发 3、batch admission、乱序完成/message pairing、delta/union reducers、middleware order、recursion/abort。
3. Retry/deadline：provider/transport hidden retries=0、model transient retry 最多一次、普通 Tool Profile/自身/deadline 取最小值、actual-use 原子 retry permit、remote retry 最多两次/Run 总计四次、取消感知退避、145 秒 Action cutoff、180 秒 hard deadline、固定 unbound Answer、仅空白 Answer fallback 与 partial/error fail-closed。
4. Tool/Web：`standard-tool/agent-tool` 判别、normalize/schema/scope、一次逻辑调用一次 transcript、Agent Tool 不套普通短超时和整 Agent retry、Outbound Secret Guard、initial/provider-reported URL policy、Tavily 远端 redirect 边界、观察截断与 Web provider contract；被拒绝原值在 provider fake、stream、UI、log、Memory 中均为零。
5. Provider compatibility：DeepSeek `reasoning_content` 内部回放且 public stream 为零；OpenAI-compatible/豆包/Qwen/Ollama trajectory。
6. Orchestrator/context/memory：所有 chat 入口汇入 Agent；三条专用链路排除；Composer/Capability 变为 context；source 依据实际执行。
7. Stream/UI/local snapshot：验证 General ReAct 只发 `agent-run-start/end` 并投影为 `agent-run`，Tasklist 保留 `agent-graph-*`/`agent-graph`，旧 `agent-step` 和 legacy 面板源码不存在且 `agentName` 不参与路由；验证 `tool-end.sources` schema/writer/reducer、canonical URL union、搜索/读取数量不含被拒绝结果或 retry、仅列最多 5 项 `status='read'` 来源且不推断“官方”；验证 General ReAct 是通用聊天唯一过程容器，Tool/Skill/Resource/Prompt 外部旧面板数量为 0；验证整行 disclosure、标题邻接 chevron、无标题耗时、active 标题 shadcn Shimmer、active 手动收起后不被新事件重开、action-settled/final-pending 仍保持 active、首个 final `text-start` 原子完成并只自动收起一次、用户重开、“已停止思考”/失败终态不闪动、并行 ordinal 稳定槽位、retry 原行更新、Tool 类型图标/纯文字状态、安全来源链接、零 Tool 不出现双 loading、accepted follow-up 在 submitted/streaming 的 assistant slot 与 ready/error 的最终 assistant item 保留固定 `288px` response reserve 且无 viewport reply runway、保留 Composer-safe footer inset、既有最终回答渲染和三条专用 Agent UI 回归；验证完成态刷新后 Trace+答案恢复、删除/重新生成同步、取消/失败/部分回答不提交稳定快照、IndexedDB 失败时服务端问答兜底，并在序列化快照上扫描 raw reasoning、原始工具数据、网页正文与 secret；同时验证 SSE 断线不触发 run abort、断线后事件继续投影，显式 cancel/hard deadline 才终止执行，且网络投递不参与 180 秒计算。
8. Performance/capacity：验证 dev/prod 单进程只有一个 Prisma client/pool；8 个 scripted General ReAct Run 可并发完成，第 9 个 fail-fast 且 provider/Tool 调用为 0；首 delta 立即、后续 40ms/256 chars、结构化强制 flush、单个大 delta 不拆包；batch append 连续 sequence/terminal last/persist-before-publish；DB 慢注入下 64 items/256KiB 高水位和 32/128KiB 低水位生效，取消/deadline/projection failure 无 timer/listener/permit/promise 泄漏。记录并评估 append transaction p95 ≤20ms、event-loop delay p95 ≤50ms、本地确定性 Tool CPU p95 ≤5ms，默认浏览器 buffer 配置下正常持续文本消息树提交频率通常 ≤25/s；模型 timer 覆盖需单独记录性能证据。
9. Repository gates：targeted tests → `pnpm typecheck` → `pnpm lint:webapp` → stable tests → build → `git diff --check`。

10. Corrective closing：Action `messages` 文本不再候选缓存或回放；全部保持私有，只有同模型未绑定 Tool 的 Answer 安全 delta 可进入 public/durable/Memory/snapshot 边界。Answer Tool Call、provider error 与 partial-stream error 以 failed 收口且不拼接 fallback；正常空白 Answer 才可使用 fallback。Web URL policy 解析 IPv4-mapped/compatible IPv6 后复用 IPv4 私网拒绝；Tool Runtime 在首个 attempt 前 await durable start、执行结束后才发布附来源的终态；process observer 使用 1,024 样本 ring window。PostgreSQL reference load 先执行不计入结果的预热，第 9 个请求经与前 8 个相同的 scripted admission 入口并保持 provider/Tool 为零；production-like 运行必须记录非秘密 topology、数据库实例、并发、pool、预热和样本数，再强制验证 transaction p95 `≤20ms`；本地 Docker 冷启动只输出诊断，不能作为 release evidence。

详细可执行验收见 [quickstart.md](./quickstart.md)。

## Documentation And Decision Records

当前 implementation-ready 资产由 `tasks.md`、`acceptance.md` 与 `decisions.md` 分别承接任务顺序、Step 退出证据和已确认/已淘汰方案；它们与本 Plan 共用同一 canonical workspace。

实施阶段必须新增/更新：

- 新 ADR：LangChain `createAgent` 作为私有 Action 内核、middleware/tool/stream ownership、run-local 与固定 Action/Answer 决策。
- `docs/architecture/`：聊天 Runtime 主链、Tool/Skill/MCP 分层、Stream Trace、Memory 与 special Agent 隔离。
- `docs/architecture/production-deployment.md`：`TAVILY_API_KEY` 生产 env contract。
- `apps/webapp/.env.example` 与 `deploy/env/webapp.production.env.example`。
- 在实现和验收稳定后再评估根 `README.md`、`docs/versions/`、`docs/releases/` 与 package version；当前计划阶段不提前修改。

## Deferred Beyond MVP

- 跨请求 Agent checkpoint/resume、HITL、长期 `AgentRun` 和 Run History；现有 resumable stream 的事件回放不是 Agent state resume。
- 有副作用 Tool 的并行、动态并发配置、逐 Tool `parallelSafe` 元数据、为通用 ReAct 新增 Agent Tool、多 Agent、子 Agent、长期或队列化后台/异步任务；现有最多 180 秒的 run-scoped 断线续跑和 Delivery `agent-tool` 不扩展这些能力。
- 浏览器操作、网页写入、文件系统、Shell、桌面控制和其他高风险工具。
- 多 Web Provider 自动 failover、搜索缓存、网页索引、额度管理 UI。
- provider hosted Web Search/MCP 的统一抽象和模型侧原生工具协商。
- 依据大量 Tool catalog、用户权限或租户策略做动态 Tool Search/按需 Tool Policy；在该需求出现前不得让 Skill selector 重新承担 Tool 权限。
- raw chain-of-thought 展示或持久化（明确不计划）。
- Redis/KV、消息队列、跨实例全局 semaphore、独立 Agent worker service、process-crash takeover、通用 Worker Thread pool 和自动扩缩容；v0.6.0 仅提供每进程 8 个 General ReAct Run 的容量门与 PostgreSQL-first 背压。

## Complexity Tracking

无 Constitution 违规需要例外说明。`createAgent` 是唯一通用 ReAct loop；两枚项目 middleware 分别承载包含 batch admission 的运行策略和 Tool Runtime 边界，均具有独立业务语义与测试价值。admission 是并行 logical-call/observation 预算与 state merge 的必要业务规则，不是第二套 scheduler；`RetryPermitPool` 只提供原子 retry admission 并把 grant 回写 state，不保存另一份 Agent 业务状态；`ToolExecutionPolicy` 继续阻止普通 Tool 与 Agent Tool 共享错误的 timeout/retry 语义。`GeneralReActExecutionGate` 只保存 process permit 计数，`DurableStreamProjectionBuffer` 只保存单 Run 未持久化 public event；二者分别解决跨请求容量和数据库背压，均不得成为第二份 request/Agent state。
