# Spec 036: Controlled Delivery Chain MVP

状态: 已完成
版本: v0.3.6
日期: 2026-06-30
建议 Change Level: Level C - Controlled Agent Runtime Extension

## 评估结论

该需求仍然适合作为 v0.3.6 的 Level C 版本推进。

本轮不是新增 public capability，而是对 v0.3.6 内部 runtime 口径做一次实现修正：将 `/delivery-chain` 从手写 sequential workflow 收口为 **LangGraph-controlled sequential workflow**。

修正后的关键边界是:

- 对外仍只暴露 `/delivery-chain`。
- `/plan`、`/task`、`/review` 仍只作为内部 stage 概念，不作为 public command。
- TaskStage 不调用现有 Tasklist Agent HITL Graph，不产生 nested HITL。
- v0.3.6 使用 LangGraph `StateGraph` 表达固定 workflow，但 **不接 PostgresSaver**、**不新增 checkpoint**、**不新增 interrupt**、**不新增 HITL**、**不新增真正多 Agent**。
- Delivery Chain Report 仍是本次 run 内的非持久化输出，不引入 artifact persistence、`@artifact://`、DB schema、stream protocol 或 frontend reducer 结构变更。
- 所有文件资源继续只来自 `@demo://`，不得读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/`。

## Summary

v0.3.6 新增 public command:

```text
/delivery-chain
```

该入口把用户输入转成一份受控交付链路报告:

```text
需求理解 -> 实现方案 -> 任务拆解 -> 交付评审 -> Delivery Chain Report
```

内部技术定位调整为:

```text
LangGraph-controlled sequential workflow
```

内部固定执行链路:

```text
resolveDeliveryChainInvocation (graph 外)
  -> DeliveryChainGraph
       -> loadDeliveryChainContext
       -> runPlanStage
       -> runTaskStage
       -> runReviewStage
       -> buildDeliveryChainReport
```

`DeliveryChainGraph` 是受控 workflow graph，不是 autonomous multi-agent group chat，也不是 checkpoint / interrupt / resume graph。

## Goals

- 新增 `/delivery-chain` public command。
- 支持 `/delivery-chain + @demo://scenarios/*/requirement.md`。
- 支持 `/delivery-chain <inline requirement text>`。
- 基于 `@demo://` 读取 demo scenario、rubrics 和 governance。
- 内部使用 LangGraph `StateGraph` 表达固定顺序的 Delivery Chain workflow。
- 固定执行 `loadDeliveryChainContext -> PlanStage -> TaskStage -> ReviewStage -> BuildReport`。
- 输出报告包含需求摘要、默认假设、方案、任务、评审、风险、非目标和下一步建议。
- 保持 v0.3.5 resource boundary，不读取真实项目目录。
- 保持现有 `/tasklist + @demo://version-plans/*.md` 能力不变。
- 保持 Tasklist Agent Graph、HITL、stream、frontend reducer、Prisma、PostgresSaver 非回归。
- 记录长期 Agent Runtime roadmap，但 roadmap 不进入 v0.3.6 实现范围。

## Non-goals

v0.3.6 不做:

- 不暴露 `/plan` public command。
- 不暴露 `/task` public command。
- 不暴露 `/review` public command。
- 不实现真正多 Agent orchestration。
- 不新增 Plan Agent、Task Agent、Review Agent 独立运行时。
- 不改造现有 Tasklist Agent 为泛任务 Agent。
- 不在 `/delivery-chain` 内嵌套调用 Tasklist Agent HITL Graph。
- 不实现 `@artifact://`。
- 不做 artifact handoff。
- 不做 artifact persistence。
- 不新增聊天持久化。
- 不新增 Conversation、Message、MessagePart、Artifact 表。
- 不新增 Prisma schema 或 migration。
- 不修改 PostgresSaver schema。
- 不在 `/delivery-chain` 中接入 PostgresSaver 或其他 durable checkpointer。
- 不新增 checkpoint / resume 语义。
- 不新增 interrupt。
- 不新增 HITL。
- 不修改 Tasklist Agent Graph topology。
- 不修改 Tasklist Agent HITL decision contract。
- 不修改 stream protocol。
- 不修改 frontend reducer 数据结构。
- 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/`。
- 不写真实代码文件。
- 不做源码级 code review。
- 不自动将普通聊天裸输入路由到 `/delivery-chain`。
- 不实现 AutoGen 式 group chat、Agent 自由互相调用、Agent message bus 或 multi-agent memory。

## User Stories

### US1: Demo scenario backed Delivery Chain

作为公开 demo 用户，我希望选择一个 demo scenario，让系统自动生成需求理解、实现方案、任务拆解和交付评审，这样我可以看到 AI Mind 如何从需求走到交付链路报告。

独立验收:

- 输入 `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md` 可以进入 Delivery Chain。
- 系统读取同 scenario 下的 `requirement.md` 和 `context.md`。
- 系统可以读取 `@demo://rubrics/*.md` 和 `@demo://governance/*.md`。
- 系统不读取真实项目目录。
- 最终输出 Delivery Chain Report。
- 报告包含 Plan、Task、Review 三个主要部分。

