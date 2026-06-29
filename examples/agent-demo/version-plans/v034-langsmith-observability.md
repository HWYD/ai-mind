# AI Mind v0.3.4: LangSmith Observability

## Summary

本版在不改变 Tasklist Agent 主流程的前提下，为受控 Agent 链路增加可选 LangSmith lifecycle tracing。

## Goals

- 记录 initial run、interrupt、human decision、resume、final status
- 只上传 allowlist metadata
- LangSmith 失败时 soft fail，不影响主流程

## Key Changes

- 增加 Tasklist Agent observer adapter
- 增加 result metadata、interrupt metadata、resume metadata
- 增加 no-op observer fallback

## Interface Changes

- 新增 Tasklist Agent LangSmith observer adapter 与 metadata allowlist builder，观测层与业务运行态保持边界分离
- initial run、interrupt、human decision、resume、final result 都输出摘要级 metadata，并继续保留 `versionPlanUri` 关联字段
- LangSmith disabled 或失败时统一退化到 no-op observer，不改变 AgentRun、checkpoint、stream 与 artifact 主流程语义

## Non-goals

- 不接入完整 prompt replay
- 不上传完整 tasklist markdown
- 不修改 Graph topology
- 不修改 HITL decision contract

## Test Plan

- 验证 tracing 关闭时 `/tasklist` 主流程与 v0.3.0 保持一致
- 验证 tracing 开启时可按 `runId` / `threadId` / `assistantMessageId` 关联 interrupt、resume 与 final 生命周期
- 验证 observer 失败时 soft fail，不上传完整 prompt、tasklist markdown 或 GraphState 正文

## Acceptance Notes

- tracing 关闭时主流程与 v0.3.0 一致
- tracing 开启时可按 runId/threadId 检索链路
- metadata 不暴露 raw GraphState、API key 或完整正文
