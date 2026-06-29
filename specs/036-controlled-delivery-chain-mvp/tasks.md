# Tasks 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30

> 本文件在 2026-06-30 因 Delivery Chain runtime 口径修正而重新打开。此前已完成的 sequential runner / UI / 文档任务仍保留为历史记录；以下新增 correction phase 用于把 v0.3.6 收口到 LangGraph-controlled sequential workflow。

## Phase 1: Spec / ADR / Roadmap

**目标**: 先固化版本边界，避免 Delivery Chain MVP 漂移成多 Agent 平台。

- [x] T036-001 [P] 完成 `specs/036-controlled-delivery-chain-mvp/spec.md`。
- [x] T036-002 [P] 完成 `specs/036-controlled-delivery-chain-mvp/plan.md`。
- [x] T036-003 [P] 完成 `specs/036-controlled-delivery-chain-mvp/research.md`、`data-model.md`、`contracts/delivery-chain-runtime.md`。
- [x] T036-004 [P] 完成 `acceptance.md`、`decisions.md` 和 checklist。
- [x] T036-005 新增 `docs/architecture/agent-runtime-roadmap.md`，记录 v0.3.6-v0.5.0 路线并标注 future-only。
- [x] T036-006 新增 `docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md`。
- [x] T036-007 更新 docs / specs 索引，确保 036 可以被后续 workflow 找到。

**Checkpoint**: 文档明确 Level C、one public command、no nested HITL、no artifact persistence、no DB / stream / reducer changes。

## Phase 2: Command routing and invocation contract

**目标**: 让系统识别 `/delivery-chain`，但先只完成解析和 fail-closed。

- [x] T036-008 更新 route type 解析，显式 `/delivery-chain` 进入 Delivery Chain route。
- [x] T036-009 确认普通聊天裸输入不进入 Delivery Chain。
- [x] T036-010 实现 DeliveryChainInvocation parser，区分 scenario、inline、invalid。
- [x] T036-011 空 `/delivery-chain` 返回安全提示，要求提供 scenario 或需求文本。
- [x] T036-012 [P] 增加 route type tests，覆盖 explicit command、ordinary chat、missing input。
- [x] T036-013 [P] 增加 invocation parser tests，覆盖 resource / inline / invalid variants。

**Checkpoint**: `/delivery-chain` 能被受控识别，但尚未执行 stage runtime。

## Phase 3: Resource boundary and input loading

**目标**: 复用 v0.3.5 `@demo://` resolver，建立 DeliveryChainInput。

- [x] T036-014 实现 scenario-backed input loading，只接受 `@demo://scenarios/*/requirement.md`。
- [x] T036-015 读取同 scenario 下 `context.md`，缺失时降级并写入 warning。
- [x] T036-016 读取 demo rubrics 和 governance，或固化缺失时的 fail closed / fallback decision。
- [x] T036-017 拒绝 `@docs://`、`docs://`、`@specs://`、`file://`、unknown scheme。
- [x] T036-018 拒绝 path traversal、absolute path、backslash path。
- [x] T036-019 拒绝 `@demo://version-plans/*.md` 作为 Delivery Chain 输入，并提示该资源属于 `/tasklist`。
- [x] T036-020 拒绝 scenario `context.md`、`plan.sample.md`、`tasks.sample.md`、`review.expected.md` 作为入口。
- [x] T036-021 [P] 增加 resource boundary tests，覆盖 allowed scenario 和 forbidden inputs。
- [x] T036-022 [P] 增加 no-real-repo-read tests 或 mock assertion，确认不扫描真实 `docs/` / `specs/` / `apps/` / `packages/`。

**Checkpoint**: Delivery Chain 输入边界与 v0.3.5 demo resource boundary 一致。

## Phase 4: Orchestrator and stages

**目标**: 固定顺序生成 Plan / Task / Review / Report。

