# Phase 0 Research: Structured Supervisor Review Loop

## Current Runtime Findings

当前 `/delivery-chain` 的真实路径为：

```text
delivery-chain/index.ts
-> runControlledDeliveryManager()
-> Manager LLM 依次生成 Plan tool call、Task tool call、3 个 Review tool calls
-> Worker models
-> rule-based report synthesis
```

它已经具备受限资源、shared tool executor、Plan/Tasks 串行、三 Reviewer 并行与确定性报告等良好边界，但 Manager 的模型调用主要是在回显 Runtime 预先决定的固定 tool 路由，尚未对输入充分性、执行 focus 和 Review 后返修做真实决策。

主要差距：

- generic Zod result 未 `.strict()`，未知字段会被剥离；业务控制值藏在开放 `metadata`。
- Worker 先生成 Markdown，再用正则提取 General disposition、Risk severity、Boundary status。
- Review policy 仅检查数量不超过 3 且位于 allowlist，没有校验三种角色各一次。
- ReviewBundle 无 finding identity/cycle/coverage contract；报告会按 Markdown bullet 前 40 字自动合并问题。
- 无单一 `SupervisorDispatchPlan`、post-review decision、Revision 或 Re-review。
- 单一 `maxToolCalls=5` 只描述旧链，不能表达阶段预算。

## Decision 1: Single Runtime-owned SupervisorDispatchPlan

**Decision**: 每个 run 只创建一个 `SupervisorDispatchPlan`。Supervisor pre-decision 首次通过 closed Contract 和 policy 后，由 Runtime 分配不可变 `dispatchPlanId`；初次 Review 后仅向同一对象追加 post-review guidance 与 Runtime 派生的动作。

**Rationale**: 避免执行前与评审后出现两个竞争事实源，同时保留 Supervisor 在受控开放点做真实决策的能力。身份、阶段迁移和硬边界仍由 Runtime 所有。

**Alternatives considered**:

- 两个独立决策对象：身份和安全边界容易漂移。
- Supervisor 复制动态 finding ID、分组或计算 targets 集合：会把跨实体集合运算交给最不稳定的结构化输出阶段。
- 自由 Supervisor 生成动态拓扑：超出本版范围。

## Decision 2: Closed Role Contracts as the Machine Fact Source

**Decision**: Supervisor、Plan、Tasks、General、Risk、Boundary 和 Revision 使用独立 Zod schemas；每层 object `.strict()`，TypeScript 类型由 schema 推导。Markdown 只承担叙述展示。

**Rationale**: role-specific Contract 才能表达各角色必填控制字段、合法枚举和权限边界，并使 unknown field 真正导致整个结果失败。

**Alternatives considered**:

- generic result + open metadata：无法建立角色约束和单一事实源。
- strip unknown fields：掩盖模型越权或版本漂移。
- 手工 JSON/Markdown 正则解析：不稳定且难以证明状态正确性。

## Decision 3: One Contract Repair Retry

**Decision**: 每个模型 Contract 阶段执行完整校验；仅 Contract/schema failure 触发一次 repair。反馈只包含受限字段路径和错误代码；第二次结果重新做完整 closed parse。

**Rationale**: 给模型一次纠正格式的机会，同时避免 patch、silent fallback 和敏感 raw output 泄露。Provider transport retry 与 Contract repair 分开统计和处理。

**Alternatives considered**:

- 不 repair：对可恢复格式问题过于脆弱。
- 多次 repair：成本和循环上限不清晰。
- Runtime 自动补字段、删字段或默认枚举：会伪造业务结论。

## Decision 4: Runtime Exact-set Review Gate

**Decision**: Supervisor 必须声明 Reviewer roles；Runtime 在任何 Reviewer invocation/progress/trace 创建前验证集合恰好为 General、Risk、Boundary 各一次。合法后由 Runtime 构造三项内部 tool invocation 并行执行。

**Rationale**: 固定 Review Group 是安全与质量 Gate，完整性不能依赖模型是否恰好生成三个 tool calls。

**Alternatives considered**:

- Runtime 静默补齐：掩盖非法 Supervisor decision。
- 启动合法子集后再标记缺失：非法调度会产生不应进入正式 bundle 的副作用。
- 保持 LLM 固定 tool routing：增加调用成本但没有真实决策价值。

## Decision 5: Runtime Identity, Supervisor Grouping

**Decision**: Reviewer 输出不携带 `findingId`；Runtime 在 Contract 通过后按 run/cycle 分配。Runtime 从 `issue + required` finding 的 `targetArtifacts` 派生每个目标的 RevisionRequest；Supervisor 只提供无 ID 的返修说明。

