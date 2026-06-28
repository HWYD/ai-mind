# Acceptance 023：v0.2.3 Baseline

状态：Released Baseline
版本：v0.2.3
归档日期：2026-06-28

## graph-only 入口验收

- `/tasklist + @docs://versions/*.md` 固定进入 Graph Runtime
- 不再存在可触达的 legacy runner 生产路径
- `AI_MIND_TASKLIST_AGENT_RUNTIME` 不再影响实际执行

## 状态与路由验收

- GraphState 以分区结构承载 graph-first 运行态
- nodes 返回显式 patch
- routes 根据显式状态字段判断
- 不因内部重构改变 tasklist 业务行为

## 外部兼容验收

- `/tasklist` 输入与最终 artifact 保持兼容
- graph events 保持兼容
- Graph Debug Summary 保持兼容
- `AgentTracePanel` 消费结构不回归

## 回归验收

- 普通聊天不受影响
- skills / tool calling / MCP 不受影响
- stream-core 消费不受影响
- webapp reducer / UI 消费不受影响

## 安全边界验收

- 不输出 raw GraphState
- 不输出完整 prompt 或 tasklist draft
- 不输出 API Key、session、provider config 或 raw error

## 历史验证记录

根据当时版本资料，关键验证包括：

- `pnpm --dir apps/webapp test`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `pnpm --filter @ai-mind/stream-core test`
- `pnpm --filter @ai-mind/stream-core typecheck`
- `git diff --check`

其中 lint 保留既有 Fast Refresh warning，不构成本版 blocker。
