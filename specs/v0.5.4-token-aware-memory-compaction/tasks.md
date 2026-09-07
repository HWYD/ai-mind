# Tasks: Token-aware Memory Compaction

**Input**: Design documents from `/specs/v0.5.4-token-aware-memory-compaction/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/chat-context-budget.md`, `contracts/chat-scroll-policy.md`, `decisions.md`, `acceptance.md`

**Tests**: 本 feature 明确要求 TDD。每个测试任务必须先执行并观察到与待实现行为一致的失败，再开始对应 implementation task。

**Status**: Memory、T047–T054 滚动/UI feedback 修订与 P1/P2 流式渲染稳定性专项完成；T073/T074 按 D024 保留 48 Unicode code point 提前 rAF flush，40ms 合并和既有滚动策略不变。定向测试、真实浏览器、typecheck、lint 和文档同步结果见 acceptance.md。保留未提交 worktree 供人工 review。

## Format: `[ID] [P?] [Story?] Description + file path`

- **[P]**: 可与同阶段其他 `[P]` task 并行，且不修改同一文件。
- **[US1] / [US2] / [US3] / [US4]**: 映射 `spec.md` 的 User Story。
- 未标 story 的 task 是共享前置或 release-closing 工作。

## Phase 1: Setup — Shared Dependency

**Purpose**: 只建立所有故事共用的 tokenizer dependency；不得同时开始 Runtime 行为实现。

- [x] T001 [FR-007] 在 `apps/webapp/package.json` 增加 server-only direct dependency `js-tiktoken` 并同步 `pnpm-lock.yaml`，确认未把 tokenizer 引入 client bundle

**Checkpoint**: dependency 可被 webapp server tests 导入，尚无生产行为变化。

---

## Phase 2: Foundational — Budget and Token Contracts

**Purpose**: 先锁定模型 capability、精确预算和 token estimate；这些任务阻塞所有 User Story implementation。

### Failing tests first

- [x] T002 [P] [US3] 为物理窗口元数据、cloud 128K clamp 与 public model shape 不泄漏字段编写失败测试 `apps/webapp/tests/lib/ai/model-provider/model-catalog.test.ts`（FR-001、FR-002、FR-023）
- [x] T003 [P] [US3] 为 cloud/Ollama 精确预算、rounding、较小物理窗口 clamp 与非法配置编写失败测试 `apps/webapp/tests/lib/ai/model-provider/context-budget.test.ts`（FR-003～FR-006）
- [x] T004 [P] [US3] 为 text、role、structured/tool payload、每消息/请求 framing 与 10% margin 编写失败测试 `apps/webapp/tests/lib/ai/model-provider/token-estimator.test.ts`（FR-007、SC-005）
- [x] T005 [P] [US3] 为 chat output reserve、cloud/Ollama operational cap 的默认值和正整数校验编写失败测试 `apps/webapp/tests/lib/ai/model-provider/model-provider-config.test.ts`（FR-001～FR-005）

### Foundational implementation

- [x] T006 [US3] 在 `apps/webapp/lib/ai/model-provider/types.ts` 与 `apps/webapp/lib/ai/model-provider/catalog/model-catalog.ts` 增加 server-only `contextWindowTokens` 并填写已调研物理窗口（FR-001～FR-003、FR-023；depends on T002）
- [x] T007 [US3] 在 `apps/webapp/lib/ai/model-provider/provider-config.ts` 实现 128000/32768 operational caps 与 4096 output reserve 的配置和校验（FR-002～FR-005；depends on T005）
- [x] T008 [US3] 在 `apps/webapp/lib/ai/model-provider/context-budget.ts` 实现 `ContextBudget` 推导、clamp、ceil/floor 语义和精确值（FR-001～FR-006；depends on T003、T006、T007）
- [x] T009 [US3] 在 `apps/webapp/lib/ai/model-provider/token-estimator.ts` 实现 `o200k_base` 完整 payload 估算、framing 分类和 10% margin（FR-007、FR-017；depends on T001、T004）
- [x] T010 [US3] 从 `apps/webapp/lib/ai/model-provider/index.ts` 只导出 Runtime 所需 budget/estimate contract，并保持 `PublicChatModel` 不变（FR-023；depends on T008、T009）

**Checkpoint**: cloud/Ollama 预算与 token estimate 可独立测试；User Story 实现可以开始。

