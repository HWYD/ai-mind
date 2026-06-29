# Demo Test: Missing Non-goals

## Summary

这个输入用于验证 Agent 在方案信息不足时是否会停在边界内，而不是脑补缺失约束。

## Goals

- 增加一个公开 demo 入口
- 更新相关说明

## Key Changes

- 调整一个用户入口
- 增加一个轻量示例

## Known Gaps

- 没有明确 Non-goals
- 没有明确 acceptance criteria
- 没有测试范围说明

## Expected Demo Behavior

- 给出缺失信息提示
- 或进入 manual review 提醒
- 不应直接产出看似完整但假设过多的 tasklist
