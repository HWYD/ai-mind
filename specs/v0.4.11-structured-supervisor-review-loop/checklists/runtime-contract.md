# Runtime Contract Checklist: Structured Supervisor Review Loop

**Purpose**: 用于方案 / Spec 评审，检查 v0.4.11 的 Runtime Contract、Supervisor 决策、固定 Review Group 与一次返修闭环的需求是否完整、清晰、一致且可客观验收。
**Created**: 2026-07-28
**Feature**: [Structured Supervisor Review Loop](../spec.md)

**Scope**: 需求质量审查，不是实现测试清单。重点覆盖强类型 Contract、Runtime authority、Review 完整性、failure/status 规则和反馈闭环；显式记录潜在缺口与跨文档冲突。

## Requirement Completeness

- [x] CHK001 是否为 Supervisor 执行前的 `execute`、`clarification_required`、`blocked` 三个分支分别定义了必填字段、禁止字段和可行动的用户下一步？[Completeness, Spec §User Story 1; Data Model §Supervisor Contracts]
- [x] CHK002 是否完整定义了 Supervisor 评审后 `finalize`、`revise`、`blocked` 三个 action 的输入、允许的 finding 引用范围和禁止的状态覆盖行为？[Completeness, Spec §User Story 4; Data Model §SupervisorPostReviewDecisionDraft]
- [x] CHK003 是否明确所有会影响调度、状态、风险、边界或返修的 Agent 输出均有角色专属 Contract，而非遗留在自由 `metadata` 或 Markdown 中？[Completeness, Spec §Goals; Plan §Phase 1]
- [x] CHK004 是否为 Plan 和 Tasks 的最小结构化摘要完整定义 requirement reference、依赖、验收条件、artifact identity 与 revision 的关系？[Completeness, Spec §User Story 2; Data Model §Artifact Contracts]
- [x] CHK005 是否为 General、Risk、Boundary 三类 Reviewer 分别定义了唯一的机器结论字段，以及 finding 的 target、required/advisory、证据和建议动作？[Completeness, Spec §User Story 2; Data Model §Role-specific Results]
- [x] CHK006 是否完整规定 Runtime-owned ID（`dispatchPlanId`、artifact ID、`cycleId`、`findingId`）的创建时机、不可变性、作用域和 Agent 越权时的收口？[Completeness, Spec §Edge Cases; Data Model §SupervisorDispatchPlan]
- [x] CHK007 是否明确 Contract 的数组、文本和嵌套层级应有哪些可度量的大小上限，以避免 prompt、repair feedback 和单次 run 的无界增长？[Gap, Non-Functional Requirements]
- [x] CHK008 是否完整定义了“安全失败摘要”在 pre-decision、Worker failure、partial review、all-review failure、post-review failure 中应保留的事实字段与应隐藏的字段？[Completeness, Spec §User Story 5; Data Model §DeliveryChainReport]

## Requirement Clarity

- [x] CHK009 “输入缺少会显著改变交付方案的关键信息”是否给出了可判定的最小标准或示例边界，避免 `clarification_required` 与 `execute` 的判定完全依赖隐式主观性？[Ambiguity, Spec §User Story 1]
- [x] CHK010 “允许的执行分支”和“阶段 focus”是否明确其可表达范围、长度限制及与固定拓扑的关系？[Clarity, Spec §Summary; Data Model §SupervisorPreDecisionDraft]
- [x] CHK011 `required` 与 `advisory` finding 的分类标准是否明确，尤其是何种 finding 必须进入返修或影响最终状态？[Ambiguity, Data Model §ReviewFindingDraft; Spec §User Story 4]
- [x] CHK012 “hard blocker”是否明确映射到 General `blocked`、Risk `blocker`、Boundary `blocked` 以及 finding 的 severity/requirement 字段，避免同一问题存在两种不一致的判定入口？[Clarity, Spec §Hard Decision Rules; Plan §Failure Precedence]
- [x] CHK013 “同一版 Plan 和 Tasks”是否以 artifact ID 与 revision 的可比较规则定义，而不只依赖自然语言描述？[Clarity, Spec §User Story 3; Data Model §ReviewBundle]
- [x] CHK014 Contract repair 的“安全字段级摘要”是否明确允许的字段、最大条数、长度、脱敏规则和不应包含的内容？[Clarity, Spec §User Story 2; Contracts §Agent Contracts]
- [x] CHK015 “Runtime 校验通过后可执行”是否明确区分 schema 校验、policy 校验和 Worker execution 三类失败，并为每类定义一致的用户可见措辞？[Clarity, Spec §Goals; Plan §Failure Precedence]
- [x] CHK016 固定 Contract model 的 `jsonOutput` / structured-output 能力、检测时机和不满足时的用户提示，以及用户业务模型不应被该能力 gate 拒绝的边界，是否写入可验收需求？[Gap, Plan §Technical Context]

