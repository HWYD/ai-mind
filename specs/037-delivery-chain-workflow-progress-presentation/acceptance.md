# Acceptance 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

## Workflow progress acceptance

- [x] `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md` 展示 workflow progress panel。
- [x] `/delivery-chain <inline requirement>` 展示 workflow progress panel。
- [x] progress panel 执行中默认展开。
- [x] progress steps 按实际执行过程逐步出现。
- [x] start 时不预渲染完整 pending step 列表。
- [x] Stage 顺序为：读取上下文 -> 方案规划 -> 任务拆解 -> 交付评审 -> 生成交付计划报告。
- [x] Stage trace 与 `DeliveryChainGraph` 固定节点顺序一致。
- [x] 每个 step 至少支持 running / completed / failed。
- [x] 读取上下文 step 能展示 demo 上下文读取摘要。
- [x] Plan / Task / Review step 能展示模型调用摘要。
- [x] step details 展示的是安全摘要，不是普通 tool/resource/prompt 事件的原样回放。
- [x] workflow 完成后 progress panel 自动折叠。
- [x] 折叠摘要显示“已处理 X”或等价安全摘要。
- [x] 折叠摘要支持点击展开。
- [x] 展开后可以查看已完成的 steps。
- [x] 失败时显示脱敏失败信息，不暴露 raw provider error、stack、prompt、GraphState 或真实路径。

## Stream and reducer acceptance

- [x] `@ai-mind/stream-core` 支持 `workflow-progress-start`。
- [x] `@ai-mind/stream-core` 支持 `workflow-progress-step`。
- [x] `@ai-mind/stream-core` 支持 `workflow-progress-end`。
- [x] webapp `chatStreamChunkSchema` 支持三个新增 chunk。
- [x] 新增 chunks 为 additive change，不修改现有 chunk 语义。
- [x] 前端 reducer 将 workflow progress chunks 映射为 `workflow-progress` message part。
- [x] reducer 支持同一步 step running -> completed / failed 更新。
- [x] reducer 在 workflow end 后标记 part completed / failed。
- [x] reducer 不修改 `agent-step` 合并逻辑。

## Report presentation acceptance

- [x] Delivery Chain Report 以清晰分段展示。
- [x] Report heading 稳定时可解析出 sections。
- [x] Report 分段失败时 fallback 普通 Markdown。
- [x] Report 仍是非持久化输出。
- [x] Report section 不进入 artifact contract。
- [x] Report section 不生成 `@artifact://`。

## Resource presentation acceptance

- [x] 内部 demo resources 继续 compact grouping。
- [x] 展开资源摘要后仍不默认显示 URI / MCP / local / service / preview。
- [x] 用户显式入口 requirement 不回退为大 ResourcePanel。
- [x] `/delivery-chain` 中 workflow progress 和 resource summary 不产生明显重复噪音。
- [x] 普通 tool / prompt 展示不被 workflow progress 面板吞并或改写。
- [x] `/tasklist` 资源展示不受影响。
- [x] 普通 MCP resource / reader / utility 展示不受影响。

## Scope guardrail acceptance

- [x] 不新增 `/plan`。
- [x] 不新增 `/task`。
- [x] 不新增 `/review`。
- [x] 不新增 PlanAgent / TaskAgent / ReviewAgent 独立运行时。
- [x] 不让 TaskStage 调用 Tasklist Agent HITL Graph。
- [x] 不新增 `@artifact://`。
- [x] 不做 session artifact handoff。
- [x] 不新增 artifact persistence。
- [x] 不新增 chat persistence。
- [x] 不新增 DB schema。
- [x] 不新增 Prisma migration。
- [x] 不修改 PostgresSaver schema。
- [x] 不接 PostgresSaver。
- [x] 不新增 checkpoint。
- [x] 不新增 interrupt。
- [x] 不新增 HITL。
- [x] 不新增 resume。
- [x] 不修改 Tasklist Agent Graph topology。
- [x] 不修改 Tasklist Agent HITL decision contract。
- [x] 不恢复 `@docs://`。
- [x] 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/`。
- [x] 不做 Agent event store。
- [x] 不做 LangSmith deep trace UI。

## Focused tests

实现阶段至少覆盖：

```powershell
pnpm --filter @ai-mind/stream-core test
pnpm --dir apps/webapp test tests/lib/ai/stream-chunk-schema.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain.test.ts
pnpm --dir apps/webapp test tests/components/instamind/chat-stream/stream-message-reducer.test.ts
pnpm --dir apps/webapp test tests/components/chat/message-list/messages/assistant-message.test.tsx
pnpm --dir apps/webapp test tests/components/chat/message-list/parts/agent-trace-panel.test.tsx
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

建议新增或扩展的 focused cases：

- workflow progress protocol union tests。
- workflow progress zod schema tests。
- reducer start / step / end tests。
- reducer progressive append tests。
- delivery-chain node -> UI step mapping tests。
- scenario-backed workflow progress emission tests。
- inline requirement workflow progress emission tests。
- soft fail workflow progress tests。
- report section extraction tests。
- report fallback markdown tests。
- message-list auto collapse / expand tests。
- resource compact grouping regression tests。
- `/tasklist` AgentTracePanel regression tests。

## Manual review checklist

- [x] 确认新增 stream chunks 不包含 raw runtime internals。
- [x] 确认 `/delivery-chain` boundary fail-closed 不启用 progress panel。
- [x] 确认 progress panel 不是 timeline 样式。
- [x] 确认 UI 中不展示内部 node id。
- [x] 确认完成后开始输出报告时 progress panel 已折叠。
- [x] 确认普通聊天和普通 resources 无展示回归。
- [x] 确认 `/tasklist` HITL path 无展示回归。
- [x] 确认没有新增 migration、Prisma schema 或 PostgresSaver schema。
- [x] 确认没有新增 artifact handoff、checkpoint、interrupt、resume。

## Release close evidence

- [x] focused tests 使用本地 `vitest` 入口完成 `stream-core`、delivery-chain runtime、reducer、message-list 与 report parsing suites。
- [x] `/tasklist` focused regressions 额外覆盖 `chat-message-list.test.tsx`、`version-plan-tasklist-agent-hitl-contracts.test.ts`、`version-plan-tasklist-agent-graph-create.test.ts`。
- [x] `apps/webapp` 本地 `tsc --noEmit` 通过。
- [x] `apps/webapp` 本地 `eslint .` 通过，仅剩既有 warnings。
- [x] `git diff --check` 通过。
- [x] manual scope guardrail review：未发现 DB schema、PostgresSaver schema、artifact handoff、checkpoint / interrupt / HITL / resume、Tasklist Agent topology / contract 越界修改。

说明：当前 workspace 直接执行 `pnpm test` 会先触发本地 build policy / ignored builds 检查，因此 focused tests 通过本地 `vitest` 入口等价执行。
