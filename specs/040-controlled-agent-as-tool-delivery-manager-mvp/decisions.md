# Decisions 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Planning
版本: v0.4.0
日期: 2026-07-01

## D040-001: 版本名

Decision:

- 使用 `Controlled Agent-as-tool Delivery Manager MVP`。

Reason:

- 用户明确要求 Agent-as-tool。
- 该名称比 `Manager-Subagent Runner` 更能表达 tool-calling 架构，但仍保留 Controlled 边界。

## D040-002: Manager 命名

Decision:

- Runtime 类型使用 `ControlledDeliveryManager`。
- 文档中强调它是 controlled runtime，不是自由 Supervisor。

Reason:

- 名称保留 Manager 的主控含义，同时用 Controlled 限定权限。

## D040-003: 子 Agent 形态

Decision:

- 子 Agent 叫 `plan-subagent tool`、`task-subagent tool`、`review-subagent tool`。
- 不叫 runner。

Reason:

- 用户已拍板“我要的是 tool，也就是 Agent-as-tool”。

## D040-004: Tool result 格式

Decision:

- Tool result 使用强 JSON Schema。
- Schema-first，Zod validation，TypeScript type 从 schema 推导。

Reason:

- 用户已拍板强 JSON Schema。
- 当前项目已有 Zod tool schema 模式。

## D040-005: 模型不支持 tool-calling

Decision:

- fail closed。
- 不降级成普通 runner。

Reason:

- v0.4.0 的展示价值在 Agent-as-tool；fallback 会让架构目标失真。

## D040-006: 非法 tool call

Decision:

- fail closed。
- 不做纠错 loop。

Reason:

- MVP 需要简单、可测、受控。
- 二次纠错会模糊 policy 和 LLM 自主修正边界。

## D040-007: 旧 DeliveryChainGraph

Decision:

- 不保留为 `/delivery-chain` 主路径。
- 实现阶段可参考现有 prompt/report/resource helper，但主执行由 Manager 接管。

Reason:

- 否则形成 graph 和 manager 双主控。

## D040-008: RuntimeArtifact 作用域

Decision:

- 放在 `apps/webapp/lib/ai/runtime/delivery-chain/manager/` 内部。
- 不抽成全局 Agent Catalog 或 artifact system。

Reason:

- 当前没有 `@artifact://`、DB persistence、artifact chip 或全局 Agent registry。
- 过早全局化会扩大架构和产品 surface。

## D040-009: Tool 系统复用边界

Decision:

- 复用 `ChatToolDefinition` / Zod schema / structured tool 设计。
- 统一 tool registry 只新增 `ToolRuntimeScope` 一个过滤维度，不新增 `ToolVisibility`。
- `skill-binding` scope 供普通 Skill / chat tool binding 使用。
- `delivery-chain-manager` scope 供 delivery-chain 内部 subagent tools 使用。
- 不把子 Agent tools 暴露到普通用户工具列表或 capability catalog。
- 复用 `executeToolCall()` 执行核心，但必须按 `runtimeScope='delivery-chain-manager'` 静默分流普通 tool/resource transcript。

Reason:

- 既保持项目一致性，又不污染 UI 和 public tool surface。
- 当前真实需求是运行时过滤，不是独立的显示可见性治理；只加 `ToolRuntimeScope` 更符合最小抽象原则。

## D040-010: 测试策略

Decision:

- 使用 fake tool-call model 主测 Manager。
- 不要求真实 provider e2e 作为验收硬门槛。

Reason:

- 真实 provider tool-calling 输出不稳定，contract tests 应确定性。