### US2: Inline requirement Delivery Chain

作为用户，我希望可以直接写一段需求，而不是必须选择文件，这样我可以快速体验 Delivery Chain 能力。

示例:

```text
/delivery-chain 帮我规划一个登录表单，支持手机号、密码、记住登录、错误提示和加载状态
```

独立验收:

- 显式 `/delivery-chain <文本>` 可以进入 inline requirement 模式。
- 系统基于用户需求生成 Delivery Chain Report。
- 系统明确说明这是规划与交付评审报告，不会直接修改代码。
- 如果需求过短，系统输出默认假设和待补充信息。

### US3: Resource boundary remains closed

作为维护者，我希望 `/delivery-chain` 继续只读取 `@demo://` 资源，这样后续 Agent 能力不会重新打开真实项目目录读取边界。

独立验收:

- `/delivery-chain + @docs://...` 被拒绝。
- `/delivery-chain + docs://...` 被拒绝。
- `/delivery-chain + @specs://...` 被拒绝。
- `/delivery-chain + file://...` 被拒绝。
- path traversal 被拒绝。
- `@demo://../../apps/webapp/package.json` 被拒绝。
- 系统不扫描真实 repo。

### US4: MVP does not become premature multi-agent

作为 reviewer，我希望 v0.3.6 只是 Delivery Chain MVP，而不是完整多 Agent 平台，这样版本范围可控。

独立验收:

- 没有新增 `/plan`、`/task`、`/review` public command。
- 没有新增 PlanAgent、TaskAgent、ReviewAgent 独立运行时。
- 没有新增 Agent message bus。
- 没有新增 `@artifact://`。
- 没有新增 artifact persistence。
- 没有新增聊天持久化。
- 没有新增 DB schema。
- 没有 nested HITL。
- 没有把 `/delivery-chain` 升级成 checkpoint / interrupt / resume graph。

### US5: Roadmap is recorded but guarded

作为维护者，我希望 v0.3.6 文档记录 v0.3.7-v0.5.0 的长期演进路线，这样后续 Spec Kit 规划能继承这条路线，但不会把未来版本误实现进 v0.3.6。

独立验收:

- 新增或更新 `docs/architecture/agent-runtime-roadmap.md`。
- 新增 ADR 记录 Delivery Chain、artifact-first handoff、future multi-agent 的关键决策。
- v0.3.6 spec 中包含 Future Roadmap guardrail。
- roadmap 明确不属于当前实现范围。

## Functional Requirements

### Command and routing

- FR-036-01: 系统必须新增 `/delivery-chain` command route。
- FR-036-02: 系统必须只在用户显式输入 `/delivery-chain` 时进入 Delivery Chain。
- FR-036-03: 普通聊天裸输入不得自动进入 Delivery Chain。
- FR-036-04: `/delivery-chain + @demo://scenarios/*/requirement.md` 必须进入 scenario-backed Delivery Chain。
- FR-036-05: `/delivery-chain <inline requirement text>` 必须进入 inline requirement Delivery Chain。
- FR-036-06: `/delivery-chain` 后既没有 resource 也没有文本时，必须 fail closed，并提示用户提供 demo scenario 或需求文本。

### Resource boundary

