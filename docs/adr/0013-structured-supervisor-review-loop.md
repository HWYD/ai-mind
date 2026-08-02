# ADR-0013: Structured Supervisor Review Loop

日期：2026-07-29

## 决策

`/delivery-chain` 使用受 Runtime 硬边界约束的结构化 Supervisor 工作流：

- 每次 run 只创建一个 `SupervisorDispatchPlan`；Supervisor 先给出 pre-decision，再在完整 Review 后给出 finalize、revise 或 blocked 决策。
- Supervisor、Plan、Tasks 和固定 General/Risk/Boundary Review Group 的业务判断由用户选择的模型生成；每个判断由固定的 `deepseek/deepseek-v4-pro` 进行 role-specific strict Contract 编码，且每个 Contract 最多一次安全 repair。
- Runtime 拥有 dispatch plan ID、artifact ID、revision、review cycle 和 finding ID；Markdown 只用于展示，不能参与状态、风险、边界、依赖或返修判断。
- Report 以 typed Plan/Tasks fields 确定性投影用户可读的范围、阶段、验收与任务依赖；Worker Markdown 仅补充叙事，不能因为短标题而丢失已验证的交付事实。Plan、Task、Review 分别消费其受控 rubric。
- Review finding 区分 `issue` 与 `observation`；只有 `issue + required` 是可返修问题并影响 canonical status，正向 observation 只作为用户可见的评审证据。
- Review Group 必须且只能启动 `general`、`risk`、`boundary` 各一次。Runtime 在任何 Reviewer 启动前验证集合，并以 typed coverage 计算 canonical `RunStatus`。
- 返修只允许一次：Supervisor 的 RevisionRequest 必须精确引用首次 Review finding，并且目标不得扩大；Plan 先于 Tasks 更新后直接生成报告。返修成功以内部 `needs_review` 收口，保留来源和 artifact revision 追踪，但不执行 Re-review 或输出 resolved/unresolved。
- 继续使用既有 `workflow-progress-*` stream family 和 run-local artifacts；不引入公开协议变更、GraphState、持久化、checkpoint/resume 或开放 Agent Catalog。

## 后果

Runtime 不再依赖 Manager tool-calling、Review Markdown regex 或开放 metadata 来决定业务结果。固定 Contract 模型不可用或 Contract 在一次 repair 后仍不合法时，run 安全失败并输出不含原始模型内容的报告。

成本是每个业务阶段额外进行一次 Contract 调用；评测记录业务模型调用、Contract 调用、repair 调用和耗时，以便与单 Agent 和旧固定多 Agent baseline 比较。