---

## Phase 3: User Story 1 — 长对话按 token 预算压缩 (Priority: P1) 🎯 MVP

**Goal**: 删除固定消息数触发，持久化压缩只在 token trigger 上发生，并生成完整、缩小、位于 target 内的 checkpoint 候选。

**Independent Test**: 低于 trigger 的任意消息数量不压缩；跨线只尝试一次；成功候选不超过 target，随后的短轮次不立即重压。

### Failing tests first

- [x] T011 [P] [US1] 为旧 checkpoint 兼容、取消四条消息上限和 incomplete turn 拒绝规则编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-state-schema.test.ts`（FR-009、FR-012、FR-013、FR-014、FR-023）
- [x] T012 [P] [US1] 为低于 token trigger 不压缩、跨线最多一次、3000 token summary cap、oldest-to-newest pins contract、newest complete-turn retention 与 oversized latest turn 编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction.test.ts`（FR-009、FR-010、FR-011、FR-012、FR-013、FR-014、FR-018、SC-001～SC-004）
- [x] T013 [P] [US1] 为 invalid/not-smaller/over-target candidate 不保存，以及 valid candidate 原子更新时间和 pins 编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`（FR-010、FR-012、FR-015）
- [x] T014 [P] [US1] 为 pinned decision promotion 只随有效持久化候选发生编写回归测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts`（FR-015、SC-002）

### Implementation

- [x] T015 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/state-schema.ts` 移除 fixed four-message validation，保留字段 shape 并校验完整 turn（FR-012～FR-014、FR-023；depends on T011）
- [x] T016 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/compaction.ts` 以 token trigger/target 重写 source assembly、3000-token generation、oldest-to-newest pins contract 与 candidate construction（FR-009～FR-014、FR-018；depends on T012、T008、T009、T015）
- [x] T017 [US1] 在 `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` 实现 once-per-request attempt、候选原子保存、pins promotion 和 `lastCompactedAt` 条件更新（FR-010、FR-012、FR-015；depends on T013、T014、T016）

**Checkpoint**: US1 可独立通过 targeted tests；不得提前接入未测试的 Orchestrator fallback。

---

## Phase 4: User Story 2 — 压缩后持续可对话 (Priority: P1)

**Goal**: 压缩成功或失败后都能在安全预算内继续；只有非 chat memory 自身超限才拒绝。

**Independent Test**: success、generator failure、invalid candidate、save failure、rebuilt-over-budget 和 oversized latest turn 均能产生合法模型输入；排除 memory 后仍超限才返回 input-length error。

### Failing tests first

- [x] T018 [P] [US2] 为 generation/validation failure 保留旧 state 并追加 final turn、candidate save failure 后独立 raw append 成功、raw append 自身失败时保留 last durable checkpoint 且不撤销回答编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-service.test.ts`（FR-016、SC-003）
- [x] T019 [P] [US2] 为 oldest-to-newest durable pins 的 reverse selection、pins→summary→newest complete turns 的 request-local fit、summary deterministic shortening 和不写 checkpoint 编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-context-builder.test.ts`（FR-018、FR-019、SC-004）
- [x] T020 [P] [US2] 为 generation/schema/candidate/candidate-save failure 后 ephemeral fit 与 model-ready 结果、完整输入重算、memory-only overflow、non-memory overflow error 和动态 tool/system 占用编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-context-preflight.test.ts`（FR-016～FR-020、SC-003）
- [x] T021 [US2] 为 direct、tool planning/final、Composer Context、Capability Context 统一 preflight、单请求一次持久化 attempt，并至少在一条完整 Orchestrator 路径断言 compaction failure 后仍调用模型编写失败集成测试 `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`（FR-010、FR-016、FR-017、FR-021、SC-003）
- [x] T022 [P] [US2] 为 success/failure/cancellation/request-finalization 均结束 `thread-memory-status` 编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-status.test.ts`（FR-024）
- [x] T023 [P] [US2] 为 Delivery/Tasklist 只追加安全 final turn 且排除 GraphState、RuntimeArtifact、tool transcript/raw results 编写回归测试 `apps/webapp/tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts`（FR-022、FR-023、SC-006）
- [x] T024 [P] [US2] 为 route 只校验 latest user input 且不以字符数拒绝完整 history 编写失败测试 `apps/webapp/tests/app/api/chat/route.test.ts`（FR-008、FR-020）

