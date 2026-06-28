# Acceptance 024：v0.2.4 Baseline

状态：Released Baseline
版本：v0.2.4
归档日期：2026-06-28

## 单状态模型验收

- GraphState 成为 Tasklist Agent 生产路径唯一内部运行态事实源
- graph nodes 直接读取 GraphState 分区
- graph nodes 返回 GraphState patch
- reducer 负责分区 patch 合并

## 旧适配层退场验收

- 生产路径不再依赖 `toVersionPlanTasklistAgentState()`
- 生产路径不再依赖 `createGraphStateUpdateFromAgentState()`
- 旧 `VersionPlanTasklistAgentState` 不再主导 graph 运行时

## 路由与行为验收

- routes 继续基于显式业务字段判断
- tasklist 业务行为不因状态模型收口而回归
- `/tasklist` 用户体验、artifact 结果与 trace 消费保持稳定

## 外部兼容验收

- `artifact-start` / `artifact-delta` / `artifact-end` 保持兼容
- graph node / route / patch events 保持兼容
- Graph Debug Summary 保持兼容
- `AgentTracePanel` 消费结构保持兼容

## 安全边界验收

- 不输出 raw GraphState
- 不输出 raw checkpoint
- 不输出 prompt、API Key、session cookie、provider config
- 不输出资源原文、tasklist draft 正文或 raw error

## 历史验证记录

根据当时版本资料，关键验证包括：

- `pnpm --dir apps/webapp test`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `pnpm --filter @ai-mind/stream-core test`
- `pnpm --filter @ai-mind/stream-core typecheck`
- `git diff --check`

其中 lint 保留既有 Fast Refresh warning，不构成本版 blocker。