- [x] T036-023 新增 DeliveryChainOrchestrator 或等价 runner。
- [x] T036-024 新增 PlanStage，输出 Implementation Plan section。
- [x] T036-025 新增 TaskStage，输出 Task Breakdown section。
- [x] T036-026 新增 ReviewStage，输出 Delivery Review section。
- [x] T036-027 新增 BuildReport，组合最终 Delivery Chain Report。
- [x] T036-028 确认 TaskStage 不调用现有 Tasklist Agent HITL Graph。
- [x] T036-029 确认 Orchestrator 不新增 checkpoint / interrupt / resume 语义。
- [x] T036-030 [P] 增加 stage sequencing tests。
- [x] T036-031 [P] 增加 report shape tests，覆盖需求摘要、假设、方案、任务、评审、风险、非目标、下一步。
- [x] T036-032 [P] 增加 insufficient inline requirement tests，确认输出默认假设和待补充信息。

**Checkpoint**: Delivery Chain runtime 可在无持久化、无 HITL、无多 Agent 的前提下产出报告。

## Phase 5: Output integration

**目标**: 把 Delivery Chain Report 接入现有输出，不改 stream protocol / reducer。

- [x] T036-033 调研现有 assistant message / text artifact 表达能力，选择不改协议的 report 承载方式。
- [x] T036-034 接入 report output，确保 report 声明“不写代码、不修改文件”。
- [x] T036-035 如果 `delivery_chain_report` kind 需要 stream / reducer schema 变更，放弃该 kind 并改用普通 markdown。
- [x] T036-036 [P] 增加 output tests，确认 report markdown 可展示且不暴露 raw provider error。

**Checkpoint**: Report 可展示，且没有新增 stream chunk 或 reducer state shape。

## Phase 6: Frontend demo UX

**目标**: 让用户能发现并触发 `/delivery-chain`，不做 UI 重构。

- [x] T036-037 在 slash command menu 新增 `/delivery-chain` 入口。
- [x] T036-038 在 quick access 中新增 Delivery Chain scenario 示例。
- [x] T036-039 评估 inline requirement quick access；为控制小屏入口密度，本版不新增单独快捷项。
- [x] T036-040 如果 resource picker 支持 command-aware view，在 `/delivery-chain` 场景只展示 `scenarios/*/requirement.md`。
- [x] T036-041 确认 picker 不展示 `plan.sample.md`、`tasks.sample.md`、`review.expected.md` 作为普通用户入口。
- [x] T036-042 确认 picker 不恢复真实 docs catalog。
- [x] T036-043 [P] 增加 slash command / quick access / picker focused tests。

**Checkpoint**: public demo 可发现 `/delivery-chain`，且 resource picker 不突破 demo boundary。

## Phase 7: Docs, tests and non-regression

**目标**: 回归验证当前版本没有影响既有 Tasklist Agent 和 runtime contracts。

- [x] T036-044 更新 README 当前能力说明和 `/delivery-chain` 示例。
- [x] T036-045 更新 `specs/README.md` 索引。
- [x] T036-046 运行 focused Delivery Chain tests。
- [x] T036-047 运行 existing Tasklist Agent route / resolver focused tests。
- [x] T036-048 运行 `pnpm --dir apps/webapp typecheck` 等价验证。
- [x] T036-049 运行 `pnpm --dir apps/webapp lint` 等价验证。
- [x] T036-050 运行 `git diff --check`。
- [x] T036-051 人工检查 diff 未修改 Graph topology、HITL contract、stream protocol、frontend reducer、Prisma schema、PostgresSaver schema。

**Checkpoint**: v0.3.6 可以进入 converge。

## Phase 8: Converge / release close

**目标**: 实现完成后做 Spec Kit 收口。

- [x] T036-052 执行 `speckit-converge` 或人工等价收口，确认 spec / plan / tasks / acceptance / decisions 与真实 diff 一致。
- [x] T036-053 同步 `docs/versions/v0.3.6-controlled-delivery-chain-mvp.md`。
- [x] T036-054 同步 `docs/releases/v0.3.6.md`。
- [x] T036-055 同步 `docs/tasklists/v0.3.6-tasklist.md`。
- [x] T036-056 更新 package version 至 `0.3.6`。
- [x] T036-057 最终记录测试、未执行验证和人工补验项。

## Phase 9: Delivery Chain presentation closeout

**目标**: 只在 `/delivery-chain` 场景下降低内部 demo resource 的展示噪音，不改 stream / reducer / resolver。