**Rationale**: 保留每个 finding 的独立来源和可追踪身份，同时不要求模型复制 Runtime ID 或计算集合。Runtime 不做文本相似度猜测。

**Alternatives considered**:

- Runtime 按文本/embedding 合并：非确定性且可能误合并。
- Reviewer 自报 findingId：破坏身份所有权。
- 强制一 finding 一 request：无法表达同一根因的联合返修。

## Decision 6: Bounded Evaluator-Optimizer Loop

**Decision**: 初次 Review 后最多一次正式 Revision；允许 Plan、Tasks 或两者，两者同时修改时 Plan 在先。返修后完整执行三 Reviewer，之后不再返修。

**Rationale**: 这是能证明“反馈真正修改产物”的最小协作闭环，又能保持成本、状态和测试空间有界。

**Alternatives considered**:

- 多轮直到 pass：成本、收敛和失败处理不可控。
- 仅在报告附 findings：没有协作反馈价值。
- 只复审受影响 Reviewer：可能漏掉跨产物回归。

## Decision 7: Phase Budgets instead of One Magic Call Limit

**Decision**: policy 显式约束 pre-decision、Plan、Tasks、Review cycle 1、post-decision、可选 Revision 与 Review cycle 2；每阶段 repair 上限 1，Revision 上限 1，Review cycles 上限 2。

**Rationale**: 合法路径的模型调用数会因 repair 和返修变化。阶段预算能准确表达产品约束，无需升级为通用 policy engine。

**Alternatives considered**:

- 把 `maxToolCalls` 从 5 改为更大数字：无法区分非法第二次返修和合法 repair。
- 通用 DAG scheduler：范围和抽象成本过大。
- 不设预算：失去 fail-closed 控制。

## Decision 8: Structured Supervisor Output Drives Runtime Tool Execution

**Decision**: Supervisor 先使用用户选定模型形成业务调度意图，再由固定 Contract model 将该意图表达为 structured output；Runtime 校验后经现有 delivery-chain tool registry/shared executor 调用 Worker。Supervisor 不再为固定阶段生成 invocation-only tool calls。

**Rationale**: Worker-as-tool 边界仍保留，但业务调度意图、Contract transport 与执行完整性职责分离。固定 Contract model 只负责严格编码，不替代 Supervisor 的业务判断；Runtime 仍是固定拓扑、预算和安全规则的唯一执行者。

**Alternatives considered**:

- 继续要求 Supervisor 生成固定 Worker tool calls：重复表达、集合完整性仍难保证。
- 绕过 shared executor 直接调用 Worker functions：会丢失现有 scope、trace 和 tool runtime 边界。
- 引入 LangGraph：本功能不需要 checkpoint、resume 或动态 Graph。

## Decision 9: Canonical Status is Deterministic

**Decision**: Runtime 的纯函数根据执行完整性、typed review coverage、hard blockers 和 unresolved required findings 计算六种 canonical status。Supervisor action 不是终态，Markdown 不能覆盖状态。

**Rationale**: 安全状态必须可重复验证。post-review Supervisor Contract 在 repair 后仍失败属于执行完整性 `failed`；报告仍保留此前验证过的 blocker/coverage 证据。

**Alternatives considered**:

- 由 Supervisor 直接给最终状态：可能覆盖 hard rules。
- 从报告 Markdown 解析：措辞会影响运行结果。
- 所有异常统一 blocked：会混淆业务阻断与 Runtime 执行失败。

## Decision 10: Test-side Evaluation Harness

**Decision**: 分两层验证：

1. deterministic contract/policy/status suite；
2. `single-agent`、`fixed-multi-agent-current`（实现前 v0.4.10 行为快照）、`structured-supervisor-v0.4.11` 三 baseline 的冻结样本比较。

baseline adapter、fault injection 和 scorer 只存在于 test/evaluation 层。建议至少 8 个 case：direct pass、clarification、revision、boundary blocked、risk blocker、1 Reviewer failure、2 Reviewer failures、all Reviewer failure。

统一评分维度：

- requirement coverage
- task dependency correctness
- acceptance actionability
- risk detection
- boundary detection
- required finding resolution
- final status correctness
- user comprehensibility

同时记录 provider/model、参数、输入输出 token、调用次数、端到端耗时、失败原因。叙述质量使用固定 0/1/2 anchored rubric；报告 median 与范围。

**Rationale**: 确定性安全规则不能依赖模型波动，架构收益又需要真实质量—成本数据。测试侧 harness 避免为评测污染生产代码。

**Alternatives considered**:

- 仅真实 provider E2E：不稳定，无法覆盖 exact policy。
- 仅 fake model：不能评估规划质量。
- 生产 feature flag 保留旧 baseline：形成测试专用生产分支。
- 把旧 demo prose 当机器 oracle：覆盖不足且对措辞过敏。

