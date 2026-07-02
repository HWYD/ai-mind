# Tasks 041: Parallel Review Subagents + Manager Synthesis

状态: Completed
版本: v0.4.1
日期: 2026-07-02

## Phase 1: Spec / decisions / acceptance

- [ ] T001: 完成 spec.md（已重写为正式 spec 文档）
- [ ] T002: 完成 decisions.md（记录 D041-001 ~ D041-010）
- [ ] T003: 完成 plan.md（Phase 1-7 实现路径）
- [ ] T004: 完成 tasks.md（本文件）
- [ ] T005: 完成 acceptance.md（验收门禁）

## Phase 2: Contract and schema

- [x] T010: 扩展 `subagentToolIds` 新增 `'risk-subagent'`、`'boundary-subagent'`（`subagent-tool-schemas.ts`）
- [x] T011: 新增 `ReviewBundle` 接口定义（`types.ts`）
- [x] T012: 扩展 `DELIVERY_CHAIN_SUBAGENT_DEFINITIONS` 新增 risk/boundary 条目（`subagent-tools.ts`）
- [x] T013: 扩展 `getDefaultArtifactTitle` 新增 risk/boundary 默认标题（`subagent-tools.ts`）
- [x] T014: 新增 contract tests 验证扩展后的 schema 和类型（`delivery-chain-manager-contract.test.ts`）

## Phase 3: Risk / Boundary subagent tools

- [x] T020: 新增 `createRiskSubagentExecutor(model)` 函数（`subagent-tools.ts`）
    - SystemMessage: 风险评审专家
    - 输出 markdown 含 severity 等级和缓解建议
    - metadata.reviewType = 'risk', metadata.severity = 'high'|'medium'|'low'
    - 前置检查：需含 plan + tasks artifacts
- [x] T021: 新增 `createBoundarySubagentExecutor(model)` 函数（`subagent-tools.ts`）
    - SystemMessage: 边界检查专家
    - 输出 markdown 含 boundaryStatus
    - metadata.reviewType = 'boundary', metadata.boundaryStatus = 'passed'|'needs_review'|'blocked'
    - blocked 时 metadata.blocked = true, status = 'blocked'
    - 前置检查：需含 plan + tasks artifacts
- [x] T022: 扩展 `createDeliveryChainSubagentTools` 绑定 risk/boundary executors（`subagent-tools.ts`）
- [x] T023: 扩展 `createSubagentResultArtifacts` 处理 risk/boundary result（`runtime-artifacts.ts`）
    - risk-subagent completed → kind: 'review' + metadata.reviewType: 'risk'
    - boundary-subagent completed/blocked → kind: 'review' + metadata.reviewType: 'boundary'

## Phase 4: Parallel Review Group policy and manager loop

- [x] T030: 新增 `ReviewGroupPolicy` 接口（`delegation-policy.ts`）
    - allowedReviewTools: SubagentToolId[]
    - allowParallelInReview: boolean
    - maxReviewToolCalls: number
- [x] T031: 新增 `deliveryChainReviewGroupPolicy` 实例（`delegation-policy.ts`）
    - allowedReviewTools: ['review-subagent', 'risk-subagent', 'boundary-subagent']
    - allowParallelInReview: true
    - maxReviewToolCalls: 3
- [x] T032: 扩展 `validateToolCallBatch` 支持 phase 上下文（`delegation-policy.ts`）
    - 新增 phase 参数
    - Review phase 允许 count > 1（上限 maxReviewToolCalls）
    - Plan/Task phase 保持 count === 1
- [x] T033: 扩展 `validateDelegationToolCall` 支持 Review phase（`delegation-policy.ts`）
    - Review phase 允许多个 review-class tool
    - Review phase 拒绝 plan/task tool
    - Review phase 拒绝未注册 tool
    - Review phase 拒绝 nested delegation
- [x] T034: 更新 `deliveryChainDelegationPolicy.maxToolCalls` 从 3 改为 5（`delegation-policy.ts`）
- [x] T035: 改造 `CONTROLLED_SUBAGENT_ORDER` 为 phase 结构（`controlled-delivery-manager.ts`）
    - 定义 plan phase / task phase / review-group phase
- [x] T036: 改造主循环为 phase-aware（`controlled-delivery-manager.ts`）
    - Plan phase：串行（保持 v0.4.0 逻辑）
    - Task phase：串行（保持 v0.4.0 逻辑）
    - Review phase：构造 manager messages 指定 3 个 review-class tools，invoke 后解析多个 tool calls
- [x] T037: 实现 Review phase 并行执行（`controlled-delivery-manager.ts`）
    - Promise.all 并行 executeToolCall
    - 每个 executeToolCall 传 runtimeScope: 'delivery-chain-manager'
    - 解析每个 tool call 的 result
