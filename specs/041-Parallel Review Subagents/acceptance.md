# Acceptance 041: Parallel Review Subagents + Manager Synthesis

状态: Completed
版本: v0.4.1
日期: 2026-07-02

> v0.4.1 先交付纯规则 synthesis，LLM 润色延后到后续版本。LLM 润色验收条目（第 18 行）标记为 Deferred。

## Functional Acceptance

- [x] `/delivery-chain` 能正确执行 plan(串行) -> task(串行) -> review-group(并行) -> synthesis 完整流程。
- [x] Review Group 内 3 个 review-class tool 并行执行。
- [x] Plan/Task 阶段出现 parallel tool calls 时 fail closed。
- [x] Review Group 内出现未注册 tool 时 fail closed。
- [x] Review Group 内出现 plan/task tool 时 fail closed。
- [x] Review Group 内出现 nested delegation 时 fail closed。
- [x] risk-subagent metadata.reviewType = 'risk'。
- [x] boundary-subagent metadata.reviewType = 'boundary'。
- [x] failed review 不生成正式 RuntimeArtifact。
- [x] boundary blocked 强制 final report blocked。
- [x] risk severity = blocker 强制 final report blocked。
- [x] risk failed 在 final report 中标记 missing。
- [x] 1 个 review failed：synthesis 继续，report 标注 missing。
- [x] 2 个 review failed：synthesis 继续，report 标注 missing。
- [x] 3 个 review 全部 failed：fail closed。
- [x] Manager synthesis 不是 raw concatenation（包含综合结论）。
- [x] Manager synthesis 处理冲突结果（标注冲突并给出综合判断）。
- [ ] LLM 润色失败时降级为纯规则生成的报告。【Deferred: LLM 润色延后到后续版本】

## RuntimeArtifact Acceptance

- [x] 不新增 RuntimeArtifact kind。
- [x] risk/boundary 产出 `kind: 'review'` + `metadata.reviewType`。
- [x] RuntimeArtifact 仍是 run-local，不进入 DB / stream / frontend message。

## Stream and UI Acceptance

- [x] 不新增 stream chunk 类型。
- [x] 不修改 frontend reducer public shape。
- [x] workflow progress 展示 `delegate-review-group` step。
- [x] workflow progress step 序列：load -> delegate-plan -> delegate-task -> delegate-review-group -> synthesize-report。
- [x] progress 不包含 raw invocation / raw result / RuntimeArtifact。
- [x] assistant message workflow progress 非退化。
- [x] Delivery Chain Report UI 兼容新报告结构。

## Public Surface Acceptance

- [x] 仍然只有 `/delivery-chain`。
- [x] 不新增 `/plan`、`/task`、`/review`。
- [x] 不新增用户可选 subagent picker。
- [x] 不新增 `@artifact://`。
- [x] 不新增 DB / persistence。
- [x] 不新增 ToolRuntimeScope。
- [x] risk/boundary subagent tool 不出现在普通 chat / skill-binding tool list。
- [x] 不暴露 raw prompt / raw response / provider config / stack / real file path。

## Tasklist Agent Non-regression

- [x] /tasklist 非退化。
- [x] Tasklist Agent Graph / HITL / checkpoint / resume / AgentRun 边界不变。
- [x] delivery-chain subagent tools 不调用 Tasklist Agent HITL Graph。

## @demo:// Boundary Non-regression

- [x] @demo:// boundary 不变。
- [x] demo 资源白名单不变。
- [x] 路径遍历防护不变。
- [x] 符号链接防护不变。

## Required Tests

- [x] plan -> task -> review group happy path。
- [x] review group parallel calls accepted only after task completed。
- [x] parallel before task completed fail closed。
- [x] unregistered review-class tool fail closed。
- [x] nested delegation still fail closed。
- [x] review group cannot call plan/task tool。
- [x] risk metadata.reviewType = risk。
- [x] boundary metadata.reviewType = boundary。
- [x] failed risk creates no formal artifact。
- [x] boundary blocked forces final report blocked。
- [x] risk failed is marked missing in final report。
- [x] 1 review failed: synthesis continues。
- [x] 2 reviews failed: synthesis continues。
- [x] 3 reviews all failed: fail closed。
- [x] ReviewBundle construction correct。
- [x] Manager synthesis is not raw concatenation。
- [x] Manager synthesis handles conflicting results。
- [x] workflow progress shows delegate-review-group step。
- [x] progress does not include raw invocation / raw result / RuntimeArtifact。
- [x] stream schema non-regression。
- [x] frontend reducer non-regression。
- [x] assistant message workflow progress non-regression。
- [x] /tasklist non-regression。
- [x] @demo:// boundary non-regression。

## Validation Commands

- [x] `pnpm lint:webapp` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm --dir apps/webapp test` 通过。
- [x] `pnpm --dir apps/webapp build` 通过。
- [x] `git diff --check` 无空白错误。

## Manual Scope Guardrail

- [x] 不修改 stream-core chunk union。
- [x] 不修改 frontend reducer public shape。
- [x] 不修改 Prisma schema / DB migration。
- [x] 不修改 @demo:// boundary 校验逻辑。
- [x] 不修改 Tasklist Agent Graph / HITL / checkpoint / resume 逻辑。
- [x] 不修改 ToolRuntimeScope 定义。
- [x] 不修改 RuntimeArtifactKind 枚举。
