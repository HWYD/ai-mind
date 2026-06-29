# AI Mind v0.3.0: HITL Checkpoint Resume

## Summary

本版为受控 Agent 引入 Human-in-the-loop 审核、durable checkpoint 和 resume。

## Goals

- Strategy Review 必停
- 修订前审核只在确有必要时出现
- durable checkpoint 支持同一 thread resume
- resume 后继续写回原 assistant message

## Key Changes

- 新增 AgentRun / AgentInterrupt 业务状态
- 新增 Strategy Review 和 Tasklist Revision Review
- 引入 Postgres checkpointer
- 新增 interrupt / resume 生命周期

## Interface Changes

- 新增 `AgentRun` / `AgentInterrupt` 持久化记录，明确区分业务运行状态与 checkpoint 技术状态
- 新增 `POST /api/agent-runs/:runId/resume` resume 入口，用于消费审核决策并恢复同一 thread 的受控执行
- stream 增加 `agent-interrupt` / `agent-resume` chunk，前端消息状态支持 paused / resuming，并继续写回原 assistant message

## Non-goals

- 不做通用审批系统
- 不做刷新后自动恢复待审卡片
- 不做多人审批
- 不做任意节点 time travel

## Test Plan

- 验证 Strategy Review 必停，且 `respond` 最多只允许触发一次 strategy regenerate
- 验证只有在 `fixNow.length > 0` 时才进入 Tasklist Revision Review，修订预算最多推进到 `v3`
- 验证 resume 后继续写回原 assistant message，同一 interrupt 不能被重复消费

## Acceptance Notes

- HITL 只作用于受控 Agent
- Graph topology 与主聊天链路保持稳定
- 最多两轮受控修订，避免无限循环
