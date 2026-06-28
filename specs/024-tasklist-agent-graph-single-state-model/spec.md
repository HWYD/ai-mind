# Spec 024：Tasklist Agent Graph Single State Model Baseline

状态：Released Baseline
版本：v0.2.4
归档日期：2026-06-28

## 摘要

本目录沉淀 `v0.2.4` 已发布的单状态模型基线。

`v0.2.4` 建立在 `v0.2.3` graph-only runtime 之上，继续完成一件更关键的事情：把 Tasklist Agent 内部运行态正式收口为 GraphState 单事实源，移除生产 graph nodes 对旧整包 AgentState adapter 的依赖。

## 适用范围

`v0.2.4` 的单状态模型收口只作用于：

```text
/tasklist + @docs://versions/*.md
```

它不向用户新增新的 Agent 能力，不改变外部入口，也不把 HITL、resume 或数据库持久化提前引入。

## 已发布用户行为

- 用户侧 `/tasklist` 入口、tasklist artifact 和 graph trace 使用方式保持不变。
- 对用户来说，这是一次“看起来变化不大”的架构巩固版本。
- 不新增 HITL、resume、Run History、数据库可见 run 状态等功能。

## 已发布系统行为

- Tasklist Agent 继续固定走 Graph Runtime。
- GraphState 成为生产路径唯一内部运行态事实源。
- graph nodes 直接读取 GraphState 分区，并返回 GraphState patch。
- 生产路径移除 `toVersionPlanTasklistAgentState()` 与 `createGraphStateUpdateFromAgentState()` 等整包状态适配流。
- 旧 `VersionPlanTasklistAgentState` 类型与旧 apply / validate 状态机 API 退出生产主路径。
- GraphState reducer 负责按分区合并 patch，减少节点手工回填完整状态的风险。
- graph route 继续基于显式业务字段判断。

## GraphState 边界

根据当时版本资料，GraphState 分区包括：

- `input`
- `source`
- `planning`
- `tasklist`
- `execution`
- `output`
- `graph`
- `threadId`

同时明确禁止在 GraphState 中保存：

- Prisma client
- pg pool
- request
- AbortSignal
- writer
- raw Error
- raw checkpoint
- API Key
- session cookie
- 业务数据库整行记录

## 外部兼容性

`v0.2.4` 继续保持：

- `/tasklist` 入口稳定
- tasklist markdown artifact 稳定
- graph node / route / state patch events 稳定
- Graph Debug Summary 稳定
- `AgentTracePanel` 消费结构稳定

## 非目标

`v0.2.4` 明确不实现：

- HITL
- `interrupt()`
- Resume API
- Run History
- AgentRun 数据库持久化
- durable checkpoint
- 新 Agent 类型
- 自由 tool calling
- tasklist artifact 格式改造
- stream-core 外部协议变更

## 历史资料来源

本 baseline 主要提炼自以下真实仓库资料：

- `docs/versions/v0.2.4-tasklist-agent-graph-single-state-model.md`
- `docs/releases/v0.2.4.md`
- `docs/tasklists/v0.2.4-tasklist.md`
- `private-folder/plans/plan-2026-06-17-v0.2.4-tasklist-agent-graph-single-state-model.md`
- `private-folder/tasklists/plan-2026-06-17-v0.2.4-tasklist-agent-graph-single-state-model-tasklist.md`
- `docs/adr/0001-graphstate-source-of-truth.md`
