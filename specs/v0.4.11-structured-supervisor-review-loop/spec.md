# Feature Specification: Structured Supervisor Review Loop

**Feature Branch**: `[0411-multi-agent]`

**Created**: 2026-07-28

**Status**: Draft

**Version**: v0.4.11

**Change Level**: Level C - Controlled Multi-Agent Runtime Evolution

**Input**: User description: "保留正式实现建议：强类型 Agent Contract、真实但受控的 Supervisor 决策、固定且完整的 Review Group、一次协作返修与完整复审；本版本不纳入 ReAct 学习 Step。"

## Summary

v0.4.11 将 `/delivery-chain` 从“固定阶段外包裹模型工具调用”的受控多 Agent workflow，推进为具备有限真实决策能力的 `ControlledDeliverySupervisor`。

本版本保留稳定的交付链主顺序：

```text
Supervisor Decision
-> Plan
-> Tasks
-> General / Risk / Boundary Review Group
-> Review Decision
-> Optional One Revision
-> Delivery Chain Report
```

Supervisor 只在开放问题上做决定，包括判断输入是否足够、明确本轮规划与评审重点、选择允许的执行分支，并在 Review 后提供面向人的返修说明。每个 run 只有一个逻辑上的 `SupervisorDispatchPlan`：它先记录执行前决策，在 Review 后继续记录 Runtime 派生的动作、返修目标与可选说明，并始终保留同一 run 内稳定的计划身份。该计划只有通过 runtime policy 校验后才能驱动对应阶段执行。Plan、Tasks 和三个强制 Reviewer 的流程完整性、权限边界、最大返修次数、返修目标和 blocked 硬规则仍由 runtime policy 保证，Supervisor 不得跳过或覆盖。

所有会影响调度、风险等级、边界结论、返修目标和最终状态的 Agent 输出，必须使用严格、可验证、角色专属的结构化 Contract。Markdown 继续作为面向用户的叙述与展示格式，但不得继续作为业务结论的机器事实源。

本版本不引入 ReAct Worker、通用 DAG scheduler、Agent Catalog、A2A、HITL、checkpoint、artifact persistence 或 LLM 最终润色。

## Clarifications

### Session 2026-07-28

- Q: Supervisor 返回的结构化调度计划，对 Runtime 应具有什么效力？ → A: 执行前分支与重点校验后可执行；评审后返修目标由 Runtime 从已验证 finding 派生，Supervisor 只补充说明，不能改变强制阶段、依赖关系及安全边界。
- Q: 一至两个必选 Reviewer 执行失败时，最终状态如何确定？ → A: 有效结果包含硬 blocker 时为 `blocked`；否则统一为 `needs_review`，绝不为 `pass`。
- Q: `ReviewFinding` 在 Review 和 Revision 之间如何保持身份与追踪？ → A: Runtime 为通过校验的 finding 分配稳定唯一的 `findingId`；`RevisionRequest` 必须引用该标识，返修结束后不生成复评 resolution。
- Q: 结构化调度计划中的 Review Group 集合由谁声明，非法集合如何处理？ → A: Supervisor 声明 Reviewer 集合；Runtime 严格校验其必须恰好等于 General、Risk、Boundary，非法时拒绝整次 Review 调度。
- Q: Reviewer 集合合法，但三个 Reviewer 全部执行失败时，最终状态是什么？ → A: 最终状态为 `failed`；生成安全失败摘要，不冒充业务结论。

### Session 2026-07-28

- Q: Agent Contract 出现 schema 未声明的额外字段时，Runtime 如何处理？ → A: 拒绝整个 Agent 结果，记录为 `contract failure`。
- Q: `SupervisorDispatchPlan` 的稳定身份由谁产生？ → A: Runtime 在首次 Contract 校验通过后分配不可变的 `dispatchPlanId`；Supervisor 不能指定或替换。
- Q: Agent 输出未通过 Contract 校验时，是否允许自动修复重试？ → A: 每个 Agent 阶段最多进行一次 Contract repair retry；只反馈安全的字段级校验摘要，第二次失败后按阶段失败规则收口。
- Q: 多个 Reviewer 指向相同或相关问题时，由谁合并 RevisionRequest？ → A: Runtime 仅依据已验证的 `issue + required` finding、其 `targetArtifacts` 和固定目标顺序派生 RevisionRequest；Supervisor 只提供面向人的返修说明，不再复制 `findingId`、分组或计算目标集合。
- Q: 初次 Review 已完成，但 Supervisor 的评审后说明在 repair retry 后仍未通过 Contract，如何收口？ → A: Runtime 保留一条安全警告，并继续依据已验证的 ReviewBundle 派生动作、返修范围和来源追踪；不得暴露原始模型输出、错误或 prompt。

### Session 2026-07-29

- Q: 哪个模型负责 Delivery Chain 的结构化输出？ → A: 仅 role-specific Contract 的结构化输出与唯一 repair 固定使用 `deepseek/deepseek-v4-pro`；Supervisor、Plan、Tasks、Reviewer 和 Revision 的业务生成仍使用用户选定的模型。该模型路由不改变固定拓扑、角色权限、Runtime policy 或 Review Group。
- Q: 用户可见报告如何避免只显示 Worker 的短标题，同时保持不引入最终 LLM 润色？ → A: Report 必须确定性投影已验证的 Plan scope、phases、acceptance criteria、Tasks、dependencies 与 task acceptance criteria；Worker Markdown 只作为可选补充说明，不能是详细交付内容的唯一来源。Plan、Task 和 Review Worker 必须消费各自已加载的 rubric。
- Q: Reviewer 对“已符合要求”的正向证据应如何表达？ → A: `ReviewFinding` 明确区分 `issue` 与 `observation`；只有 `issue + required` 是可返修的待处理问题并影响 `needs_changes`，正向 observation 只进入评审观察，不得生成 RevisionRequest 或未解决事项。

### Session 2026-07-30

- Q: v0.4.11 快速入门使用什么公开演示案例？ → A: 使用 `register-login` 注册与登录流程案例，替换原快速入口展示的额度提醒案例；仅替换 demo requirement/context、公开 manifest 和入口文案，不改变 Delivery Chain Runtime，也不实现真实认证功能。
- Q: 最终交付报告是否需要先说明用户需求？ → A: 需要在报告引导语之后、交付结论之前确定性展示简短的“需求摘要”，从已读取的 Requirement 提取用户目标、本轮重点和明确不包含事项；不新增模型调用，不输出原始模型内容或敏感运行时数据。

## Goals

