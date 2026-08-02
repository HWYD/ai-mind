# Implementation Plan: Structured Supervisor Review Loop

**Branch**: `[0411-multi-agent]` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/v0.4.11-structured-supervisor-review-loop/spec.md`

## Summary

v0.4.11 将 `/delivery-chain` 从“模型为固定阶段生成 tool calls”的路由式 Manager，演进为受 Runtime 硬边界约束的 `ControlledDeliverySupervisor`：

- Supervisor 通过 closed、role-specific Contract 做执行前与评审后决策；每个 run 只有一个由 Runtime 分配身份并分阶段追加的 `SupervisorDispatchPlan`。
- Runtime 校验 Supervisor 决策后，使用现有 delivery-chain 内部 Worker tools 执行固定的 Plan → Tasks → 完整 Review Group；Review Group 必须恰好包含 General、Risk、Boundary 各一次。
- Plan、Tasks 与三类 Reviewer 同时保留面向用户的 Markdown 和机器可读的最小结构化摘要；业务状态不再从 Markdown 或任意 `metadata` 推断。
- 报告以已验证的 Plan、Tasks、ReviewBundle 确定性投影为主，角色 rubric 显式注入对应 Worker；Review finding 区分待处理 issue 与仅供记录的 observation。
- 初次 Review 后允许一次由 Runtime 从已验证 finding 派生的 Revision；Supervisor 只补充返修说明，返修后直接生成报告并以 `needs_review` 内部状态收口，不执行 Re-review。
- 评测分为确定性 policy/contract suite 与测试侧三 baseline 质量—成本对比，不向生产 Runtime 增加评测模式或隐藏开关。

## Technical Context

**Language/Version**: TypeScript 5.9.3；Node.js 22.x

**Primary Dependencies**: Next.js 16.1.6、`@langchain/core` 1.1.48、Zod 4.3.6；复用现有 model-provider、tool-runtime 与 workflow progress 基础设施

**Storage**: N/A；全部 DispatchPlan、Artifacts、ReviewBundle、Finding 与 RevisionOutcome 只存在于单次 run 内

**Testing**: Vitest 4.1.4；现有 `vitest.stable.config.ts`；测试侧 evaluation harness

**Target Platform**: AI Mind Webapp server runtime；Node.js 22；现有 `/delivery-chain` command

**Project Type**: pnpm monorepo 内的 Next.js web application server runtime

**Performance Goals**: Review Group 每轮保持三个 Reviewer 并行；不增加最终 LLM 润色；评测分别记录用户业务模型调用、固定 Contract model 调用与 repair、token/resource 消耗和端到端耗时，并与两个 baseline 对比，不在取得基线前承诺绝对延迟 SLA

**Constraints**:

- public `/delivery-chain` 输入、demo resource allowlist、stream chunk union 与 frontend reducer public shape 保持兼容
- Supervisor 只能选择 `execute | clarification_required | blocked` 和 `finalize | revise | blocked`；不能跳过 Plan、Tasks 或固定 Review Group
- 每个 Agent 阶段最多一次 Contract repair；每个 run 最多一次正式 Revision、仅一次 Review Group
- closed schema 必须拒绝未知字段，不能 strip 后继续；TypeScript 类型从 Zod schema 推导
- 每个业务 Agent stage 保持使用用户选定模型及现有 `/delivery-chain` `toolCalling` model-selection gate；所有 structured Contract/repair 固定使用 `deepseek/deepseek-v4-pro`
- 仅固定 Contract model 必须支持 `jsonOutput` / structured output；创建 Contract handle 时能力不满足则 fail closed。是否放宽用户模型的 `toolCalling` gate 后续单独评估
- Runtime 拥有 `dispatchPlanId`、artifact identity/revision、`cycleId`、`findingId` 和 canonical status
- 不引入 ReAct、通用 DAG、Agent Catalog、A2A、HITL、checkpoint、resume、持久化或 nested delegation

**Scale/Scope**: 单次 `/delivery-chain` run；1 个 Supervisor、2 个生成 Worker、3 个固定 Reviewer；正常路径 1 个 Review cycle，返修路径最多 2 个 Review cycles

## Constitution Check

_GATE: Phase 0 前检查，并在 Phase 1 设计完成后复查。_

| Gate                            | Pre-design     | Post-design    | 设计约束                                                                                                    |
| ------------------------------- | -------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Controlled Agent First          | PASS           | PASS           | Supervisor 只在 allowlist 内做真实决策；顺序、Reviewer 完整性、blocked 和次数由 Runtime policy 决定。       |
| State Ownership                 | PASS           | PASS           | 本功能不接入 Tasklist GraphState；单次 run 的唯一 `SupervisorDispatchPlan` 由 delivery-chain Runtime 持有。 |
| Strict and Safe DTO             | 当前实现不满足 | PASS by design | 以 role-specific `.strict()` Zod schema 替换 generic result、开放 metadata 与 Markdown 业务解析。           |
| Runtime / Checkpoint Separation | PASS           | PASS           | 无数据库、checkpoint、resume、AgentRun 或跨 run artifact。                                                  |
| Stream Compatibility            | PASS           | PASS           | 仅扩展内部 stepId/detail，继续复用现有 `workflow-progress-*` message family。                               |
| Minimal Abstraction             | PASS           | PASS           | 使用局部 phase policy、contract runner 和 discriminated unions，不建设通用 DAG、catalog 或 policy engine。  |
| Test-first Boundary Validation  | PASS           | PASS           | 先完成 Contract、exact-set、status 和 identity 确定性测试，再接入口与展示回归。                             |
| Test-only Behavior Isolation    | PASS           | PASS           | 三 baseline adapter 与 fault injection 只在 evaluation/test harness；生产代码不增加测试模式。               |
| Documentation and ADR           | 待实施同步     | PASS by plan   | 新增 follow-up ADR-0013；更新 roadmap。历史 ADR-0010/0011 不改写，公开 release 文档在实现收口后同步。       |

Phase 1 复查未发现需要违反 constitution 的设计；`Complexity Tracking` 无需豁免项。

## Architecture Decision

采用 **Controlled Supervisor-Worker + bounded Plan-and-Execute + one-shot Evaluator-Optimizer**：

```text
Supervisor pre-decision
  -> Runtime contract + policy gate
  -> Plan v1
  -> Tasks v1
  -> Runtime exact Review Group gate
  -> General / Risk / Boundary in parallel
  -> deterministic ReviewBundle
  -> Supervisor post-review guidance appended to same DispatchPlan
  -> Runtime derives finalize / revise and bounded RevisionRequests
     -> revise: Plan v2? -> Tasks v2? -> report with needs_review
  -> deterministic status + report
