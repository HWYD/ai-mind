# Spec 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30
建议 Change Level: Level C - Additive Workflow Progress Stream and Presentation Surface

## 评估结论

v0.3.7 建议聚焦为 Delivery Chain Workflow Progress + Presentation。

v0.3.6 已经把 `/delivery-chain` 收口为 LangGraph-controlled sequential workflow，但用户仍只能看到资源读取摘要和最终 Markdown 报告。下一版应该优先解决“执行过程可见、可解释、可演示”的问题，而不是提前进入 artifact handoff、多 Agent、HITL 或持久化。

本版本允许新增向后兼容的通用 workflow progress stream chunk：

```text
workflow-progress-start
workflow-progress-step
workflow-progress-end
```

该通道设计成通用能力，但 v0.3.7 的唯一 emit / consume 范围是 `/delivery-chain`。其他 Agent、普通 tool/resource/prompt、reader、utility 和 `/tasklist` 不使用该通道，也不改变现有展示。

## Summary

v0.3.7 在现有 `DeliveryChainGraph` 之上新增一层轻量执行过程展示：

```text
读取上下文 -> 方案规划 -> 任务拆解 -> 交付评审 -> 生成交付计划报告
```

用户体验目标：

- 执行中默认展开 process panel。
- step 随执行过程逐步出现，不预先展示完整 pending 列表。
- 每个 step 展示用户可理解的动作摘要，例如“已读取 demo 上下文 6 项”“调用模型：生成方案 (plan)”。
- 当 workflow 完成并开始输出最终报告时，process panel 自动折叠为一行摘要，例如“已处理 6m25s”。
- 用户可以点击摘要重新展开或折叠执行过程。
- 最终报告继续输出为 Delivery Chain Report，并增加更清晰的分段展示和 Markdown fallback。

## Goals

- 为 `/delivery-chain` 新增通用 workflow progress stream events。
- 新增通用 Workflow Progress message part / presentation component。
- `/delivery-chain` 执行时逐步展示已发生的 workflow steps，而不是一次性展示全部阶段。
- 执行中默认展开，完成后自动折叠为“已处理 X”摘要。
- 支持完成后点击展开 / 折叠查看过程。
- 固定展示 v0.3.6 的 `DeliveryChainGraph` 节点顺序对应的用户文案。
- 展示 `running`、`completed`、`failed` 状态。
- 在 step 中展示少量、安全、可读的“做了什么”摘要，例如读取了哪些 demo 文件、调用了哪个模型阶段，但不回放任意底层事件。
- 失败时展示脱敏失败信息，不暴露 raw provider error、stack、prompt、GraphState 或 resolver internals。
- 优化 Delivery Chain Report 分段展示；当分段解析失败时保留普通 Markdown fallback。
- 保持 v0.3.6 `/delivery-chain` resource compact grouping 不回退为多个大 ResourcePanel。
- 保持 `/tasklist`、AgentTracePanel、普通 ResourcePanel、tool、prompt、reader、utility 展示不受影响。

## Non-goals

v0.3.7 不做：