- 让 Supervisor 在受控边界内做有限但真实的执行前和评审后决策。
- 让 Supervisor 以结构化调度计划表达允许的执行分支和阶段重点，并在 runtime policy 校验通过后驱动执行；返修目标由 Runtime 从已验证 finding 派生。
- 保持每个 run 只有一个逻辑上的 Supervisor 调度计划，避免执行前决策和评审后决策形成两个相互竞争的事实源。
- 用严格结构化 Contract 表达 Supervisor 决策、General Review、Risk Review、Boundary Review、ReviewBundle 和 RevisionRequest。
- 移除从 Markdown 正文中提取 disposition、severity、boundaryStatus 等业务结论的行为。
- 保持 Plan -> Tasks 的依赖顺序，以及三个强制 Reviewer 的完整并行评审。
- 明确区分“非法或不完整调度”和“正确调度后的执行失败”。
- 让 Review findings 能够驱动 Plan、Tasks 或两者的一次受控返修。
- 返修完成后不执行 Re-review，直接以 `needs_review` 内部状态收口，报告引导人工确认。
- 保持最终安全结论由确定性硬规则约束，Supervisor 和报告表达都不得覆盖。
- 保持 `/delivery-chain` public surface、现有输入边界和安全摘要能力稳定。
- 建立可对比单 Agent、当前固定多 Agent 和 v0.4.11 反馈闭环的评测基线。

## Non-goals

v0.4.11 不做：

- 不做 ReAct、Reason-Act-Observe 循环或 Worker 自主工具探索。
- 不为 Plan、Tasks 或 Review Worker 新增文件搜索、源码读取或外部检索工具。
- 不做通用 DAG、任意依赖图、运行时动态拓扑或开放式 parallel group。
- 不让 Supervisor 决定是否跳过 General、Risk 或 Boundary Reviewer。
- 不让模型生成固定 Review Group 的三个工具调用作为流程完整性依据。
- 不做 Agent group chat、Swarm、peer handoff 或 subagent-to-subagent 自由通信。
- 不做 nested delegation。
- 不做全局 Agent Catalog、动态 Agent 注册、动态 Agent discovery 或用户可选 Agent。
- 不接入 A2A 或远程 Agent 协议。
- 不做多轮或无限 Evaluator-Optimizer 循环；最多返修一次。
- 不做 LLM 最终润色；最终报告继续由受控事实和确定性规则生成。
- 不把完整 Plan 和 Tasks 强制转换为纯结构化数据；长篇叙述仍可保留 Markdown。
- 不做 HITL、checkpoint、resume 或新的 AgentRun 状态机。
- 不做 RuntimeArtifact persistence、`@artifact://` 或数据库变更。
- 不新增 public command、public route 或用户可选的 subagent picker。
- 不修改 Tasklist Agent Graph、HITL、checkpoint、resume 或 AgentRun 边界。
- 不修改 stream protocol 的 public chunk union 或 frontend reducer public shape。
- 不把 raw prompt、raw reasoning、raw model response、provider config、stack 或敏感路径暴露给用户。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 受控 Supervisor 生成可信交付计划 (Priority: P1)

作为使用 `/delivery-chain` 的用户，我希望系统在生成交付计划前先判断输入是否足够，并明确本轮规划、任务拆解和评审重点，这样生成结果能针对当前需求，而不是机械重复固定提示。

**Why this priority**: 这是 Manager 从形式上的工具路由器升级为真实 Supervisor 的核心用户价值，同时必须保持受控边界。

**Independent Test**: 使用信息完整、信息不足和明确越界三类输入分别触发 `/delivery-chain`，验证系统能够稳定产生 `execute`、`clarification_required` 或 `blocked` 三类受控决策；对合法与非法的结构化调度计划分别验证校验后执行和执行前拒绝，并确认强制流程不会被跳过、权限不会被扩大。

**Acceptance Scenarios**:

1. **Given** 输入包含足够的需求、范围和验收信息，**When** 用户发起 `/delivery-chain`，**Then** Supervisor 选择继续执行，并通过结构化调度计划明确允许的执行分支、assumptions、planning focus、task focus 和 review focus。
2. **Given** 输入缺少会显著改变交付方案的关键信息，**When** 用户发起 `/delivery-chain`，**Then** Supervisor 返回 `clarification_required`，系统不继续生成看似完整但建立在关键猜测上的报告。
3. **Given** 输入要求突破本版本只读、无持久化或无新增 public surface 等边界，**When** Supervisor 评估该输入，**Then** 系统安全停止或明确标记 blocked，且不执行越界工作。
4. **Given** Supervisor 提出的决定试图跳过必选阶段或扩大 Agent 权限，**When** runtime policy 校验该决定，**Then** 非法部分被拒绝且不会进入执行。
5. **Given** Supervisor 返回的结构化调度计划选择了允许的分支且满足强制顺序、完整 Review Group 和返修次数约束，**When** runtime policy 校验通过，**Then** Runtime 按该计划驱动对应阶段执行。
6. **Given** 同一 run 已通过执行前调度并完成初次 Review，**When** Supervisor 产生评审后决策，**Then** 该决策记录在 Runtime 分配的同一个 `dispatchPlanId` 对应计划中，且执行前决策、计划身份和硬边界不会被替换或丢失。

---

### User Story 2 - 程序可靠理解各 Agent 的业务结论 (Priority: P1)

作为依赖交付计划结果的用户，我希望风险等级、边界结论、评审状态和返修要求不会因为 Agent 改变 Markdown 措辞而被系统误判。

**Why this priority**: 真实 Supervisor 和反馈闭环都依赖可靠的机器可读结果；如果业务结论仍从自然语言中猜测，动态协作会放大错误。

**Independent Test**: 为每类 Agent 提供合法、缺字段、非法枚举、额外未知字段和正文措辞变化的结果，验证只有满足角色专属 Contract 的结果能参与业务判断，Markdown 表达变化不会改变结构化结论。

**Acceptance Scenarios**:

