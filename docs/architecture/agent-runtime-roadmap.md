# Agent Runtime Roadmap

状态: Active
日期: 2026-07-04

## Purpose

本文记录 AI Mind Agent Runtime 从受控单 Agent、受控 Graph Agent，继续演进到受控 Agent-as-tool Manager 架构的方向。

Roadmap 不是当前版本的实现清单。每个版本只能实现对应 spec / tasks / acceptance 中明确列出的能力；如果 roadmap、ADR、spec 与真实实现发生冲突，以当前代码和正式 spec 收口结果为准，并同步修正文档。

## Current baseline

截至 v0.4.11，当前 Agent Runtime 基线是：

- Public Agent demo resource root 已收口到 `examples/agent-demo/`。
- Public Agent demo 文件资源只使用 `@demo://`。
- Tasklist Agent public demo 入口是 `/tasklist + @demo://version-plans/*.md`。
- Tasklist Agent 是受控 LangGraph Agent Runtime，包含 GraphState、HITL、checkpoint / resume 和 AgentRun 协调边界。
- `/delivery-chain` 支持 demo scenario 和 inline requirement 两类输入。
- `/delivery-chain` 内部 runtime 是结构化 Supervisor：用户模型生成业务判断，固定 Contract 模型编码严格 Contract，Review 阶段固定并行执行 General/Risk/Boundary 三个角色。
- `/delivery-chain` 已支持 `workflow-progress-*` stream channel 和对应前端展示，包含 `delegate-review-group` step。
- 普通 chat 已有单会话 chat memory baseline；tool / MCP final answer、Tasklist final answer summary、Delivery final report 现在也可作为安全 final turn 进入 chat history，但它们仍不进入 Agent Runtime、GraphState 或 Delivery runtime artifact 边界。
- `@docs://`、`docs://versions/*.md` 不再作为 public Agent demo 输入。
- `examples/agent-demo/scenarios/`、`rubrics/`、`governance/` 作为 Delivery Chain demo corpus 存在。

当前受控 Agent Runtime 的核心约束：

- 显式 command 触发。
- Runtime 控制流程。
- Resource boundary 先于模型执行。
- GraphState / runtime state 不保存敏感对象。
- 可以使用 LangGraph 表达受控 workflow，但 LangGraph 本身不等于 checkpoint、interrupt、resume 或 HITL。
- Stream protocol 和 frontend reducer 保持兼容。
- Artifact 可以作为展示产物或 run-local 内部交接物，但不得默认升级为持久化协议。

## v0.3.6: Controlled Delivery Chain MVP

目标：

- 新增 public command: `/delivery-chain`。
- 支持 demo scenario 输入。
- 支持 inline requirement 输入。
- 内部使用 LangGraph `StateGraph` 固定执行 `loadDeliveryChainContext -> PlanStage -> TaskStage -> ReviewStage -> BuildReport`。
- 输出非持久化 Delivery Chain Report。
- 继续只读 `@demo://`。

明确不做：

- 不暴露 `/plan`、`/task`、`/review`。
- 不接 PostgresSaver。
- 不做 checkpoint。
- 不做 interrupt。
- 不做真正多 Agent。
- 不实现 `@artifact://`。
- 不做 artifact persistence。
- 不做 nested HITL。
- 不做 chat persistence。

价值：

```text
先把“需求 -> 方案 -> 任务 -> 评审”的交付链路跑起来。
```

## v0.3.7: Delivery Chain Workflow Progress Presentation

目标：

- 为 `/delivery-chain` 新增通用 workflow progress stream channel：

```text
workflow-progress-start
workflow-progress-step
workflow-progress-end
```

- 执行中逐步展示 Delivery Chain workflow steps，而不是一次性展示完整 pending 列表。
- 执行中默认展开，完成并开始输出报告时自动折叠为“已处理 X”摘要。
- 新增通用 Workflow Progress component，但首版只绑定 `/delivery-chain`。
- step detail 只展示安全、可读的过程摘要，不把普通 tool / resource / prompt 事件自动回放成日志面板。
- 优化 Delivery Chain Report 分段展示，并保留 Markdown fallback。
- 保持 `/tasklist` AgentTracePanel、普通 resource / tool / prompt 展示不受影响。

明确不做：

- 不复用 `agent-graph-*` 承载 Delivery Chain process UI。
- 不做 Tasklist Agent 时间线样式。
- 不新增 `@artifact://`。
- 不做 artifact handoff / persistence。
- 不做 checkpoint / interrupt / HITL / resume。
- 不做 DB schema / Prisma / PostgresSaver schema 变更。
- 不实现真正多 Agent。
- 不做 Agent event store 或 LangSmith deep trace UI。