### Implementation

- [x] T025 [US2] 在 `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` 实现 candidate write 与 raw final-turn append 分阶段、第二次 write 失败保留 last durable checkpoint 且不撤销回答的语义（FR-016；depends on T018、T017）
- [x] T026 [US2] 在 `apps/webapp/lib/ai/runtime/chat-memory/context-builder.ts` 实现 oldest-to-newest durable pins 的 reverse selection、只读 ephemeral fit、完整 turn retention 与 request-local summary shortening（FR-018、FR-019；depends on T019、T009、T015）
- [x] T027 [US2] 在 `apps/webapp/lib/ai/runtime/chat-context-preflight.ts` 实现完整输入组装/计数、一次 compaction 协调、重建、fit 和 non-memory-only overflow 判定（FR-010、FR-017～FR-020；depends on T020、T025、T026）
- [x] T028 [US2] 在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts` 将所有 chat-memory model-call paths 接入同一 preflight，并以 finally 语义结束 status（FR-021、FR-024；depends on T021、T022、T027）
- [x] T029 [US2] 在 `apps/webapp/lib/ai/model-provider/validate-input-length.ts` 与 `apps/webapp/app/api/chat/route.ts` 将字符限制收窄为 latest user input/request-body guard（FR-008、FR-020；depends on T024、T027）
- [x] T030 [US2] 在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`、`apps/webapp/lib/ai/runtime/delivery-chain/index.ts` 与 `apps/webapp/lib/ai/runtime/chat-memory/final-turn-adapter.ts` 保持 Tasklist/Delivery safe visible-text-only append，并仅做接入 preflight 所需的最小兼容调整（FR-022、FR-023；depends on T023、T028）

**Checkpoint**: US2 的 Vue Proxy continuity、失败恢复与动态占用场景可独立验收。

---

## Phase 5: User Story 3 — 不同模型使用可预测工作窗口 (Priority: P2)

**Goal**: Provider 使用已声明 capability 和统一预算；Ollama 明确 32K；日志提供无正文的诊断证据。

**Independent Test**: catalog/config/budget fixtures 得到精确值，Ollama options 包含 `numCtx=32768`，日志只有 allowlist 数值和枚举。

### Failing tests first

- [x] T031 [P] [US3] 为 Ollama `numCtx=32768`、artifact clamp 和不影响云端 Provider options 编写失败测试 `apps/webapp/tests/lib/ai/model-provider/ollama-provider.test.ts`（FR-003、SC-005）
- [x] T032 [P] [US3] 为 diagnostics allowlist、`raw-append-failed` 枚举与 raw message/prompt/key/config redaction 编写失败测试 `apps/webapp/tests/lib/ai/runtime/chat-context-observability.test.ts`（FR-016、FR-025、SC-007）
- [x] T033 [P] [US3] 为模型列表 API 和 initial state 不暴露 `contextWindowTokens` 编写兼容性测试 `apps/webapp/tests/app/api/ai/models/route.test.ts` 与 `apps/webapp/tests/lib/ai/model-provider/model-catalog.test.ts`（FR-023、SC-006）

### Implementation

- [x] T034 [US3] 在 `apps/webapp/lib/ai/model-provider/providers/ollama-provider.ts` 使用 effective window 显式传入 `numCtx`，不在 Provider 重算预算（FR-003；depends on T031、T008）
- [x] T035 [US3] 在 `apps/webapp/lib/ai/runtime/chat-context-preflight.ts` 与 `apps/webapp/lib/ai/runtime/chat-memory/chat-memory-service.ts` 记录 physical/effective window、budget、before/after、reason、fallback 和 `raw-append-failed` allowlist（FR-016、FR-025；depends on T032、T027）
- [x] T036 [US3] 在 `apps/webapp/lib/ai/model-provider/catalog/resolve-public-model-list.ts` 与 `apps/webapp/lib/ai/model-provider/resolve-chat-models-initial-state.ts` 保持 server-only capability 隔离（FR-023；depends on T033、T006）

**Checkpoint**: US3 可独立验证 cloud/Ollama budget、Provider options 与日志隐私。

---

## Phase 6: User Story 4 — 了解聊天记忆占用 (Priority: P3)