1. **Given** Risk Reviewer 返回合法的高风险结构化结论，**When** 系统综合 ReviewBundle，**Then** 风险等级被准确识别，不依赖 Markdown 中是否出现固定关键词。
2. **Given** Boundary Reviewer 的 Markdown 使用不同标题或中文表达，**When** 其结构化 boundary status 保持不变，**Then** 最终边界判断保持一致。
3. **Given** 任一 Agent 缺少必填控制字段、返回未允许的枚举值或包含 schema 未声明字段，**When** 系统接收结果，**Then** 整个结果被标记为 contract failure，不能删除未知字段后继续，也不能静默降级为看似合法的业务结论。
4. **Given** Markdown 内容与结构化硬结论冲突，**When** 系统生成最终报告，**Then** 结构化硬结论优先，冲突被安全处理且 Markdown 不得覆盖事实源。
5. **Given** Plan 或 Tasks 正文使用自由 Markdown，**When** Runtime 校验依赖、评审定位或返修目标，**Then** 只使用对应产物的最小结构化摘要，不从正文重新猜测机器字段。
6. **Given** 某个 Agent 首次输出未通过 Contract 校验，**When** Runtime 启动该阶段唯一一次 repair retry，**Then** Agent 只获得安全的字段级错误摘要；修复结果通过完整 Contract 校验后才可继续，第二次仍失败则按该阶段失败规则收口。

---

### User Story 3 - 完整且不可绕过的并行 Review Group (Priority: P1)

作为查看交付计划的用户，我希望每一轮正式评审都同时覆盖方案质量、交付风险和项目边界，避免 Supervisor 因漏调、重复调用或错误调用导致评审不完整。

**Why this priority**: 三类 Reviewer 是本功能的固定安全与质量 Gate，必须与 Supervisor 的动态决策边界明确分离。

**Independent Test**: 验证首次 Review 的 Reviewer 集合恰好包含 General、Risk、Boundary 且各一次；覆盖缺失、重复、额外或未知 Reviewer 导致整次调度在执行前被拒绝，以及合法调度后的 Reviewer 执行失败场景。

**Acceptance Scenarios**:

1. **Given** Plan 和 Tasks 已完成，**When** 系统进入 Review，**Then** General、Risk、Boundary 三个 Reviewer 各执行一次，并消费同一版 Plan 和 Tasks。
2. **Given** Supervisor 声明的 Reviewer 集合缺少任一必选 Reviewer，**When** 系统进入 Review Gate，**Then** Runtime 拒绝整次 Review 调度，且不会静默补齐或启动部分 Reviewer。
3. **Given** Supervisor 声明的 Reviewer 集合包含重复、额外或未知角色，**When** Review policy 校验执行集合，**Then** Runtime 拒绝整次 Review 调度，且任何 Reviewer 结果都不会进入正式 ReviewBundle。
4. **Given** 三个 Reviewer 已被正确调度但其中一个或两个执行失败，**When** 系统综合结果，**Then** 报告明确标记缺失覆盖；有效结果包含硬 blocker 时 run status 为 `blocked`，否则为 `needs_review`，且绝不为 `pass`。
5. **Given** Reviewer 集合已通过严格校验，但三个 Reviewer 全部执行失败，**When** 系统尝试综合，**Then** 当前交付链以 `failed` 收口并输出安全失败摘要，不生成伪造的 ReviewBundle 或业务 `blocked` 结论。

---

### User Story 4 - Review 反馈驱动一次受控返修 (Priority: P2)

作为使用交付计划的用户，我希望 Reviewer 发现的必改问题能够真正推动 Plan、Tasks 或两者修订，并在修订后重新评审，而不是仅把问题附在最终报告中。

**Why this priority**: 这是从“并行生成多个评审文本”升级为“多个 Agent 通过产物和反馈协作”的关键能力。

**Independent Test**: 构造只需修改 Plan、只需修改 Tasks、两者都需修改、直接 blocked 和无需修改五类 ReviewBundle，验证返修目标、最大次数、完整复审和最终状态均符合规则。

**Acceptance Scenarios**:

1. **Given** ReviewBundle 包含针对 Plan 的 required findings，**When** Supervisor 做评审后决策，**Then** 系统只要求 Plan 返修，并保留 Tasks 与 Plan 一致性检查。
2. **Given** ReviewBundle 包含针对 Tasks 的 required findings，**When** Runtime 派生返修，**Then** Task 产物根据明确的 RevisionRequest 更新。
3. **Given** ReviewBundle 同时包含 Plan 和 Tasks 的 required findings，**When** 系统返修，**Then** 两类产物按依赖顺序更新。
4. **Given** 一次返修已经完成，**When** 系统生成报告，**Then** 不再启动 General、Risk、Boundary 的第二轮评审，内部状态为 `needs_review`，报告引导人工确认修订产物。
5. **Given** 一次返修已经完成，**When** 系统结束本次 run，**Then** 不继续循环、不输出原问题已解决/仍未解决的未经验证结论。
6. **Given** 任一轮出现边界 blocked、blocker 风险或明确 blocked 总评，**When** 系统做综合判断，**Then** 不进入普通返修，直接安全停止或生成 blocked 报告。
7. **Given** 初次 Review 的 finding 已进入返修，**When** Revision 记录处理结果，**Then** `RevisionOutcome` 通过 Runtime 分配的 `findingId` 指向原始 finding 和更新后的 artifact revision，但不声明 finding 已解决。
8. **Given** 多个 Reviewer 对同一或相关问题产生不同 finding，**When** Runtime 生成评审后动作，**Then** Runtime 按每个 `issue + required` finding 的 `targetArtifacts` 派生对应 RevisionRequest，并保留全部来源 `findingId`。
9. **Given** 初次 Review 已完成但 Supervisor 的评审后说明在唯一一次 repair retry 后仍不合法，**When** Runtime 收口该 run，**Then** Runtime 继续使用已验证 finding 派生返修；报告仅增加安全降级提示，不暴露模型原始内容。

---

### User Story 5 - 用户清楚看到决策、评审和返修进度 (Priority: P3)

作为等待交付计划生成的用户，我希望看到安全、简洁的 Supervisor 决策、初次评审、返修和复审进度，从而理解系统正在推进，而不会看到内部 prompt、原始结果或敏感信息。

**Why this priority**: 新增决策和返修阶段后，用户需要可理解的过程反馈，但不应暴露内部运行细节。

**Independent Test**: 分别运行无需返修、需要返修、`clarification_required`、`blocked` 和 partial review failure 场景，验证进度顺序、终止状态和安全摘要。

**Acceptance Scenarios**:

1. **Given** 输入可直接执行且 Review 首轮通过，**When** 用户查看进度，**Then** 能看到 Supervisor decision、Plan、Tasks、Review Group 和 Report 阶段的有序摘要。
2. **Given** 首轮 Review 要求返修，**When** 系统继续执行，**Then** 用户能区分初次 Review、Revision 和 Report，且不会看到复评步骤。
3. **Given** Supervisor 要求澄清或判定 blocked，**When** 流程停止，**Then** 进度以明确、安全、可行动的原因结束。
4. **Given** 任一内部 Agent 返回原始 prompt、provider error 或敏感运行信息，**When** 系统生成用户可见进度，**Then** 这些信息不会进入进度或最终报告。

