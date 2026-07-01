# Quickstart 040: Controlled Agent-as-tool Delivery Manager MVP

状态: Completed
版本: v0.4.0
日期: 2026-07-01

## Purpose

本 quickstart 用于实现完成后的最小验证。  
v0.4.0 已经把 `/delivery-chain` 从固定 stage main path 收口为 `ControlledDeliveryManager`，并通过受控 tool-calling 串行委派三个 delivery-chain-local subagent tools。

## Prerequisites

- 使用声明了 tool-calling 能力的模型配置，或在测试里使用 fake tool-call model。
- 不需要 PostgreSQL / Prisma migration / PostgresSaver。
- 不需要真实 provider 作为单元测试硬门槛；manager-focused tests 使用 fake model。

## Focused Validation Commands

推荐按下面顺序验证：

```powershell
cd apps/webapp
.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts
.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain-manager-run.test.ts
.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/delivery-chain.test.ts
.\node_modules\.bin\vitest.cmd run tests/lib/ai/runtime/chat-orchestrator.test.ts
.\node_modules\.bin\vitest.cmd run tests/lib/ai/stream-chunk-schema.test.ts
.\node_modules\.bin\vitest.cmd run tests/components/instamind/chat-stream/stream-message-reducer.test.ts
.\node_modules\.bin\vitest.cmd run tests/components/chat/message-list/messages/assistant-message.test.tsx
.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
cd ../..
packages/stream-core/node_modules/.bin/vitest.cmd run tests/protocol/chat-stream-chunk.test.ts
git diff --check
```

说明：当前 workspace 直接执行部分 `pnpm` 测试命令会先触发本地 build policy / ignored builds 约束，因此 focused validation 使用本地 binary 入口作为等价路径。

## Scenario 1: Legal Serial Delegation

Input:

```text
/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md
```

Expected:

- request 通过现有 `/delivery-chain` boundary 解析；
- manager 发出 workflow progress start；
- manager 只按下面顺序调用 tool：
    - `plan-subagent`
    - `task-subagent`
    - `review-subagent`
- plan result 生成 `RuntimeArtifact(kind='plan')`；
- task result 消费 plan artifact 并生成 `RuntimeArtifact(kind='tasks')`；
- review result 消费 plan + tasks artifacts 并生成 `RuntimeArtifact(kind='review')`；
- manager 内部合成 `RuntimeArtifact(kind='delivery_report')`；
- 最终可见报告继续沿用 Delivery Chain Report headings。

## Scenario 2: Model Does Not Support Tool-calling

Input:

```text
/delivery-chain <valid inline requirement>
```

Setup:

- 选择或伪造一个没有 tool-calling capability / `bindTools` 的模型。

Expected:

- manager fail closed；
- 不降级成 runner fallback；
- 不生成正式 RuntimeArtifact；
- 输出安全失败摘要。

## Scenario 3: Out-of-order Tool Call

Setup:

- fake manager model 首次调用 `task-subagent`。

Expected:

- policy 拒绝调用；
- 不生成 task artifact；
- 不进入 correction loop；
- 最终输出安全失败摘要。

## Scenario 4: Invalid Tool Result JSON

Setup:

- fake subagent tool 返回 schema-invalid JSON result。

Expected:

- manager 拒绝结果；
- 不生成正式 artifact；
- 不暴露 raw parse error、provider error 或 stack。

## Scenario 5: Workflow Progress Safety

Expected visible chunks:

- `workflow-progress-start`
- safe `workflow-progress-step`
- `workflow-progress-end`
- final text report

Forbidden visible content from subagent delegation:

- raw `SubagentToolInvocation`
- raw `SubagentToolResult`
- `RuntimeArtifact`
- raw prompt / raw provider error / stack
- full generic tool transcript

## Scenario 6: Tasklist Agent Non-regression

Input:

```text
/tasklist + @demo://version-plans/v034-langsmith-observability.md
```

Expected:

- request 仍然进入 Tasklist Agent；
- `/tasklist` 不导入也不使用 `ControlledDeliveryManager`；
- Tasklist Graph topology / HITL contract / checkpoint behavior 保持不变。

## Scenario 7: `@demo://` Boundary Non-regression

Inputs:

```text
/delivery-chain + @demo://scenarios/request-limit-banner/context.md
/delivery-chain + @demo://version-plans/v034-langsmith-observability.md
/delivery-chain + @file://private.md
```

Expected:

- 现有 fail-closed message 语义保持兼容；
- boundary failure 不会启动 workflow progress；
- 不读取真实 repo resources。