```

Supervisor 不再为固定阶段重复生成 invocation-only tool calls。它输出结构化意图，Runtime 校验后通过现有内部 tool registry/shared executor 调用 Worker。这样既保留 Worker-as-tool 边界，又让 Supervisor 对输入充分性与 focus 做真正决策，同时让 Runtime 对返修目标与来源追踪保持确定性控制。

本版本不使用 ReAct：Worker 没有探索工具，问题和资源边界已知；引入 Thought/Action/Observation 循环只会增加调用成本和不可控状态，不产生本版所需价值。

### Consolidated Worker-as-Tool Boundary

v0.4.11 将原 `v0.4.11-1-runtime-worker-chat-tool-adapter` 的实现决策并入本计划：Plan、Tasks、General、Risk、Boundary 及其 Revision 都注册为仅供 `delivery-chain-manager` scope 使用的内部 `ChatToolDefinition`。

- Runtime 程序化构造固定 Worker invocation，并通过共享 Tool Runtime 调用；这不是 Supervisor 或业务模型发起的 LLM tool calling。
- Tool 输入仅携带 run-local invocation identity；业务草稿、Contract model、artifact snapshot、AbortSignal 和安全调用上下文由 Runtime 持有，Tool 不拥有或猜测 artifact/finding/cycle identity。
- Worker Tool 返回 strict success/failure envelope；`contract_failure`、`execution_failed` 和 `timeout` 继续映射到既有阶段失败规则，禁止以 Markdown、metadata 或错误文本推断业务状态。
- `delivery-chain-manager` scope 不写入 public `tool-*` transcript；普通 Chat、Skill、MCP、Tasklist Agent 和用户选择的业务模型都不能发现或调用这些 Worker Tools。

该边界保留受控 Plan-and-Execute 的固定拓扑，同时为后续通用 Execution Capability 演进保留清晰的 Runtime-owned 调用入口；本版本不开放动态 Worker 路由或 Agent Catalog。

## Project Structure

### Documentation (this feature)

```text
specs/v0.4.11-structured-supervisor-review-loop/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- evaluation-results.md        # 实现收口时生成的安全三 baseline 汇总
|-- quickstart.md
|-- contracts/
|   |-- agent-contracts.md
|   |-- workflow-contract.md
|   `-- evaluation-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md                     # 由 /speckit-tasks 后续生成
```

### Source Code (repository root)

