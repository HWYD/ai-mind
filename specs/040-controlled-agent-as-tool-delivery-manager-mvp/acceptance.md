# Acceptance 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Completed
版本: v0.4.0
日期: 2026-07-01

## Release Gate

v0.4.0 只有在以下条件全部满足时，才可进入 release close。

## Functional Acceptance

- [x] `/delivery-chain` 主路径进入 `ControlledDeliveryManager`。
- [x] Manager 通过 tool-calling 调用 `plan-subagent`、`task-subagent`、`review-subagent`。
- [x] 当前模型不支持 tool-calling 或没有 `bindTools` 时 fail closed。
- [x] Manager 固定顺序只接受 `plan -> task -> review`。
- [x] `maxToolCalls = 3` 生效。
- [x] parallel tool calls fail closed。
- [x] nested delegation 在 v0.4.0 中未暴露执行入口，policy 显式禁用。
- [x] 未注册 tool call fail closed。
- [x] 乱序 tool call fail closed。
- [x] 不存在非法 tool call correction loop。
- [x] `task-subagent` 缺少 plan artifact 时不得 completed。
- [x] `review-subagent` 缺少 plan 或 tasks artifact 时不得 completed。
- [x] 子 Agent tool result 必须通过强 JSON Schema。
- [x] schema-invalid result 不生成正式 artifact。
- [x] failed subagent tool 不生成正式 artifact。
- [x] review blocked 可生成带 blocked metadata 的 review artifact。
- [x] Manager 最终输出兼容现有 Delivery Chain Report headings。

## RuntimeArtifact Acceptance

- [x] `RuntimeArtifact(kind='plan')` 只来自 plan completed result。
- [x] `RuntimeArtifact(kind='tasks')` 只来自 task completed result。
- [x] `RuntimeArtifact(kind='review')` 只来自 review completed / blocked result。
- [x] `RuntimeArtifact(kind='delivery_report')` 只由 Manager synthesis 生成。
- [x] RuntimeArtifact 不进入 `artifact-*` stream chunks。
- [x] RuntimeArtifact 不进入 frontend `message.artifacts`。
- [x] RuntimeArtifact 不进入 DB。
- [x] RuntimeArtifact 不暴露 raw prompt、raw response、provider config、stack、API key、cookie 或真实文件路径。

## Stream and UI Acceptance

- [x] 继续复用 `workflow-progress-*`。
- [x] progress step 使用 Manager delegation 语义。
- [x] progress detail 只包含 curated safe summary。
- [x] progress chunk 不包含 raw invocation、raw result、RuntimeArtifact。
- [x] 完成后 progress panel 仍自动 collapsed。
- [x] 不新增 Agent trace UI。
- [x] 不修改 `stream-core` chunk union。
- [x] 不修改 frontend reducer public shape，相关 reducer / message tests 保持通过。

## Public Surface Acceptance

- [x] 不新增 `/plan`、`/task`、`/review`。
- [x] 不新增用户可选 subagent picker。
- [x] 不修改 `@` 菜单。
- [x] 不新增 `@artifact://`。
- [x] 不新增 composer artifact chip。
- [x] 不新增 artifact persistence。
- [x] 不新增 chat persistence。
- [x] 不新增 DB schema / Prisma migration。
- [x] 不接 PostgresSaver。

## Tasklist Agent Non-regression

- [x] `/tasklist` route behavior 不变。
- [x] Tasklist Agent Graph topology 不变。
- [x] Tasklist Agent HITL decision contract 不变。
- [x] `/tasklist` 不使用 `ControlledDeliveryManager`。
- [x] Delivery Chain 子 Agent tools 不调用 Tasklist Agent HITL Graph。
- [x] 不把 Tasklist Agent 包装成 Delivery Chain 子 Agent tool。

## Required Tests

- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `apps/webapp/tests/lib/ai/stream-chunk-schema.test.ts`
- [x] `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts`
- [x] `apps/webapp/tests/components/chat/message-list/messages/assistant-message.test.tsx`
- [x] `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts`

## Validation Commands

- [x] `.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain-manager-run.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/chat-orchestrator.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/lib/ai/stream-chunk-schema.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/components/instamind/chat-stream/stream-message-reducer.test.ts` in `apps/webapp`
- [x] `.\node_modules\.bin\vitest.cmd run tests/components/chat/message-list/messages/assistant-message.test.tsx` in `apps/webapp`
- [x] `packages/stream-core/node_modules/.bin/vitest.cmd run tests/protocol/chat-stream-chunk.test.ts`
- [x] `.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json` in `apps/webapp`
- [x] Focused `eslint` validation for touched runtime/test files
- [x] `git diff --check`

说明：由于当前 workspace 直接执行部分 `pnpm test` / `pnpm typecheck` 会先触发本地 build policy / ignored builds 约束，本版 focused validation 使用本地 binary 入口完成，作为等价验证。

## Manual Scope Guardrail

- [x] 人工检查 diff 未新增 DB schema、Prisma migration、PostgresSaver、checkpoint、resume、HITL、`@artifact://`、global Agent Catalog、message bus、parallel subagents 或 nested subagents。
