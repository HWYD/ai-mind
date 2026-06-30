# Quickstart 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7

## Demo commands

Scenario-backed：

```text
/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md
```

Inline requirement：

```text
/delivery-chain 帮我规划一个登录表单，支持手机号、密码、错误提示和加载状态
```

Existing Tasklist Agent should still work：

```text
/tasklist + @demo://version-plans/v034-langsmith-observability.md
```

## Expected workflow progress

During execution, `/delivery-chain` should show an expanded process panel.

Steps appear progressively:

```text
正在生成交付计划...

读取上下文
方案规划
任务拆解
交付评审
生成交付计划报告
```

The UI must not render all future steps at start time.

After workflow completion and before final report output, the panel collapses:

```text
已处理 6m25s
```

The summary row can be clicked to expand and inspect the completed steps.

## Expected report sections

Delivery Chain Report should still include:

```text
输入来源
需求摘要
默认假设
实现方案
任务拆解
交付评审
风险
非目标
下一步建议
```

If section parsing fails, the full Markdown report must remain visible.

## Boundary probes

These should not start workflow progress:

```text
/delivery-chain
/delivery-chain + @docs://versions/v034-langsmith-observability.md
/delivery-chain + docs://versions/v034-langsmith-observability.md
/delivery-chain + @specs://037-delivery-chain-workflow-progress-presentation/spec.md
/delivery-chain + file:///D:/code/mine/ai-mind/package.json
/delivery-chain + @demo://version-plans/v034-langsmith-observability.md
/delivery-chain + @demo://scenarios/request-limit-banner/context.md
/delivery-chain + @demo://../../apps/webapp/package.json
```

They should continue to output safe fail-closed text.

## Suggested validation commands

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

## Manual smoke

- Run scenario-backed `/delivery-chain`。
- Confirm steps appear progressively。
- Confirm process panel is expanded while running。
- Confirm process panel collapses after workflow completion。
- Expand the collapsed summary and inspect steps。
- Confirm final report appears normally。
- Run inline requirement and repeat the same checks。
- Run `/tasklist + @demo://version-plans/*.md` and confirm AgentTracePanel / HITL path is unchanged。
- Confirm ordinary resource messages still show ResourcePanel。
