# Tasks 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

## Phase 1: Spec / Contract / Acceptance

**目标**: 固化 v0.3.7 的用户体验、stream contract 和非目标，避免 progress presentation 漂移成 observability / artifact / multi-agent 平台。

- [x] T037-001 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/spec.md`。
- [x] T037-002 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/plan.md`。
- [x] T037-003 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/research.md`。
- [x] T037-004 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/data-model.md`。
- [x] T037-005 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/contracts/workflow-progress-stream.md`。
- [x] T037-006 [P] 完成 `specs/037-delivery-chain-workflow-progress-presentation/acceptance.md`、`decisions.md`、`quickstart.md` 和 checklists。
- [x] T037-007 更新 `docs/architecture/agent-runtime-roadmap.md`，明确 v0.3.7 的 generic workflow progress channel 和 future guardrails。
- [x] T037-008 更新 `specs/README.md`，将 037 标记为当前 planning spec。

**Checkpoint**: 文档明确 Level C、允许 additive stream/reducer 变更、首版只绑定 `/delivery-chain`、不做 artifact / multi-agent / HITL / persistence。

## Phase 2: Stream Protocol and Schema

**目标**: 先建立稳定的底层 contract，再接 runtime 和 UI。

- [x] T037-009 在 `packages/stream-core/src/protocol/chat-stream-chunk.ts` 新增 `WorkflowProgressStartChunk`、`WorkflowProgressStepChunk`、`WorkflowProgressEndChunk`。
- [x] T037-010 在 `packages/stream-core/src/protocol/chat-stream-chunk.ts` 将三个 workflow progress chunk 加入 `ChatStreamChunk` union。
- [x] T037-011 [P] 在 `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` 增加 workflow progress protocol union tests。
- [x] T037-012 在 `apps/webapp/lib/ai/stream-chunk-schema.ts` 增加 workflow progress zod schema。
- [x] T037-013 [P] 在 `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts` 增加 workflow progress schema tests，覆盖合法 chunk 与 forbidden raw-like fields。

**Checkpoint**: 新增 chunk 能被 stream-core 类型和 webapp schema 同时接受，现有 chunk tests 不变。

## Phase 3: Delivery Chain Runtime Emission

**目标**: `/delivery-chain` 围绕现有 graph 节点 emit progressive events，不改变核心执行语义。

- [x] T037-014 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 新增 presentation-safe node -> step mapping。
- [x] T037-015 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 新增 workflow progress emit helpers，确保不输出 raw node state / raw error。
- [x] T037-015A 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 保持 step details 为 curated safe summary，不自动转发普通 tool/resource/prompt 事件。
- [x] T037-016 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 于 graph 执行前 emit `workflow-progress-start`。
- [x] T037-017 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 为 `loadDeliveryChainContext` emit running / completed / failed step。
- [x] T037-018 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 为 Plan / Task / Review stage emit running / completed / failed step。
- [x] T037-019 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 为 `buildDeliveryChainReport` emit running / completed / failed step。
- [x] T037-020 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 于 final report text 前 emit `workflow-progress-end`。
- [x] T037-021 [P] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 增加 scenario-backed progress emission tests。
- [x] T037-022 [P] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 增加 inline requirement progress emission tests。
- [x] T037-023 [P] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 增加 boundary fail-closed 不 emit progress tests。
- [x] T037-024 [P] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 增加 soft fail sanitized progress tests。

**Checkpoint**: `/delivery-chain` 可产生 progressive events，且 report 输出、resource boundary、graph node 顺序不变。

## Phase 4: Frontend Message Model and Reducer

**目标**: 新增 workflow progress message part，不影响 existing agent-step/resource/tool/prompt。

- [x] T037-025 在 `apps/webapp/lib/ai/types/message.ts` 新增 `WorkflowProgressPart` 和 `WorkflowProgressStep`。
- [x] T037-026 在 `apps/webapp/components/instamind/chat-stream/message-factory.ts` 新增 workflow progress part factory。
- [x] T037-027 在 `apps/webapp/components/instamind/chat-stream/message-operations.ts` 新增 workflow progress upsert/update helper。
- [x] T037-028 在 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 处理 `workflow-progress-start`。
- [x] T037-029 在 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 处理 `workflow-progress-step`，支持 progressive append 和 same-step update。
- [x] T037-030 在 `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 处理 `workflow-progress-end`，完成后默认 collapsed。
- [x] T037-031 [P] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 增加 workflow progress reducer tests。
- [x] T037-032 [P] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 增加 existing agent-step/resource reducer regression tests。

**Checkpoint**: reducer 能建立和更新 workflow progress part，且 `agent-step` 行为不变。

## Phase 5: Workflow Progress UI

**目标**: 新增通用组件，首版只在 `/delivery-chain` 消息中展示。