- FR-036-07: Delivery Chain 只能读取 `@demo://` 资源。
- FR-036-08: Delivery Chain 必须复用 v0.3.5 demo resource resolver。
- FR-036-09: Delivery Chain 必须拒绝 `@docs://`、`docs://`、`@specs://`、`file://`、真实绝对路径、path traversal、反斜杠路径和未知 scheme。
- FR-036-10: Scenario-backed 模式只允许读取 `@demo://scenarios/*/requirement.md` 作为入口。
- FR-036-11: 如果读取 scenario context，只能读取同 scenario 目录下的 `context.md`。
- FR-036-12: rubrics 只能读取 `@demo://rubrics/*.md`。
- FR-036-13: governance 只能读取 `@demo://governance/*.md`。
- FR-036-14: Delivery Chain 不得扫描真实仓库目录。
- FR-036-15: `/delivery-chain + @demo://version-plans/*.md` 必须被拒绝或提示该资源属于 Tasklist Agent version plan。

### Runtime

- FR-036-16: 系统必须在 `/delivery-chain` 内部使用 LangGraph `StateGraph` 实现 Delivery Chain workflow。
- FR-036-17: `resolveDeliveryChainInvocation()` 与边界 fail-closed 提示必须保持在 graph 外，graph 只接收归一化后的可执行输入。
- FR-036-18: Delivery Chain graph 必须包含 `loadDeliveryChainContext` 节点，用于加载 requirement、context、rubrics 和 governance。
- FR-036-19: Delivery Chain graph 必须按固定顺序执行 `runPlanStage -> runTaskStage -> runReviewStage -> buildDeliveryChainReport`。
- FR-036-20: PlanStage 必须输出 Implementation Plan section。
- FR-036-21: TaskStage 必须输出 Task Breakdown section。
- FR-036-22: ReviewStage 必须输出 Delivery Review section。
- FR-036-23: 系统必须最终输出 Delivery Chain Report，且报告必须明确这是规划与评审报告，不是代码修改结果。
- FR-036-24: 如果输入信息不足，Report 必须列出默认假设和需要补充的问题。

### Artifact and output

- FR-036-25: v0.3.6 的 report 必须是非持久化输出。
- FR-036-26: Delivery Chain graph 不得接入 PostgresSaver 或其他 durable checkpointer。
- FR-036-27: Delivery Chain graph 不得引入 interrupt、HITL、checkpoint resume 或 nested resume 语义。
- FR-036-28: 内部 stage output 可以作为 graph state 传递，但不得暴露 `@artifact://`。
- FR-036-29: 本版本不得新增 session artifact handoff。
- FR-036-30: 本版本不得新增数据库 Artifact 表。

### Existing runtime non-regression

- FR-036-31: 不得修改现有 Tasklist Agent Graph topology。
- FR-036-32: 不得修改现有 Tasklist Agent HITL decision schema。
- FR-036-33: 不得修改 existing checkpoint resume 语义。
- FR-036-34: 不得修改 AgentRun / AgentInterrupt schema。
- FR-036-35: 不得修改 stream protocol。
- FR-036-36: 不得修改 frontend reducer 数据结构。
- FR-036-37: 不得修改 Prisma schema。
- FR-036-38: 不得修改 PostgresSaver schema。
- FR-036-39: 不得修改 v0.3.4 Tasklist Agent LangSmith observer 语义。

### Frontend and demo UX

- FR-036-40: slash command menu 必须新增 `/delivery-chain` 入口。
- FR-036-41: 快速访问可以新增 Delivery Chain demo 示例。
- FR-036-42: 快速访问推荐示例可使用 `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md`。
- FR-036-43: 快速访问也可提供 inline requirement 示例。
- FR-036-44: resource picker 如展示 scenario，必须只展示 `@demo://scenarios/*/requirement.md`，不得展示 `plan.sample.md`、`tasks.sample.md`、`review.expected.md` 作为普通用户入口。
- FR-036-45: resource picker 不得恢复真实 docs catalog。

### Docs and roadmap

- FR-036-46: 必须新增或更新 `docs/architecture/agent-runtime-roadmap.md`。
- FR-036-47: 路线文档必须说明 v0.3.6-v0.5.0 的阶段关系。
- FR-036-48: 必须新增 ADR，记录 v0.3.6 到 future multi-agent / artifact handoff 的关键取舍。
- FR-036-49: Spec 中的 Future Roadmap 必须明确不属于 v0.3.6 实现范围。

### Delivery Chain presentation guardrail