```text
apps/webapp/lib/ai/runtime/delivery-chain/
|-- index.ts                     # public command/resource/progress 兼容适配
|-- graph-state.ts               # 仅同步 delivery-chain 内部类型，不引入新 Graph
`-- manager/
    |-- agent-contracts.ts       # 新增：closed role schemas 与 schema-derived types
    |-- contract-invocation.ts   # 新增：一次 repair 的安全结构化调用边界
    |-- controlled-delivery-manager.ts
    |-- delegation-policy.ts
    |-- runtime-artifacts.ts
    |-- report-synthesis.ts
    |-- subagent-tool-schemas.ts
    |-- subagent-tools.ts
    |-- types.ts
    |-- workflow-progress.ts
    `-- index.ts

apps/webapp/tests/lib/ai/runtime/
|-- delivery-chain-manager-contract.test.ts
|-- delivery-chain-manager-run.test.ts
|-- delivery-chain-manager-review-loop.test.ts  # 新增，避免旧 run suite 继续膨胀
|-- delivery-chain.test.ts
`-- delivery-chain-evaluation.test.ts            # 新增：manifest/harness 确定性检查

apps/webapp/tests/fixtures/delivery-chain-evaluation/
|-- manifest.json
`-- cases/

docs/adr/
`-- 0013-structured-supervisor-review-loop.md

docs/architecture/
`-- agent-runtime-roadmap.md
```

**Structure Decision**: 改动限定在现有 delivery-chain server runtime、对应测试与版本架构文档。Contract 由产生它的 manager 模块所有，通过 manager public entry 导出；不移动到全局 common/types，不触碰 Tasklist Agent、数据库或 stream-core。

## Implementation Phases

### Phase 1 - Closed Agent Contract Foundation

1. 新增 `agent-contracts.ts`，定义 Supervisor pre/post、Plan、Tasks、三类 Reviewer、Finding draft、RevisionRequest 与 canonical run-local entities 的 closed schemas。
2. 所有 root/nested object 使用 `.strict()`；类型全部从 schema 推导。Agent draft 不允许携带 Runtime-owned IDs。
3. 新增 `contract-invocation.ts`：structured output 首次校验失败后最多一次 repair；repair 只暴露受限的 `{path, code}` 摘要。
4. 在 delivery-chain model set 边界分别创建用户选定的业务 model handle 与固定 `deepseek/deepseek-v4-pro` Contract handle；仅后者验证 `jsonOutput` 能力，并与 provider transport `maxRetries` 分开记录 Contract repair。固定 Contract handle 的服务端 model resolution、关闭 reasoning、非流式调用和 `withStructuredOutput` transport 可参考 `apps/webapp/lib/ai/runtime/user-memory/candidate-extractor.ts`，但不得复用其记忆候选业务语义或失败收口。
5. 删除 generic `metadata: Record<string, unknown>` 作为业务事实源；保留的 Markdown 仅供展示。
6. 先完成 table-driven Contract 与 repair 测试。

### Phase 2 - Runtime-owned Supervisor Dispatch

1. 用结构化 Supervisor pre-decision 替换固定 Plan/Task/Review tool-call routing prompts。
2. 首次 Contract 与 policy 通过后由 Runtime 分配不可变 `dispatchPlanId`，创建本 run 唯一 `SupervisorDispatchPlan`。
3. `clarification_required` 与 `blocked` 在生成 Worker 启动前安全收口；`execute` 才进入 Plan/Tasks。
4. `delegation-policy.ts` 从单一 `maxToolCalls=5` 演进为阶段预算：固定阶段、每阶段 repair 上限、Review cycle 上限和 Revision 上限。

### Phase 3 - Typed Plan, Tasks and Review Group

1. Supervisor、Plan/Tasks Worker、三个 Reviewer 与 Revision Worker 均保持用户选定模型的业务生成；固定 Contract model 只将各角色结果转换为 role-specific structured output，Runtime 分配稳定 artifact ID、revision、cycleId 和 findingId。
2. Tasks 引用当前 Plan identity/revision；校验 task ID 唯一、依赖存在且无环、requirement/acceptance 摘要完整。
3. Supervisor 声明 Reviewer 集合；Runtime 在创建 invocation、发送 started progress 或执行任何 Reviewer 之前完成 exact multiset 校验。
4. 校验通过后由 Runtime 构造三项内部调用并并行执行；用 immutable artifact snapshot 保证同版输入。
5. Reviewer Contract 通过后 Runtime 分配 `cycleId` 和 `findingId`；ReviewBundle 记录 typed result 与 coverage failure。

### Phase 4 - Deterministic Status and First Review

