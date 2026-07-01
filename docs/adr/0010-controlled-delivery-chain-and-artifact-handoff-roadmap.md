# ADR-0010: Controlled Delivery Chain to Agent-as-tool Roadmap

状态: Accepted
日期: 2026-07-01

## 背景

v0.3.6 已经把 `/delivery-chain` 收口为受控 Delivery Chain MVP：用户显式触发 `/delivery-chain`，系统读取受限的 `@demo://` 资源或 inline requirement，并按固定顺序生成 Plan / Task / Review / Delivery Chain Report。

v0.3.7 在此基础上新增 `workflow-progress-*`，让 `/delivery-chain` 的执行过程可见，但仍然不做 artifact persistence、HITL、checkpoint、resume 或真正多 Agent。

下一步 v0.4.0 的目标不再是 session artifact handoff，而是证明 AI Mind 可以从“受控 Graph Agent / 固定 stage workflow”推进到“受控 Agent-as-tool Manager”。这意味着 Manager 可以通过模型 tool-calling 调用子 Agent tools，但所有 tool call 都必须受代码层 policy 约束。

本 ADR 取代旧路线中“先做 session artifact handoff、后续再做 controlled multi-agent orchestration”的预排顺序；后续版本暂不提前编号。

## 决策

v0.4.0 定义为：

```text
Controlled Agent-as-tool Delivery Manager MVP
```

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

v0.4.0 允许：

- `ControlledDeliveryManager` 通过模型 tool-calling 调用受控 subagent tools。
- 新增 `plan-subagent tool`、`task-subagent tool`、`review-subagent tool`。
- 复用统一 tool runtime 的执行核心，但 `delivery-chain-manager` scope 必须静默分流普通 `tool-*` / `resource-*` transcript。
- 新增 run-local `RuntimeArtifact`，用于 plan、tasks、review、delivery_report 的内部交接。
- 新增 `SubagentToolDefinition`、`SubagentToolInvocation`、`SubagentToolResult`、`SubagentToolInvocationTrace` 和 `DelegationPolicy`。
- 继续复用 `workflow-progress-*` 展示安全摘要。

v0.4.0 的固定 policy：

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

v0.4.0 明确不做：

- 不做自由 Supervisor Agent。
- 不做开放式 tool registry。
- 不做全局 Agent Catalog。
- 不做用户可选 subagent picker。
- 不做 Agent group chat。
- 不做 subagent-to-subagent 通信。
- 不做 Agent message bus。
- 不做 nested subagent。
- 不做 parallel subagents。
- 不做 HITL。
- 不做 checkpoint。
- 不做 resume。
- 不做 DB / persistence。
- 不新增 `/plan`、`/task`、`/review`。
- 不新增 `@artifact://`。
- 不修改 `@` 菜单。
- 不新增 composer artifact chip。
- 不让 `/delivery-chain` 调用 Tasklist Agent HITL Graph。
- 不把 RuntimeArtifact 写入 frontend `message.artifacts`。
- 不把 RuntimeArtifact 写入 `artifact-*` stream chunks。

## 影响

正向影响：

- `/delivery-chain` 从固定 LangGraph stage workflow 演进为受控 Agent-as-tool Manager，展示 AI Mind 的下一阶段 Agent Runtime 能力。
- Manager 仍然是受控 runtime，不是自由 Supervisor。
- 子 Agent tool 有明确输入、输出、non-goal 和 artifact boundary。
- RuntimeArtifact 只在单次 run 内交接，不提前引入 `@artifact://` 或持久化。
- workflow progress 可以继续作为安全摘要通道，不需要新增 trace UI。
- Tasklist Agent 的 HITL / checkpoint / resume / AgentRun 边界保持隔离。

代价：

- v0.4.0 复杂度高于代码级 runner 方案，因为需要处理模型 tool call、tool schema、非法调用、乱序调用和 tool result 安全摘要。
- 测试必须覆盖非法 tool call、缺 artifact、超次数、未注册 tool 和 failed tool result。
- 不能再把 v0.4.0 描述为普通 stage rename 或纯代码串行调用，否则会和 Agent-as-tool 目标不一致。

## 备选方案

继续做 Session Artifact Handoff：

- 优点是范围较小，可以先解决跨步骤产物引用。
- 缺点是无法证明 Manager 调用子 Agent tool 的架构能力，也和当前 v0.4.0 新目标不一致。

做代码级 Subagent Runner：

- 优点是更稳、更容易测试。
- 缺点是不是真正 Agent-as-tool；模型没有发起 tool_call，展示价值不足。

做全局 Agent Catalog：

- 优点是更接近长期平台化。
- 缺点是过早抽象，会把 Tasklist Agent、Delivery Chain、tool runtime、artifact contract、权限和持久化混在一版里，明显超过 v0.4.0。

直接接入 Tasklist Agent HITL Graph：

- 优点是复用现有 Tasklist Agent 能力。
- 缺点是引入 nested interrupt / resume / checkpoint 合并问题，违反 v0.4.0 不做 HITL / checkpoint / resume 的边界。

## 后续事项

- 新增 v0.4.0 spec，正式记录 Controlled Agent-as-tool Delivery Manager MVP 的目标、非目标、contract 和验收边界。
- 同步 `docs/architecture/agent-runtime-roadmap.md`。
- 同步 `specs/036` 和 `specs/037` 中的 Future Roadmap Guardrail，避免继续引用旧的 v0.4.0 artifact handoff 路线。
- 实现前先确认现有 model provider / tool-runtime 是否可复用受控 tool-calling loop 与 scope-aware transcript suppression；如需新增差异逻辑，只能限定在 `/delivery-chain` runtime 内部。
- v0.4.0 实现不得修改 `/tasklist` 路由、Tasklist Agent Graph topology、HITL decision contract、checkpoint / resume contract 或 AgentRun 持久化边界。
