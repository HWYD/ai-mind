# Decisions 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

## D037-01: v0.3.7 聚焦 workflow progress presentation

决定：
v0.3.7 优先解决 `/delivery-chain` 的执行过程可见性，而不是提前进入 artifact handoff、多 Agent、HITL 或持久化。

理由：

- v0.3.6 已经跑通 `DeliveryChainGraph`，但用户仍然主要只看到资源读取摘要和最终 Markdown 报告。
- 当前最明显的体验缺口是“系统正在做什么”不可见。
- 先把过程展示做好，才能为后续 artifact handoff 和多 Agent 演进打 UX 基础。

## D037-02: 新增通用 `workflow-progress-*` stream chunks

决定：
新增：

```text
workflow-progress-start
workflow-progress-step
workflow-progress-end
```

理由：

- 用户已经明确希望这套展示模式未来能被其他 Agent 复用。
- 命名不应绑定 `delivery-chain`，否则后续会重复设计。
- 首版仍只让 `/delivery-chain` emit / consume，先把回归范围控制住。

## D037-03: 不复用 `agent-graph-*`

决定：
`/delivery-chain` 的过程展示不复用 Tasklist Agent 的 `agent-graph-node-*` 系列 chunk。

理由：

- 复用后会自然落到 `AgentTracePanel` 时间线 UI。
- 本版目标是整洁的 process panel，不是 graph timeline 或 debug trace。
- Tasklist Agent 的 HITL / graph trace 语义比当前 Delivery Chain presentation 更重。

## D037-04: steps 按实际开始顺序逐步出现

决定：
`workflow-progress-start` 不携带完整 step list；step 只在实际开始时逐步出现。

理由：

- 用户明确要求“一步步出现”，不是一开始就看到完整流程清单。
- 这样不会把尚未发生的 future steps 伪装成既定轨迹。
- 这更符合 Codex / Cursor / GPT 一类 Agent 产品的过程感知方式。

## D037-05: 运行时展开，完成后折叠

决定：
process panel 在执行中默认展开，在 `workflow-progress-end` 后默认折叠为一行摘要。

理由：

- 执行中用户需要降低等待焦虑。
- 完成后用户的注意力应该回到最终 Delivery Chain Report。
- 折叠摘要保留复盘入口，同时保持界面整洁。

## D037-06: 组件和事件通道通用化，但首版只绑定 `/delivery-chain`

决定：
组件命名和数据结构使用 `WorkflowProgress*`，但 v0.3.7 只在 `/delivery-chain` 中接入。

理由：

- 后续新 Agent 可以直接复用同一种展示方式。
- 当前版本不扩大到 `/tasklist` 或普通 tool/resource/prompt。
- 这样既保留扩展性，也不让这一版的回归范围失控。

## D037-07: workflow progress 是 presentation，不是 persistence

决定：
workflow progress 不进入 DB、PostgresSaver、checkpoint、artifact store 或 event store。

理由：

- v0.3.7 只解决当前流式执行的过程可见性。
- durable trace 会引入 schema、restore、retention 和隐私边界，属于后续版本。

## D037-08: report sections 保持 UI-level parsing

决定：
Delivery Chain Report 的分段展示先在 UI 基于 Markdown heading 解析；解析失败时 fallback 到完整 Markdown。

理由：

- 当前 report builder 已有相对稳定的 headings。
- 现在不应该把 report sections 提前固化成 artifact handoff contract。
- fallback 可以消化 LLM 格式漂移风险。

## D037-09: 保持 resource compact grouping

决定：
v0.3.6 的 `/delivery-chain` resource compact grouping 必须保持；v0.3.7 可以把上下文读取摘要并入 progress step，但不能让多个大 ResourcePanel 回来。

理由：

- 用户需要感知读取了什么，但不需要调试级 resource cards 占满界面。
- `/tasklist` 和普通资源展示不能因此回归。

## D037-10: step details 必须是 curated summary，不是自动回放日志

决定：
workflow progress panel 中的 step details 只展示 runtime 显式构造的安全摘要，例如“读取文件: context.md”或“调用模型: 生成方案 (plan)”；不自动把普通 tool/resource/prompt 事件逐条回放进 panel。

理由：

- 用户要的是可理解的工作过程，而不是完整调试日志。
- 自动回放底层事件会迅速膨胀成通用 observability transcript。
- v0.3.7 只需要让 `/delivery-chain` 可解释、可演示，不需要重做现有 tool/resource 展示体系。