价值：

```text
让用户和 reviewer 在报告生成前就能感知 Delivery Chain 做了什么、正在做什么，并在完成后保持界面整洁。
```

## v0.4.0: Controlled Agent-as-tool Delivery Manager MVP

目标：

v0.4.0 正式引入 `ControlledDeliveryManager`，把 `/delivery-chain` 从固定 stage workflow 推进为受控 Agent-as-tool delegation 雏形。

本版本允许 Manager 通过模型 tool-calling 调用子 Agent tools，但所有 tool call 都必须被代码层 policy 约束。它不是自由 Supervisor，不是全局 Agent Catalog，也不是开放式动态 Agent 调度。

目标架构：

```text
/delivery-chain request
  -> resolveDeliveryChainInvocation
  -> load demo context
  -> ControlledDeliveryManager
       -> controlled tool-calling loop
       -> call plan-subagent tool
       -> receive PlanSubagentToolResult
       -> call task-subagent tool with plan artifact
       -> receive TaskSubagentToolResult
       -> call review-subagent tool with plan + tasks artifacts
       -> receive ReviewSubagentToolResult
       -> synthesize Delivery Chain Report
  -> output final report
```

核心能力：

- 新增只服务 `/delivery-chain` 的 Controlled Manager Runtime。
- 将 Plan / Task / Review 能力封装为受控 Subagent Tools。
- Manager 通过受控 tool-calling loop 调用子 Agent tools。
- Manager 复用统一 tool runtime 的执行核心，但 `delivery-chain-manager` scope 必须静默分流普通 `tool-*` / `resource-*` transcript。
- 模型可以发起 tool call，但代码层必须强制校验 tool 顺序、次数、输入 artifact 和允许列表。
- 子 Agent Tool 返回统一的 `SubagentToolResult`。
- 引入 run-local `RuntimeArtifact`，用于 plan、tasks、review、delivery_report 的内部交接。
- 引入 `SubagentToolDefinition`、`SubagentToolInvocation`、`SubagentToolResult`、`DelegationPolicy` 和 run-local `SubagentToolInvocationTrace`。
- 继续复用 `workflow-progress-*` 展示安全摘要。
- 最终仍输出 Delivery Chain Report，不新增 public route 或持久化 artifact。

固定 Delegation Policy：

```text
allowedSubagentTools: plan-subagent, task-subagent, review-subagent
maxToolCalls: 3
allowParallel: false
allowNestedDelegation: false
requirePlanBeforeTask: true
requireTasksBeforeReview: true
rejectUnregisteredTools: true
rejectOutOfOrderToolCalls: true
```

明确不做：

- 不做无约束 LLM 自主动态路由。
- 不做自由 Supervisor Agent。
- 不做开放式 tool registry。
- 不做全局 Agent Catalog。
- 不允许模型调用未注册 subagent tool。
- 不允许模型改变 `plan -> task -> review` 的固定顺序。
- 不做 Agent group chat。
- 不做 subagent-to-subagent 通信。
- 不做 Agent message bus。
- 不做 nested subagent。
- 不做 parallel subagents。
- 不做 HITL。
- 不做 checkpoint。
- 不做 resume。
- 不做 DB / persistence。
- 不做用户可选 Agent。
- 不新增 `/plan`、`/task`、`/review`。
- 不新增 `@artifact://`。
- 不修改 `@` 菜单。
- 不新增 composer artifact chip。
- 不让 `/delivery-chain` 调用 Tasklist Agent HITL Graph。
- 不把 RuntimeArtifact 写入 frontend `message.artifacts`。
- 不把 RuntimeArtifact 写入 `artifact-*` stream chunks。

价值：

```text
把 Delivery Chain 从“LangGraph 固定 stage workflow”推进到“Controlled Manager -> Subagent Tool -> Subagent Tool Result -> Manager Synthesis”的 Agent-as-tool 架构雏形。
```

## v0.4.1: Parallel Review Subagents + Manager Synthesis

目标：

- Review 阶段从单 `review-subagent` 升级为 3 个并行 review-class subagent（`review-subagent`、`risk-subagent`、`boundary-subagent`）。
- 新增 phase-aware `DelegationPolicy`，只在 Review phase 内部允许并行 tool calls。
- 新增 `ReviewBundle` 和 `synthesizeReviewBundle`，基于规则做综合判断（blocked / conflict / merge）。
- Partial failure 安全处理：1-2 个 failed 继续 synthesis，3 个全 failed fail closed。
- 保持 v0.4.0 的所有边界。

明确不做：

