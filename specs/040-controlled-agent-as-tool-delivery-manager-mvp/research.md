# Research 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Planning
版本: v0.4.0
日期: 2026-07-01

## Decision 1: v0.4.0 使用 Agent-as-tool，不使用 runner fallback

Decision:

- `ControlledDeliveryManager` 必须通过模型 tool-calling 调用 `plan-subagent`、`task-subagent`、`review-subagent`。
- 当前模型不支持 tool-calling 或运行时没有 `bindTools` 时 fail closed。
- 不自动降级为普通函数 runner。

Rationale:

- 用户已明确要求“我要的是 tool，也就是 Agent-as-tool”。
- 现有项目已经有 model catalog tool-calling 能力校验，`apps/webapp/lib/ai/model-provider/catalog/resolve-model-selection.ts` 支持 `requireToolCalling`。
- 自动 fallback 会让 v0.4.0 和旧 fixed stage workflow 的架构差异变弱。

Alternatives considered:

- 普通 runner：实现简单，但架构价值不足。
- 自由 Supervisor：展示效果强，但不符合 Controlled Agent First，也超出 MVP。

## Decision 2: 子 Agent tool result 使用强 JSON Schema

Decision:

- 子 Agent tool raw result 必须通过强 JSON Schema 校验。
- Schema 以 Zod 为事实源，TypeScript 类型从 schema 推导。
- Manager 只把 schema 合法 result 转换成 `SubagentToolResult` 和 `RuntimeArtifact`。

Rationale:

- 用户已拍板强 JSON Schema。
- 现有 tool definitions 已使用 Zod schema，路径为 `apps/webapp/lib/ai/tools/registry.ts` 及具体 tool 文件。
- Markdown-first raw result 难以稳定区分 status、artifact title、warnings、summary 和安全失败字段。

Alternatives considered:

- Markdown-first + runtime 包装：容错高，但不符合用户最终决策。
- 让模型输出自由文本，后处理解析：实现快，但不可测性高。

## Decision 3: 复用现有 tool 体系，并用最小 runtime scope 过滤隔离内部 tools

Decision:

- 子 Agent tools 优先复用 `ChatToolDefinition`、Zod schema、LangChain structured tool 的模式。
- 在统一 tool registry 侧只新增最小 `ToolRuntimeScope` 过滤维度，不新增独立 `ToolVisibility`。
- `plan-subagent`、`task-subagent`、`review-subagent` 只允许位于 `delivery-chain-manager` scope。
- 普通 Skill / chat capability 只消费 `skill-binding` scope 的 tools。
- 不把 delivery-chain 子 Agent tools 暴露到普通 capability catalog 或 `@` 菜单。

Rationale:

- 复用现有工具体系能保持 schema、tool binding 和 LangChain 适配一致。
- 当前项目真实需要解决的是 runtime 过滤，而不是额外一层显示可见性抽象；`ToolRuntimeScope` 一维足以表达 skill-binding 与 agent-internal 的边界。
- 只加 scope 能避免 delivery-chain 内部 tools 进入普通聊天绑定面，同时不把 registry 复杂化成新的 catalog 设计。
- v0.4.0 的定位是 `/delivery-chain` 内部受控 manager，不是通用 Agent platform。

Alternatives considered:

- `ToolVisibility` + `ToolRuntimeScope` 双字段：表达更完整，但当前没有独立“显示可见但不可绑定”的真实需求，属于过早抽象。
- 全局 Agent Catalog：后续可能需要，但本版会过早引入权限、发现、选择、版本化和 persistence 问题。
- 私有纯函数：安全但不满足 Agent-as-tool。

## Decision 4: 复用统一 `executeToolCall()` 执行核心，但按 runtime scope 静默分流 transcript

Decision:

- Manager 应复用统一 `executeToolCall()` 执行核心，而不是再维护一套平行的 local executor。
- `delivery-chain-manager` scope 下的子 Agent tool 执行不得发普通 `tool-start/tool-end` 或完整 resource transcript。
- 用户可见进度只通过 `workflow-progress-*` 安全摘要表达。

Rationale:

- `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts` 已经承载了工具执行、`ToolMessage` 生成、raw result 回传等真实运行职责，重复造一套 executor 更容易 drift。
- v0.4.0 明确要求 progress panel 不变成 debug transcript，不暴露 raw invocation/result/artifact；真正冲突的是 transcript 发射，而不是 tool 执行核心本身。

Alternatives considered:

- 直接调用 `executeToolCall()` 且不分流 transcript：复用多，但会污染 UI。
- 完全复制 tool runtime：能隔离 UI，但会形成第二套执行链，增加 drift 风险。

## Decision 5: 旧 DeliveryChainGraph 不保留为主路径

Decision:

- `startDeliveryChainRun()` 在 v0.4.0 完成后应进入 `ControlledDeliveryManager`。
- 当前 `createDeliveryChainGraph()` / `runDeliveryChainGraph()` 不应继续作为主执行路径。

Rationale:

- 当前 graph 已经是固定 node workflow，路径在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts`。
- 如果 Manager 包在 graph 外或 graph 包在 Manager 外，会形成双主控。
- v0.4.0 的架构目标是 Manager -> Subagent Tool -> Result -> Synthesis。

Alternatives considered:

- 保留 graph 做外层 workflow：容易和 Manager 争夺 orchestration authority。
- 把子 Agent tool 做成 graph node：会退回“node 改名”。

## Decision 6: Workflow progress 复用现有 contract

Decision:

- 不新增 stream chunk。
- 使用现有 `workflow-progress-start`、`workflow-progress-step`、`workflow-progress-end`。
- step 文案从旧 Plan/Task/Review 改为 Manager delegation 语义。

Rationale:

- stream-core 已有 workflow progress contract，路径为 `packages/stream-core/src/protocol/chat-stream-chunk.ts`。
- 前端 reducer 已支持 workflow progress，路径为 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts`。
- 新增 Agent trace UI 会扩大范围。

Alternatives considered:

- 新增 `agent-delegation-*` chunk：语义清晰，但协议和 reducer 改动过大。
- 使用普通 tool UI：会泄露内部 transcript。

## Decision 7: 测试使用 fake tool-call model

Decision:

- Manager 主测试使用 fake model 返回确定的 tool calls。
- 不把真实 provider 调用作为 CI / 验收硬门槛。

Rationale:

- Tool-calling provider 行为不稳定，不适合作为契约测试事实源。
- 本版重点是 policy、schema、manager loop 和 public boundary。

Alternatives considered:

- 真实 provider e2e：覆盖真实链路，但不稳定、成本高。

## Decision 8: Tasklist Agent 完全隔离

Decision:

- `task-subagent` 不是现有 Tasklist Agent。
- `/delivery-chain` 子 Agent tools 不 import `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/**`。
- 不复用 HITL Graph、checkpoint、resume 或 AgentRun persistence。

Rationale:

- Tasklist Agent 当前已经有 GraphState、HITL、checkpoint / resume、AgentRun 等更重的架构。
- v0.4.0 不做 HITL-aware delegation。
- 复用 Tasklist Agent 会污染双方边界，并让 MVP 范围爆炸。

Alternatives considered:

- 把 Tasklist Agent 包装成 tool：更像真实 agent-as-tool，但引入持久化和 HITL 复杂度，超出 v0.4.0。