### Edge Cases

- Supervisor 返回无法识别的 decision、缺少必填 focus 或包含未允许字段时，结果必须作为 contract failure 处理。
- 任一 Agent Contract 出现 schema 未声明字段时，整个结果必须被拒绝，不得删除、保留或忽略未知字段后继续执行。
- 同一 Agent 阶段第二次返回非法 Contract 时，不得继续第三次尝试，也不得使用第一次或第二次的 Markdown 正文拼接出业务结果。
- 初次 Review 已完成但评审后 Supervisor 说明在 repair retry 后仍失败时，Runtime MUST 根据 ReviewBundle 中已验证 `issue + required` finding 的 `targetArtifacts` 派生 RevisionRequest，并记录安全降级提示。
- Supervisor 的自然语言说明与结构化 decision 冲突时，结构化 decision 是唯一机器事实源。
- 同一 run 中 Supervisor 尝试指定或替换 `dispatchPlanId`、创建第二个独立调度计划或删除先前阶段决策时，Runtime 必须拒绝该更新。
- Supervisor 声明的 Reviewer 集合缺失、重复、额外或包含未知角色时，Runtime 必须在任何 Reviewer 启动前拒绝整次 Review 调度，不得静默规范化集合。
- Supervisor 请求第二次返修时，runtime 必须拒绝并按一次返修后的现状收口。
- Plan-only 返修后 Tasks 可以暂时保留 v1；报告必须明确该 run 未执行自动复评，并要求人工确认 Plan 与 Tasks 是否仍对齐。
- RevisionRequest 引用不存在、非本次 run 或非当前 Review cycle 的 `findingId`，或者引用不存在的目标产物时，该返修请求不得执行。
- 多个 Reviewer 指向同一或相关问题时，每个 finding 保留独立的 Runtime `findingId`；Runtime 按其结构化 `targetArtifacts` 生成受限 RevisionRequest，不根据文本或语义相似度自动合并。
- Reviewer 对同一问题给出冲突结论时，报告必须标明冲突；blocked 硬规则优先于非 blocked 意见。
- Risk Reviewer 返回 blocker 时，无论其他 Reviewer 是否 pass，run status 都必须为 `blocked`。
- Boundary Reviewer 返回 blocked 时，无论其他 Reviewer 是否 pass，run status 都必须为 `blocked`。
- General Reviewer 返回 blocked 时，run status 必须为 `blocked`。
- 任一必选 Reviewer contract failure 视为该 Reviewer 执行失败，不得使用其 Markdown 猜测结论。
- 一至两个必选 Reviewer 执行失败时，仍须保留其他有效评审中的硬 blocker；不存在硬 blocker 时统一以 `needs_review` 收口。
- 一至两个 Reviewer 失败时，流程可生成报告，但结论不得为 pass，且必须列出缺失覆盖。
- Reviewer 集合合法但三个 Reviewer 全部失败时，流程必须以 `failed` 收口并输出安全失败摘要，不得伪造 ReviewBundle 或改写为业务 `blocked`。
- 用户取消或请求中断时，不得继续启动新的返修或复审阶段。
- 最终报告生成失败时，系统必须输出安全失败摘要，不得暴露内部结构化对象或原始错误。
- 普通 chat、`/tasklist` 和不使用 `/delivery-chain` 的请求不得进入本功能流程。

## Requirements _(mandatory)_

### Functional Requirements

#### Controlled Supervisor Decision

- **FR-001**: 每个 `/delivery-chain` run MUST 只有一个逻辑上的 `SupervisorDispatchPlan`；系统 MUST 在其首次 Contract 校验通过后分配一个当前 run 内稳定、唯一且不可变的 `dispatchPlanId`，并在整个 run 内保持该身份。Supervisor MUST NOT 指定或覆盖该标识。
- **FR-002**: `SupervisorDispatchPlan` 的执行前决策 MUST 只允许 `execute`、`clarification_required` 和 `blocked` 三类分支。
- **FR-003**: 当执行前分支为 `execute` 时，`SupervisorDispatchPlan` MUST 提供 assumptions、planning focus、task focus、review focus，以及本轮允许执行的阶段意图。
- **FR-004**: 当决策为 `clarification_required` 时，系统 MUST 给出用户可行动的缺失信息说明，并且不得继续生成正式 Plan、Tasks 或 ReviewBundle。
- **FR-005**: 当决策为 `blocked` 时，系统 MUST 安全停止并给出不暴露内部细节的边界说明。
- **FR-006**: `SupervisorDispatchPlan` MUST NOT 修改 Plan -> Tasks 依赖、Agent allowlist、固定 Review Group、最大返修次数、只读边界或 blocked 硬规则。
- **FR-007**: 非法或无法验证的 `SupervisorDispatchPlan`，以及 Supervisor 指定或替换 `dispatchPlanId`、在同一 run 中创建第二个独立计划或删除已有阶段决策的行为，MUST 作为 contract failure 处理并在对应阶段执行前拒绝，不得通过自然语言猜测、静默修正或默认值继续执行。

#### Strong Agent Contracts

