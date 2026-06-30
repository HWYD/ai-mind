# Research 037: Delivery Chain Workflow Progress Presentation

状态: 已完成
版本: v0.3.7
日期: 2026-06-30

## Decision 1: Change Level is Level C

结论：v0.3.7 是 Level C - Additive Workflow Progress Stream and Presentation Surface。

理由：

- 修改 user-visible `/delivery-chain` runtime presentation。
- 新增 stream protocol chunk，但为 additive change。
- 新增 reducer/message part/UI presentation。
- 不修改 DB、Prisma、PostgresSaver、checkpoint、HITL、Tasklist Agent topology 或 artifact contract。

备选：

- Level B：不合适，因为新增 stream chunks 和 reducer state shape，影响跨模块 contract。
- Level D：暂不需要，因为没有持久化、DB schema、checkpoint/resume 或跨 Agent orchestration。

## Decision 2: Use generic `workflow-progress-*` chunks

结论：新增通用 chunk：

```text
workflow-progress-start
workflow-progress-step
workflow-progress-end
```

理由：

- 用户明确希望设计通用一点，后续新 Agent 大概率采用类似展示。
- Delivery Chain 首版消费，但协议名字不绑定 Delivery Chain。
- 比 `delivery-chain-process-*` 更适合作为长期 UI primitive。

备选：

- `delivery-chain-process-*`：实现简单，但会在未来新 Agent 上重复设计。
- 复用 `agent-graph-*`：会落入 Tasklist Agent trace/time line UI，不符合本版整洁 process panel。
- 只输出 Markdown 过程文本：无法做到执行中逐步出现、完成后自动折叠和 structured UI。

## Decision 3: Steps appear progressively

结论：`workflow-progress-start` 不带完整 step list；每个 step 在实际开始时才 emit。

理由：

- 用户明确要求流程一步步出现，不是一开始就展示全部流程。
- 这样更接近 Codex/Cursor/GPT 类 Agent 产品的“正在做什么”体验。
- 避免把尚未执行的未来步骤伪装成已知执行轨迹。

备选：

- start 时带全部 pending steps：看起来更像 checklist，但不符合用户反馈。

## Decision 4: Expanded while running, collapsed when report begins

结论：执行中默认展开；`workflow-progress-end` 后自动折叠为“已处理 X”，随后展示最终报告。

理由：

- 执行中用户需要感知进度。
- 完成后主要注意力应该回到 Delivery Chain Report。
- 折叠摘要保留复盘入口，不让过程占据太多界面空间。

## Decision 5: First consumer is `/delivery-chain` only

结论：协议和组件通用，v0.3.7 只让 `/delivery-chain` emit / consume。

理由：

- 控制回归范围。
- 不影响 Tasklist Agent HITL trace、普通 resource/tool/prompt 展示。
- 为后续 Agent 复用留出稳定 contract。

## Decision 6: Keep resource chunks but reduce visible duplication

结论：v0.3.7 可以继续 emit `resource-start/resource-end`，用于兼容现有读取状态和 compact grouping；但 `/delivery-chain` 可优先在 workflow progress 的“读取上下文”step 中展示资源摘要。

理由：

- v0.3.6 已依赖 resource chunks 做 compact grouping。
- 直接移除 resource chunks 风险更大。
- 用户界面上不应重复展示多个大 ResourcePanel。

## Decision 7: Report section parsing stays presentation-level

结论：报告分段展示先做 UI-level Markdown heading parsing，失败 fallback 到完整 Markdown。

理由：

- 当前 report headings 已稳定，足够支撑 presentation enhancement。
- 把 report section 变成 runtime contract 会过早靠近 artifact handoff。
- fallback 可以控制 LLM / heading 漂移风险。

## Decision 8: Workflow progress is not durable trace

结论：workflow progress 不进入 DB、PostgresSaver、checkpoint、artifact store 或 Agent event store。

理由：

- v0.3.7 目标是前端执行过程可见，不是可查询 trace 平台。
- durable trace 会牵动 persistence、schema、retention、privacy 和 restore 设计，属于后续版本。
