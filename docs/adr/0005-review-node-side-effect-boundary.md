# ADR-0005：Review Node Side-effect Boundary

状态：Accepted
日期：2026-06-27

## 背景

LangGraph interrupt resume 会从触发 interrupt 的 node 起点重新执行。任何发生在 `interrupt(payload)` 之前的不可逆副作用，都可能重复执行或留下半完成状态。

Tasklist Agent v0.3.0 引入了 Strategy Review 和 Tasklist Revision Review nodes。

## 决策

LangGraph interrupt review node 必须无副作用。

review node 可以构建 JSON-serializable payload、调用 `interrupt(payload)`、解析 resume decision，并返回 GraphState patch。它不得调用模型、工具、资源、Prisma、writer 或文件系统。

## 影响

- AgentInterrupt 持久化由 review node 外部处理。
- review payload 必须是 strict public DTO。
- review node 更容易测试，也更适合 resume。
- 未来新增 review node 时，必须测试它不会调用 model / tool / resource / database / writer。

## 备选方案

在 review node 内持久化 AgentInterrupt。这个方案被放弃，因为 node 可能在 resume 时重新进入。

在 interrupt 前发送 stream chunk。这个方案被放弃，因为 chunk 可能重复或和 runner/coordinator 的 stream 行为冲突。

## 后续事项

未来 HITL 点必须复用这个边界，除非新增 ADR 明确改变 LangGraph interrupt 语义。