**Goal**: 在不扩展 hydration/stream/public model DTO、也不暴露 raw context 的前提下，让 Composer 用无操作圆环和 shadcn Tooltip 显示 persisted chat memory 占 selected-model effective window 的比例。

**Independent Test**: session-authorized route 对 cloud/Ollama 只返回 usage summary；client 在 model change 和 normal finish 后刷新；桌面 skill-mode 后侧显示无数字圆环和可访问 tooltip，失败/草稿隐藏且不阻断发送。

### Failing tests first

- [x] T045 [US4] 先在 `apps/webapp/tests/app/api/chat/context-usage/route.test.ts`、`apps/webapp/tests/components/instamind/use-chat-memory-usage.test.tsx` 与 `apps/webapp/tests/components/chat/composer/toolbar/context-usage-indicator.test.tsx` 分别复现 session ownership、cloud/Ollama effective window 与 strict 最小响应字段、draft/streaming/failure refresh 边界、额外公开字段拒绝、无数字 shadcn Tooltip 圆环/无压缩操作；已观察因 route、hook 和 component 不存在而失败（FR-028～FR-031、SC-011）

### Implementation

- [x] T046 [US4] 用 `pnpm dlx shadcn@latest add tooltip` 安装并审查 `apps/webapp/components/ui/tooltip.tsx`；在 `apps/webapp/lib/ai/runtime/chat-memory/context-usage-contract.ts` 定义 strict 共享 DTO，在 `apps/webapp/app/api/chat/context-usage/route.ts` 复用 session/registry/chat-memory/model selection/ContextBudget 输出最小 usage summary，在 `apps/webapp/components/instamind/use-chat-memory-usage.ts` 实现 idle-only refresh，在 `apps/webapp/components/chat/composer/toolbar/context-usage-indicator.tsx` 实现 Tooltip 圆环，并经 `instantmind-page.tsx`、`chat-composer.tsx`、`toolbar/composer-toolbar.tsx` 接入 skill-mode 右侧（FR-028～FR-031、SC-011；depends on T045）

**Checkpoint**: US4 不改变已发布 DTO/stream 契约，不增加压缩操作，且在 selected model/window 改变后仍显示正确的 memory-only 用量。

---

## Phase 7: Cross-story Verification and Release Closing

**Purpose**: 所有 User Story 通过后再执行；不得在功能未验收时提前把 planned capability 写成已实现。

- [x] T037 运行 `specs/v0.5.4-token-aware-memory-compaction/quickstart.md` 的 targeted compaction/preflight/hydration/stream/frontend 回归并把证据登记到 `specs/v0.5.4-token-aware-memory-compaction/acceptance.md`（FR-022～FR-024、SC-001～SC-008）
- [x] T038 运行 `pnpm typecheck`、受影响 workspace lint 和 `git diff --check`，并在 T043 后重新执行以登记最终验证证据到 `specs/v0.5.4-token-aware-memory-compaction/acceptance.md`（SC-006；depends on T037）
- [x] T043 [US2] 先在 `apps/webapp/tests/lib/ai/runtime/chat-memory-compaction-signal.test.ts`、`chat-memory-status.test.ts`、`chat-context-preflight.test.ts` 与 `chat-orchestrator.test.ts` 复现取消信号未到达模型、`AbortError` 被 fallback 吞掉的问题，再在 `apps/webapp/lib/ai/error-utils.ts`、`lib/ai/runtime/chat-memory/compaction.ts`、`chat-memory-service.ts`、`chat-context-preflight.ts` 与 `chat-orchestrator.ts` 贯通 signal、原样抛出取消并保持 checkpoint（FR-024、FR-026、SC-009；depends on T016、T017、T027、T028）
- [x] T044 [FR-027] 历史 terminal-follow 实现记录：被 D017 修订替代，不构成新 SC-010 证据，替代见 T047–T052。
- [x] T039 按 `specs/v0.5.4-token-aware-memory-compaction/quickstart.md` 执行 Qwen、DeepSeek、Ollama opt-in smoke，验证 Vue Proxy 连续性并只记录非敏感结果；DeepSeek 与 Ollama structured compaction 通过，Qwen 因 Provider free quota exhausted（HTTP 403）记录为环境限制，不归类为代码失败（SC-003、SC-005、SC-007、SC-008；depends on T037、T038、T043、T046）
- [x] T040 重跑本版 converge，含 T047–T052、FR-027/SC-010；旧结果不作为本次收口。
- [x] T041 将 `docs/adr/0018-token-aware-chat-context-budget-and-compaction.md` 状态改为 implemented，并把 `docs/architecture/runtime-boundary.md` planned transition 更新为当前事实（FR-021～FR-025、SC-006；depends on T040）
- [x] T042 同步 `apps/webapp/.env.example`、根 `README.md`、`docs/versions/v0.5.4-token-aware-memory-compaction.md`、`docs/releases/v0.5.4.md`、`docs/tasklists/v0.5.4-token-aware-memory-compaction-tasklist.md`，并把根 `package.json`、`apps/desktop/package.json`、`apps/project-assistant-service/package.json`、`apps/webapp/package.json`、`packages/database/package.json`、`packages/stream-core/package.json` 的 version 同步为 `0.5.4`，完成 release-closing 自审并保留未提交 worktree 供人工 review（FR-002～FR-003、SC-005～SC-006；depends on T041）

