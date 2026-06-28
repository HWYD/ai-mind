# 任务 020：v0.2.0 Completed Baseline

状态：Completed Baseline
版本：v0.2.0
归档日期：2026-06-28

## P0 LangGraph 编排迁移

- [x] 为 Tasklist Agent 引入 `@langchain/langgraph`
- [x] 建立 tasklist runtime config，允许在请求开始前选择 `legacy` 或 `graph`
- [x] 保留 legacy runner 作为迁移期止损路径
- [x] 抽取 shared step operations，避免维护两套业务规则
- [x] 新增 GraphState 包装层承载 graph 执行轨迹
- [x] 把 v0.1.1 主流程映射为 StateGraph nodes / edges / conditional edges
- [x] 将 `PlanningDecisionAction` 映射为显式路由
- [x] 将 `WarningDisposition` 映射为显式路由

## P0+ Graph Events 与 Trace

- [x] 设计并接入 graph node start / end chunks
- [x] 设计并接入 graph route chunk
- [x] 设计并接入 graph state patch summary chunk
- [x] 保持既有 `agent-step-*` 与 `artifact-*` 兼容
- [x] 升级 `AgentTracePanel`，可展示 graph timeline
- [x] 保持 `AgentTextArtifactPanel` 的最终 tasklist 展示语义不变

## P1 开发态 Checkpoint 与 Debug Summary

- [x] 支持 development-only memory checkpoint
- [x] 将 checkpoint 与 `threadId` 绑定
- [x] 新增 Graph Debug Summary
- [x] 限制 debug summary 只输出白名单摘要字段
- [x] 避免输出完整 GraphState / AgentState / prompt / tasklist draft

## P2 回归与兼容验证

- [x] 验证 ready / needs_review / ask_clarification / stop_with_boundary_message 各路径
- [x] 验证 optional context 只读一次
- [x] 验证 warning 触发 v2 修订路径
- [x] 验证 v2 后不再继续生成更高版本 draft
- [x] 验证普通聊天、summary、skills、tool calling 不受影响
- [x] 验证 graph events 只在 graph runtime 下出现
- [x] 验证前端不提供 runtime switch
- [x] 更新 v0.2.0 对外版本文档、release 和 tasklist 资产

## 基线结论

后续版本如果回看 `v0.2.0`，应把它理解为：

- 首次把 Tasklist Agent 接入 LangGraph
- 仍保留 legacy / graph 双路径
- checkpoint 仅是开发态能力
- GraphState 尚未成为最终单事实源
