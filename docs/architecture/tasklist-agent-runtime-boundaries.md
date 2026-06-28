# Tasklist Agent Runtime Boundaries

## 摘要

Tasklist Agent 是 AI Mind 的第一个受控 Agent。v0.3.0 后，它的稳定边界是：

```text
/tasklist + @docs://versions/*.md
  -> LangGraph StateGraph
  -> GraphState runtime source of truth
  -> AgentRun business state
  -> PostgresSaver checkpoint state
  -> strict public stream / API DTO
```

这条链路不代表 AI Mind 进入通用 Agent 平台阶段。它仍然是受控、窄入口、可观察、可恢复的 Tasklist Agent。

## Entry Boundary

Tasklist Agent 只在以下入口启动：

```text
/tasklist + @docs://versions/*.md
```

它不会：

- 自动扫描 docs。
- 自动写入文件。
- 自由调用工具。
- 接管普通聊天。
- 接管 reader-skill / utility-skill。
- 接管 MCP Tool / Resource / Prompt。

## Graph Runtime Boundary

Tasklist Agent 固定走 LangGraph `StateGraph`。

当前关键路径：

- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/create-version-plan-tasklist-graph.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/nodes/`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/`

Graph runtime 只替换编排层，不扩大 Agent 权限。

## GraphState Boundary

GraphState 是 Tasklist Agent 内部运行态事实源。

GraphState 允许保存：

- 用户输入摘要和受控引用。
- version plan 读取结果。
- planning decision。
- TasklistStrategy。
- tasklist draft versions。
- validation result。
- warning disposition。
- revision effect。
- final output summary。
- graph runtime event summary。

GraphState 不允许保存：

- Prisma client。
- pg pool。
- HTTP request。
- AbortSignal。
- stream writer。
- raw Error。
- raw checkpoint。
- API Key。
- session cookie。
- AgentRun 数据库整行。
- AgentInterrupt 数据库整行。

## Review Node Boundary

LangGraph interrupt review node 必须无副作用。

允许：

- 构建 JSON-serializable interrupt payload。
- 调用 `interrupt(payload)`。
- 解析 resume decision。
- 返回 GraphState patch。

禁止：

- 调用模型。
- 调用工具。
- 读取资源。
- 写数据库。
- 写 stream。
- 读写文件系统。
- 发送网络请求。

原因：LangGraph interrupt resume 会从 node 起点重新执行。interrupt 前产生不可重复副作用会导致重复写入、重复输出或状态不一致。

## Business State Boundary

`AgentRun` / `AgentInterrupt` 是 Webapp 拥有的业务状态。

关键路径：

- `apps/webapp/lib/ai/agent-runs/agent-run-service.ts`
- `apps/webapp/lib/ai/agent-runs/agent-run-repository.ts`
- `packages/database/prisma/schema.prisma`

职责：

- session ownership。
- run status。
- result status。
- pending interrupt。
- resume decision validation。
- duplicate resume protection。
- version mismatch protection。

Graph node 不直接写 `AgentRun` 或 `AgentInterrupt`。

## Checkpoint Boundary

PostgresSaver 拥有 LangGraph checkpoint state。

关键路径：

- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider.ts`

职责：

- 为 graph invoke 提供 durable checkpointer。
- 使用同一 `threadId` 支持跨 HTTP 请求 resume。
- 管理 checkpoint tables。

不负责：

- 业务 run 查询。
- session ownership。
- API DTO。
- frontend pending state。
- Run History。

## Stream / Public DTO Boundary

Tasklist Agent 只能通过严格 public DTO 暴露状态。

允许暴露：

- 受控 `agent-step`。
- 受控 graph event summary。
- 受控 patch summary。
- `agent-interrupt` payload。
- `agent-resume` 指示。
- final artifact。
- final text summary。

禁止暴露：

- raw GraphState。
- raw checkpoint。
- raw provider error。
- raw Prisma error。
- API Key。
- 原始 session cookie。
- provider config。
- internal prompt。
- sensitive env。

## Change Rule

修改以下内容至少是 Level C：

- Tasklist Agent entry。
- GraphState。
- review node。
- AgentRun state。
- AgentInterrupt payload。
- CheckpointerProvider。
- stream chunk。
- resume semantics。

如果改动长期影响架构边界，则是 Level D，必须新增或更新 ADR。