- 不修改全局 `allowParallel`。
- 不新增 public command。
- 不修改 stream chunk schema 或 frontend reducer shape。
- 不新增 RuntimeArtifact kind。
- 不实现 LLM 润色（预留降级路径）。

价值：

```text
把 Review 阶段从"单 subagent 串行"推进到"多维度并行评审 + 规则综合判断"，为后续多 Agent 协作奠定基础。
```

## v0.4.11: Structured Supervisor Review Loop (Implemented)

目标：

- 将 `/delivery-chain` 的 Runtime 主链收敛为结构化 Supervisor、Plan、Tasks、固定三角色 Review Group 和至多一次返修。
- 保持业务判断使用用户选择的模型；将每个严格 Contract 和唯一 repair 固定到 `deepseek/deepseek-v4-pro`。
- 将 dispatch plan、artifact revision、review coverage、finding lineage 和 canonical RunStatus 保持为 Runtime-owned typed data；Markdown 仅用于展示。
- 使用既有 `workflow-progress-*` 展示 Supervisor、首次 Review、返修和报告，不扩展 public stream 协议；返修后不执行 Re-review。

明确不做：

- 不恢复 Manager tool-calling fallback、Markdown 业务解析或开放 metadata 驱动的状态合成。
- 不新增 GraphState、持久化 artifact、checkpoint/resume、开放 Agent Catalog 或用户可选 Agent。
- 不让 `/delivery-chain` 调用 Tasklist Graph Runtime，也不改变 `/tasklist` 的 Graph/HITL 边界。

实现摘要：

- 58 个实现任务完成（T001–T058），覆盖 Contract、Supervisor、Plan/Tasks、Review Group、返修和报告。
- 确定性测试：130 文件 / 908 测试通过，含 Contract、policy、Review Group、status matrix、loop 和 evaluation harness。
- 新增 ADR-0013，详见 `docs/adr/0013-structured-supervisor-review-loop.md`。
- Demo 案例替换为 `register-login`、`guangzhou-3-day-trip`、`frontend-learning-plan`。

## Future Direction

v0.4.3 已作为 Tool & Agent Final Turn Memory 发布，但不改变 Agent Runtime 的后续方向。后续 Agent 方向仍需要等 v0.4.1-v0.4.3 的真实实现、测试和架构复盘收口后再决定。

候选方向包括：

- Session artifact handoff。
- Agent Catalog and Runtime Contract。
- 可注册 / 可发现的通用 Agent-as-tool Catalog。
- 更开放的 LLM dynamic routing。
- HITL-aware Subagent Delegation。
- Chat persistence foundation。

这些方向当前都不是 v0.4.3 的实现范围。

## Guardrails

- Roadmap 不是当前版本任务清单。
- v0.4.1-v0.4.3 的 Manager 仍是 Controlled Manager Runtime，不是自由 Supervisor Agent。
- v0.4.1-v0.4.3 的 Subagent Tool 是只对 ControlledDeliveryManager 暴露的受控 model tool，不是用户可选 tool，也不是全局 Agent Catalog entry。
- v0.4.1-v0.4.3 允许受控 tool-calling，但每次 tool call 都必须经过 DelegationPolicy 校验；未注册、乱序、超次数或缺少必要 artifact 的 tool call 必须 fail closed。Review phase 内部允许 3 个 review-class tool 并行，但 Plan/Task 阶段保持串行。
- v0.4.1-v0.4.3 可以复用统一 `executeToolCall()` 执行核心，但 `delivery-chain-manager` scope 不得向用户流出普通 `tool-*` / `resource-*` transcript。
- v0.4.1-v0.4.3 允许在 `/delivery-chain` 内部引入 run-local RuntimeArtifact，但不得引入 `@artifact://`、artifact persistence 或 DB schema。
- v0.4.3 的 chat memory 可以保存用户可见 final text，但不得保存 Tasklist GraphState、HITL checkpoint、Tasklist artifact markdown、Delivery RuntimeArtifact、workflow progress 或 subagent raw invocation/result。
- v0.4.1-v0.4.3 不得修改 `/tasklist` 路由、Tasklist Agent Graph topology、HITL decision contract、checkpoint / resume contract 或 AgentRun 持久化边界。
- v0.4.1-v0.4.3 不得让 Delivery Chain 子 Agent 调用 Tasklist Agent HITL Graph。
- v0.4.1-v0.4.3 继续复用 `workflow-progress-*`，不得把 progress panel 扩展成 raw prompt / raw response / stack / provider config transcript。
- 除非正式 spec 明确允许，不得修改 stream protocol、frontend reducer、Prisma schema 或 PostgresSaver schema。
- 后续版本编号必须等对应 spec / ADR / acceptance 明确后再写入 roadmap。