## Requirement Consistency and Conflict Detection

- [x] CHK017 Spec 中的 blocked 硬规则与“post-review Supervisor repair 后仍失败即 `failed`”是否有明确优先级说明，并与状态矩阵保持一致？[Conflict, Spec §Hard Decision Rules; Spec §User Story 4; Plan §Failure Precedence]
- [x] CHK018 Plan-only 返修保留 Tasks v1 时，是否明确以人工确认替代自动对齐或复评结论？[Conflict, Spec §Edge Cases; Data Model §TaskArtifact]
- [x] CHK019 首次 Review 是否使用 exact-set、同版产物、partial failure 和 hard-blocker 规则，且返修后明确不启动第二个 Review Group？[Consistency, Spec §User Story 3; Spec §User Story 4]
- [x] CHK020 `finalize`、`revise` 作为 Supervisor action 与六种 `RunStatus` 的职责边界是否在 spec、data model 和报告需求中一致表达？[Consistency, Data Model §Canonical RunStatus; Contracts §Workflow Contract]
- [x] CHK021 “未知字段整体拒绝”的 strict Contract 规则是否与“允许自由 Markdown 叙述”的边界一致，且未要求 Markdown 同时承担未声明控制字段？[Consistency, Spec §User Story 2; Spec §Non-goals]
- [x] CHK022 保留现有 `toolCalling` 模型筛选门槛、同时改用 structured Supervisor output 的兼容性理由和后续放宽边界是否已形成明确需求决策？[Ambiguity, Plan §Technical Context; Research §Decision 12]

## Scenario and Edge-case Coverage

- [x] CHK023 是否分别规定 Supervisor pre-decision、Plan、Tasks、单个 Reviewer、Supervisor post-decision 与 Revision Worker 在两次 Contract failure 后的状态、保留信息和后续禁止动作？[Coverage, Spec §Edge Cases; Contracts §Agent Contracts]
- [x] CHK024 是否明确 Reviewer 集合缺失、重复、额外、未知角色四种非法情形都在 invocation、progress、trace 与任何 Reviewer 启动之前停止？[Coverage, Spec §User Story 3; Contracts §Workflow Contract]
- [x] CHK025 是否覆盖合法 Review 调度后，contract failure、timeout、execution failure 三类 Reviewer failure 在 coverage、报告和 status 上的差异？[Coverage, Data Model §ReviewCoverage; Spec §User Story 3]
- [x] CHK026 是否明确 Review finding 的 cross-run、cross-cycle、unknown ID、重复引用、target 不兼容及同一 finding 被多个 RevisionRequest 引用时的要求？[Coverage, Spec §Edge Cases; Data Model §RevisionRequestDraft]
- [x] CHK027 是否明确初次 Review 有 blocker 时，Supervisor `revise`、`finalize`、`blocked` 各自允许或禁止的路径，避免 Runtime 与 Supervisor 对安全停止的责任分歧？[Coverage, Spec §User Story 4; Data Model §SupervisorPostReviewDecisionDraft]
- [x] CHK028 是否完整覆盖 Plan-only、Tasks-only、both、无返修、返修后未收敛、返修阶段失败及试图第二次返修这些互斥场景？[Coverage, Spec §User Story 4; Contracts §Workflow Contract]
- [x] CHK029 是否明确返修后不产生 resolved/unresolved 或新 finding，并且不得将成功返修标记为 `pass`？[Coverage, Data Model §RevisionOutcome; Spec §User Story 4]
- [x] CHK030 是否规定 Markdown 与结构化结论冲突时，报告需要如何标示冲突、是否影响用户下一步建议，以及哪些冲突只应内部记录？[Gap, Spec §User Story 2; Data Model §DeliveryChainReport]

## Non-functional and Safety Requirements

- [x] CHK031 是否对每个 Agent 阶段、每轮 Review 和整个 run 的 timeout、取消、资源/调用预算给出可度量的要求，而不是仅描述“最多一次返修”？[Gap, Non-Functional Requirements; Plan §Phase 2]
- [x] CHK032 是否明确 Contract repair 与 provider transport retry 的独立计量、上限、可见性和成本归属，避免两种重试被混为同一预算？[Completeness, Plan §Phase 1; Contracts §Agent Contracts]
- [x] CHK033 是否定义了并行 Reviewer 共享同一 immutable artifact snapshot 的一致性要求，包括 snapshot 创建时点和返修期间不可变性？[Clarity, Data Model §ReviewBundle; Contracts §Workflow Contract]
- [x] CHK034 是否明确 user-visible progress 对 `clarification_required`、`needs_changes`、`needs_review`、`blocked`、`failed` 的展示/完成语义，尤其是内部六状态映射到现有 public progress channel 的规则？[Completeness, Spec §User Story 5; Plan §Phase 6]
- [x] CHK035 是否明确 safe repair summary、progress 和 report 对 raw prompt、raw response、invalid value、provider config、stack、secret 与内部路径的统一禁止策略？[Completeness, Spec §Non-goals; Data Model §DeliveryChainReport]

