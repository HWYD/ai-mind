# 实现计划：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**分支**：`[043-tool-agent-final-turn-memory]` | **日期**：2026-07-03 | **规格**：[spec.md](./spec.md)

**输入**：来自 `specs/043-tool-agent-final-turn-memory/spec.md` 的功能规格。

**说明**：本计划遵循 Spec Kit planning workflow，用于记录 v0.4.3 的实现设计；本文件不直接实现生产代码。

## 摘要

v0.4.3 在 v0.4.2 单线程 chat memory baseline 上扩展 final-turn memory：普通 tool/MCP/resource、Tasklist Agent、Delivery Chain 和未来受控 Agent 的“用户输入文本 + 最终用户可见助手文本”可以进入 current chat ThreadState recent messages。设计重点不是持久化执行过程，而是把现有 text-only chat memory 的写入资格从 ordinary chat 扩展到安全 final turn，同时继续排除 raw tool transcript、GraphState、HITL checkpoint、RuntimeArtifact、workflow progress、subagent raw result、raw prompt 和 provider response。

## 技术上下文

**语言/版本**：TypeScript 5.9、React 19、Next.js 16、Node.js runtime。

**主要依赖**：`@langchain/core`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres`、`zod`、`@ai-mind/stream-core`、`@ai-mind/database`。

**存储**：继续使用 v0.4.2 chat memory 的 LangGraph checkpoint storage。PostgreSQL 发布目标仍为 `langgraph_chat_memory` schema；Prisma 不新增 chat history 业务表，也不管理 checkpoint tables。

**测试**：`apps/webapp/tests` 下的 Vitest suites、`packages/stream-core` protocol tests、Tasklist Agent / Delivery focused runtime tests、frontend reducer / hydration tests、typecheck / lint / build。

**目标平台**：AI Mind webapp，本地开发和容器化生产部署。

**项目类型**：Web application，包含 frontend state、server API routes、AI runtime、stream protocol package 和 shared database package。

**性能目标**：

- final-turn memory 仍然每个 completed turn 最多写入一次，不按 stream chunk 写入。
- hydration 继续返回有界 text messages，页面初始化不会因为 tool/agent final turns 引入 raw runtime payload。
- 长 Delivery final text 在保存前做确定性截断，避免单个 final report 导致 recent window 或 compaction 压力失控。
- 普通 chat 模型上下文仍以后端 ThreadState 为历史事实源，不重复注入前端历史。

**约束**：

- persisted `ChatThreadMessage` 保持 text-only；v0.4.3 不持久化 `source`、`turnId`、`displayKind` 或其他 metadata。
- `source` / final-turn identity 只可作为 append 阶段的 non-persisted guardrail、logging 和 duplicate-prevention 输入。
- Hydration DTO 不新增字段，不透传 source metadata，不新增 tool/resource/agent/workflow/artifact parts。
- `@ai-mind/stream-core` chunk union 不修改；frontend reducer public shape 不修改。
- 不新增 ChatSession / ChatMessage 业务表，不新增 LangGraph Store / PostgresStore。
- Tasklist Agent checkpoint/resume thread id、AgentRun/AgentInterrupt 业务状态和 review node side-effect-free 约束不得改变。
- Delivery Chain 继续 run-local，不获得 checkpoint/resume/artifact persistence 语义。
- failed/exception/cancelled/paused/interrupted turns 不保存为 completed final turn。

**范围/边界**：

- 只支持当前浏览器的单个 chat session。
- recent chat memory 继续使用 v0.4.2 的完整轮次窗口和 compaction 策略。
- 本版范围内的 final turns：ordinary chat、tool-assisted final answer、reader/utility text answer、docs summary、MCP/resource-assisted final answer、Tasklist Agent completed/final/controlled blocked final answer text summary、Delivery Chain completed/blocked final report text、未来受控 Agent 的 final text。
- 本版范围外：contextEntries、execution summary、tool observation summary、agent run summary、frontend source badge、Memory Inspector、Long-term Memory、多会话历史、业务历史表、stream protocol breaking change。

## Constitution 检查

_闸门：必须在 Phase 0 research 前通过，并在 Phase 1 design 后复检。_

**Controlled Agent First**：PASS。v0.4.3 不新增自由 Agent，不扩大 Tasklist Agent 或 Delivery Chain 权限；只在 final user-visible text 层做 chat memory 写入资格扩展。

**GraphState Is Runtime Source of Truth**：PASS。Tasklist Agent GraphState 仍是内部运行态事实源；chat ThreadState 不保存 GraphState，也不参与 Tasklist route/resume 决策。

**Review Node Must Be Side-effect Free**：PASS。本版本不修改 review node；final-turn memory append 只能发生在 graph/coordinator 观察到 completed/final/blocked 之后，不能放进 interrupt review node。

**Business State and Checkpoint Must Stay Separate**：PASS。AgentRun / AgentInterrupt 继续由 Prisma 业务表管理；chat memory 继续使用独立 checkpoint state，不新增业务历史表。

**Stream Compatibility Is a Hard Constraint**：PASS。本版本不新增 stream chunk，不修改 `@ai-mind/stream-core` chunk union；final-turn memory 是 server-side append 行为。

**Public DTO Must Be Strict and Safe**：PASS with guardrail。Hydration DTO 保持 v0.4.2 allowlist；必须继续拒绝 raw checkpoint、GraphState、RuntimeArtifact、provider response、stack、cookie、API key 和 provider config。

**Minimal Abstraction**：PASS with guardrail。可以新增很薄的 final-turn append/adaptation boundary，但不得创建通用 Agent memory platform、contextEntries 或 execution-summary subsystem。

**Tests Before Broad Integration**：PASS。计划先补 state/service/contract tests，再接普通 tool/MCP、Delivery、Tasklist，最后跑 hydration/reducer/stream-core/non-regression。

**Spec Drift Must Be Blocked**：PASS。本计划明确不改 stream protocol、DB schema、GraphState shape、AgentRun state 或 hydration DTO；若实现偏离必须同步更新 spec/plan/contracts/ADR。

**Official Spec Kit Skills Are Tooling Entry**：PASS。本计划位于 `specs/`，遵循 official Spec Kit workflow；后续 tasks/analyze/converge 应继续使用或人工等价执行。

## 项目结构

### 文档（本功能）

```text
specs/043-tool-agent-final-turn-memory/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── final-turn-memory-runtime.md
│   └── chat-thread-hydration.md
└── tasks.md
```

### 源码（仓库根目录）

```text
apps/webapp/
├── app/api/chat/
│   ├── route.ts
│   └── thread/route.ts
├── components/instamind/
│   ├── use-chat-stream.ts
│   └── chat-stream/
├── lib/ai/
│   ├── runtime/
│   │   ├── chat-memory/
│   │   │   ├── chat-memory-service.ts
│   │   │   ├── message-adapter.ts
│   │   │   ├── state-schema.ts
│   │   │   ├── context-builder.ts
│   │   │   ├── compaction.ts
│   │   │   └── final-turn-adapter.ts       # 候选薄边界
│   │   ├── chat-orchestrator.ts
│   │   ├── version-plan-tasklist-agent/
│   │   └── delivery-chain/
│   └── types/
└── tests/
    ├── app/api/chat/thread/
    ├── components/instamind/
    └── lib/ai/runtime/

