# Quickstart: Structured Supervisor Review Loop

## Purpose

本指南用于 v0.4.11 实现与 Review。它不替代 `tasks.md`，而是给出推荐实现顺序、最小验证命令和人工检查路线。

## Read First

```text
.specify/memory/constitution.md
specs/v0.4.11-structured-supervisor-review-loop/spec.md
specs/v0.4.11-structured-supervisor-review-loop/plan.md
specs/v0.4.11-structured-supervisor-review-loop/data-model.md
specs/v0.4.11-structured-supervisor-review-loop/contracts/
docs/adr/0010-controlled-agent-as-tool-delivery-manager.md
docs/adr/0011-phase-aware-parallel-review-group.md
apps/webapp/AGENTS.md
```

## Recommended Implementation Order

### 1. Contract first

- 建立 role-specific `.strict()` Zod schemas。
- 从 schema 推导 TypeScript types。
- 保持 Supervisor、Plan、Tasks、Reviewer 和 Revision 使用用户选定的业务模型；仅 Contract 输出与 repair 使用固定 `deepseek/deepseek-v4-pro`。
- 参考 `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts` 的固定模型解析与 `withStructuredOutput` 调用方式，不复用其记忆候选语义、输入或失败收口。
- 实现安全的一次 Contract repair。
- 先写 Contract table tests，证明 unknown fields 不会被 strip。

Exit check:

```text
业务 decision/severity/boundaryStatus 不再来自 Markdown 或 open metadata。
```

### 2. Supervisor pre-decision and policy

- 创建本 run 唯一 `SupervisorDispatchPlan`。
- Runtime 分配 immutable `dispatchPlanId`。
- 实现 execute / clarification_required / blocked。
- 将 policy 改为阶段预算。

Exit check:

```text
非 execute 分支不会调用 Plan/Tasks/Reviewer。
```

### 3. Typed artifacts and exact Review Group

- Plan/Tasks 同时输出 Markdown 和 typed summary。
- Runtime 持有稳定 artifact identity/revision。
- Reviewer set 在任何 Reviewer 启动前做 exact-set validation。
- 合法集合才并行执行三个 Reviewer。

Exit check:

```text
missing/duplicate/extra/unknown reviewer 时 executor call count = 0。
```

### 4. Typed ReviewBundle and canonical status

- Runtime 分配 `cycleId`、`findingId`。
- partial Reviewer failure 记录 coverage。
- 用纯函数实现 hard rules 和六状态矩阵。
- 删除 Markdown conclusion regex、metadata casts 和 text-based finding merge。

Exit check:

```text
修改 Markdown 标题、语言、关键字，不改变同一结构化输入的状态。
```

### 5. Supervisor guidance and deterministic feedback loop

- 初次 Review 后追加 post-review guidance 到同一 DispatchPlan。
- Supervisor 只提供 rationale 和按目标分类的返修建议，不复制 finding IDs。
- Runtime 按 `issue + required` finding 的 `targetArtifacts` 派生 RevisionRequest、目标和来源追踪；post guidance 失败时保留安全警告并继续。
- 最多一次 Revision；Plan before Tasks。
- Revision 后直接生成报告，保留返修依据和 artifact revision，并要求人工确认；不执行 Re-review 或记录 resolved/unresolved。

Exit check:

```text
最多 1 次 Revision、最多 2 个 Review cycles，第二轮不会再次返修。
```

### 6. Compatibility, evaluation and docs

- 复用现有 workflow progress message family。
- 建立冻结 evaluation manifest 和 test-side adapters。
- 新增 ADR-0012，更新 roadmap。
- 实现验收收口后再同步公开 version/release/tasklist/README/package version。

## Targeted Validation

在仓库根目录执行。

### Contract and manager suites

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/delivery-chain-manager-contract.test.ts
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/delivery-chain-manager-review-loop.test.ts
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/delivery-chain-manager-run.test.ts
```

### Route and compatibility

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/delivery-chain.test.ts
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/chat-orchestrator.test.ts
```

如果 report section shape 变化，再运行相应 UI report view test；不要因内部状态增加而修改 public stream reducer shape。

### Static checks

```powershell
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

完成 target suites 后，再按项目 gate 运行：

```powershell
pnpm test:stable
pnpm typecheck
pnpm lint
```

## Manual Review Checklist

### Runtime authority

- Supervisor 输出 Runtime ID 时 whole result 被拒绝。
- post-decision 写回同一 `dispatchPlanId`。
- Supervisor 不能跳过 Plan、Tasks 或固定 Reviewer。
- Runtime 只按已验证 finding 的结构化 target 派生返修，不做文本或语义相似度分组。

### Contract safety

- root/nested unknown fields 都失败。
- Contract repair 反馈不含 raw invalid value 或 raw response。
- provider retry 与 Contract repair metrics 分离。
- trace 能证明业务 Agent 调用使用用户选定模型，Contract/repair 调用只使用固定 DeepSeek model。
- Markdown 仅展示。

### Review integrity

- exact-set gate 在 progress started、trace 和 invocation 之前。
- 三 Reviewer 同版 Plan/Tasks。
- one/two/all Reviewer failure 对应正确状态。
- Risk-only missing 不能 pass。

### Feedback loop

- RevisionRequest 只引用当前 run/cycle findings。
- stable artifact ID + revision increment。
- Plan+Tasks 返修顺序正确。
- 不会出现 Re-review 或第二次 Revision；返修成功后的内部状态为 `needs_review`。

### Compatibility

- inline 与 `@demo://` 输入仍可用。
- 普通 chat 与 `/tasklist` 不获得 delivery Supervisor 权限。
- 无 DB、checkpoint、resume、GraphState 生命周期扩张。
- public stream union 和 frontend reducer public shape 无变化。

## Evaluation Run Rules

- 先冻结 manifest 和 scorer version，再运行三个 baseline。
- 同 case 固定用户业务模型、固定 DeepSeek Contract model、provider parameters 与 timeout。
- fault injection 位于测试 harness，不通过 prompt 或生产 flag 制造失败。
- 记录质量、hard-rule errors、elapsed time、model calls、repair calls 和 tokens。
- 模型型 case 建议重复三次并报告 median/range。

## Completion Evidence

实现完成至少应留下：

- Contract/policy/status/loop tests 全绿；
- `/delivery-chain` 与旧链回归证据；
- 三 baseline 结果及质量—成本说明；
- ADR-0012 与 roadmap 同步；
- 无 Markdown 业务结论解析的搜索证据；
- docs/package version 仅在真实实现收口后更新到 v0.4.11。