- FR-036-50: `/delivery-chain` assistant message 中内部自动读取的 demo resources（`context.md`、`rubrics/*.md`、`governance/*.md`）默认必须聚合为紧凑的“已读取 demo 上下文 N 项”摘要，而不是连续展开多个大 ResourcePanel。
- FR-036-51: `/delivery-chain` 中用户显式选择的 scenario `requirement.md` 不应继续使用与普通资源读取相同的大 ResourcePanel 形态；它应收敛进轻量分组列表或报告输入来源语义中。
- FR-036-52: 该紧凑分组展示只作用于 `/delivery-chain` 场景中的内部自动读取 demo resources，不得影响 `/tasklist`、普通 MCP resource、reader skill、utility skill 或普通聊天中的现有 ResourcePanel 展示逻辑。
- FR-036-53: 展开摘要后只展示轻量分组列表；`URI`、`MCP`、`local`、`service`、`preview` 等调试信息不得默认展示，如需保留只能进入二级 debug 详情。

## Key Entities and Contracts

本版本不新增数据库实体。

本轮口径修正后的核心 runtime contracts 应围绕以下概念展开:

- `DeliveryChainInput`
- `DeliveryChainStage`
- `DeliveryChainStageResult`
- `DeliveryChainGraphState`
- `DeliveryChainReportArtifact`

本轮已同步修正核心 spec 资产、`data-model.md`、`contracts/`、roadmap 和 ADR，避免继续保留 sequential runner 口径。

## Edge Cases

- 用户只输入 `/delivery-chain`: fail closed，提示提供 scenario 或需求文本。
- 用户输入 `/delivery-chain + @docs://...`: 拒绝，并提示使用 `@demo://scenarios/*/requirement.md` 或直接输入需求。
- 用户输入 `/delivery-chain + @demo://version-plans/*.md`: 拒绝，提示这是 Tasklist Agent version plan，不是 Delivery Chain scenario requirement。
- 用户输入 `/delivery-chain + @demo://scenarios/request-limit-banner/context.md`: 拒绝，入口必须是 `requirement.md`。
- 用户输入 `/delivery-chain + @demo://scenarios/request-limit-banner/plan.sample.md`: 拒绝作为入口，提示选择 `requirement.md`。
- 用户输入 path traversal: 拒绝。
- 用户输入 inline requirement 过短: 输出默认假设和需要补充信息。
- 用户输入“帮我写代码”: 输出交付链路规划，不写真实文件。
- 用户要求读取真实项目源码: 拒绝，并说明 public demo 只允许 `@demo://`。
- 用户要求 review 真实代码: 拒绝，说明本版本是 delivery review，不是 code review。
- LLM 失败: 输出 soft fail error，不暴露 raw provider error。
- scenario context 缺失: 可以降级为 requirement-only，但必须在报告中标注 context missing。
- rubric 缺失: 使用内置最低限度 rubric 或 fail closed，由实现阶段 decision 固化。
- governance 缺失: 必须至少保留 resource boundary 和 no-code-write 约束。

## Future Roadmap Guardrail

v0.3.6 文档可以记录未来路线，但不得实现未来版本能力。

- v0.3.7: Delivery Chain presentation and trace。
- v0.4.0: Session artifact handoff and `@artifact://last-*`。
- v0.4.1: Agent Catalog and runtime contract。
- v0.4.2: Controlled multi-agent orchestration。
- v0.4.3: HITL-aware multi-agent。
- v0.5.0: Chat persistence foundation。

这些路线只作为上下文，不属于 v0.3.6 tasks。

## Success Criteria

v0.3.6 修正完成后，项目应该能回答:

- `/delivery-chain` 是什么？
- 为什么 v0.3.6 只暴露一个主入口？
- 为什么 `/plan`、`/task`、`/review` 暂时不作为 public command？
- scenario-backed 输入和 inline requirement 输入有什么区别？
- DeliveryChainGraph 是 multi-agent graph 吗，还是受控 sequential workflow？
- 为什么 v0.3.6 要用 LangGraph，但又不接 PostgresSaver、不做 checkpoint、不做 interrupt、不做 HITL？
- PlanStage、TaskStage、ReviewStage 各自负责什么？
- 为什么 TaskStage 不等同于现有 Tasklist Agent HITL？
- 为什么本版本不做 artifact handoff？
- 为什么本版本不做真正多 Agent？
- 为什么本版本不做 chat persistence？
- 后续怎么平滑演进到 artifact-first handoff 和 controlled multi-agent workflow？
