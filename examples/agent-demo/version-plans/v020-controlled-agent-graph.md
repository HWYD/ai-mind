# AI Mind v0.2.0: Controlled Agent Graph

## Summary

本版把受控 `/tasklist` 主链路迁移为 LangGraph `StateGraph` 编排，但不开放通用 Agent 权限。

## Goals

- 让 Tasklist Agent 进入显式 Graph Runtime
- 保持受控边界，不允许自由扫描目录或自由写文件
- 为后续 checkpoint、HITL、resume 留出结构位置

## Key Changes

- `/tasklist` 进入受控 Graph 编排
- Graph nodes 返回显式 state patch
- Graph route、graph event、trace summary 更清晰

## Interface Changes

- Tasklist Agent 主链路从手写 runner / 状态机表达迁移为 LangGraph `StateGraph` 编排，但用户入口仍保持 `/tasklist + @docs://versions/*.md`
- GraphState 增加 graph 执行轨迹分区，graph nodes 以 state patch 形式返回更新，不直接暴露完整内部状态
- stream trace 增加 graph node、route、state patch summary 类可观察信息，最终 tasklist artifact 展示 contract 保持不变

## Non-goals

- 不做通用 Agent Runtime
- 不做自由 tool calling
- 不做源码扫描
- 不做 artifact 持久化

## Test Plan

- 验证 `/tasklist + @docs://versions/*.md` 在 Graph Runtime 下仍可进入受控 Agent 并生成 tasklist
- 验证普通聊天、`/summary`、`/check` 等非 Tasklist 路径不受 Graph 编排迁移影响
- 验证 graph trace 能展示 node / route 摘要，但不泄露完整 prompt、draft 或 GraphState 正文

## Acceptance Notes

- 普通聊天路径不退化
- 最终 tasklist 仍通过受控 artifact 展示
- Graph 只改变编排表达，不扩大权限边界
