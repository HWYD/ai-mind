# Decisions 024：v0.2.4 Baseline

状态：Released Baseline
版本：v0.2.4
归档日期：2026-06-28

## 核心决策

### 1. GraphState 成为唯一内部运行态事实源

这是本版最核心的收口。后续 Tasklist Agent 的运行时事实应直接驻留在 GraphState，而不是经由旧整包 AgentState 来回适配。

### 2. 节点只返回 patch，不返回整包状态

这样能降低节点之间互相覆盖状态、手工回填遗漏和状态漂移风险。

### 3. reducer 承担状态合并责任

状态合并逻辑集中到 reducer，有利于减少 node 自己拼装完整状态的隐性复杂度。

### 4. 路由必须依据显式业务字段

Graph route 不能退化成“看流程走到哪了”的隐式游标逻辑，必须基于可解释的业务状态判断。

### 5. 不把未来字段提前塞进 GraphState

本版明确不提前加入 `human`、`pendingReview`、`stateVersion`、resume 相关状态等未来能力字段，避免把后续版本边界提前污染到当前模型。

### 6. 对外协议保持稳定，内部先完成状态收口

本版优先处理内部事实源一致性，不借机改 artifact、stream 协议或用户可见交互。

## 后续影响

`v0.2.4` 之后，后续版本可以在更稳定的内部状态边界上继续推进：

- durable checkpoint
- HITL review node
- resume 语义
- AgentRun / AgentInterrupt 业务状态

这也是 ADR-0001 在仓库中的历史落点。