- 不新增 `/plan` public command。
- 不新增 `/task` public command。
- 不新增 `/review` public command。
- 不新增 PlanAgent / TaskAgent / ReviewAgent 独立运行时。
- 不让 TaskStage 调用 Tasklist Agent HITL Graph。
- 不实现真正 multi-agent orchestration。
- 不实现 `@artifact://`。
- 不做 session artifact handoff。
- 不做 artifact persistence。
- 不做 chat persistence。
- 不新增 Conversation / Message / MessagePart / Artifact 表。
- 不新增 Prisma schema 或 migration。
- 不修改 PostgresSaver schema。
- 不接 PostgresSaver。
- 不新增 checkpoint / interrupt / HITL / resume。
- 不修改 Tasklist Agent Graph topology。
- 不修改 Tasklist Agent HITL decision contract。
- 不恢复 `@docs://`。
- 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/`。
- 不做完整 observability 平台。
- 不做 Agent event store。
- 不做 LangSmith deep trace UI。
- 不把 workflow progress 写入数据库、checkpoint、artifact store 或 event store。
- 不让除 `/delivery-chain` 外的现有 Agent 自动消费 workflow progress UI。
- 不默认展示内部 node id、raw URI、MCP/local/service/debug preview 或 raw provider error。
- 不自动把普通 tool/resource/prompt chunks 逐条回放成 workflow progress 明细。
- 不把 workflow progress 面板升级成通用工具日志、资源日志或 observability transcript。

## User Stories

### US1: 执行中看到 Delivery Chain 正在做什么 (Priority: P1)

作为使用 `/delivery-chain` 的用户，我希望在交付计划生成过程中看到系统已经做了什么、正在做什么、调用了哪个规划/拆解/评审阶段，这样我不会只面对一个长时间等待的空白状态。

独立验收：

- 输入 `/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md` 后出现 workflow progress panel。
- panel 在执行中默认展开。
- step 随执行推进逐步出现。
- 当前 running step 有可见状态。
- 已完成 step 显示 completed 状态。
- 不预先展示尚未执行的 pending step 列表。

### US2: 完成后折叠执行过程并展示报告 (Priority: P1)

作为用户，我希望最终报告输出时执行过程自动收起，只保留一行“已处理 X”的摘要，这样界面保持整洁，同时我仍然可以需要时展开复盘过程。

独立验收：

- workflow 完成后，progress panel 自动折叠。
- 折叠摘要显示总耗时或安全降级摘要。
- 折叠摘要可点击展开。
- 展开后可看到本轮已经发生的 steps。
- 最终 Delivery Chain Report 正常显示在 progress panel 之后。

### US3: 报告更清晰地分段展示 (Priority: P2)

作为 reviewer，我希望 Delivery Chain Report 的输入来源、需求摘要、实现方案、任务拆解、交付评审、风险与边界、下一步建议分段更清晰，这样我能快速审阅报告质量。

独立验收：

- report headings 稳定时，UI 可以按 section 展示。
- section parsing 失败时，完整 Markdown 仍可正常展示。
- 不把 report section 误建模为持久 artifact contract。

### US4: 现有 Agent 和资源展示不回归 (Priority: P1)

作为维护者，我希望 `/tasklist`、Tasklist Agent trace、普通 resource/tool/prompt 展示完全不受 v0.3.7 影响，这样新增展示能力不会破坏已有主链路。

独立验收：

- `/tasklist + @demo://version-plans/*.md` 仍使用现有 AgentTracePanel / HITL 展示。
- 普通 resource 仍使用 ResourcePanel。
- `/delivery-chain` 的内部 demo resources 不回退为多个大 ResourcePanel。
- 新增 workflow progress chunk 对未知旧 chunk 消费路径保持向后兼容。

## Functional Requirements

### Stream protocol

- FR-037-01: 系统必须新增向后兼容的 `workflow-progress-start` stream chunk。
- FR-037-02: 系统必须新增向后兼容的 `workflow-progress-step` stream chunk。
- FR-037-03: 系统必须新增向后兼容的 `workflow-progress-end` stream chunk。
- FR-037-04: workflow progress chunk 必须使用 public DTO，不得包含 raw GraphState、raw Error、provider config、prompt、API key、cookie、真实文件路径或 resolver internals。
- FR-037-05: workflow progress chunk 必须可通过 `@ai-mind/stream-core` protocol type 和 webapp `chatStreamChunkSchema` 校验。
- FR-037-06: 新增 chunk 必须是 additive change，不得修改现有 `agent-graph-*`、resource、tool、prompt、text、artifact、reasoning、error chunk 的语义。

### Delivery Chain runtime

- FR-037-07: `/delivery-chain` 必须在执行前 emit `workflow-progress-start`。
- FR-037-08: `/delivery-chain` 必须围绕 `loadDeliveryChainContext`、`runPlanStage`、`runTaskStage`、`runReviewStage`、`buildDeliveryChainReport` emit progressive step updates。
- FR-037-09: step 必须按实际执行进度出现，不得在 start 时一次性 emit 所有未来 step。
- FR-037-10: node -> 用户文案映射必须固定为：
    - `loadDeliveryChainContext` -> `读取上下文`
    - `runPlanStage` -> `方案规划`
    - `runTaskStage` -> `任务拆解`
    - `runReviewStage` -> `交付评审`
    - `buildDeliveryChainReport` -> `生成交付计划报告`
- FR-037-11: 读取上下文 step 必须可以展示 demo 上下文读取摘要，例如“已读取 demo 上下文 6 项”。
- FR-037-12: Plan / Task / Review step 必须可以展示模型调用语义，例如“调用模型：生成方案 (plan)”。
- FR-037-13: workflow 完成后必须 emit `workflow-progress-end`，并在最终 report text 输出前让前端具备自动折叠依据。
- FR-037-14: stage 失败时必须 emit failed step 或 failed workflow end，并展示脱敏失败摘要。

### Frontend reducer and message model

- FR-037-15: 前端 reducer 必须把 workflow progress chunks 映射为新的 message part，不复用 `agent-step`。
- FR-037-16: 新的 message part 必须可表达 running / completed / failed steps。
- FR-037-17: reducer 必须支持同一 step 的 running -> completed / failed 更新。
- FR-037-18: reducer 必须在 `workflow-progress-end` 后把该 part 标记为 completed / failed，并记录用于折叠摘要的 duration 或 summary。
- FR-037-19: reducer 不得改变 Tasklist Agent `agent-step` 合并逻辑。

### Frontend presentation

