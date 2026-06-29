# Quickstart 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6

## Demo commands

Scenario-backed:

```text
/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md
```

Inline requirement:

```text
/delivery-chain 帮我规划一个登录表单，支持手机号、密码、错误提示和加载状态
```

Existing Tasklist Agent should still work:

```text
/tasklist + @demo://version-plans/v034-langsmith-observability.md
```

## Expected report sections

Delivery Chain Report should include:

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

## Boundary probes

These should be rejected:

```text
/delivery-chain
/delivery-chain + @docs://versions/v034-langsmith-observability.md
/delivery-chain + docs://versions/v034-langsmith-observability.md
/delivery-chain + @specs://036-controlled-delivery-chain-mvp/spec.md
/delivery-chain + file:///D:/code/mine/ai-mind/package.json
/delivery-chain + @demo://version-plans/v034-langsmith-observability.md
/delivery-chain + @demo://scenarios/request-limit-banner/context.md
/delivery-chain + @demo://scenarios/request-limit-banner/plan.sample.md
/delivery-chain + @demo://../../apps/webapp/package.json
```

## Suggested validation commands

Adjust paths to the final implementation files:

```powershell
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain*.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/demo-resource*.test.ts
pnpm --dir apps/webapp test tests/components/chat/message-list
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

## Manual smoke

- Open public demo UI。
- Use slash menu to insert `/delivery-chain`。
- Run scenario-backed command。
- Run inline requirement command。
- Confirm report says it is planning/review output and did not modify code。
- Confirm `@` picker does not show real `docs/` files。
