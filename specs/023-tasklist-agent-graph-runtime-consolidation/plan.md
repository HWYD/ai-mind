# Plan 023：v0.2.3 Released Graph-only Architecture

状态：Released Baseline
版本：v0.2.3
归档日期：2026-06-28

## 目的

记录 `v0.2.3` 已落地的 graph-only runtime 架构，用于明确 “何时彻底告别 legacy 路径”。

## Tasklist Agent 入口链路

`v0.2.3` 发布后，当时的链路可抽象为：

```text
POST /api/chat
  -> chat route / chat-service / ChatOrchestrator
  -> 识别 /tasklist + @docs://versions/*.md
  -> 直接进入 runVersionPlanTasklistGraph()
  -> GraphState 驱动 nodes / routes
  -> graph events / artifact 输出
  -> HTTP stream 完成
```

与 `v0.2.0` 相比，关键变化是：

- 不再先读 runtime selector 决定 legacy / graph
- 不再保留执行期 fallback 概念
- Tasklist Agent 的生产路径只有一条：Graph Runtime

## GraphState 结构

根据当时版本资产，GraphState 已按分区组织为：

- `input`
- `source`
- `planning`
- `tasklist`
- `execution`
- `output`
- `graph`

计划层面的核心约束：

- state 按分区管理，便于 node patch 和 route 判断
- graph routes 依赖显式业务字段
- 对外不暴露完整 GraphState

## 迁移收口点

`v0.2.3` 的架构收口主要落在以下几类动作：

1. 入口收口  
   `ChatOrchestrator` tasklist 分支固定进入 graph 执行入口。

2. 运行时配置收口  
   `AI_MIND_TASKLIST_AGENT_RUNTIME` 不再决定执行路径，只保留为历史兼容背景。

3. 死代码清理  
   legacy runner、legacy wrapper、fallback 路径与对应测试从生产基线中移除。

4. 测试策略收口  
   从 legacy / graph parity，收口到 graph-only regression。

## 对外兼容边界

本版虽然进行了内部收口，但对外仍要求保持：

- `/tasklist` 行为不变
- artifact 格式不变
- graph trace 与 debug summary 展示不回归
- 普通聊天与其他能力不受影响

## 关联资料

- `docs/versions/v0.2.3-tasklist-agent-graph-runtime-consolidation.md`
- `docs/releases/v0.2.3.md`
- `docs/tasklists/v0.2.3-tasklist.md`
- `private-folder/plans/plan-2026-06-16-v0.2.3-tasklist-agent-graph-runtime-consolidation.md`
- `private-folder/tasklists/plan-2026-06-16-v0.2.3-tasklist-agent-graph-runtime-consolidation-tasklist.md`
- `docs/architecture/tasklist-agent-runtime-boundaries.md`