1. 重写 `report-synthesis.ts` 的机器判断，只消费 typed artifacts/ReviewBundle。
2. 删除 disposition、severity、boundaryStatus 的 Markdown 正则、metadata cast、bullet 前缀合并和基于 Markdown 的 conflict 判断。
3. 建立纯函数状态矩阵：hard blocker、完整 review、1–2 Reviewer failure、3 Reviewer failure。
4. 展示专用 heading 归一化可保留，并用测试证明 Markdown 措辞不会改变状态。

### Phase 5 - One Revision and Direct Report Closure

1. 初次 Review 后调用 Supervisor post-review guidance Contract，并把说明追加到同一 DispatchPlan。
2. Runtime 依据已验证 `issue + required` finding 的 `targetArtifacts`，以固定 `plan`、`tasks` 顺序派生 RevisionRequest；Supervisor 不复制 `findingId`、不分组、也不计算目标集合。
3. `revise` 只允许 Plan、Tasks 或两者；两者同时返修时 Plan 在前、Tasks 对齐新 Plan。
4. Plan-only Revision 可保留 Tasks v1；返修沿用稳定 artifact ID、revision 递增，RevisionOutcome 保留源 finding 引用，但不声明 finding 已解决。
5. Revision 后不执行第二轮 Review Group；成功返修以 `needs_review` 收口，报告展示返修依据、修订结果和人工确认下一步。
6. post-review Supervisor 在 repair 后仍 invalid 时，run 以 `failed` 收口且不返修；安全报告仍保留已观察到的 coverage 与 blocker 证据。

### Phase 6 - Integration, Evaluation and Documentation

1. 将内部六种 `RunStatus` 适配到现有 public workflow progress；除执行完整性 `failed` 外，其余业务终态仍通过现有 completed channel 呈现。
2. 新增 Supervisor Decision、Revision 的内部 stepId/detail；无返修路径不发虚假阶段，任何路径都不发 Re-review。
3. 建立八类冻结 evaluation cases、统一 anchored rubric 和测试侧三 baseline adapters；实际运行三条 baseline，并将质量、耗时、调用次数与资源消耗的安全汇总记录到 `evaluation-results.md`。
4. 新增 ADR-0013 并更新 agent runtime roadmap；实现收口后再同步 README、version/release/tasklist 与 package version v0.4.11。
5. 执行 targeted stable tests、delivery-chain 回归、typecheck 与 lint；不修改历史 fixture、旧 specs 或历史 ADR 事实。

## Failure Precedence

状态解析按以下优先级执行：

1. **执行完整性失败**：Supervisor pre/post、Plan/Tasks、Revision Worker 在唯一 repair 后仍不合法，或合法 Review 调度后三个 Reviewer 全失败，状态为 `failed`。
2. **已验证 hard blocker**：在可形成可信业务 ReviewBundle 时，Boundary `blocked`、Risk `blocker`、General `blocked` 产生 `blocked`。
3. **覆盖不完整**：一至两个 Reviewer 失败且其余结果无 hard blocker，状态为 `needs_review`。
4. **未解决 required findings**：状态为 `needs_changes`。
5. **完整且无 required findings**：状态为 `pass`。

执行完整性失败不会删除已验证的 blocker/coverage 证据；安全失败报告必须展示这些事实，但不得伪造可继续执行的业务 ReviewBundle。

## Validation Strategy

- Contract：每个角色覆盖 valid、missing、wrong type、illegal enum、unknown root/nested、Runtime ID injection、Markdown conflict。
- Repair：1-call success、invalid→valid、invalid→invalid、safe issue summary、provider error 不触发 Contract repair。
- Policy：Reviewer set 的任意合法排列，以及 missing/duplicate/extra/unknown 在 Reviewer call count 为 0 时被拒绝。
- Identity：单一 dispatch identity、artifact stable ID/revision、finding run/cycle scope，以及 Runtime 派生 RevisionRequest 的引用与目标一致性。
- Status：三种 hard blocker、1/2/3 Reviewer failure、needs_changes、pass 与 post-Supervisor failure。
- Loop：Plan-only、Tasks-only、both revision；最多一次；返修后不复评；RevisionOutcome 保留来源与版本追踪。
- Compatibility：普通 chat、`/tasklist`、现有 `/delivery-chain` 输入、resource boundary、workflow progress、report UI 回归。
- Evaluation：冻结 manifest schema、三 baseline 同条件运行、统一评分、成本记录；真实 provider 评测与 deterministic suite 分离。

## Complexity Tracking

无 constitution violation。新增的 Contract runner、role schemas 和 phase policy 分别承载跨角色结构化边界、安全重试与核心业务规则，具备明确模块边界，不是为了测试而引入的通用抽象。
