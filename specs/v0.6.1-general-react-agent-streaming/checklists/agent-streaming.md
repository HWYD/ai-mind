# Requirements Quality Checklist: Agent Streaming and Trace

**Purpose**: 在进入实现前，审查 phase-aware ReAct stream、Runtime、前端 Trace、Memory 与预算需求是否完整、明确、一致、可测量。

**Created**: 2026-09-22

**Audience/Timing**: 规格作者与 PR reviewer；已通过的 formal pre-implementation gate

**Focus**: stream/runtime safety、frontend disclosure/final-content boundary

## Requirement Completeness

- [x] CHK001 是否定义了正文在 Tool Call 尚未确定时的暂定语义、开始时机和最终解析条件？ [Completeness, Spec §FR-001–FR-005]
- [x] CHK002 是否分别定义了自然完成、非自然停止、空白正文、Tool-only 和 final 后迟到 Tool 的处理？ [Completeness, Spec §FR-006–FR-008]
- [x] CHK003 是否明确普通成功路径、异常 finalizer 与 deterministic fallback 的适用边界？ [Completeness, Spec §FR-009–FR-014]
- [x] CHK004 是否为 producer、durable stream、replay、reducer 和 terminal invariant 定义了完整契约？ [Completeness, Spec §FR-015–FR-020]
- [x] CHK005 是否覆盖 pending、commentary、final answer、Tool、来源和无详情标题的全部展示位置？ [Completeness, Spec §FR-021–FR-028]
- [x] CHK006 是否列明 copy、feedback、follow-up、Memory、history 与 snapshot 对三种 phase 的消费矩阵？ [Completeness, Spec §FR-029–FR-033]
- [x] CHK007 是否记录所有扩容与保持不变的预算、retry、timeout、concurrency 和性能参数？ [Completeness, Spec §FR-034–FR-041]
- [x] CHK008 是否明确工具级 detail、专用 Agent、数据库/部署和 raw reasoning 的 Non-goals？ [Completeness, Spec §Non-goals]

## Requirement Clarity

- [x] CHK009 `pending` 是否只表示分类未决，而没有与 reasoning/loading/commentary 混用？ [Clarity, Spec §Clarifications]
- [x] CHK010 `natural completion` 是否被完整消息、finish class、no Tool、non-empty、non-cancelled/non-deadline 等客观条件限定？ [Clarity, Spec §FR-004/FR-006]
- [x] CHK011 “立即流式”是否明确为首个非空 delta，不依赖全文缓冲或第二次模型调用？ [Clarity, Spec §FR-001/SC-001]
- [x] CHK012 Tool-bearing round、logical Tool Call、loop model call、retry attempt 和 finalizer call 是否分别定义而不混计？ [Clarity, Spec §FR-034–FR-040; Data Model §10]
- [x] CHK013 foldable details 的构成是否明确排除 pending/final，并包含 commentary/Tool/Skill/Resource/Prompt/source？ [Clarity, Spec §Edge Cases/FR-025–FR-027]
- [x] CHK014 “工具级 detail 不实现”是否同时约束 UI、协议、Pencil 和 raw data，而非仅视觉隐藏？ [Clarity, Spec §FR-023/FR-024/FR-044]

## Requirement Consistency

- [x] CHK015 spec、plan、data model、stream contract 与 decisions 是否对三种 phase 使用同一术语和转移规则？ [Consistency, Spec §FR-001–FR-008]
- [x] CHK016 固定预算是否在 requirements、decisions、data model 和 Runtime contract 中数值一致并满足算术不变量？ [Consistency, Spec §FR-034–FR-040]
- [x] CHK017 commentary 的“可见/可本地快照”是否与“不进入最终正文/server Memory”保持一致？ [Consistency, Spec §FR-029–FR-033]
- [x] CHK018 additive `agent-text-*` 是否与“普通 `text-*`/专用 Agent 向后兼容”的范围一致？ [Consistency, Spec §FR-015/FR-042–FR-043]
- [x] CHK019 自动折叠、manual sticky、完成后 reopen 和 refresh 默认收起是否不存在状态冲突？ [Consistency, Spec §FR-025–FR-028]