- [x] T036-058 将 `/delivery-chain` assistant message 中内部自动读取的 demo resources 聚合为 compact summary，避免连续展开多个大 ResourcePanel。
- [x] T036-059 将显式入口 `requirement.md` 调整为 lightweight visible display，并保持 `/tasklist` 与普通 resource panel 展示不受影响。
- [x] T036-060 [P] 增加 delivery-chain message rendering focused tests，并重跑 typecheck / lint / git diff --check。

## Phase 10: LangGraph workflow correction

**目标**: 将 v0.3.6 `/delivery-chain` 从手写 sequential workflow 收口为 LangGraph-controlled sequential workflow，不扩大版本边界。

- [x] T036-061 修正 `spec.md`、`plan.md`、`decisions.md`、`acceptance.md`、`tasks.md`，统一内部实现口径为 LangGraph-controlled sequential workflow。
- [x] T036-062 同步 `data-model.md`、`contracts/delivery-chain-runtime.md`、roadmap 和 ADR，补齐 `DeliveryChainGraphState` 与 graph boundary 文档。
- [x] T036-063 在 `apps/webapp/lib/ai/runtime/delivery-chain/**` 中新增 `DeliveryChainGraph`，使用 LangGraph `StateGraph` 编译固定顺序 workflow。
- [x] T036-064 保留 `resolveDeliveryChainInvocation()` 在 graph 外处理 entry / boundary / fail-closed，graph 只接收归一化输入。
- [x] T036-065 将 `loadDeliveryChainContext`、`runPlanStage`、`runTaskStage`、`runReviewStage`、`buildDeliveryChainReport` 迁移为 graph nodes。
- [x] T036-066 保留现有 prompt builders 与 `invokeStageMarkdown()`，移除 `startDeliveryChainRun()` 中手写 Plan / Task / Review 连续 await 主流程。
- [x] T036-067 明确禁止接入 PostgresSaver、checkpoint、interrupt、HITL、resume 和 `@artifact://`。
- [x] T036-068 [P] 增加 DeliveryChainGraph happy path、node order、node contract、soft fail tests。
- [x] T036-069 [P] 增加 no-checkpointer / no-interrupt / no-HITL focused regression tests。
- [x] T036-070 [P] 重跑 `/tasklist` focused regression 与 delivery-chain resource display compact grouping regression。
- [x] T036-071 运行 `pnpm --dir apps/webapp test` 中相关 focused suites、`typecheck`、`lint`、`git diff --check`，并记录人工收口结论。

**Checkpoint**: `/delivery-chain` 已完成 graph 化，但仍保持 v0.3.6 的 no-checkpoint / no-HITL / no-multi-agent 边界。

## Minimum validation record

本轮 correction 实施完成后在这里记录:

- [x] route / parser / resource boundary targeted tests
- [x] orchestrator / stage / report targeted tests
- [x] delivery-chain message rendering targeted tests
- [x] picker / quick access targeted tests
- [x] existing Tasklist Agent non-regression tests
- [x] `/tasklist + @demo://version-plans/*.md` long-history input-length regression test
- [x] DeliveryChainGraph happy path / node order / soft fail tests
- [x] no PostgresSaver / no checkpoint / no interrupt / no HITL regression
- [x] `pnpm --dir apps/webapp typecheck` 等价验证
- [x] `pnpm --dir apps/webapp lint` 等价验证
- [x] `git diff --check`
- [x] manual diff check: no Graph topology, HITL decision contract, stream protocol, frontend reducer, Prisma schema, PostgresSaver schema changes

人工收口结论：

- 本轮 diff 收口在 `specs/036-controlled-delivery-chain-mvp/`、`docs/architecture/agent-runtime-roadmap.md`、`docs/adr/0010-controlled-delivery-chain-and-artifact-handoff-roadmap.md`、`apps/webapp/lib/ai/runtime/delivery-chain/**` 及其 focused tests。
- 未发现需要追加到 v0.3.6 的新任务；stage trace presentation、artifact handoff、checkpoint/HITL-aware multi-agent 仍后置到 v0.3.7-v0.4.x。
