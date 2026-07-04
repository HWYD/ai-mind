# 任务清单：AI Mind v0.4.3 Tool & Agent Final Turn Memory

**输入**：来自 `specs/043-tool-agent-final-turn-memory/` 的设计文档

**前置依赖**：[plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**测试**：本版本涉及 chat memory state、hydration DTO、chat orchestrator、Tasklist Agent、Delivery Chain、frontend hydration/reducer 和 stream-core non-regression。按 constitution 要求采用 tests-first 顺序：先补 contract/runtime tests，再接各条 runtime 路径，最后做 focused validation 和手工 smoke。

**组织方式**：任务按 user story 分组，保证 ordinary tool/MCP、Tasklist、Delivery 和安全边界都可以独立验证。Phase 1 + Phase 2 + US1 是最小 MVP；US2、US3 在同一 memory baseline 上增量接入；US4 负责 boundedness、安全和 non-regression 收口。

## 格式：`[ID] [P?] [Story] Description`

- **[P]**：表示可并行执行，前提是不同文件且不依赖尚未完成的任务。
- **[Story]**：只在 user story phase 中使用，例如 `[US1]`。
- 每个任务都包含明确文件路径，验证命令按本仓库现有脚本执行。

## Phase 1：准备阶段（共享基础设施）

**目的**：准备 final-turn memory 的最小模块边界和测试落点，不修改现有 public DTO、stream protocol 或 reducer shape。

- [x] T001 在 `apps/webapp/lib/ai/runtime/chat-memory/final-turn-adapter.ts` 新建 append-time final-turn adapter 模块
- [x] T002 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts` 新建 focused adapter 测试文件
- [x] T003 [P] 在 `apps/webapp/lib/ai/runtime/chat-memory/index.ts` 准备 final-turn memory API 的 chat-memory 导出入口

---

## Phase 2：基础阶段（阻塞性前置条件）

**目的**：建立所有 final-turn source 共用的 append-time 适配、write eligibility、duplicate prevention 和 text-only guardrail。

**关键说明**：在本阶段完成前，不能开始任何 user story 的实现。

### 先写测试

- [x] T004 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts` 增加状态过滤、raw object 拒绝、tasklist summary 透传和 delivery 截断测试
- [x] T005 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-eligibility.test.ts` 增加独立的 write-eligibility 和 context-eligibility 测试
- [x] T006 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts` 增加基于 message id 匹配和相同 user/assistant pair 的 duplicate prevention 测试
- [x] T007 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-state.test.ts` 增加 ThreadState text-only schema 测试，禁止持久化 source metadata 和 runtime fields
- [x] T008 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts` 增加 hydration DTO 测试，禁止 `source` / `turnId` / `displayKind` 和 raw runtime fields

### 实现

- [x] T009 在 `apps/webapp/lib/ai/runtime/chat-memory/final-turn-adapter.ts` 实现 append-time final-turn 适配、安全文本提取和确定性的 delivery 截断
- [x] T010 在 `apps/webapp/lib/ai/runtime/chat-memory/eligibility.ts` 实现独立的 final-turn write eligibility guard
- [x] T011 在 `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` 更新 append API 和 final-turn candidate 的 duplicate check
- [x] T012 在 `apps/webapp/lib/ai/runtime/chat-memory/message-adapter.ts` 保持适配后的 final turns 在映射到 persisted messages 时仍为 text-only
- [x] T013 从 `apps/webapp/lib/ai/runtime/chat-memory/index.ts` 导出 final-turn adapter 和 write-eligibility API

**检查点**：final-turn append 边界已经存在，并且仍保持 text-only。此时还没有接入任何 runtime path。

---

## Phase 3：用户故事 1 - 恢复 Tool 和 Resource 的最终回答（优先级：P1）🎯 MVP

**目标**：普通 tool、authoritative tool、reader/utility、docs summary 和 MCP/resource final answer 刷新后都能作为普通 user/assistant text turns 恢复。

**独立测试**：完成一轮 ordinary tool 或 MCP/resource 辅助回答后刷新页面，恢复结果只包含用户输入和最终助手文本，不包含任何中间 tool/resource transcript。

### 用户故事 1 的测试

- [x] T014 [P] [US1] 在 `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` 增加普通 tool、authoritative tool、reader/utility/docs-summary 和 MCP/resource final turns 的 orchestrator 集成测试
- [x] T015 [P] [US1] 在 `apps/webapp/tests/lib/ai/runtime/assistant-stream.test.ts` 增加 assistant final-text capture 测试，确认忽略 tool/resource 中间 parts
- [x] T016 [P] [US1] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 增加 tool/resource final turns 的 hydration route 恢复测试
- [x] T017 [P] [US1] 在 `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx` 增加恢复后 tool/resource text-only turns 的 frontend hydration 测试

### 用户故事 1 的实现

- [x] T018 [US1] 在 `apps/webapp/lib/ai/runtime/assistant-stream.ts` 复用 completed assistant text capture，用于 tool/resource final turns
- [x] T019 [US1] 在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` 构建并 append tool / MCP-resource final-turn candidates
- [x] T020 [US1] 在 `apps/webapp/components/instamind/use-chat-stream.ts` 保持刷新后的 tool/resource turns 仍按普通 text messages 做 hydration

**检查点**：tool 和 resource final turns 能正确恢复；同时 tool args/results、ToolMessage、MCP envelope 和 resource raw content 仍不会进入 ThreadState 或 hydration。

---

## Phase 4：用户故事 2 - 恢复 Tasklist Agent 的最终回合（优先级：P2）

**目标**：`/tasklist` 的 completed/final/controlled blocked 结果在刷新后可恢复最终文本摘要，但 artifact markdown、GraphState、checkpoint、interrupt payload 和 AgentRun 内部状态继续保持隔离。

**独立测试**：完成一轮 Tasklist Agent final run 后刷新页面，恢复结果只包含用户目标和 Tasklist final answer text summary；HITL paused/interrupted 或 failed turn 不进入 completed memory。

### 用户故事 2 的测试

- [x] T021 [P] [US2] 在 `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-output.test.ts` 增加 Tasklist final-answer output 测试，覆盖 summary text eligibility 和 artifact markdown 排除
- [x] T022 [P] [US2] 在 `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts` 增加 Tasklist run coordinator 测试，覆盖 completed/blocked append、interrupted skip 和 failed skip
- [x] T023 [P] [US2] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 增加 Tasklist final turns 的 hydrate route 恢复测试
- [x] T024 [P] [US2] 在 `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner-resume-state.test.ts` 增加 Tasklist resume 的 non-regression 测试，验证 chat thread id 隔离

### 用户故事 2 的实现

- [x] T025 [US2] 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/stream/tasklist-agent-output.ts` 暴露 final answer text summary，并排除 artifact markdown
- [x] T026 [US2] 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 中，于 run 完成后 append 符合条件的 Tasklist completed / blocked final turns
- [x] T027 [US2] 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 中保持 Tasklist 的 chat-memory 写入与 Tasklist resume thread identity 隔离

**检查点**：Tasklist final turns 能作为普通 text messages 恢复；同时 HITL pause/resume 和 artifact markdown 边界保持不变。

---

## Phase 5：用户故事 3 - 恢复 Delivery Chain 的最终报告（优先级：P2）

**目标**：`/delivery-chain` 的 completed/blocked final report 刷新后可恢复为普通 assistant text message，但 workflow progress、RuntimeArtifact 和 subagent raw result 继续保持 run-local。

**独立测试**：完成一轮 Delivery Chain 后刷新页面，恢复结果只包含用户输入和最终报告文本；长报告按 8000 字符做确定性截断，不保存 raw runtime objects。

### 用户故事 3 的测试

- [x] T028 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 增加 Delivery final-turn memory 测试，覆盖 completed/blocked reports、failed skip 和 raw runtime 排除
- [x] T029 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts` 增加 Delivery manager 测试，覆盖 8000 字符确定性截断和 RuntimeArtifact 不泄露
- [x] T030 [P] [US3] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 增加 Delivery final turns 的 hydrate route 恢复测试
- [x] T031 [P] [US3] 在 `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts` 增加 ToolRuntimeScope transcript suppression 回归测试，覆盖 Delivery manager 的 final-turn 写入

### 用户故事 3 的实现

- [x] T032 [US3] 在 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 复用 final report markdown 作为 final-turn append 输入，不引入其他对象
- [x] T033 [US3] 在 `apps/webapp/lib/ai/runtime/delivery-chain/manager/controlled-delivery-manager.ts` 保持 Delivery manager runtime artifacts 和 subagent traces 不进入 final-turn append 输入

**检查点**：Delivery final reports 能作为有界的 text-only turns 恢复；同时 progress panels、RuntimeArtifact 和 subagent raw results 仍然在 chat memory 外。

---

## Phase 6：用户故事 4 - 保持 Memory 安全且有界（优先级：P1）

**目标**：扩展 final-turn memory 后，继续保持 server-authoritative context、safe hydration、bounded recent messages、text-only compaction 和现有 runtime non-regression。

**独立测试**：在 ThreadState 中混合 ordinary chat、tool final、Tasklist final 和 Delivery final turns，验证 hydration、model context、compaction 和 reducer 仍只处理安全文本，不引入 raw runtime state。

### 用户故事 4 的测试

- [x] T034 [P] [US4] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts` 增加 context-builder 测试，覆盖 persisted tool / Tasklist / Delivery final turns 以及 raw-runtime 排除
- [x] T035 [P] [US4] 在 `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts` 增加 compaction 测试，覆盖 structured final turns、确定性截断报告保留，以及 failure no-op 行为
- [x] T036 [P] [US4] 在 `apps/webapp/tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 增加 frontend reducer 测试，证明恢复后的 tool/agent final turns 仍然是普通 text messages
- [x] T037 [P] [US4] 在 `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` 增加 stream protocol non-regression 测试，确认不需要新的 final-turn chunk
- [x] T038 [P] [US4] 在 `apps/webapp/tests/app/api/chat/thread/route.test.ts` 增加 route-level forbidden-field 回归测试，覆盖 tool、Tasklist 和 Delivery 场景

### 用户故事 4 的实现

- [x] T039 [US4] 在 `apps/webapp/lib/ai/runtime/chat-memory/context-builder.ts` 保持 context builder 对 persisted final turns 的 source-agnostic 和 text-only 处理
- [x] T040 [US4] 在 `apps/webapp/lib/ai/runtime/chat-memory/compaction.ts` 保持 structured final turns 的 bounded compaction，并避免 raw runtime 泄露
- [x] T041 [US4] 在 `apps/webapp/lib/ai/runtime/chat-memory/hydration-dto.ts` 保持 structured final turns 的 safe hydration allowlist 与降级行为
- [x] T042 [US4] 在 `apps/webapp/app/api/chat/thread/route.ts` 保持 structured final turns 的安全 thread restore 行为

**检查点**：v0.4.3 的 final-turn memory 仍然有界、hydration-safe、context-safe，并且与现有 stream/reducer 契约保持向后兼容。

---

## Phase 7：收尾与跨领域验证

**目的**：收口验收、决策记录、focused validation 和手工 smoke。

- [x] T043 [P] 更新 `specs/043-tool-agent-final-turn-memory/quickstart.md` 中的验证场景与命令说明
- [x] T044 [P] 更新 `specs/043-tool-agent-final-turn-memory/acceptance.md` 中的 release checklist 和验证证据
- [x] T045 [P] 更新 `specs/043-tool-agent-final-turn-memory/decisions.md` 中已确认实现的决策与剩余 non-goals
- [x] T046 运行 chat memory、orchestrator、Tasklist、Delivery、route 和 hydration 场景的 focused webapp tests
- [x] T047 运行 `pnpm --filter @ai-mind/stream-core test`
- [x] T048 运行 `pnpm typecheck`、`pnpm lint:webapp` 和 `pnpm build:pas`
- [x] T049 按 `specs/043-tool-agent-final-turn-memory/quickstart.md` 执行手工 smoke

---

## 依赖关系与执行顺序

### Phase 依赖

- **Phase 1 Setup**：无依赖。
- **Phase 2 Foundational**：依赖 Setup；会阻塞所有 user stories。
- **Phase 3 US1**：依赖 Foundational；交付 tool/resource final turns 的 MVP refresh recovery。
- **Phase 4 US2**：依赖 Foundational，并复用 US1 / Phase 2 建立的 final-turn append 边界。
- **Phase 5 US3**：依赖 Foundational，并复用 US1 / Phase 2 建立的 final-turn append 边界。
- **Phase 6 US4**：依赖 Foundational，且应在 US1-US3 的集成点都落地后完成。
- **Phase 7 Polish**：依赖目标 user stories 全部完成。

### User Story 依赖

- **US1 Restore Tool And Resource Final Answers (P1)**：Foundational 完成后的第一个 MVP 故事。
- **US2 Restore Tasklist Agent Final Turns (P2)**：依赖 final-turn adapter + service guardrail，以及 Tasklist final answer summary 的提取。
- **US3 Restore Delivery Chain Final Reports (P2)**：依赖 final-turn adapter + service guardrail，以及 Delivery final report 的提取。
- **US4 Keep Memory Safe And Bounded (P1)**：依赖已接入的 final-turn sources，才能对 boundedness 和 non-regression 做真实验证。

### 每个 User Story 内部顺序

- 先测试，后实现。
- 先完成 append-time adapter 和 eligibility，再接入 runtime。
- 先完成 runtime integration，再验证 hydration/reducer。
- 先跑 focused tests，再跑 broader typecheck/lint/build。

---

## 可并行机会

- T002-T003 可在 T001 之后并行执行。
- T004-T008 可并行执行，因为它们分别作用于不同测试文件。
- T009-T012 可在测试写完后并行推进，T013 则在 API 名称稳定后执行。
- T014-T017 可作为 US1 的并行测试。
- T021-T024 可作为 US2 的并行测试。
- T028-T031 可作为 US3 的并行测试。
- T034-T038 可作为 US4 的并行测试。
- T043-T045 可在实现行为稳定后并行完成。

---

## 并行示例：用户故事 1

```text
Task: "在 apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts 中增加普通 tool、authoritative tool、reader/utility/docs-summary 和 MCP/resource final turns 的 orchestrator 集成测试"
Task: "在 apps/webapp/tests/lib/ai/runtime/assistant-stream.test.ts 中增加 assistant final-text capture 测试，确认忽略 tool/resource 中间 parts"
Task: "在 apps/webapp/tests/app/api/chat/thread/route.test.ts 中增加 tool/resource final turns 的 hydration route 恢复测试"
```

## 并行示例：用户故事 2

```text
Task: "在 apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-output.test.ts 中增加 Tasklist final-answer output 测试，覆盖 summary text eligibility 和 artifact markdown 排除"
Task: "在 apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts 中增加 Tasklist run coordinator 测试，覆盖 completed/blocked append、interrupted skip 和 failed skip"
Task: "在 apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner-resume-state.test.ts 中增加 Tasklist resume 的 non-regression 测试，验证 chat thread id 隔离"
```

## 并行示例：用户故事 3

```text
Task: "在 apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts 中增加 Delivery final-turn memory 测试，覆盖 completed/blocked reports、failed skip 和 raw runtime 排除"
Task: "在 apps/webapp/tests/lib/ai/runtime/delivery-chain-manager-run.test.ts 中增加 Delivery manager 测试，覆盖 8000 字符确定性截断和 RuntimeArtifact 不泄露"
Task: "在 apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts 中增加 ToolRuntimeScope transcript suppression 回归测试，覆盖 Delivery manager 的 final-turn 写入"
```

---

## 实施策略

### 先交 MVP

1. 完成 Phase 1 Setup。
2. 完成 Phase 2 Foundational。
3. 完成 Phase 3 US1。
4. 先停下来，独立验证 ordinary tool / MCP-resource restore。

### 增量交付

1. 完成 Setup + Foundational。
2. 接入 US1，并验证 ordinary tool/resource paths 的 refresh recovery。
3. 接入 US2，并验证 Tasklist completed/final/blocked restore，同时不引入 HITL 回归。
4. 接入 US3，并验证 Delivery completed/blocked restore，同时不引入 run-local 回归。
5. 接入 US4，完成 boundedness、安全和 non-regression 加固。
6. 完成 Phase 7 验证与 release-close evidence。

### 质量闸门

在实现被视为完成之前，必须满足：

- chat memory adapter / eligibility / service tests 通过。
- hydration route tests 通过。
- Tasklist Agent focused non-regression 通过。
- Delivery Chain focused non-regression 通过。
- ToolRuntimeScope transcript suppression tests 通过。
- stream-core protocol tests 通过。
- frontend reducer / hydration tests 通过。
- `pnpm typecheck` 通过。
- `pnpm lint:webapp` 通过。
- `pnpm build:pas` 通过。
- Manual smoke 按 `quickstart.md` 执行。

## 备注

- 不要在 `ChatThreadMessage` 中持久化 `source`、`turnId`、`displayKind`、`toolCall`、`toolResult`、`resourceContent`、`artifact`、`graphState`、`runtimeArtifact`、`workflowProgress` 或 `subagentResult`。
- 不要新增 ChatSession / ChatMessage 业务表、LangGraph Store / PostgresStore、contextEntries、execution summary、reasoning summary、tool observation summary 或 agent run summary。
- v0.4.3 不要修改 `@ai-mind/stream-core` chunk union。
- v0.4.3 不要修改 frontend reducer public message shape。
- Delivery final report memory 在必要时必须做 8000 字符的确定性截断。
- Tasklist memory 只允许保存 final answer text summary，不能持久化 tasklist artifact markdown。

## Phase 8：收敛补充

- [x] T050 在 `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts` 和 `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts` 中增加 Tasklist 和 Delivery focused tests，验证 final-turn append 期间 chat-memory compaction status 的 relay，依据 FR-043-015 / US2 / US3（partial）
- [x] T051 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 和 `apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 中 relay Tasklist 与 Delivery final-turn chat-memory writes 的 `thread-memory-status` events，依据 FR-043-015 / US2 / US3（partial）
- [x] T052 在 compaction-status 修复后，运行 chat memory、Tasklist coordinator、Delivery chain 和 stream hydration paths 的 focused regression，依据 SC-043-008（partial）

## Phase 9：HITL Resume 错误体验补充

- [x] T053 在 `apps/webapp/tests/components/instamind/use-chat-stream.test.tsx` 中增加针对 `AGENT_RUN_FORBIDDEN` / `AGENT_INTERRUPT_NOT_PENDING` resume responses 的 frontend focused regression，确保 403/409 错误能在主 UI 中可见，同时 pending review 仍可恢复
- [x] T054 在 `apps/webapp/components/instamind/use-chat-stream.ts` 中暴露明确的用户可见 resume failure messages，覆盖 stale、forbidden、non-paused 或 version-mismatched 的 HITL review points，且不改变 stream protocol、reducer shape、AgentRun state transitions 或 chat-memory writes
- [x] T055 复用 `apps/webapp/tests/app/api/agent-runs/route.test.ts` 现有 route-level coverage，确认 forbidden / stale resume responses 不会启动 resume stream

## Phase 10：再次收敛

- [x] T056 在 `apps/webapp/tests/lib/ai/chat-service.test.ts` 或等价位置增加 resume-stream regression coverage，证明 Tasklist HITL resume 在 `agent-resume` 之后仍保留 provider-normalized runtime errors，而不会把所有未知失败都塌成 `MODEL_STREAM_FAILED`（partial）
- [x] T057 对齐 `apps/webapp/lib/ai/chat-service.ts` 中 Tasklist resume stream 的错误标准化逻辑，使 `agent-resume` 后的 provider/model/runtime failures 与 ordinary chat orchestration 使用相同的公开错误语义，并且不泄露 raw internals（partial）
- [x] T058 在错误标准化修复后，运行 Tasklist resume route、chat service resume stream、Tasklist coordinator 和 frontend resume flow 的 focused regression，依据 SC-043-008 / FR-043-015（partial）
