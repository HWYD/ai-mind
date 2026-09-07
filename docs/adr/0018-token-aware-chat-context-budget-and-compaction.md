# ADR-0018: Token-aware Chat Context Budget and Compaction

**Status**: Implemented — v0.5.4

**Date**: 2026-09-01

**Owners**: AI Mind Runtime

**Related**: [ADR-0012](./0012-chat-thread-memory-baseline.md), [ADR-0013](./0013-tool-agent-final-turn-memory.md), [v0.5.4 spec](../../specs/v0.5.4-token-aware-memory-compaction/spec.md)

## Context

现有 Chat Thread Memory 使用固定 recent turn/message 数量触发压缩，并在压后保留固定数量的 recent turns。长对话达到阈值后，即使每轮内容很短，也可能每轮再次压缩。与此同时，现有字符级输入限制无法表达完整模型输入中的 system instructions、Tool schema、Capability Context、UserMemory 与结构化消息占用；因此 checkpoint 压缩成功不等于下一次请求一定能进入模型。

主流云端模型已经普遍提供 128K 以上、部分达到 1M 的物理窗口，但应用若默认吃满物理窗口，会放大费用、首 token 延迟和 Provider 差异。本地 Ollama 还需要受 artifact context 与 KV cache 资源约束。AI Mind 需要把模型物理能力、产品运行上限和单请求实际预算分开管理。

## Decision

### Physical capability and operational cap are separate

模型目录保存 server-only `contextWindowTokens`。普通聊天按环境得到有效窗口：

```text
effectiveWindow =
  cloud: min(model.contextWindowTokens, 128000)
  ollama: min(model.contextWindowTokens, 32768)
```

Ollama Provider 显式使用 `numCtx=32768`，同时不得超过模型 artifact 的物理窗口。该元数据不进入 `PublicChatModel` 或前端 DTO。

### One deterministic context budget

当前 chat 最大输出预留为 4096 tokens：

```text
runtimeReserve = max(8192, ceil(effectiveWindow × 10%))
hardInputBudget = effectiveWindow - 4096 - runtimeReserve
compactionTrigger = floor(hardInputBudget × 70%)
postCompactionTarget = floor(hardInputBudget × 35%)
```

| Environment | Effective window | Hard input | Trigger | Target |
| ----------- | ---------------: | ---------: | ------: | -----: |
| Cloud       |          128,000 |    111,104 |  77,772 | 38,886 |
| Ollama      |           32,768 |     20,480 |  14,336 |  7,168 |

`AI_MIND_MAX_INPUT_CHARS=12000` 继续作为最新单条用户输入/请求体的 abuse guard，不再用于验证已组装的完整模型输入。

### Shared conservative token estimation

Runtime 使用 `js-tiktoken/o200k_base` 估算模型可见 role、text、structured payload、tool calls/results 与 framing，并在合计后增加 10% Provider 偏差安全系数。日志只记录数值、原因和 fallback 枚举，不记录原始 payload。

### Token-triggered persistent compaction

固定 turn/message count trigger 被删除。chat memory 达到 token trigger 时，一个请求最多尝试一次持久化压缩：

- 输入包含旧 summary、pinned decisions 和全部 recent messages。
- 生成结果最多 3000 tokens。
- raw retention 只按 newest-first 保存完整 user/assistant turns。
- 超大最后一轮整体进入 summary，不拆断 raw turn。
- 候选只有在 schema 合法、完整轮次、不超过 target 且严格小于原上下文时才原子更新 checkpoint。

### Request continuity uses non-persisted fitting

生成、校验或 candidate 保存失败时，旧 summary、pins 和 `lastCompactedAt` 不变。当前回答完成后，Runtime 基于 last durable checkpoint 独立尝试 raw final-turn append；若该第二次 write 也失败，则保留 last durable checkpoint、记录脱敏 `raw-append-failed` 且不撤销回答。当前请求使用只读 ephemeral fit：优先放入 pins、summary，再从新到旧加入完整 turns。Durable `pinnedDecisions` 解释为 oldest-to-newest，最新项位于末尾；pins 单独超出可用 memory budget 时从数组末尾向前保留完整项，其余只在当前请求省略且不裁剪单条 pin。该 projection 不写回 ThreadState。

仅当完全排除 chat memory 后，system instructions、Tool/Capability payload、UserMemory 和最新问题自身仍超过 hard input budget 时，才返回现有输入过长错误。

### Orchestrator owns complete-input preflight

所有注入 chat memory 的 direct answer、tool planning/final、Composer Context 和 Capability Context 模型调用统一经过 Chat Orchestrator preflight。Route 保持 HTTP 边界，Provider 接收已经拟合的输入，Chat Memory 只负责持久化状态和 compaction 候选。

### Compatibility boundaries remain unchanged

- ThreadState 字段仍为 `messages/summary/pinnedDecisions/lastCompactedAt`，但移除固定四条消息验证限制。
- hydration DTO、公开 API、`thread-memory-status` chunk、前端 reducer 和数据库 schema 不变。
- Delivery/Tasklist 继续只持久化最终用户可见 turn；GraphState、RuntimeArtifact、tool transcript 和 raw results 不进入 chat memory。
- 压缩 success、failure、cancellation 与 request finalization 均结束现有 status，避免 UI 卡在 compressing。

## Relationship to Existing ADRs

本 ADR 已在 v0.5.4 实现并通过验收，supersede ADR-0012 中的 count-based trigger 与 fixed recent-turn retention 决策。ADR-0012 的 ThreadState、hydration 和 bounded runtime memory 基线继续有效。

ADR-0013 的安全 final-turn 边界不变：只保存用户输入和最终用户可见文本，不保存 Tool/Agent 内部事实。该边界是本 ADR 的前置约束，不被 supersede。

## Consequences

### Positive

- 短消息不会只因累计轮次而每轮压缩。
- 压缩故障不会破坏原 checkpoint，也不会由旧记忆直接阻断当前请求。
- 动态 Tool/System/Capability 占用进入统一预算，所有主链路径行为一致。
- 物理窗口与运行策略分离，未来提高上限时无需改变公开 API。

### Costs and risks

- 新增 tokenizer CPU 与依赖成本，完整输入需要在调用前估算。
- 统一 tokenizer 与 Provider tokenizer 存在偏差，因此必须保留 framing 与 10% margin。
- 持续 compaction 故障时 raw checkpoint 可能增长，需要日志和后续运维观察。
- Ollama 32K 会提高 KV cache、显存和延迟，应保持 opt-in smoke 验证。

## Alternatives Rejected

- **直接把窗口提高到 1M**：没有解决预算、成本和故障恢复问题。
- **继续按消息数压缩并调高阈值**：只延后重复压缩，无法处理消息体积差异。
- **只在 Provider 返回超限后重试**：错误发生过晚，各 Provider 行为不统一，并可能重复产生费用。
- **压缩失败时删除旧 checkpoint**：破坏数据安全和可恢复性。
- **公开前端窗口与阈值配置**：不属于 v0.5.4 的产品范围，会扩大 API 和 UI 契约。

## Verification

实现验收与 cross-artifact converge 已完成。定向自动化覆盖预算、持久化压缩、失败恢复、完整输入 preflight、Provider 配置、状态收口和 Composer 用量提示；DeepSeek 与本地 Ollama external smoke 已通过，Qwen smoke 的免费额度耗尽作为环境限制记录在 acceptance，而非代码失败。