packages/stream-core/
└── tests/protocol/        # 只做 non-regression；预期不改协议

packages/database/
└── tests/                 # 只做 non-regression；预期不改 Prisma schema
```

**结构决策**：v0.4.3 仍主要在 `apps/webapp` 内实现，因为能力属于 webapp runtime 的 chat memory 写入和恢复边界。`packages/stream-core` 和 `packages/database` 只做 non-regression 验证，不应产生功能 diff。

## Phase 0 研究结论摘要

详细决策见 [research.md](./research.md)。

关键结论：

- persisted ThreadState 继续 text-only，不扩展 `ChatThreadMessage` metadata。
- Hydration DTO 保持 v0.4.2 兼容，不新增字段。
- final-turn write eligibility 与 context eligibility 分离：structured runtimes 可以写 final text，但不自动获得 ordinary chat model context 或 resume 语义。
- 普通 tool/MCP/resource 当前已经通过 orchestrator final answer append 路径具备基础能力，本版重点补 guardrail 和 tests。
- Tasklist 只保存 final answer text summary，不保存 tasklist artifact markdown、GraphState、HITL payload 或 AgentRun internals。
- Delivery 只保存 completed/blocked final report text，不保存 RuntimeArtifact、workflow progress、trace 或 subagent raw result。
- 长 Delivery final report 保存前进行确定性截断，上限 8000 字符；不做模型摘要，不引入 execution-summary data model。
- failed/exception/cancelled/paused/interrupted turns 不保存。
- duplicate prevention 不依赖 persisted turnId；append 前检查现有 message id 或相同 user/assistant final text pair。

## Phase 1 设计摘要

详细模型和契约见：

- [data-model.md](./data-model.md)
- [contracts/final-turn-memory-runtime.md](./contracts/final-turn-memory-runtime.md)
- [contracts/chat-thread-hydration.md](./contracts/chat-thread-hydration.md)
- [quickstart.md](./quickstart.md)

## 设计后 Constitution 复检

**Controlled Agent First**：PASS。设计不扩大 Agent 权限，只保存完成后的用户可见文本。

**GraphState Is Runtime Source of Truth**：PASS。Tasklist GraphState 不进入 chat memory；final-turn extraction 不以 raw GraphState 为输入。

**Review Node Must Be Side-effect Free**：PASS。HITL paused/interrupted 不写入；review node 不新增副作用。

**Business State and Checkpoint Must Stay Separate**：PASS。不新增业务表，不混用 Tasklist checkpoint 和 chat memory checkpoint。

**Stream Compatibility Is a Hard Constraint**：PASS。不修改 stream-core；所有新增行为通过 server-side memory append 和既有 hydration route 体现。

**Public DTO Must Be Strict and Safe**：PASS。Hydration contract 继续 text-only allowlist，并扩展 forbidden-field 测试覆盖 tool/agent/workflow raw state。

**Minimal Abstraction**：PASS。若新增 `final-turn-adapter`，其职责限定为 append-time text validation、bounding 和 duplicate guard；不做通用 execution memory。

**Tests Before Broad Integration**：PASS。Design artifacts 明确从 chat-memory state/service/contract tests 开始，逐步接 runtime paths。

**Spec Drift Must Be Blocked**：PASS。如实现需要改 DTO、stream protocol、ThreadState schema metadata、GraphState 或 DB schema，必须先回改本 spec/plan 并重新 review。

## 复杂度跟踪

本计划不引入 constitution violation。