## Dependencies and Assumptions

- [x] CHK036 是否记录并验证固定 Contract model 的 structured output 支持、错误语义和能力声明一致性，以及用户业务模型与 Contract model 的路由边界？[Assumption, Plan §Technical Context]
- [x] CHK037 是否明确现有 shared tool executor、resource allowlist、workflow progress 组件在“Runtime 根据结构化计划直接构造 Worker invocation”后仍需保持的边界和兼容职责？[Completeness, Plan §Architecture Decision; Spec §Compatibility and Scope]
- [x] CHK038 是否明确无需新增持久化的前提：单次 run 结束后 dispatch plan、artifact revision、finding lineage 与 evaluation evidence 的保留/丢弃语义？[Assumption, Spec §Assumptions; Data Model §Modeling Principles]
- [x] CHK039 是否明确 ADR-0012、roadmap、公开版本文档与实现收口之间的同步触发条件，避免文档在实现前或实现后漂移？[Traceability, Plan §Phase 6; Constitution §9]

## Acceptance Criteria Quality

- [x] CHK040 Contract 严格性、exact-set gate、状态优先级、一次 repair、一次 Revision 和一次 Review 的验收标准是否均可由确定性断言客观判定？[Measurability, Spec §Success Criteria; Plan §Validation Strategy]
- [x] CHK041 对 Supervisor 决策质量的“至少 90% 与人工标注一致”是否定义了标注规范、样本冻结时点、评审者分歧处理与置信区间/重复次数？[Gap, Spec §SC-007; Contracts §Evaluation Contract]
- [x] CHK042 Revision 追踪评测的分母、首次 finding 引用、artifact revision 2 判定与不评估新 blocker 的边界是否明确？[Measurability, Spec §SC-005; Contracts §Evaluation Contract]
- [x] CHK043 三 baseline 的质量—成本比较是否明确模型参数、并发、超时、token 统计口径、评分者盲测和结果报告格式，使架构收益可重复评估？[Measurability, Spec §FR-061–065; Contracts §Evaluation Contract]

## Notes

- 勾选项表示“需求已被充分写清”，不是“代码已实现”。
- 对标记为 `[Gap]`、`[Ambiguity]`、`[Conflict]`、`[Assumption]` 的项，建议在进入 `/speckit-tasks` 前记录处理结论或回写相应 spec/plan。
- 可在每一项后追加评审结论和引用位置。

## Review Result — 2026-07-28

本轮逐项复核已完成。为保留本 checklist 作为后续版本可复用的需求审查题库，原始问题保持未勾选；本节记录当前 feature 的已处理结论。

| Checklist items | Review result | Resolution source                                                                                                        |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CHK001–CHK006   | 已覆盖        | `spec.md` Checklist Resolutions；`data-model.md` Supervisor / Artifact / Review Contracts                                |
| CHK007–CHK008   | 已补齐        | 明确 Contract bounds、repair issue limit 与 safe failure summary fields                                                  |
| CHK009–CHK016   | 已补齐        | 明确输入充分性、required/advisory、hard blocker、snapshot、repair taxonomy 与 structured-output capability               |
| CHK017–CHK022   | 已消除冲突    | 执行完整性 `failed` 优先；Plan-only Revision 的 `planTaskAlignment`；保留 toolCalling gate 的范围                        |
| CHK023–CHK030   | 已补齐        | 统一一次 Review、一次受控返修后直接收口的 policy、failure classes、Revision scope、finding lineage 与 conflict note 规则 |
| CHK031–CHK039   | 已补齐        | stage timeout、12-stage/24-invocation budget、abort、progress mapping、retention、catalog capability 与 docs trigger     |
| CHK040–CHK043   | 已补齐        | deterministic acceptance、8-case × 3 evaluation、双评审+裁决、70% 分母与质量—成本报告口径                                |

**Status**: CHK001–CHK043 在当前 spec 资产层面均已处理；后续实现阶段仍须按 `tasks.md` 的测试和代码任务验证这些要求没有漂移。
