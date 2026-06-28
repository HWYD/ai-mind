# Plan 024：v0.2.4 Released Single-state Runtime Architecture

状态：Released Baseline
版本：v0.2.4
归档日期：2026-06-28

## 目的

记录 `v0.2.4` 已经收口完成的单状态模型架构，明确 GraphState 何时成为 Tasklist Agent 的唯一内部运行态事实源。

## 入口链路

`v0.2.4` 当时的主链路可概括为：

```text
POST /api/chat
  -> chat route / chat-service / ChatOrchestrator
  -> 识别 /tasklist + @docs://versions/*.md
  -> runVersionPlanTasklistGraph()
  -> createInitialVersionPlanTasklistGraphState()
  -> LangGraph StateGraph
  -> graph nodes 直接读写 GraphState partitions
  -> graph events / artifact 输出
  -> HTTP stream 完成
```

## 单状态模型

与 `v0.2.3` 相比，本版的关键变化是：

```text
旧路径：
GraphState -> AgentState -> domain step -> AgentState -> GraphState patch

新路径：
GraphState -> domain operation -> GraphState patch
```

这意味着：

- 节点不再通过整包 AgentState adapter 绕一圈
- 节点只处理自己负责的分区输入输出
- reducer 统一合并 patch

## 状态分区与责任

GraphState 分区职责在本版已经明确化：

- `input`：请求级输入与用户显式给定引用
- `source`：版本方案、可选上下文读取结果
- `planning`：readiness、decision、strategy 等规划阶段事实
- `tasklist`：draft、validation、warning disposition、revision effect 等 tasklist 事实
- `execution`：步数、修订计数等执行计数器
- `output`：最终 artifact 相关输出
- `graph`：node / route / patch summary 等 graph 轨迹
- `threadId`：graph execution 关联线程

## 路由与 reducer 边界

本版的架构约束包括：

- routes 基于显式 GraphState 字段，而不是隐式游标
- node 返回 patch，而不是手工构造完整下一状态
- reducer 负责安全合并分区 patch
- 对外仍只输出脱敏 debug summary

## 清理目标

`v0.2.4` 的清理目标集中在生产主路径：

- 移除 `toVersionPlanTasklistAgentState()`
- 移除 `createGraphStateUpdateFromAgentState()`
- 移除旧 `VersionPlanTasklistAgentState` 在生产 graph path 的核心依赖
- 收窄旧 apply / validate 状态机 API 在主链中的角色

## 关联资料

- `docs/versions/v0.2.4-tasklist-agent-graph-single-state-model.md`
- `docs/releases/v0.2.4.md`
- `docs/tasklists/v0.2.4-tasklist.md`
- `private-folder/plans/plan-2026-06-17-v0.2.4-tasklist-agent-graph-single-state-model.md`
- `private-folder/tasklists/plan-2026-06-17-v0.2.4-tasklist-agent-graph-single-state-model-tasklist.md`
- `docs/adr/0001-graphstate-source-of-truth.md`
- `docs/architecture/tasklist-agent-runtime-boundaries.md`
