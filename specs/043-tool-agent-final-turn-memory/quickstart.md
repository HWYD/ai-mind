# 快速验证：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**功能**：[spec.md](./spec.md)  
**日期**：2026-07-04

## 目的

验证 tool/resource/agent/workflow 路径产生的最终用户可见回合在刷新后可以恢复，同时 raw execution state 仍然被排除在 chat memory、hydration 和 model context 之外。

## 前置条件

- 已通过 `pnpm` 安装依赖。
- 已为本地验证配置 chat memory mode，通常为 `AI_MIND_CHAT_MEMORY_CHECKPOINT=memory`。
- 可选：若要验证持久化 Postgres 行为，需要准备数据库驱动的 checkpoint 环境。

## Focused 测试命令

优先执行定向 suites：

```powershell
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts tests/lib/ai/runtime/chat-memory-service.test.ts tests/lib/ai/runtime/chat-memory-eligibility.test.ts tests/lib/ai/runtime/chat-memory-state.test.ts tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts tests/lib/ai/runtime/chat-memory-context-builder.test.ts tests/lib/ai/runtime/chat-memory-compaction.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/assistant-stream.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-output.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner-resume-state.test.ts tests/lib/ai/runtime/delivery-chain.test.ts tests/lib/ai/runtime/delivery-chain-manager-run.test.ts tests/lib/ai/runtime/tool-runtime-execution.test.ts tests/app/api/chat/thread/route.test.ts tests/components/instamind/use-chat-stream-hydration.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-memory-service.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/chat-orchestrator.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/delivery-chain.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/delivery-chain-manager-run.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner.test.ts
pnpm --dir apps/webapp test -- --run tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts
pnpm --dir apps/webapp test -- --run tests/components/instamind/use-chat-stream-hydration.test.tsx
pnpm --dir apps/webapp test -- --run tests/components/instamind/chat-stream/stream-message-reducer.test.ts
```

再执行 package 级 non-regression tests：

```powershell
pnpm --filter @ai-mind/stream-core test
```

最后执行项目级校验：

```powershell
pnpm typecheck
pnpm lint:webapp
pnpm build:pas
```

## 手工验证场景

### 场景 1：Tool 最终回答恢复

1. 启动 webapp，并确保 chat memory 已启用。
2. 发送一个会触发 ordinary tool-assisted final answer 的用户请求。
3. 确认实时响应过程中可能出现 tool/resource cards，但最后会落到 final text。
4. 刷新页面。
5. 期望：恢复后的 messages 只包含用户问题和最终 assistant text。
6. 期望：恢复结果中不出现 tool args、raw result、ToolMessage、tool card 或 resource raw content。

### 场景 2：MCP / Resource 最终回答恢复

1. 发送一个会使用 docs resource 或 remote resource context，并最终产出 final answer text 的请求。
2. 刷新页面。
3. 期望：恢复后的 messages 只包含 text-only 的 user/assistant pair。
4. 期望：hydration 中不出现 MCP envelope、resource content、prompt raw content 或 resource card。

### 场景 3：Tasklist Agent 最终回答恢复

1. 运行 `/tasklist + @demo://version-plans/*.md`，直到得到 completed/final 或 controlled blocked 的结果。
2. 刷新页面。
3. 期望：恢复后的 messages 包含用户目标和 Tasklist final answer text summary。
4. 期望：hydration 中不出现 tasklist artifact markdown、agent-step、agent-interrupt、GraphState、checkpoint、AgentRun 或 AgentInterrupt raw payload。
5. 确认 Tasklist resume 的 focused tests 仍然通过。

### 场景 4：Tasklist 的 paused / interrupted 不保存

1. 让 Tasklist Agent 运行到一个 HITL pause。
2. 请求 chat thread hydration。
3. 期望：这个 paused/interrupted 的 assistant turn 不会被保存为 completed final turn。
4. Resume 仍然使用 Tasklist Agent 自己的 thread id 和业务 run state。

### 场景 5：Delivery 最终报告恢复

1. 运行 `/delivery-chain`，直到得到 completed 或 blocked 的 final report。
2. 刷新页面。
3. 期望：若报告超过 8000 字符，恢复后的 messages 中会包含用户输入和确定性截断后的 final report text。
4. 期望：hydration 中不出现 workflow progress、RuntimeArtifact、manager trace 或 subagent raw result。
5. 确认 Delivery 仍然是 run-local，不具备 checkpoint/resume 行为。

### 场景 6：failed / cancelled 输出不保存

1. 触发或模拟一个 failed runtime path、exception report、cancellation 或 aborted request。
2. 请求 chat thread hydration。
3. 期望：不会有 failed/exception/cancelled/paused turn 以 completed memory 的形式出现。

### 场景 7：duplicate prevention

1. 模拟同一个 completed final turn 被观察到两次。
2. 请求 chat thread hydration。
3. 期望：该回合只存在一组 user/assistant final pair。

### 场景 8：长输出约束

1. 生成较长的 Tasklist 或 Delivery final text。
2. 请求 chat thread hydration，并通过测试检查 ThreadState。
3. 期望：必要时，保存的 Delivery assistant text 会在 8000 字符处做确定性截断。
4. 期望：不会因此引入 model summary、execution summary、contextEntries、artifact markdown 或 raw runtime state。

## 终端 smoke 说明

- 本轮在 terminal-only 环境下完成 smoke，无法直接驱动浏览器 UI。
- 手工 smoke 以 quickstart 中的 focused runtime / hydration / route / reducer / stream-core 验证命令为准，覆盖 ordinary tool、MCP/resource、Tasklist、Delivery 和 hydration refresh 边界。
- 如 release close 需要补浏览器级视觉确认，可在有交互环境时按上面的 8 个场景再复核一次。

## 预期不会发生的变化

- `GET /api/chat/thread` response shape 保持与 v0.4.2 兼容。
- `@ai-mind/stream-core` protocol 保持不变。
- frontend reducer public message shape 保持不变。
- Prisma schema 保持不变。
- Tasklist Agent 的 GraphState、AgentRun、AgentInterrupt 和 checkpoint/resume 行为保持不变。
- Delivery Chain 的 RuntimeArtifact 仍然只在 run-local 范围内存在，不会被持久化。