- [x] T038: 实现 Partial failure 处理（`controlled-delivery-manager.ts`）
    - 1-2 个 failed：标记 failedReviews，继续 synthesis
    - 3 个全 failed：fail closed
    - 未返回的 tool call 标记为 failed

## Phase 5: ReviewBundle and Manager synthesis

- [x] T040: 实现 `synthesizeReviewBundle` 函数（`report-synthesis.ts`）
    - 规则优先：blocked 判断、冲突合并、风险排序、缺失检查
    - LLM 润色：调用 invokeMarkdown 生成最终报告
    - LLM 失败降级：降级为纯规则生成的模板报告
- [x] T041: 实现 synthesis 规则（`report-synthesis.ts`）
    - 规则 1: boundary blocked → final = blocked
    - 规则 2: boundary failed → final ≥ needs_review
    - 规则 3: review failed → final = needs_review
    - 规则 4: risk high → report 包含 high risk section
    - 规则 5: risk failed → report 标注 risk missing
    - 规则 6: 相同问题合并
    - 规则 7: 冲突意见标注
- [x] T042: 修改 `buildDeliveryManagerReport` 接收 ReviewBundle（`report-synthesis.ts`）
- [x] T043: 修改 `buildDeliveryManagerFailureReport` 适配新场景（`report-synthesis.ts`）
- [x] T044: 在 Review phase 结束后构造 ReviewBundle 并调用 synthesizeReviewBundle（`controlled-delivery-manager.ts`）

## Phase 6: Workflow progress and regression tests

- [x] T050: 新增 `'delegate-review-group'` 到 `DeliveryManagerProgressStepId`，移除旧 `'delegate-review'`（`workflow-progress.ts`）。同步更新 v0.4.0 测试中 step 序列断言。
- [x] T051: 新增 `REVIEW_GROUP_STEP_DEFINITION`（`workflow-progress.ts`）
- [x] T052: 扩展 `mapManagerProgressEvent` 新增 `delegate-review-group` 映射（`index.ts`）
- [x] T060: 新增测试：plan → task → review group happy path（`delivery-chain-manager-run.test.ts`）
- [x] T061: 新增测试：review group parallel calls 仅在 task completed 后才接受
- [x] T062: 新增测试：parallel before task completed 必须 fail closed
- [x] T063: 新增测试：review group 内出现未注册 tool 必须 fail closed
- [x] T064: 新增测试：nested delegation 仍然 fail closed
- [x] T065: 新增测试：review group 不能调用 plan/task tool
- [x] T066: 新增测试：risk metadata.reviewType = 'risk'
- [x] T067: 新增测试：boundary metadata.reviewType = 'boundary'
- [x] T068: 新增测试：failed risk-subagent 不生成正式 RuntimeArtifact
- [x] T069: 新增测试：boundary blocked 强制 final report blocked
- [x] T070: 新增测试：risk failed 在 final report 中标记 missing
- [x] T071: 新增测试：1 个 review failed synthesis 继续
- [x] T072: 新增测试：2 个 review failed synthesis 继续
- [x] T073: 新增测试：3 个 review 全部 failed fail closed
- [x] T074: 新增测试：ReviewBundle 构造正确
- [x] T075: 新增测试：Manager synthesis 不是 raw concatenation
- [x] T076: 新增测试：Manager synthesis 处理冲突结果
- [x] T077: 新增测试：workflow progress 展示 delegate-review-group step（`delivery-chain.test.ts`）
- [x] T078: 新增测试：progress 不包含 raw invocation / raw result / RuntimeArtifact
- [x] T079: 回归测试：stream schema 非退化（`stream-chunk-schema.test.ts`）
- [x] T080: 回归测试：frontend reducer 非退化（`stream-message-reducer.test.ts`）
- [x] T081: 回归测试：assistant message workflow progress 非退化（`assistant-message.test.tsx`）
- [x] T082: 回归测试：/tasklist 非退化（`chat-orchestrator.test.ts`）
- [x] T083: 回归测试：@demo:// boundary 非退化（`chat-orchestrator.test.ts`）
- [x] T084: 验证：typecheck / lint / build 全通过

## Phase 7: Release close

- [x] T090: 新增 `docs/releases/v0.4.1.md` release notes
- [x] T091: 新增 `docs/versions/v0.4.1.md` 版本说明
- [x] T092: 检查 `README.md` 是否需要更新
- [x] T093: 更新 `docs/architecture/agent-runtime-roadmap.md` roadmap
- [x] T094: speckit-converge 人工等价检查
- [x] T095: 同步 package version（如适用）