- **FR-008**: 所有包含机器控制字段的 Supervisor、Plan、Tasks 和 Reviewer 结果 MUST 使用角色专属的 closed Contract；缺少必填字段、字段类型错误、枚举值非法或出现任何 schema 未声明字段时，整个结果 MUST 被拒绝为 contract failure，不得删除、保留或忽略未知字段后继续执行。
- **FR-009**: General Review Contract MUST 明确包含 disposition、findings 和 summary。
- **FR-010**: Risk Review Contract MUST 明确包含 severity、findings 和 summary。
- **FR-011**: Boundary Review Contract MUST 明确包含 boundary status、violations 或 findings，以及 summary。
- **FR-012**: 每个通过 Contract 校验的 Review finding MUST 由 Runtime 分配一个在当前 run 内稳定且唯一的 `findingId`，并明确表达来源角色、目标产物、严重程度、问题描述和建议动作；Agent MUST NOT 指定或覆盖该标识。
- **FR-013**: 每个 RevisionRequest MUST 由 Runtime 基于 ReviewBundle 中已验证 `issue + required` finding 的 `targetArtifacts` 生成，并引用一个或多个有效的来源 `findingId`，目标只允许 Plan、Tasks 或两者；来源必须属于当前 run 和当前 Review cycle，且不得删除 blocked 硬规则要求处理的问题。
- **FR-014**: 影响业务判断的 disposition、severity、boundary status、revision target 和 run status MUST 直接来自已验证的结构化字段；用户可见终止状态 MUST 只使用 `pass`、`clarification_required`、`needs_changes`、`needs_review`、`blocked` 和 `failed`。
- **FR-015**: 系统 MUST NOT 再从 Markdown 标题、固定关键词、文本前缀或正则匹配中推断业务结论。
- **FR-016**: 当 Markdown 与结构化字段冲突时，系统 MUST 使用结构化字段，并阻止 Markdown 覆盖硬结论。
- **FR-017**: Plan 和 Tasks MAY 保留 Markdown 正文，但 MUST 提供以下最小结构化摘要：Plan 至少包含当前 run 内稳定的产物标识、修订版本、需求引用、范围、assumptions、有序交付阶段和验收条件；Tasks 至少包含当前 run 内稳定的产物标识、修订版本，以及每个 task 的唯一标识、需求引用、依赖 task 标识和验收条件。依赖确认、Review 定位和返修目标识别 MUST 使用这些结构化字段，不得重新解析 Markdown 正文。
- **FR-018**: 每个产生 Contract 的 Agent 阶段在首次 schema 校验失败后 MAY 进行且最多进行一次 repair retry。该 retry MUST 只接收不包含 raw response、raw prompt、secret 或内部配置的安全 `{ path, code }` 摘要，并 MUST 重新通过完整 closed Contract 与适用 Runtime policy 校验。第二次仍失败时，Contract failure MUST 被记录为对应阶段失败，且不得生成看似成功的正式产物；当失败使整个 run 无法形成可信结果时，run status MUST 为 `failed`，Reviewer 部分失败则按 FR-026 和 FR-027 收口。Supervisor post-review guidance 第二次失败时，Runtime MUST 保留安全警告并继续按 FR-013 派生返修。

#### Fixed Review Group

- **FR-019**: 每个正式 Review cycle 的 `SupervisorDispatchPlan` MUST 声明 Reviewer 集合，且该集合 MUST 恰好包含 General、Risk 和 Boundary 三类 Reviewer 各一次。
- **FR-020**: 三个 Reviewer MUST 基于同一版本的 Plan 和 Tasks 进行评审。
- **FR-021**: 三个 Reviewer MUST 能够独立完成评审，且任一 Reviewer 的输出不得成为另一个 Reviewer 开始评审的前置条件。
- **FR-022**: Supervisor MUST NOT 省略、替换、重复或额外增加任一固定 Reviewer。
- **FR-023**: 固定 Review Group 的完整性 MUST 由 runtime policy 在执行前进行严格集合校验，不得仅依赖模型声明或模型生成的工具调用。
- **FR-024**: Reviewer 集合缺失、重复、额外或包含未知角色时，Runtime MUST 拒绝整次 Review 调度，且 MUST NOT 静默补齐、删除或规范化集合，也不得启动部分 Reviewer。
- **FR-025**: 正确调度后的单个 Reviewer contract failure、超时或执行失败 MUST 与非法或不完整调度区分记录。
- **FR-026**: 一至两个 Reviewer 失败时，系统 MAY 继续生成报告并 MUST 明确列出缺失评审；若其他有效结果包含任一 blocked 硬规则，run status MUST 为 `blocked`，否则 MUST 为 `needs_review`，且 MUST NOT 为 `pass`。
- **FR-027**: Reviewer 集合已通过严格校验但三个 Reviewer 全部执行失败时，系统 MUST 以 `failed` 收口并生成安全失败摘要；MUST NOT 生成伪造的 ReviewBundle，也不得将执行失败改写为业务 `blocked`。

#### Review Decision and One Revision

- **FR-028**: 初次 Review 完成后，Runtime MUST 在同一个 `SupervisorDispatchPlan` 中追加由已验证 ReviewBundle 派生的评审后动作；动作只允许 `finalize` 或 `revise`，且 MUST 保留执行前决策和计划稳定身份。完整评审不存在 required finding 时为 `finalize`；存在 `issue + required` finding 且无 blocked 时为 `revise`。run status 仍 MUST 由完整性、findings 和硬规则确定。
- **FR-029**: `revise` 动作 MUST 由 Runtime 根据每个已验证 `issue + required` finding 的 `targetArtifacts` 以固定 `plan`、`tasks` 顺序派生 RevisionRequest、目标和来源 `findingId`；不得使用文本匹配或语义相似度合并 finding，也不得要求模型复制 Runtime 生成的 ID 或计算集合。
- **FR-030**: Supervisor post-review Contract 只可输出简短 rationale 与按 `plan` / `tasks` 分类的返修建议；这些建议不得选择运行动作、删除硬规则、扩大返修目标或改变 Runtime 派生的 RevisionRequest。
- **FR-031**: 每次 `/delivery-chain` run 最多允许一次正式返修。
- **FR-032**: 当 Plan 和 Tasks 都需要返修时，Plan MUST 先完成修订，Tasks 再与修订后的 Plan 对齐。
- **FR-033**: 返修必须消费当前产物和 Runtime 派生的 RevisionRequest，不得丢失已经通过的要求、来源 `findingId` 或无关扩大范围。
- **FR-034**: 返修完成后，系统 MUST 不启动第二个 General、Risk 和 Boundary Review Group，也不得产生第二次返修。
- **FR-035**: 返修成功后，系统 MUST 保留首次 ReviewBundle、RevisionRequest、RevisionOutcome 和最新 Plan/Tasks artifact revision，并将内部 run status 设为 `needs_review`，不得标记为 `pass`。
- **FR-036**: Plan-only Revision 时 Tasks MAY 保留 v1；报告 MUST 以人工确认作为下一步，不得由系统声明 Plan/Tasks 已重新对齐。
- **FR-037**: 报告 MUST 展示返修依据和修订结果，但 MUST NOT 输出原 finding 的 resolved/unresolved、复审遗留问题或未经独立复评的收敛结论。
- **FR-038**: 用户报告 MAY 不展示 canonical terminal status；Runtime 和 stream 仍 MUST 保留内部状态与 machine terminal state 以保证安全收口和协议兼容。

#### Hard Decision Rules