## Decision 11: Public Surface and Persistence Remain Unchanged

**Decision**: 新状态和阶段限定在 delivery-chain 内部 Contract、现有 progress detail 和报告文本；不新增 public command、route、stream family、数据库或跨 run artifact。

**Rationale**: 现有 progress message family 足以表达新增阶段。扩大 public protocol 或复用 Tasklist AgentRun 会显著增加回归面并混淆生命周期。

**Alternatives considered**:

- 新增 supervisor-specific chunks：无必要地扩大协议。
- 持久化 DispatchPlan/ReviewBundle：超出版本目标。
- 接入 Tasklist GraphState/checkpoint：混合两个独立 Runtime。

## Decision 12: Fixed Contract-output Capability without Expanding Model Selection

**Decision**: delivery-chain 在发起任何 Agent stage 前，服务端固定解析 `deepseek/deepseek-v4-pro` 作为 Contract model，并对该 model fail closed 校验 `jsonOutput`/structured-output 能力。用户选定的业务模型继续使用既有 `/delivery-chain` `toolCalling` selection gate，不再要求其具备 `jsonOutput`；放宽该 gate 不与本次 Runtime 演进捆绑。

**Rationale**: 强类型 Agent Contract 依赖真实 structured output 能力；将能力 gate 收敛到固定 Contract model，既能在运行前安全失败，也不会因用户选择的业务模型不稳定而改变既有模型选择范围。保留现有 `toolCalling` gate 则避免本版顺带扩大可选模型集合或改变旧入口失败行为。

**Alternatives considered**:

- 继续要求每个用户选定模型声明 `jsonOutput=true`：会把 Contract transport 的限制错误扩散到业务生成模型。
- 本版同时移除 toolCalling gate：可能合理，但会扩大 model selection 与回归范围。
- 继续用 tool calls 模拟所有 structured outputs：仍会混淆调度决策和 Worker execution。

## Decision 13: Fixed Structured Contract Transport Model

**Decision**: 所有 delivery-chain 的结构化 Contract 调用（包括 Supervisor pre/post、Plan、Tasks、Reviewer、Revision 及唯一 repair）固定使用 catalog 中的 `deepseek/deepseek-v4-pro`，并参考 `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts` 已验证的服务端 model resolution 与 `withStructuredOutput(schema, { name })` 调用方式。每个角色的业务判断、规划、任务生成、评审和返修仍使用用户在界面选定的模型；固定 Contract model 仅将该角色结果编码为严格 Contract 并验证 schema compliance。

**Rationale**: Contract 是 Runtime 的机器事实来源，统一使用更稳定的模型可避免 schema 遵从性随用户业务模型波动。用户选定模型仍拥有各 Agent 的业务语义职责，因而保留模型选择对生成质量的影响。长期记忆提取实现只提供固定模型、关闭 reasoning、非流式调用和 schema transport 的参考；Delivery Chain 仍拥有自己的 role Contract、一次 repair、状态机和 Agent-as-Tool 边界，不能与记忆候选提取的业务语义或失败收口耦合。Contract adapter 的底层 transport 可以使用 provider 的 function-calling，但它只承载 schema 编码与 repair，不能重写角色业务结论、改变 Delivery Chain 的 Runtime 调度或绕过 Agent-as-Tool 边界。Provider、Base URL 与鉴权继续复用既有配置，不新增密钥或前端可编辑项。

**Alternatives considered**:

- 跟随用户选择：模型切换会改变 Contract 稳定性，且难以重现流程故障。
- JSON mode 加手工 JSON Schema prompt：需要在调用侧重复维护 schema 表达，且偏离已验证的长期记忆实现。

## ADR and Documentation Decision

- 新增 `ADR-0012: Structured Supervisor Dispatch and Bounded Review Revision Loop`，建立在 ADR-0010/0011 之上。
- 不改写 ADR-0010/0011 的历史事实；ADR-0012 明确替代“LLM tool calls 作为固定 Review 完整性依据”和“Markdown 业务 synthesis”这两个旧实现选择。
- 规划阶段在 `agent-runtime-roadmap.md` 标记 Planned v0.4.11；实现收口后再更新 Current baseline。
- README、version、release、tasklist 和 package version 在实现与验收收口后同步，不提前宣称已交付。
- constitution 无需修改。

## Retained Display-only Parsing

以下解析不参与业务控制，可以保留：

- `report-synthesis.ts` 中 Markdown heading 去重/降级；
- 前端 `delivery-chain-report-parser.ts` 的 section 展示解析。

必须删除的是任何影响 disposition、severity、boundaryStatus、finding merge 或 canonical status 的文本解析。