## Acceptance Criteria Quality

- [x] CHK020 only-text 1 call、四个核心序列、零 reasoning 泄漏、零 Memory 污染和预算上限是否都有可计数结果？ [Measurability, Spec §SC-001–SC-008]
- [x] CHK021 每项异常 finish class 是否有可验证的 final/finalizer/failed outcome，而非“优雅处理”等模糊要求？ [Measurability, Acceptance §B]
- [x] CHK022 replay 幂等、ordinal stability、terminal-last 和 end-before-tool 是否能由 sequence/assertion 客观验证？ [Measurability, Contract agent-text-stream]
- [x] CHK023 accessibility 是否明确交互角色、键盘、ARIA、focus 与非交互空标题？ [Measurability, Contract frontend-presentation §Accessibility]

## Scenario and Edge Coverage

- [x] CHK024 是否覆盖 Tool→final、text→Tool→final、Tool→text→Tool→final、only-final 四个用户指定序列？ [Coverage, Spec §User Story 1–2]
- [x] CHK025 是否补充并行多 Tool、Tool-only、empty delta、Markdown 跨 delta、duplicate/reordered event、cancel、reconnect 和 late Tool？ [Coverage, Spec §Edge Cases]
- [x] CHK026 是否定义 provider finish metadata 缺失时以正常闭合/完整消息为主证据、而明确非自然 metadata fail-closed 的行为？ [Coverage, Spec §Assumptions/FR-014]
- [x] CHK027 是否定义 finalizer 没有足够时间、底层执行未知或自身失败时的 recovery boundary？ [Coverage, Runtime Contract §Abnormal finalizer gate]
- [x] CHK028 是否定义 IndexedDB 不可用、旧 snapshot 和 message-height fingerprint 的兼容/降级？ [Coverage, Memory Contract §Snapshot rules]

## Security, Dependencies, and Tradeoffs

- [x] CHK029 是否明确 raw reasoning、Tool detail、secret、provider event 和网页全文的所有禁止出口？ [Security, Spec §FR-020]
- [x] CHK030 是否明确 visible commentary 不授予 Tool 权限、不改变 allowlist/schema/URL policy？ [Security, Spec §FR-042; Assumptions]
- [x] CHK031 是否记录 1.5 倍轮次可能接近 2 倍累计输入 token 的成本假设与控制措施？ [Risk, Spec §FR-041; Research §R007]
- [x] CHK032 是否记录 provider adapter、LangChain model-turn identity、durable stream 和 local snapshot 的依赖假设？ [Dependency, Spec §Dependencies]
- [x] CHK033 是否比较固定 Answer、完整缓冲、复用 text/reasoning、工具级 detail 与 2 倍扩容等替代方案？ [Tradeoff, Research §R001–R010]
- [x] CHK034 是否建立任何决策变化必须先回到 canonical workspace 的 change-control 门？ [Governance, Decisions §Change Control]
- [x] CHK035 是否明确 public delta 之后的 retry 禁止、不可撤回 durable stream 与 interrupted 收口？ [Coverage, Spec §FR-038; Runtime Contract §Model retry boundary]
- [x] CHK036 是否明确 constrained finalizer 的正文、Trace header、展开状态、限制说明和 Memory 边界？ [Coverage, Spec §FR-013/FR-028/FR-031]
- [x] CHK037 是否定义空白 natural no-Tool 结果不成为 final、但可进入受限 finalizer gate 的条件？ [Coverage, Spec §FR-007/FR-011]
- [x] CHK038 是否为 constrained finalizer 定义可回放的 public provenance carrier，而非由 UI 猜测 header？ [Completeness, Spec §FR-046]
- [x] CHK039 是否明确 constrained final 进入同会话 history、但排除 Chat Memory/UserMemory 的分离规则？ [Consistency, Spec §FR-031]
- [x] CHK040 是否明确 constrained snapshot 仅保留 completed safe rows、恢复“处理未完成”且默认收起？ [Recovery, Spec §FR-032]

## Result

40/40 项通过。该结果只说明需求文档已具备实现条件，不代表代码、测试、Pencil 或运行行为已经完成。