- **FR-039**: Boundary status 为 blocked 时，run status MUST 为 `blocked`。
- **FR-040**: Risk severity 为 blocker 时，run status MUST 为 `blocked`。
- **FR-041**: General Review disposition 为 blocked 时，run status MUST 为 `blocked`。
- **FR-042**: 任一 blocked 硬规则 MUST 优先于其他 Reviewer 的 `pass` 或 `needs_changes` 结论。
- **FR-043**: Supervisor、Plan Worker、Task Worker 和报告生成过程 MUST NOT 将 blocked 硬规则降级为 `pass`、`needs_changes` 或普通 warning。
- **FR-044**: 缺失 General 或 Boundary Review 且其他有效结果不存在 blocked 硬规则时，run status MUST 为 `needs_review`。
- **FR-045**: 缺失 Risk Review 时，报告 MUST 明确标记风险评审缺失；其他有效结果存在 blocked 硬规则时 run status MUST 为 `blocked`，否则 MUST 为 `needs_review`。

#### Report and User-visible Progress

- **FR-046**: 最终报告 MUST 基于同一个已完成阶段更新的 `SupervisorDispatchPlan`、最新 Plan、最新 Tasks 和最新 ReviewBundle 生成。
- **FR-047**: Runtime 和 machine-readable trace MUST 保留 canonical run status；最终用户报告 MUST 明确展示评审覆盖、关键 findings、已执行返修、返修依据（如有）、assumptions 和下一步建议，且 MAY 隐藏 canonical run status。
- **FR-047a**: 最终报告 MUST 从已验证的 Plan/Tasks typed fields 确定性渲染方案概览、范围、实施阶段、验收标准、任务目标区域、依赖和任务验收；短 Markdown 标题不得单独构成完整交付内容。
- **FR-047b**: Plan、Task 和 Review Worker MUST 分别消费对应的 plan/task/review rubric；rubric 不得仅被入口加载后丢弃。
- **FR-047c**: 最终报告 MUST 在交付结论之前确定性展示简短的需求摘要，摘要仅可基于已读取的 Requirement 内容提取用户目标、主要范围和非目标，不得依赖额外 LLM 润色或输出原始模型内容。
- **FR-048**: 最终报告 MUST 使用确定性硬规则保留 blocked、blocker 和缺失评审结论。
- **FR-049**: 本版本 MUST NOT 依赖额外的自由生成润色步骤才能得到完整报告。
- **FR-049a**: `findingType=observation` MUST NOT 触发 `needs_changes`、RevisionRequest 或未解决事项；只有 `findingType=issue` 且 `requirement=required` 的 finding 是 required follow-up。
- **FR-050**: 用户可见进度 MUST 区分 Supervisor decision、Plan、Tasks、首次 Review Group、Revision 和 Report 阶段，且不得展示 Re-review 阶段。
- **FR-051**: 无返修场景 MUST NOT 展示虚假的 Revision；返修场景也 MUST NOT 展示不存在的 Re-review 阶段。
- **FR-052**: 用户可见进度和报告 MUST NOT 包含 raw prompt、raw reasoning、raw model response、provider config、stack、secret 或未脱敏内部路径。
- **FR-053**: `clarification_required`、`needs_changes`、`needs_review`、`blocked`、`failed`、partial review failure 和 contract failure MUST 产生可理解且可行动的用户提示。
- **FR-053A**: 每个 role-specific Contract 的结构化输出和唯一 repair MUST 固定使用服务端配置的 `deepseek/deepseek-v4-pro`；Supervisor、Plan、Tasks、Reviewer 与 Revision 的业务生成 MUST 保持使用用户选定的模型。固定 Contract model 只负责 Contract transport 与 schema compliance，不得改变业务阶段顺序、角色权限、Runtime-owned identity、policy 或最终状态规则。

#### Compatibility and Scope

- **FR-054**: `/delivery-chain` 的现有 public command 和输入方式 MUST 保持兼容。
- **FR-055**: 普通 chat 和 `/tasklist` MUST NOT 获得或执行本版本的内部 Supervisor/Reviewer 权限。
- **FR-056**: 本版本 MUST 保持现有 demo resource 和 inline requirement 边界，不扩大到任意项目目录或外部数据源。
- **FR-057**: 本版本 MUST NOT 新增 RuntimeArtifact persistence、数据库 schema 或跨 run Artifact 引用。
- **FR-058**: 本版本 MUST 保持现有 stream public contract 向后兼容。
- **FR-059**: 本版本 MUST 保持现有 frontend workflow progress 消费方式兼容。
- **FR-060**: 本版本 MUST NOT 引入 ReAct、Agent Catalog、A2A、HITL、checkpoint、resume 或 nested delegation。

#### Evaluation

- **FR-061**: 版本验收 MUST 使用同一套固定、可重复的评测样本，对单 Agent baseline、当前固定多 Agent baseline 和 v0.4.11 反馈闭环进行对比。
- **FR-062**: 每个评测样本 MUST 具有稳定的 case 标识、输入、预期 Supervisor 分支、必须识别的关键问题、预期 run status 和评分依据；三类 baseline MUST 使用同一评分规则记录需求覆盖、任务依赖正确性、验收可执行性、风险与边界问题识别、返修 finding lineage 与 artifact revision、最终状态正确性和用户可理解性。
- **FR-063**: 三类 baseline MUST 在可比较的执行条件下运行，并分别记录用户业务模型与固定 Contract model 的调用次数、repair 次数、端到端耗时和资源消耗，避免只用质量提升解释更高成本。
- **FR-064**: 固定评测集 MUST 覆盖直接通过、需要澄清、需要返修、边界 blocked、blocker 风险、单 Reviewer 失败、双 Reviewer 失败和全部 Reviewer 失败；版本验收期间不得根据待测方案的输出临时修改样本预期。
- **FR-065**: Contract、Review Group、硬规则和最大返修次数 MUST 使用确定性测试验证，不得只依赖主观报告评审。

### Key Entities