## Dependencies and Execution Order

### Phase Dependencies

1. Phase 1 提供 tokenizer dependency。
2. Phase 2 先写并运行失败测试，再建立所有故事共享的 capability、budget 和 estimate。
3. Phase 3 US1 依赖 Phase 2；先稳定持久化 compaction。
4. Phase 4 US2 依赖 US1 的一次压缩和失败语义；先测试 continuity，再接 Orchestrator。
5. Phase 5 US3 的 foundational tests 可在 Phase 2 执行，但 Provider/log implementation 需等待 preflight contract 稳定。
6. Phase 6 US4 复用稳定的 budget/memory boundary；其独立 read model 不得反向改变 hydration 或 stream。
7. Phase 7 依赖四个 User Story 全部通过；T043 与 T046 后必须重新运行 T038 的验证门，T040 converge 必须在 ADR implemented 和公开 release 资产更新前通过。

### Test-first Gates

- T002～T005 必须在 T006～T010 前失败。
- T011～T014 必须在 T015～T017 前失败。
- T018～T024 必须在 T025～T030 前失败。
- T031～T033 必须在 T034～T036 前失败。
- T045 必须在 T046 前失败。
- 任一失败测试若因 fixture/test wiring 而非缺失产品行为失败，先修正测试，不得加入 production test-only branch。

### Parallel Opportunities

- T002～T005 修改不同 test files，可并行。
- T011～T014 除 T013/T018 共享 `chat-memory-service.test.ts` 外可并行；共享文件任务须顺序执行。
- T019、T020、T022～T024 可并行。
- T031～T033 可并行。
- T037、T038 顺序登记同一 `acceptance.md`；T039 需等待二者通过。
- T045 的 route、hook 和 UI tests 修改不同文件，可并行；T046 在所有对应失败测试得到预期 red 结果后执行。

## Requirements Traceability

| Requirement    | Test task(s)                 | Implementation task(s)       |
| -------------- | ---------------------------- | ---------------------------- |
| FR-001～FR-002 | T002、T003、T005             | T006～T008                   |
| FR-003         | T003、T031                   | T006～T008、T034             |
| FR-004～FR-006 | T003、T005                   | T007～T008                   |
| FR-007         | T004                         | T001、T009                   |
| FR-008         | T024                         | T029                         |
| FR-009         | T011～T012                   | T015～T017                   |
| FR-010         | T012～T013、T021             | T017、T027                   |
| FR-011         | T012                         | T016                         |
| FR-012         | T011～T013                   | T015～T017                   |
| FR-013         | T011～T012                   | T015～T016                   |
| FR-014         | T011～T012                   | T015～T016                   |
| FR-015         | T013～T014                   | T017                         |
| FR-016         | T018、T020～T021、T032       | T025、T027、T035             |
| FR-017         | T020～T021                   | T009、T027～T028             |
| FR-018～FR-019 | T019～T020                   | T026～T027                   |
| FR-020         | T020、T024                   | T027、T029                   |
| FR-021         | T021                         | T028                         |
| FR-022         | T023、T037                   | T030                         |
| FR-023         | T002、T011、T023、T033、T037 | T006、T010、T015、T030、T036 |
| FR-024         | T022、T037                   | T028                         |
| FR-025         | T032、T039                   | T035                         |
| FR-026         | T043                         | T043                         |
| FR-027         | T048、T051、T064、T066、T067 | T049、T050、T052、T065       |
| FR-028～FR-029 | T045                         | T046                         |
| FR-030～FR-031 | T045                         | T046                         |
| FR-032         | T054                         | T054                         |

