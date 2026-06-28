# 任务 024：v0.2.4 Completed Baseline

状态：Completed Baseline
版本：v0.2.4
归档日期：2026-06-28

## P0 冻结 graph-only baseline

- [x] 明确本版建立在 `v0.2.3` graph-only runtime 之上
- [x] 明确保持 `/tasklist`、artifact、trace、debug summary 外部兼容
- [x] 明确本版不是 HITL / resume / persistence 版本

## P1 审计旧 AgentState 依赖

- [x] 盘点生产 graph nodes 中对旧整包 AgentState adapter 的依赖
- [x] 识别需要直接转为 GraphState 分区输入输出的节点
- [x] 识别旧 apply / validate 状态机 API 在主路径中的残留位置

## P2 GraphState 分区直连

- [x] 让 graph nodes 直接消费 GraphState 分区
- [x] 让 graph nodes 直接返回 GraphState patch
- [x] 让 reducer 统一合并分区 patch
- [x] 减少节点手工回填完整状态的风险

## P3 移除旧适配层

- [x] 移除 `toVersionPlanTasklistAgentState()` 的生产主路径依赖
- [x] 移除 `createGraphStateUpdateFromAgentState()` 的生产主路径依赖
- [x] 缩减或移除旧 `VersionPlanTasklistAgentState` 在生产路径中的角色
- [x] 清理围绕旧适配层的相关测试与死代码

## P4 路由、测试与文档收口

- [x] 让 routes 持续基于显式业务字段判断
- [x] 保持 stream / debug / artifact 对外兼容
- [x] 执行 webapp 与 stream-core 相关验证
- [x] 更新 v0.2.4 版本文档、release 和 tasklist 资产
- [x] 为后续 durable checkpoint / HITL 演进打下单状态模型基础

## 基线结论

`v0.2.4` 是 GraphState 单事实源真正成立的版本，也是后续 `v0.3.0` 能继续做 checkpoint + HITL + resume 的关键前置。