- **SupervisorDispatchPlan**: 每个 run 内唯一的 Supervisor 受控结构化调度计划；首次 Contract 校验通过后由 Runtime 分配稳定、唯一且不可变的 `dispatchPlanId`，并贯穿执行前与评审后阶段。计划先记录执行前分支、assumptions、本轮 focus、阶段意图和严格完整的 Reviewer 集合，初次 Review 后继续记录 Runtime 派生的 `finalize` 或 `revise` 动作、返修目标及可选 Supervisor 说明。只有当前阶段更新通过 runtime policy 校验后才能驱动执行，且 Supervisor 不能指定或替换计划身份、删除已有决策或携带权限扩张、强制阶段变更和动态安全策略。
- **RunStatus**: 面向 Runtime、报告和用户进度的统一终止状态，只允许 `pass`、`clarification_required`、`needs_changes`、`needs_review`、`blocked` 和 `failed`；评审后动作 `finalize` 或 `revise` 不属于终止状态。
- **PlanArtifact**: 交付方案产物，包含面向人的 Markdown 正文，以及当前 run 内稳定的产物标识、修订版本、需求引用、范围、assumptions、有序交付阶段和验收条件。
- **TaskArtifact**: 任务拆解产物，包含面向人的 Markdown 正文、当前 run 内稳定的产物标识和修订版本；每个 task 具有唯一标识、需求引用、依赖 task 标识和验收条件。
- **GeneralReviewResult**: 评估 Plan 与 Tasks 的覆盖度、一致性、范围和验收质量，输出明确 disposition 和 findings。
- **RiskReviewResult**: 评估实现、测试、运行时、安全和维护风险，输出明确 severity 和 findings。
- **BoundaryReviewResult**: 评估是否违反版本、资源、权限、持久化、stream 和 Agent Runtime 边界，输出明确 boundary status 和 violations/findings。
- **ReviewFinding**: Reviewer 发现的一个可追踪问题；通过 Contract 校验后由 Runtime 分配当前 run 内稳定唯一的 `findingId`，并包含来源、目标产物、严重程度、证据、问题描述和建议动作。
- **ReviewBundle**: 同一 Review cycle 的三类 Reviewer 结果、失败覆盖、冲突、综合结论和可返修问题集合；保留每个 finding 的独立身份，不负责基于文本或语义相似度自动合并。
- **RevisionRequest**: Runtime 从已验证 `issue + required` ReviewFinding 的 `targetArtifacts` 派生的受控返修请求，通过来源 `findingId` 保持追踪，并明确目标产物和必须处理的事项；Supervisor 建议只可补充说明，Runtime 负责动作、引用、目标、硬规则和范围边界。
- **RevisionOutcome**: 一次返修的结果，通过来源 `findingId` 记录哪些目标产物被更新、哪些请求已处理；不包含 finding resolution。
- **DeliveryChainReport**: 面向用户的最终交付计划报告，使用最新产物、首次 ReviewBundle 和 RevisionOutcome，明确返修依据、修订结果和人工确认下一步。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 在全部 contract 测试场景中，100% 的非法 decision、非法 severity、非法 boundary status、缺失必填字段、字段类型错误和 schema 未声明字段都导致当前结果被拒绝；每个 Agent 阶段最多发生一次 repair retry，只有完整合法的修复结果可以继续，第二次失败后 100% 按阶段失败规则收口，且不会通过删除未知字段或 Markdown 猜测继续执行。
- **SC-002**: 在全部首次 Review 场景中，100% 的合法调度都声明并执行 General、Risk、Boundary 三类唯一 Reviewer；100% 的缺失、重复、额外或未知角色集合都在任何 Reviewer 启动前被拒绝。
- **SC-003**: 在可形成可信 ReviewBundle 且不存在后续执行完整性失败的全部 blocked 测试场景中，boundary blocked、risk blocker 和 general blocked 以 100% 的比例得到 `blocked` run status，不被其他 Agent 结果覆盖。
- **SC-004**: 在全部需要返修的测试场景中，系统最多执行一次返修，返修后不启动第二个 Review Group，并以 100% 的比例以 `needs_review` 收口。
- **SC-005**: 在代表性可返修评测集中，100% 的 RevisionOutcome 都能通过 Runtime 分配的 `findingId` 追踪到首次 Review 的有效来源；所有声明更新的 artifact 都具有 revision 2，且不依赖 Runtime 文本或语义相似度合并。本版本不评估 finding resolution rate 或返修后新 blocker。
- **SC-006**: 在一至两个 Reviewer 失败的全部测试场景中，100% 的报告明确标记缺失评审；其他有效结果存在硬 blocker 时 run status 为 `blocked`，否则为 `needs_review`，且绝不为 `pass`；合法调度后三个 Reviewer 全部失败时，100% 以 `failed` 收口并生成安全失败摘要。
- **SC-007**: 在信息完整、信息不足和明确越界三类输入集中，至少 90% 的 Supervisor 调度分支与人工标注一致；所有违反强制阶段、依赖关系、Review Group、返修次数或安全边界的调度计划均在执行前被 runtime policy 拦截。
- **SC-008**: 在 Markdown 措辞、标题和语言变化测试中，结构化业务结论保持 100% 一致。
- **SC-009**: 普通 chat、`/tasklist`、现有 `/delivery-chain` 输入边界和已有 workflow progress 消费场景的回归测试全部通过。
- **SC-010**: 用户在所有终止场景中都能获得与实际分支一致的进度/报告和至少一条可行动的下一步建议；canonical `RunStatus` 必须由 Runtime 和 machine-readable trace 保留，但普通用户报告 MAY 隐藏该内部状态值。
- **SC-011**: 单 Agent、当前固定多 Agent 和 v0.4.11 反馈闭环使用同一套固定评测样本与评分规则，并同时产出质量、耗时、调用次数和资源消耗结果，使评审者能够重复验证反馈闭环的收益是否值得额外成本。

## Assumptions

- `/delivery-chain` 继续服务现有 demo scenario 和 inline requirement，不读取任意真实项目目录。
- Plan、Tasks、Review 和最终报告继续是单次 run 内部产物，不跨 run 持久化。
- Supervisor 的真实决策范围限定为输入充分性、focus 和返修说明；返修目标和返修请求由 Runtime 的已验证 finding 派生，不包含自由 Agent discovery 或任意拓扑生成。
- `SupervisorDispatchPlan` 是单次 run 内唯一的逻辑对象，不要求跨 run 持久化；阶段更新可以增加后续决策，但不得替换其身份或删除已经生效的早期决策。
- Plan 和 Tasks 的长篇内容继续允许使用 Markdown；只有参与机器判断和返修定位的最小字段需要结构化。
- Review Group 是固定安全与质量 Gate，不属于 Supervisor 可以省略的动态调度范围。
- 三个 Reviewer 彼此独立，可以基于同一版 Plan 和 Tasks 同时评审。
- 每个 run 最多进行一次返修；这是一项产品边界，不由模型决定。
- 最终报告不需要额外 LLM 润色即可满足本版本的完整性和可读性要求。
- 用户选定的模型可以影响各业务角色的生成质量，但不能改变 Supervisor 或 Worker 的权限和 policy；固定 Contract model 只承担结构化输出稳定性，不承担业务阶段替换或调度职责。
- 三类 baseline 的对比价值建立在固定评测样本、统一评分规则和可比较执行条件之上；具体模型波动作为评测结果的一部分记录，而不是通过临时修改预期消除。
- 现有 workflow progress channel 足以表达新增阶段，不需要新的 public stream message family。
- ReAct Context Explorer 作为后续学习或独立版本候选，本版本没有相关 runtime、工具或验收要求。

