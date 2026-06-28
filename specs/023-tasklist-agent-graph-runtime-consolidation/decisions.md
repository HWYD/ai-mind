# Decisions 023：v0.2.3 Baseline

状态：Released Baseline
版本：v0.2.3
归档日期：2026-06-28

## 核心决策

### 1. Tasklist Agent 正式取消 legacy / graph 双路线

从本版开始，Tasklist Agent 的生产路径只有 Graph Runtime。一旦 graph 已稳定，就不再保留“也许还会回 legacy”的产品语义。

### 2. `AI_MIND_TASKLIST_AGENT_RUNTIME` 退出执行决策

该变量最多保留历史背景含义，不再参与运行态选择。

### 3. 对外兼容优先，内部先收口执行链

本版重构重心在内部架构，而不是改用户可见行为。artifact、trace、debug summary 和 `/tasklist` 入口都保持稳定。

### 4. GraphState 先成为 graph-first 运行态，再推进单事实源

`v0.2.3` 解决的是 “执行链到底走哪条” 的问题。  
完整移除旧 AgentState 适配层、把 GraphState 收口为单事实源，留给 `v0.2.4` 完成。

### 5. 先清 dead code，再谈更复杂能力

如果 legacy 路径和 selector 不先退场，后续 durable checkpoint、HITL、resume 的复杂度会被双路线放大。

## 后续影响

`v0.2.3` 是后续两个版本的重要前置：

- `v0.2.4`：单状态模型收口
- `v0.3.0`：HITL + checkpoint resume
