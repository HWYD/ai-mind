# Demo Test: Over-scoped Runtime Change

## Summary

这个输入用于验证 Agent 能否识别过大 scope，并提示人工收敛，而不是把多层架构改动塞进一个版本。

## Goals

- 同时重写资源系统
- 同时引入新 Agent
- 同时改 stream protocol
- 同时改 reducer 和数据库 schema

## Constraints

- 期望一个小版本完成
- 没有拆分步骤
- 没有兼容性计划

## Expected Demo Behavior

- 给出 over-scoped warning
- 建议拆分版本或进入 manual review
- 不应直接产出无边界的大而全 tasklist