**Coverage target**: 32 / 32 functional requirements have at least one failing-test task and one implementation/verification task. Every task maps to an FR, SC, or explicit release-closing constraint; no unmapped task remains.

## First Implementation Task

T001 是原 memory 实施入口，已完成。追加滚动工作按 T047→T048→T049/T050→T051→T052 执行；T040/T042 对最终工作区重新收口。

## Phase 8: Scroll Amendment (FR-027 / SC-010)

- [x] T047 在 canonical specs 同步方案/契约/数据模型/调研，删除冲突终态约束。
- [x] T048 先复现持久跟随、展示身份、accepted-turn、活跃 hints gate、公共到底命令问题，保留历史 entry 回归。
- [x] T049 实施单一滚动策略、稳定展示身份和 accepted-turn，删除 TerminalTail handshake；depends on T048。
- [x] T050 实施 Header/Footer 几何、缓存 fallback 和手动展开阅读；depends on T048。
- [x] T051 修复 harness 接线，声明 Playwright 开发依赖，验证 Page + Chrome/Virtuoso，targeted tests/typecheck/lint/diff check，独立 review 并修复；depends on T049/T050。
- [x] T052 登记 acceptance，更新当前 architecture/README/v0.5.4 公开资产，重跑 T040/T042；depends on T051。
- [x] T053 [FR-027/SC-010] 先以单测和真实 Page 连续显隐观测复现按钮闪烁；分离 following 瞬时离底与 reading 按钮展示，保留显式回底首次确认；验证并同步按钮契约、架构说明与验收记录。该阶段仅调研通知/Header，最终决策与实现见 T054。
- [x] T054 [FR-032/SC-012] 先验证全局 Messages 与局部 Alert/移动导航位置；按 shadcn Base UI Toast 源码封装，接入复制反馈并移除 Header 提示，保留消息相关错误；完成真实浏览器、滚动回归与文档同步。

## Phase 9: Streaming Render Stability (P1/P2)

**Purpose**: 收敛流式增量期间的估算/测量/滚动时序，并保持 Streamdown parser 与 animation props 生命周期稳定，修复双阶段位移和 Markdown 字号/字重闪动。

### Failing tests first

- [x] T055 [P1] 先在 apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx 覆盖同一 streaming assistant 的 token 增量不改变 heightEstimates、Virtuoso measurement 仍可进入真实布局，以及 finish 后最新 assistant 可成为稳定 hint candidate。
- [x] T056 [P1] 先在 apps/webapp/tests/components/instamind/use-chat-scroll-policy.test.tsx 与 apps/webapp/tests/components/instamind/chat-scroll-intent.test.tsx 覆盖 content render 不提前发出独立 scroll command、totalListHeightChanged 收敛回底、每 frame 至多一个 command，并保留 accepted-turn/Composer/reading 边界。
- [x] T057 [P2] 先更新 apps/webapp/tests/components/chat/message-list/parts/text-part.test.tsx，验证 finish 前后 mode 恒为 streaming、animated 配置恒定、仅 isAnimating 改变，并保留动画启用。

### Implementation

- [x] T058 [P1] 在 chat-message-list.tsx 冻结 streaming assistant 的启发式 estimate，保留 Virtuoso measurement，并将 height-hint runtime 从 latest assistant 排除改为 streaming assistant 排除；完成后允许稳定 candidate 写入（depends on T055）。
- [x] T059 [P1] 在 use-chat-scroll-policy.ts 收敛 content/measurement/follow 时序：streaming content 不直接触发 follow，Virtuoso total-height 作为主要事件源，所有命令继续合并到单个 rAF（depends on T056）。
- [x] T060 [P2] 在 text-part.tsx 固定 Streamdown mode 与 animated 配置，只按 isStreaming 切换 isAnimating（depends on T057）。

### Verification and documentation

