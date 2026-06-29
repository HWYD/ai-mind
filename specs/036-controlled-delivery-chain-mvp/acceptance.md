# Acceptance 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30

## Existing MVP baseline

以下条目对应当前已实现且仍需保持的 v0.3.6 MVP 基线:

- [x] `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md` 可进入 Delivery Chain。
- [x] `/delivery-chain 帮我规划一个登录表单，支持手机号、密码、错误提示和加载状态` 可进入 Delivery Chain。
- [x] `/delivery-chain` 空输入 fail closed。
- [x] `/delivery-chain + @docs://...` 被拒绝。
- [x] `/delivery-chain + docs://...` 被拒绝。
- [x] `/delivery-chain + @specs://...` 被拒绝。
- [x] `/delivery-chain + file://...` 被拒绝。
- [x] `/delivery-chain + @demo://version-plans/*.md` 不作为 Delivery Chain 入口。
- [x] `/delivery-chain + @demo://scenarios/*/context.md` 不作为 Delivery Chain 入口。
- [x] `/delivery-chain + @demo://scenarios/*/plan.sample.md` 不作为 Delivery Chain 入口。
- [x] path traversal 被拒绝。
- [x] Delivery Chain Report 包含 Plan / Task / Review。
- [x] `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md` 执行时，不再连续展开多个大 ResourcePanel。
- [x] 页面上可见紧凑的“已读取 demo 上下文 N 项”摘要。
- [x] 展开后只展示轻量分组列表，不默认显示 preview 按钮或 URI / MCP / local / service 等调试信息。
- [x] 用户显式选择的 `requirement.md` 不再以大 ResourcePanel 形式单独占位。
- [x] `/tasklist` 与普通 MCP / reader / utility resource 展示不受影响。
- [x] Inline requirement 报告明确默认假设和不写代码边界。
- [x] Scenario-backed 模式不读取真实项目目录。
- [x] 不新增 `/plan`、`/task`、`/review` public command。
- [x] 不新增 `@artifact://`。
- [x] 不新增 DB schema。
- [x] 不修改 Tasklist Agent HITL contract。
- [x] 不修改 stream protocol。
- [x] 不修改 frontend reducer 数据结构。
- [x] 不修改 Prisma schema。
- [x] 不修改 PostgresSaver schema。

## LangGraph alignment acceptance

以下条目是本轮口径修正后必须新增满足的验收标准:

- [x] `/delivery-chain` 内部实现引入并实际使用 `@langchain/langgraph` `StateGraph`。
- [x] `/delivery-chain` 不再由 `startDeliveryChainRun()` 手写连续 await Plan / Task / Review 主流程。
- [x] `startDeliveryChainRun()` 只负责 resolve invocation、fail-closed、invoke graph、emit report 和 soft fail handling。
- [x] Delivery Chain workflow 被表达为 `DeliveryChainGraph`，而不是自由函数串行 runner。
- [x] `DeliveryChainGraph` 至少包含 `loadDeliveryChainContext`、`runPlanStage`、`runTaskStage`、`runReviewStage`、`buildDeliveryChainReport` 五个节点。
- [x] Graph node 执行顺序固定为 `load -> plan -> task -> review -> report`。
- [x] Plan / Task / Review 的输出内容与当前 sequential workflow 语义等价。
- [x] graph 输出仍然生成 `Delivery Chain Report / 交付计划报告`。
- [x] GraphState 只保存 JSON-serializable business state，不保存 raw fs path、writer、AbortSignal、raw Error、API key 或 session cookie。
- [x] `/delivery-chain` 不接 PostgresSaver。
- [x] `/delivery-chain` 不新增 checkpoint。
- [x] `/delivery-chain` 不新增 interrupt。
- [x] `/delivery-chain` 不新增 HITL。
- [x] `/delivery-chain` 不新增 resume 语义。
- [x] `/delivery-chain` 不新增 `@artifact://`。
- [x] `@demo://` resource boundary 不受影响。
- [x] `/tasklist` 现有 LangGraph HITL 能力不受影响。
- [x] 资源展示降噪逻辑不受影响。

## Focused tests

实现阶段至少覆盖:

```powershell
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/delivery-chain*.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/demo-resource*.test.ts
pnpm --dir apps/webapp test tests/components/chat/message-list
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

建议补齐的 graph 定向测试:

- DeliveryChainGraph happy path。
- Graph node execution order。
- Plan / Task / Review node contract。
- graph failed stage soft fail。
- no PostgresSaver / no checkpoint / no interrupt / no HITL regression。

## Manual review checklist

- [x] 确认 `/delivery-chain` 只在显式 command 下触发。
- [x] 确认 ordinary chat 不会自动进入 Delivery Chain。
- [x] 确认 resource picker 没有恢复真实 docs catalog。
- [x] 确认 Delivery Chain report 不写真实文件。
- [x] 确认 ReviewStage 是 delivery review，不是源码级 code review。
- [x] 确认 TaskStage 没有调用现有 Tasklist Agent HITL Graph。
- [x] 确认没有新增 migration 或 Prisma schema 变更。
- [x] 确认没有新增 stream protocol chunk。
- [x] 确认没有新增 frontend reducer state shape。
- [x] 确认 `DeliveryChainGraph` 未接入 PostgresSaver。
- [x] 确认 `DeliveryChainGraph` 不使用 interrupt / resume。
- [x] 确认 roadmap 中 v0.3.7-v0.5.0 能力没有进入当前实现任务。

## Release close evidence

本轮口径修正完成后在这里记录:

- [x] focused tests: `apps/webapp` 本地 `vitest` 覆盖 route / runtime / graph / picker / quick access focused cases。
- [x] focused regression: `/tasklist + @demo://version-plans/*.md` 在长历史对话下不再被入口输入长度校验误拦截。
- [x] typecheck: 通过 `apps/webapp` 本地 `tsc --noEmit`。
- [x] lint: 通过 `apps/webapp` 本地 `eslint .`。
- [x] git diff --check: 通过。
- [x] manual no-regression check: 确认未修改 Graph topology、HITL contract、stream protocol、frontend reducer、Prisma schema、PostgresSaver schema。
- [x] browser smoke: 本轮仅调整 runtime graph 与 spec 资产，未修改前端展示实现，因此不新增浏览器 smoke。
- [x] known residual risks: Delivery Chain 仍是文本报告 MVP，尚无 stage trace presentation、artifact handoff 或持久化。