- FR-037-20: 新增或扩展通用 Workflow Progress component，首版只在 `/delivery-chain` assistant message 中展示。
- FR-037-21: progress panel 执行中默认展开。
- FR-037-22: progress panel 完成后默认折叠为一行摘要，例如“已处理 6m25s”。
- FR-037-23: progress panel 必须支持点击展开和折叠。
- FR-037-24: progress panel 不应使用 Tasklist Agent 时间线样式。
- FR-037-25: progress panel 不应展示内部 node id，除非未来另有 debug 模式 spec。
- FR-037-26: panel 内部可以用 icon、状态点、简短说明表现 step，但必须保持界面整洁。
- FR-037-27: 资源摘要应优先整合进 progress step，避免 `/delivery-chain` 同时出现重复的大 ResourcePanel。
- FR-037-27a: progress step details 必须是 runtime 构造的安全摘要，不得自动串接任意 tool/resource/prompt 事件明细。

### Report presentation

- FR-037-28: Delivery Chain Report 必须继续作为非持久化输出展示。
- FR-037-29: UI 可以基于稳定 Markdown heading 做 section parsing。
- FR-037-30: report section parsing 失败时必须 fallback 到完整 Markdown。
- FR-037-31: 本版本不得把 report section 变成 artifact handoff contract、DB entity 或 `@artifact://`。

### Non-regression

- FR-037-32: `/tasklist` 必须继续使用现有 AgentTracePanel 和 HITL 展示。
- FR-037-33: 普通 ResourcePanel、ToolPanel、PromptPanel、SkillPanel 展示不得受影响。
- FR-037-34: v0.3.6 resource compact grouping 必须保持。
- FR-037-35: `/delivery-chain` 的 explicit requirement resource 不得回退为大 ResourcePanel。
- FR-037-36: 本版本不得新增 Prisma schema、PostgresSaver schema、checkpoint、interrupt、resume 或 HITL。

## Key Entities and Contracts

本版本不新增数据库实体。

本版本新增的是 stream/presentation-level contract：

- `WorkflowProgressStartChunk`
- `WorkflowProgressStepChunk`
- `WorkflowProgressEndChunk`
- `WorkflowProgressPart`
- `WorkflowProgressStep`
- `DeliveryChainWorkflowStepMap`
- `ReportSection` UI parsing result

这些实体只存在于一次 chat stream 和前端消息树中，不进入 DB、PostgresSaver、checkpoint、artifact store 或 Agent event store。

## Edge Cases

- `/delivery-chain` 空输入 fail closed：不应出现 workflow progress panel，只输出安全提示。
- 输入资源被拒绝：不应出现 workflow progress panel，只输出安全提示。
- scenario context 缺失：读取上下文 step completed，但 summary 中标注降级。
- rubric / governance 缺失并使用 fallback：读取上下文 step completed，并在 details 中显示安全降级摘要。
- PlanStage 失败：方案规划 step failed，后续报告使用 fallback 文本继续生成时必须显式标注。
- TaskStage 失败：任务拆解 step failed，后续报告使用 fallback 文本继续生成时必须显式标注。
- ReviewStage 失败：交付评审 step failed，review disposition 默认 needs_changes，并标注人工确认。
- build report 失败：生成报告 step failed，workflow end failed，输出安全失败摘要。
- 用户中止请求：如当前流式运行能捕捉 abort，可用 failed 风格的安全摘要；不新增 resume。
- 旧消息或没有 workflow progress part 的消息：继续按现有 text/resource/artifact 展示。

## Future Roadmap Guardrail

v0.3.7 的通用 workflow progress channel 是为了给未来 Agent 展示留扩展点，但不实现后续版本内容。

- v0.4.0 的 `@artifact://` 和 session artifact handoff 不进入本版本。
- v0.4.1 的 Agent Catalog / Runtime Contract 不进入本版本。
- v0.4.2 的 controlled multi-agent orchestration 不进入本版本。
- v0.4.3 的 HITL-aware multi-agent 不进入本版本。
- v0.5.0 的 chat persistence foundation 不进入本版本。

如果实现过程中发现必须新增 DB schema、checkpoint/resume、artifact handoff 或 Tasklist Agent topology change，必须暂停并重开对应版本 spec。

## Success Criteria

v0.3.7 完成后，项目应该能回答：

- `/delivery-chain` 现在如何让用户看到执行过程？
- 为什么使用 `workflow-progress-*` 而不是复用 `agent-graph-*`？
- 为什么 step 逐步出现，而不是提前渲染完整 pending 列表？
- 为什么执行中默认展开，完成后默认折叠？
- workflow progress 是否是 persistent trace？答案必须是否定。
- workflow progress 是否影响 `/tasklist`？答案必须是否定。
- Report section parsing 失败时如何降级？
- 为什么本版本仍不做 `@artifact://`、多 Agent、HITL、checkpoint 或持久化？
