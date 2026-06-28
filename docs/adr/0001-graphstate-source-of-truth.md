# ADR-0001：GraphState Source of Truth

状态：Accepted
日期：2026-06-27

## 背景

Tasklist Agent 最初从受控 runner 起步，后来迁移到 LangGraph。迁移阶段中，旧 AgentState adapter 降低了风险，但也让同一条运行路径同时存在两套状态模型。

v0.2.4 已完成 GraphState 单状态模型收口：生产 graph nodes 直接读取 GraphState 分区，并返回 GraphState patch。

## 决策

Tasklist Agent 内部运行态以 GraphState 作为事实源。

后续版本不得重新引入旧 AgentState adapter、双状态模型或隐藏的全局运行态。

## 影响

- Graph route 应基于显式 GraphState 字段判断。
- Graph node 应返回局部 GraphState patch，而不是重建整包状态对象。
- 测试应直接构造和断言 GraphState。
- GraphState 必须保持 JSON-serializable，且不包含运行时对象。

## 备选方案

保留 domain AgentState 并长期包在 GraphState 里。这个方案被放弃，因为它会保留重复状态语义，让 HITL / checkpoint 后续演进更难。

把业务数据库整行放进 GraphState。这个方案被放弃，因为业务持久化和 graph runtime state 生命周期不同。

## 后续事项

未来修改 GraphState 时，必须具备完整 spec / plan / tasks，并同步 GraphState tests、route tests、debug summary review 和安全边界 review。
