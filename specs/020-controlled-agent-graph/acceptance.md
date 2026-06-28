# Acceptance 020：v0.2.0 Baseline

状态：Released Baseline
版本：v0.2.0
归档日期：2026-06-28

## 运行链路验收

- `/tasklist + @docs://versions/*.md` 能按服务端配置进入 legacy 或 graph 路径
- graph runner 只影响 tasklist Agent，不影响普通聊天或其他能力
- runtime 选择在请求开始前完成，不存在执行中自动切换

## Agent 行为验收

- ready 方案可正常生成 tasklist v1 并输出最终 artifact
- `needs_review` 路径能保留人工复核项后继续推进
- `ask_clarification` 会提前收口，不生成 draft
- `stop_with_boundary_message` 会提前收口，不生成 draft
- optional context 读取失败时会降级并保留 review 提示
- warning / fail 路径最多只触发一轮修订，最多形成 `v1 -> v2`

## Graph 编排验收

- `PlanningDecisionAction` 条件路由正确
- `WarningDisposition` 条件路由正确
- graph runner 复用共享 step operations，而不是复制一套业务实现
- legacy runner 仍可用，但不拥有独立演进规则

## Stream / UI 验收

- `agent-step-*` 与 `artifact-*` 保持兼容
- graph node / route / patch summary chunks 能被消费
- `AgentTracePanel` 能展示 graph timeline
- `AgentTextArtifactPanel` 的 tasklist 展示没有回归

## 安全边界验收

- debug summary 不显示完整 prompt
- debug summary 不显示完整 GraphState / AgentState
- graph patch 只显示摘要，不泄露 draft 正文和原始资源文本
- 不暴露 API Key、token、env 原值

## Checkpoint 验收

- `AI_MIND_GRAPH_CHECKPOINT=memory` 仅代表开发态 checkpoint
- 不存在 resume、replay、history list 或 state edit 产品能力
- 版本对外表述不把 memory checkpoint 误写成生产特性

## 历史验证记录

根据当时版本资产，`v0.2.0` 的验证重点包括：

- webapp 回归测试
- stream-core 协议测试
- stream-core build
- lint / typecheck
- `git diff --check`

如需精确命令，以 `docs/releases/v0.2.0.md` 和 `docs/tasklists/v0.2.0-tasklist.md` 为准。
