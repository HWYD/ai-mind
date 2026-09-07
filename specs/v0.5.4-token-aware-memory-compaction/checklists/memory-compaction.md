# Memory Compaction Requirements Quality Checklist

**Purpose**: 以 requirements unit tests 的方式审查 v0.5.4 的预算、恢复、失败、兼容性和 Non-goals 是否足够明确、完整、一致且可验收。本文检查需求文本质量，不执行代码测试。

**Created**: 2026-09-01

**Feature**: [spec.md](../spec.md)

**Depth**: Formal pre-implementation gate

## Token Budget Completeness

- [x] CHK001 是否分别定义 cloud 与 Ollama 的物理窗口、运行上限和向下 clamp 规则？[Spec §FR-001～FR-003; Plan §Budget Policy]
- [x] CHK002 是否明确输出预留、runtime reserve、hard input、trigger、target 的完整公式和 rounding semantics？[Spec §FR-004～FR-006; Contract §Budget derivation]
- [x] CHK003 是否给出 cloud 128K 与 Ollama 32K 的可复算精确结果？[Spec §US3; Plan §Budget Policy]
- [x] CHK004 是否明确 128K 是产品运行上限而非覆盖 256K～1M 物理能力？[Spec §Non-goals; Research §Recommendation]
- [x] CHK005 是否明确 `AI_MIND_MAX_INPUT_CHARS` 只约束最新用户输入/请求体？[Spec §FR-008; Contract §Single-input guard]

## Token Estimation Clarity

- [x] CHK006 是否指定 tokenizer、结构化/tool payload 覆盖、message/request framing 和 Provider margin？[Spec §FR-007; Plan §Token Estimation]
- [x] CHK007 是否定义 token estimate 的分类和向上取整，使测试可以断言组成而不依赖聊天正文日志？[Data Model §TokenEstimate; Contract §Token estimation]
- [x] CHK008 是否明确最终 preflight 必须统计 system、UserMemory、动态 capability/tool context、chat memory 和最新输入？[Spec §FR-017; Contract §Preflight]

## Trigger and Candidate Validity

- [x] CHK009 是否无歧义地删除固定 turn/message count trigger？[Spec §FR-009; Decisions §D005]
- [x] CHK010 是否限定单请求最多一次持久化 compaction attempt？[Spec §FR-010; Decisions §D007]
- [x] CHK011 是否明确压缩源包含旧 summary、pins 和全部 recent messages，且输出上限为 3000 tokens？[Spec §FR-011]
- [x] CHK012 是否把 schema validity、完整轮次、target 上限和严格缩小同时定义为保存前置条件？[Spec §FR-012; Contract §Candidate validation]
- [x] CHK013 是否定义 newest-first complete-turn retention，以及超大最后一轮不得拆断？[Spec §FR-013～FR-014; Decisions §D006]
- [x] CHK014 是否明确 pins promotion 和 `lastCompactedAt` 只能随有效候选原子更新？[Spec §FR-015; Data Model §Transitions]

## Recovery and Continuity

- [x] CHK015 是否分别覆盖生成失败、candidate 无效、save 失败和重建后仍超限？[Spec §US2; Acceptance §C]
- [x] CHK016 是否区分 candidate save 与独立 raw append 两次写入，并定义第二次写入失败时保留 last durable checkpoint、回答有效和脱敏日志？[Spec §FR-016; Contract §Failure recovery]
- [x] CHK017 是否定义 ephemeral fit 为 request-local、只读、不可持久化？[Spec §FR-018～FR-019; Data Model §Ephemeral Fit]
- [x] CHK018 是否定义 oldest-to-newest durable pin 顺序、反向 newest-first fit、完整 turn 约束，并允许对 request-local summary 做进一步缩短？[Spec §FR-018; Plan §Ephemeral Fit; Contract §Fallback]
- [x] CHK019 是否将输入过长错误限制为“排除 chat memory 后非记忆内容仍超限”？[Spec §FR-020; Decisions §D009]
- [x] CHK020 是否包含压缩后继续回答 Vue Proxy 问题的可观察验收场景？[Spec §US2; Acceptance §C1]

## Runtime Coverage and Compatibility

- [x] CHK021 是否枚举 direct answer、tool planning/final、Composer Context、Capability Context 的统一 preflight 要求？[Spec §FR-021; Plan §Architecture and Ownership]
- [x] CHK022 是否继续排除 Delivery/Tasklist GraphState、RuntimeArtifact、tool transcript 和 raw results？[Spec §FR-022; Plan §Compatibility]
- [x] CHK023 是否明确 ThreadState 字段 shape、hydration DTO、公开 API、stream chunk、frontend reducer 和数据库 schema 不变？[Spec §FR-023; Decisions §D011～D013]
- [x] CHK024 是否覆盖压缩 success、failure、cancellation、request-finalization 四类状态终止路径，并要求 cancellation 传至 compaction model、不得降级为 ephemeral fit？[Spec §FR-024、FR-026; Contract §Cancellation]
- [x] CHK025 是否限定日志字段并禁止原始内容、prompt 与 secrets？[Spec §FR-025; Contract §Observability]

## Non-goals and Verification Readiness

- [x] CHK026 是否明确不引入历史表、transcript retrieval、用户阈值配置或 Memory Inspector？[Spec §Non-goals]
- [x] CHK027 是否把模型/网络不可用和非记忆自身超限排除在连续性保证之外？[Spec §Non-goals; Assumptions]
- [x] CHK028 是否针对动态 tool/system 挤占、超大最后一轮、连续失败与 Ollama 32K 给出可执行验收？[Spec §Edge Cases; Acceptance §B～D]
- [x] CHK029 是否区分已通过的文档门和实现后待验证行为，避免提前声明完成？[Acceptance §Current stage]
- [x] CHK030 每个可实施 FR 是否都能在 `tasks.md` 中映射到至少一个测试先行任务与实现任务？[Tasks §Requirements Traceability]
- [x] CHK031 是否清楚限定用量分子为 persisted chat memory、分母为同一 effective window，并禁止暴露 raw memory、token 明细或 Provider config？[Spec §FR-028～FR-029; Data Model §ChatMemoryUsageSummary; Contract §Read-only usage]
- [x] CHK032 是否明确圆环位置、无数字/无操作边界、Tooltip 文案、normal-finish/model-change refresh 与失败隐藏语义？[Spec §US4、FR-030～FR-031; Plan §Composer Memory Usage Hint]

## Review Result

- Passed: 32 / 32
- Failed: 0
- Open ambiguity: 0
- Review conclusion: requirements 已达到生成实施 tasks 和执行 cross-artifact analyze 的质量门；代码行为仍全部受 `acceptance.md` 的 pending 状态约束。
