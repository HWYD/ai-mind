# Context

## Product Context

- tracing 是可选观测层
- 主流程优先级高于可观测性

## Module Map

- observer factory
- Tasklist Agent run coordinator
- runtime logging

## Interface Contracts

- 不修改 AgentRun schema
- 不修改 HITL contract

## Constraints

- 只允许 soft fail
- 失败信息要脱敏

## Acceptance Criteria

- tracing 关闭时主流程正常
- tracing 初始化失败时主流程正常
- 仅记录 warning，不中断 agent run