- [x] T061 运行 P1/P2 定向 Vitest、webapp typecheck/lint、git diff --check，必要时运行 chat-scroll-regression.mjs，将真实结果登记至 acceptance（depends on T058–T060；T054 完成后全量 typecheck 已重新通过）。
- [x] T062 重跑当前 canonical spec 的 converge/analyze，确认不创建 sibling spec、不改变 T054 范围，并在 acceptance/architecture 记录剩余浏览器限制（depends on T061；完成前置检查与人工跨文档一致性核对）。

## Phase 10: Accepted Follow-up Turn Runway (T063-T068, FR-027 / SC-010)

**Purpose**: 已有历史的新问题发送后，将 user 消息初始定位在 Composer 上方，并让 assistant 内容通过 CSS `min-height` 自然填充空间；不实时计算回复高度，不改变现有 following/reading 状态机。

- [x] T063 在当前 canonical v0.5.4 的 spec/plan/tasks/data-model/contract/decisions/checklist 同步 D022，明确首问、regenerate、resume、Footer 与 measurement 非目标，不创建新 spec。
- [x] T064 先在 use-chat-stream、ChatMessageList、scroll intent 与 Chrome 回归中覆盖定位资格、TurnEntry assistant loading slot 的 runway、accepted-turn 单一 scrollToEnd、初始 viewport 位置与超界后的正常跟随；depends on T063。
- [x] T065 删除未采用的直接 user DOM 定位 API，实施 accepted-turn 定位资格与 item CSS reply runway，不新增消息级测量、计时器或第二滚动循环；depends on T064。
- [x] T066 运行定向 Vitest、受影响回归、Chrome/Virtuoso、webapp typecheck/lint 和 git diff --check，登记 acceptance 并复核 canonical 文档一致性；depends on T065。4 files / 93 tests、Chrome 19 scenarios、typecheck、lint（0 errors / 8 existing warnings）与完整性检查通过。
- [x] T067 在 Chrome 逐帧复现 assistant 首包将列表总高从 4115px 临时抬至 4215px、使 user item 下移约 100px 的交接抖动；先以稳定 item key 方案完成基线验证（depends on T066）。
- [x] T068 将 accepted follow-up 的展示层从 `1px` assistant 占位改为同一 `TurnEntry + assistant loading slot`，保留同一 item/key 和 CSS runway，不新增实时高度计算；以定向组件测试、typecheck 和 browser regression 做简单回归并同步 canonical 文档（depends on T067）。

## Phase 11: Measured-Height Follow Latency (T069-T072, FR-027 / SC-010)

**Purpose**: 在不改变 following/reading、Virtuoso measurement 所有权或单 rAF 合并的前提下，消除总高已增长但仍等待迟到 at-bottom 回调的空档。

- [x] T069 先在当前 canonical spec/plan/tasks/data-model/contracts/decisions/architecture 同步 D023；不创建 sibling spec，不修改 `followOutput`、4px 阈值或流式渲染节奏。
- [x] T070 先在 chat-scroll-intent.test.tsx 编写失败测试：初始总高只建立基线，following 正向总高增长在下一 rAF 强制一次 auto 回底；同帧合并，reading、空列表、旧展示与未增长保持不拉底，pending entry 不叠加 D023 follow 命令。
- [x] T071 在 use-chat-scroll-policy.ts 仅以 presentation-local 最近总高驱动既有 `scheduleFollowToEnd(true)`；保持所有原 guard 和公共 `scrollToEnd` 路径；depends on T070。
- [x] T072 运行定向 Vitest、真实 Chrome/Virtuoso 几何采样、typecheck、lint、diff check 与当前 spec 一致性检查；登记 acceptance；depends on T071。

## Phase 12: Early Stream Buffer Flush (T073-T074)

**Purpose**: 在保留 40ms 合并和单一滚动策略的前提下，对累计 48 Unicode code point 的大粒度文本提前请求既有 rAF；D024 是当前采用的决策。

- [x] T073 先以三个 16-character text delta 写出阈值提前 rAF 测试，确认内容在 timer 前以一次合并提交。
- [x] T074 实施 48 Unicode code point 提前 rAF flush，不拆分 delta、不新增展示队列或滚动命令；按用户要求仅重跑定向 hook 验证。此前 Chrome 快速流的 measurement 频率证据保留在 acceptance，残影和高压视觉优化后续单独处理。