## Checklist Resolutions

本节是 2026-07-28 对 `checklists/runtime-contract.md` 的正式处理结论；若与早期叙述存在歧义，以本节及其同步的 data model / contracts 为准。

### Contract Bounds and Supervisor Decision Rules

- 除 Markdown 外，单个结构化文本字段必须为 1–1,000 个字符；Markdown 必须为 1–24,000 个字符。普通标量数组最多 20 项，Plan phases、Tasks、Review findings 最多 40 项，RevisionRequests 最多 20 项，每个 finding 的 evidence 最多 10 项；结构化对象嵌套最多 4 层。
- `execute` 只能在输入同时具备交付目标与范围、受限资源/目标区域、可验收结果三类信息时使用；若缺失其中任一项且合理假设会实质改变 Plan 或 Tasks，必须为 `clarification_required`。请求突破只读、无持久化、无新增 public surface 或资源 allowlist 的硬边界时必须为 `blocked`。
- `required` finding 表示未处理将违反 requirement、acceptance criterion、受控资源边界或已验证的安全规则；`advisory` 只表示可选质量改进。完整 Review 中任何未解决的 `required` finding 都不得得到 `pass`。
- hard blocker 仅由已通过 Contract 的 General `disposition=blocked`、Risk `severity=blocker` 或 Boundary `boundaryStatus=blocked` 产生；普通 finding 的文本或 `severity` 本身不能绕过角色结论字段创建或解除 hard blocker。
- `finalize`、`revise` 是 Supervisor action，不是 RunStatus；Supervisor 不得以 action 覆盖 Runtime 的 hard blocker、coverage 或执行完整性结论。

### Review, Revision and Failure Precedence

- 初次 Review 使用 exact-set、同一 artifact snapshot、coverage、hard-blocker 和 partial failure 规则。集合不合法时，在创建 invocation、progress 或 trace 之前拒绝，任何 Reviewer 均不得启动。
- Runtime 在每个 Review cycle 的三个 invocation 创建前冻结 artifact snapshot；仅在该 cycle 的三个 Reviewer 全部 settled 后，才允许进入 post-review guidance 或 Revision，返修不得改变已启动 Reviewer 的输入。
- 执行完整性 `failed` 优先于已观察到的 hard blocker；但 post-review guidance 在唯一 repair 后仍不合法不构成执行完整性失败，Runtime 必须保留安全降级提示并继续使用已验证 finding 生成受限 Revision。
- Plan-only Revision 可以暂时保留 Tasks v1；返修后不自动复评，最终内部状态为 `needs_review`，报告必须要求人工确认 Tasks 是否仍对齐。
- `revise` 不得消费 hard blocker 来启动普通返修；存在 hard blocker 时 post-review action 只能为 `blocked`，或因执行完整性失败而按 `failed` 收口。
- 所有 Agent stage 的第二次 Contract failure 使用 `contracts/agent-contracts.md` 的 Stage Failure Contract。schema failure、policy failure 与 Worker execution failure 必须分别记录为 `contract_failure`、`policy_failure`、`execution_failed` 或 `timeout`，并使用安全、可行动的用户摘要。

### Safety, Budget, Progress and Retention

- 用户业务模型与固定 Contract model 分别使用既有 stage timeout：Supervisor 与每个 Reviewer 120 秒，Plan 与 Tasks 180 秒。每个 run 最多 12 个正式业务 Agent stage、12 次对应的业务模型 invocation，以及 24 次 Contract model invocation（含每阶段至多一次 repair）；Reviewer group 固定 3 项并行。两类调用预算必须分别统计，Runtime 必须透传现有 request abort；本版本不承诺额外的全局 wall-clock SLA。
- Contract repair 只可返回最多 5 个 `{ path, code }`；`path` 最长 160 个字符。repair、progress、report 与 evaluation 不得输出 invalid value、raw prompt、raw response、provider config、stack、secret 或内部敏感路径。
- delivery-chain 必须在发起任何 Agent stage 前确认固定 Contract model `deepseek/deepseek-v4-pro` 的 `jsonOutput`/structured-output capability；不满足时以 `failed` 和可行动的模型能力提示收口。用户选定的业务模型保留现有 `toolCalling` selection gate，但不因缺少 `jsonOutput` 被拒绝；放宽该 gate 属于后续版本决策。
- model-provider catalog 必须为固定 Contract model 声明准确的 structured-output capability，并验证业务模型与 Contract model 的路由边界；该声明与实际能力的偏差属于 capability failure，并由 Contract/model-set 测试覆盖。
- 所有内部终态复用现有 workflow progress family：仅 `failed` 映射为 public failed，其余五个 RunStatus 映射为 completed。报告不展示 canonical status；无 Revision 路径不得显示 Revision 阶段，任何路径都不得显示 Re-review 阶段。
- DispatchPlan、artifacts、ReviewBundle 和 RevisionOutcome 在单次 run 结束后丢弃；evaluation 仅保留 schema version、case ID、聚合评分、成本指标和安全 failure reason，不保留 raw model content。
- Markdown 与结构化结论冲突时，报告只显示“结构化结论优先”的安全 conflict note 和由该结论导出的下一步，不引用冲突原文；这类 note 不改变 canonical status，原始冲突内容不进入用户可见或持久化数据。

### Evaluation and Documentation Rules

- SC-007 使用冻结的 8-case manifest，每个模型型 case 固定运行 3 次；人工标注在运行前冻结。两个独立评审者按同一 branch rubric 标注，分歧由第三位评审者裁决；24 个 branch trial 中至少 22 个正确才满足 90% 门槛。
- SC-005 验证返修路径的产物追踪：每个 RevisionOutcome 都引用首次 Review 的 required finding，并且所有声明已更新的 artifact 都具有 revision 2；本版本不评估 finding resolution rate 或返修后新 blocker。
- 三 baseline 固定用户业务 model/provider、固定 DeepSeek Contract model/provider、generation parameters、timeout、input/context、manifest 与 scorer version；叙述质量使用隐藏 baseline 名称的 0/1/2 anchored rubric，报告每 case 的 median、range、两类 model calls、repair calls、tokens 和 elapsed time，并将不含 raw model content 的汇总保存为 `specs/v0.4.11-structured-supervisor-review-loop/evaluation-results.md`。
- ADR-0012 与 roadmap 在实现收口前仅标记 Planned；全部 deterministic tests、targeted regressions、typecheck、lint 和 evaluation evidence 完成后，才同步 README、version、release、tasklist 与 package version。