- [x] T037-033 新增 `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx`。
- [x] T037-034 在 `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` 渲染 `workflow-progress` part。
- [x] T037-035 在 `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` 限制 v0.3.7 首版只对 `/delivery-chain` route 展示该 panel。
- [x] T037-036 在 `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx` 实现 running expanded。
- [x] T037-037 在 `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx` 实现 completed / failed collapsed summary。
- [x] T037-038 在 `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx` 实现点击展开 / 折叠。
- [x] T037-039 在 `apps/webapp/components/chat/message-list/parts/workflow-progress-panel.tsx` 保持 compact 非 timeline 样式。
- [x] T037-039A 确认 workflow progress panel 只消费 `workflow-progress-*` part，不替代普通 tool/resource/prompt 面板。
- [x] T037-040 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 增加 workflow progress rendering tests。
- [x] T037-041 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 增加 auto collapse / expand tests。
- [x] T037-042 [P] 在 `apps/webapp/tests/components/chat/message-list/parts/agent-trace-panel.test.tsx` 或现有 message-list tests 中确认 `/tasklist` AgentTracePanel 不受影响。

**Checkpoint**: `/delivery-chain` 执行过程 UI 可用，界面整洁，完成后自动折叠。

## Phase 6: Report Section Presentation

**目标**: 让报告更清晰，但不升级成 artifact contract。

- [x] T037-043 在 message-list 相邻 presentation module 中新增 Delivery Chain report section parsing。
- [x] T037-044 在 report parsing 中支持 headings：输入来源、需求摘要、默认假设、实现方案、任务拆解、交付评审、风险、非目标、下一步建议。
- [x] T037-045 在 report parsing 失败时 fallback 到完整 Markdown。
- [x] T037-046 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 或相邻 tests 中增加 report section parsing tests。
- [x] T037-047 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 或相邻 tests 中增加 fallback Markdown tests。

**Checkpoint**: report presentation 更清晰，但不新增 artifact handoff / persistence。

## Phase 7: Resource and Agent Regression

**目标**: 确认 v0.3.6 compact grouping 与现有 Agent 展示不回归。

- [x] T037-048 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 保持 delivery-chain internal demo resource compact grouping regression。
- [x] T037-049 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 确认 explicit requirement resource 不回退为大 ResourcePanel。
- [x] T037-050 [P] 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx` 确认普通 resource 仍展示 ResourcePanel。
- [x] T037-051 [P] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 确认 `/delivery-chain` 不接 PostgresSaver / checkpoint / interrupt / HITL / resume。
- [x] T037-052 [P] 运行 Tasklist Agent focused regression tests，确认 Graph topology / HITL contract 不受影响。

**Checkpoint**: 只有 `/delivery-chain` 获得 workflow progress UI，其他展示路径无回归。

## Phase 8: Docs, Validation and Release Close

**目标**: 收口版本资产和验证记录。

- [x] T037-053 更新 `README.md` 中 `/delivery-chain` 能力说明。
- [x] T037-054 在实现完成后新增 `docs/versions/v0.3.7-delivery-chain-workflow-progress-presentation.md`。
- [x] T037-055 在实现完成后新增 `docs/releases/v0.3.7.md`。
- [x] T037-056 在实现完成后新增 `docs/tasklists/v0.3.7-tasklist.md`。
- [x] T037-057 运行 `pnpm --filter @ai-mind/stream-core test` 等价验证。
- [x] T037-058 运行 `pnpm --dir apps/webapp test tests/lib/ai/stream-chunk-schema.test.ts` 等价验证。
- [x] T037-059 运行 `pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain.test.ts` 等价验证。
- [x] T037-060 运行 `pnpm --dir apps/webapp test tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 等价验证。
- [x] T037-061 运行 `pnpm --dir apps/webapp test tests/components/chat/message-list/messages/assistant-message.test.tsx` 等价验证。
- [x] T037-062 运行 `pnpm --dir apps/webapp typecheck` 等价验证。
- [x] T037-063 运行 `pnpm --dir apps/webapp lint` 等价验证。
- [x] T037-064 运行 `git diff --check`。
- [x] T037-065 人工检查 diff 未新增 DB schema、PostgresSaver schema、artifact handoff、checkpoint、interrupt、HITL、resume、Tasklist Agent topology 变更。
- [x] T037-066 执行 `speckit-converge` 或人工等价收口，确认 spec / plan / tasks / acceptance / decisions 与真实 diff 一致。

**Checkpoint**: v0.3.7 可进入 release close。

## Minimum validation record

实现完成后在这里记录：

- [x] stream-core protocol tests
- [x] webapp stream chunk schema tests
- [x] delivery-chain runtime progress tests
- [x] reducer workflow progress tests
- [x] message-list workflow progress tests
- [x] report section parsing / fallback tests
- [x] resource compact grouping regression
- [x] `/tasklist` AgentTracePanel regression
- [x] typecheck
- [x] lint
- [x] git diff --check
- [x] manual scope guardrail check

人工收口结论：

- 本轮实现已覆盖 `workflow-progress-*` 协议、`/delivery-chain` runtime emit、frontend reducer / message model、Workflow Progress UI、Report section parsing 与版本文档同步。
- focused tests 通过本地 `vitest` / `tsc --noEmit` / `eslint .` 等价命令完成；当前 workspace 直接执行 `pnpm test` 会先触发 build policy / ignored builds 检查，因此未作为本轮主验证入口。
- 额外回归已覆盖 `/tasklist` 相关的 message list、HITL contract 与 graph create focused suites，未发现 Tasklist Agent topology、HITL contract、DB schema、PostgresSaver schema、artifact handoff 或 checkpoint/resume 越界修改。
