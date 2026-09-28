# Tasks: v0.6.2 AMap MCP Tools

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/amap-mcp-tool-boundary.md](./contracts/amap-mcp-tool-boundary.md)
**Status**: T001–T049 are complete. Evidence is in `acceptance.md`; no commit, tag, remote release, or deployment was created.
**Tests**: Required by SC-001～SC-010 and [acceptance.md](./acceptance.md).

## Format

`- [ ] Tnnn [P?] [US?] Action in exact path`；`[P]` 仅用于不修改同一文件且无未完成依赖的任务。

## Phase 1: Setup and External Contract

**Purpose**: 先取得固定映射的外部契约证据，再准备本地契约与测试样本。真实连接须使用服务端安全配置的 Key；不凭历史包名断言托管 schema。

- [x] T001 **Static mapping gate**：在受控的 server-only Key 配置中执行 MCP `initialize` 与 `tools/list`，并以公开、非个人位置的低频样本对每项候选执行一次 contract call，逐项核验九项本地语义能力的实际远端名称、完整 input schema、GCJ-02 坐标字段语义、成功结果类别和错误类别；将工具名、字段摘要、结果类别、核验日期和来源写入 `specs/v0.6.2-amap-mcp-tools/contracts/amap-mcp-tool-boundary.md`，不得写入 Key、URL、raw request/response 或原始错误。T001 必须在 T007 固定映射前完成；任一项不兼容即 fail closed 并更新同一 canonical spec，不能作为实现后的普通 smoke。
- [x] T002 在 `apps/webapp/tests/lib/ai/mcp/adapters/amap-mcp-tool-adapter.test.ts` 按 T001 已核验的映射准备九项 fake 远端响应与不兼容 schema 样本，验证固定白名单外工具不会进入模型
- [x] T003 [P] 在 `apps/webapp/tests/lib/ai/mcp/streamable-http-transport.test.ts` 增加固定高德端点、Key 缺失及含 Key URL/错误脱敏的边界测试

## Phase 2: Foundational MCP and Tool Safety

**Purpose**: 必须在任何 User Story 绑定前完成。若后续 T001 发现远端能力缺失，先在同一 canonical spec 更新范围与验收，不自动改用任意远端工具。

- [x] T004 在 `apps/webapp/lib/ai/mcp/protocol/types.ts` 与 `apps/webapp/lib/ai/mcp/registry/server-definitions.ts` 增加固定 `amap-maps` 定义、server-only Key availability 与固定 HTTPS endpoint
- [x] T005 在 `apps/webapp/lib/ai/mcp/transport/streamable-http-transport.ts` 与 `apps/webapp/lib/ai/mcp/client/mcp-client.ts` 审查并实现含 Key URL 脱敏、AbortSignal 传播和无 adapter/MCP client 自行重试或恢复
- [x] T006 **Security test gate (historical scope superseded by T025)**：已覆盖 strict schema、GCJ-02、`isError`、异常/空结果、限流/额度错误、取消、超时、迟到结果与 public Trace 脱敏。原同 Run provenance/跨 Run POI ID 门禁由 T025 统一参数候选回归取代；retryable failure 才最多三次 attempt。
- [x] T007 **Security implementation gate (historical scope superseded by T026–T027)**：已建立九项静态 Tool 的 strict schema、GCJ-02、outbound-secret、固定远端映射、有界 observation 与安全 public 投影。原 Run-scoped 位置/POI ID provenance ledger 已移除，改为所有 remote-readonly 参数的通用安全校验与 repair 语义。
- [x] T008 **Security binding gate**：在 `apps/webapp/lib/ai/tools/index.ts` 与 `apps/webapp/lib/ai/capabilities/tool-binding.ts` 仅显式注册 T001 已核验且当前可用的九项；在 `apps/webapp/tests/lib/ai/capabilities/tool-binding.test.ts` 验证缺 Key、未批准远端 Tool、Skill 与非 General ReAct scope 均不能授权

**Core security gate**: T001 与 T006–T008 全部完成并通过后，才可开始任何 User Story。它们分别锁定真实来源证据、public `StreamEvent` 脱敏、provider 前来源校验和固定授权绑定。

**Checkpoint**: 有静态且安全的地图 Tool contract；未开始用户场景前可独立验证无 Key fail-closed。

## Phase 3: User Story 1 — POI Search (Priority: P1, MVP)

**Goal**: 关键词、周边及详情搜索可在普通聊天中提供真实地点文字。

**Independent Test**: 固定公开样本搜索成功/空/歧义；只有真实 POI ID 才能查详情，安全 Trace 无敏感参数。

- [x] T009 [P] [US1] 在 `apps/webapp/tests/lib/ai/tools/amap-poi-tools.test.ts` 添加三项 POI schema、来源、响应投影与失败的 contract tests
- [x] T010 [US1] 实现关键词、周边、详情的固定远端映射和有限 POI observation；POI ID 是通过 schema/出站安全检查的业务候选，原来源校验由 T026 supersede。
- [x] T011 [US1] 验证 POI ToolCall、真实结果与 final answer 事实边界；模型候选参数与失败 repair 的 Provider 前行为由 T025 覆盖。

**Checkpoint**: POI 作为独立 MVP；任意 POI ID 都只能作为经 schema/安全边界检查的候选，不能直接成为地点事实。

## Phase 4: User Story 2 — Geocoding (Priority: P2)

**Goal**: 明确地址与坐标双向转换，不引入隐式定位。

**Independent Test**: 地址→坐标、坐标→地址均有成功和歧义/无结果测试；未给位置时无调用。

- [x] T012 [P] [US2] 在 `apps/webapp/tests/lib/ai/tools/amap-geocode-tools.test.ts` 添加 GCJ-02 `longitude,latitude` 顺序、范围、六位小数、显式非 GCJ-02 拒绝、地址长度、歧义与无隐式位置 contract tests
- [x] T013 [US2] 实现地理/逆地理编码固定映射、有限 observation 与地址/坐标 schema、GCJ-02 和出站安全校验；不隐式转换 WGS-84/GPS/BD-09 坐标。原 provenance 校验由 T026 supersede。
- [x] T014 [US2] 验证 schema/坐标边界、失败或迟到结果不能形成事实，以及模型修正参数后只执行修正调用；原来源拒绝断言由 T025 supersede。

**Checkpoint**: 编码可独立演示；不依赖路线功能。

## Phase 5: User Story 3 — Route Planning (Priority: P3)

**Goal**: 四类路线返回文字摘要，歧义与跨城公交先澄清。

**Independent Test**: 四种方式各有真实/脚本化成功与失败；无明确起终点或跨城城市时不外发。

- [x] T015 [P] [US3] 在 `apps/webapp/tests/lib/ai/tools/amap-route-tools.test.ts` 添加四类路线 schema、范围、跨城城市、距离/时长和有界路线摘要的 contract tests；不覆盖多候选、完整逐步指引或道路限制详情
- [x] T016 [US3] 在 `apps/webapp/lib/ai/tools/amap/amap-route-tools.ts` 实现四类路线固定映射与仅含距离、时长和有界摘要的 RouteObservation
- [x] T017 [US3] 在 `apps/webapp/tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts` 验证起终点编码链、GCJ-02 坐标规则、四类方式选择、对齐 `web-search` / `read-url` 的重试 permit/限流/超时与不虚构成功

**Checkpoint**: 三个 User Story 都能独立验收；不提供导航或地图视图。

## Phase 6: Polish, Operations and Release Evidence

- [x] T018 在 `apps/webapp/.env.example`、`deploy/env/webapp.production.env.example`、`docs/architecture/production-deployment.md` 记录无真实值的 server-only Key、缺 Key 禁用和轮换说明，检查 `scripts/ops/sync-production-env.ps1` 的同步语义；注明账号权限、配额/QPS、计费和条款由用户在公开上线前人工核对，本版不实现账号级限速/告警
- [x] T019 在 `docs/architecture/production-deployment.md`、`docs/architecture/capability-skill-surface.md` 与 `docs/adr/0020-amap-mcp-tool-boundary.md` 把已实现的能力、运维限制与 ADR 状态同步为当前事实
- [x] T020 在 `apps/webapp/tests/components/chat/message-list/messages/assistant-message-general-react.test.tsx`、`apps/webapp/tests/lib/ai/stream-recovery/stream-event-projector.test.ts` 与 `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts` 验证地图 Tool 自有安全 Trace/`StreamEvent`、重连与取消；快照及 Memory 沿用既有通用 Tool 覆盖，不新增地图专用存储测试或保留策略
- [x] T021 按 `specs/v0.6.2-amap-mcp-tools/quickstart.md` 执行低频真实 Key 九项正常 smoke、GCJ-02 坐标样本、普通问答与原七 Tool 回归、缺 Key/未验证映射禁用、typecheck/lint/build，并把脱敏结果写入 `specs/v0.6.2-amap-mcp-tools/acceptance.md`；任一九项不通过不得发布地图能力
- [x] T022 在 `specs/v0.6.2-amap-mcp-tools/acceptance.md` 记录 `speckit-analyze`、实现后 `speckit-converge`、非目标核对和 release closing；在公开上线交接中提示用户自行核对账号/条款；随后按真实结果同步 `docs/versions/v0.6.2-amap-mcp-tools.md`、`docs/releases/v0.6.2.md`、`docs/tasklists/v0.6.2-tasklist.md`、根 `README.md` 与 workspace package manifests 的 lockstep version

## Post-closing maintenance

- [x] T023 处理用户实际使用中报告的地图 Trace、历史来源校验和 `deepseek-v4-pro` 思考配置问题：地图 Tool Definition/adapter 提供具体中文 Trace 名称与固定错误分类；在 `model-catalog.ts`、兼容 provider 与 Tool prompt 补齐模型级 `thinking` 映射和九项地图用途。历史的当前 user turn 城市白名单来源门已由 T025–T029 的统一业务参数候选策略 superseded；以先失败后通过的 unit/UI/runner/prompt 测试、三次并发真实城市编码和最终工程检查记录为证；不改变地图存储或天气范围。
- [x] T024 依据真实用户地图场景，在 `apps/webapp/lib/ai/prompts/tool-calling.ts` 补齐通用 Tool result facts rule：即时、精确或外部事实只依据当前 Run observation；缺失、失败或未完成时如实说明，不用模型常识、估算、同类候选或调用顺序补齐。地图 Tool use prompt 说明最小调用、位置来源并提供三里屯日料、天安门驾车、附近地点和跨城公交示例。在 `apps/webapp/tests/lib/ai/prompts/tool-calling.test.ts` 先验证新增契约失败，再实现并通过；不新增 Tool、Runtime 权限、重试或存储策略。

## Phase 7: Unified business parameters and repair retry

**Purpose**: 用户或模型均可生成 Tool 的业务参数；所有参数仍经过 strict schema、工具语义和出网安全校验。参数错误由模型在下一 Action 使用新参数修正，瞬态故障才重发同一请求。

- [x] T025 **Regression test gate**：已先写失败用例，覆盖模型生成地图地址/坐标与公共 URL、schema repair observation、400 不重发同参、retryable 失败重试、地图 Key/signed URL/provider 前拒绝和 observation 事实边界。
- [x] T026 **Unified input policy**：已移除地图与 `read-url` 的 user/observation 参数授权门及其 Run state；业务参数允许由模型或用户生成，固定 allowlist、schema、GCJ-02/范围、公开 URL policy、secret guard 与 public Trace 脱敏保持。
- [x] T027 **Repair semantics and outbound hardening**：已区分 retryable transport retry 与模型参数修正；安全字段级 repair hint 不含原始值或远端错误；`AI_MIND_AMAP_MCP_KEY` 已加入 known secret，所有 remote-readonly 参数均经过统一 outbound-secret guard。
- [x] T028 **Prompt and contract alignment**：已明确候选参数与 observation 事实边界、缺锚点澄清和修正调用方式，并同步九项地图 Tool description。
- [x] T029 **Spec and architecture synchronization**：已在当前 canonical workspace、ADR、architecture 和公开版本文档标记 provenance-only 决策 superseded 并记录本次验证证据；未创建 sibling spec。
- [x] T030 **Verification and close**：已运行 T025 定向 suites、全 workspace typecheck、全 workspace lint、Spec Kit analyze/converge、受控低频 map smoke、`pnpm test:stable`、`pnpm build` 和最终 `git diff --check`；证据记录在 `acceptance.md`，不含 Key、URL、原始请求/响应或敏感位置。

## Phase 8: Completed constrained finalizer maintenance

- [x] T031 [P] 在 `apps/webapp/tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx` 先复现 completed constrained Run 被错误展示为“处理未完成”，并保留真实 `failed` 的原文案覆盖。
- [x] T032 [P] 在 `apps/webapp/tests/lib/ai/runtime/chat-session.test.ts` 与 `apps/webapp/tests/lib/ai/prompts/tool-calling.test.ts` 先断言受限 finalizer 接收 Tool result 事实规则，且路线缺失距离/时长时不能从坐标或经验推算。
- [x] T033 在 `apps/webapp/components/chat/message-list/parts/general-agent/general-agent-trace-panel.tsx` 让总标题只按真实 terminal status 判断；completed constrained Run 保持 Trace 展开策略但显示“已完成思考”。
- [x] T034 在 `apps/webapp/lib/ai/runtime/chat-session.ts` 将 `toolResultSystemPrompt` 传给受限 finalizer，并在 `apps/webapp/lib/ai/prompts/tool-calling.ts` 明确路线空结果的事实边界。
- [x] T035 同步 canonical spec、plan、acceptance、ADR/公开版本说明并运行定向测试、typecheck、lint 与 `git diff --check`。

## Phase 9: AMap safe failure and no-result repair

- [x] T036 [P] 在 `apps/webapp/tests/lib/ai/mcp/client/mcp-client.test.ts`、`apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts`、`apps/webapp/tests/lib/ai/mcp/adapters/amap-mcp-tool-adapter.test.ts` 先复现 MCP timeout/connection/HTTP 分类无法传给 Runtime、行政区字段丢失、明确空 POI 被伪装成普通完成的行为；测试不得断言或输出原始错误、URL、Key、地址或坐标。
- [x] T037 **Historical scope superseded by T046**：在 `apps/webapp/lib/ai/mcp/protocol/errors.ts`、`apps/webapp/lib/ai/mcp/client/mcp-client.ts`、`apps/webapp/lib/ai/mcp/adapters/amap-mcp-tool-adapter.ts` 与 `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts` 传递并消费安全 status/retry 分类；原先只让明确 timeout、connection、429、5xx 进入既有 remote-readonly retry。T046 将 MCP `isError` 细分为已识别瞬态失败与一次安全兜底，malformed result 仍不重试。
- [x] T038 在 `apps/webapp/lib/ai/mcp/adapters/amap-mcp-tool-adapter.ts`、`apps/webapp/lib/ai/tools/amap/amap-tool-boundary.ts`、`apps/webapp/lib/ai/prompts/tool-calling.ts` 实现行政区 allowlist 和显式 POI `no-result` observation，禁止同参重复查询；不增加地图专用存储、StreamEvent 字段或原始服务诊断。
- [x] T039 同步 canonical spec、plan、decisions、acceptance、architecture/公开版本说明，运行 targeted Vitest、typecheck、Webapp lint、受控 external smoke 与 `git diff --check`；记录安全结果，不提交、tag、发布或部署。

## Phase 10: AMap request batch pacing (2026-09-28)

**Purpose**: 修复同一高德 Key 的详情查询在非受控突发后出现安全失败的问题，同时保持 General ReAct 的三并发和通用 remote-readonly retry/deadline 语义。

- [x] T040 **Test gate**：在 `apps/webapp/tests/lib/ai/mcp/client/mcp-client-manager.test.ts` 先复现并断言：未配置策略的 server 立即转发；配置策略的 server 对同 tick 七条 ToolCall 只启动首批三条，须等本批全部 settled 并经过 800ms 才能启动下一批；不同 server 不互相阻塞；失败不阻断同批；队列中的 abort/deadline 与 `close` 不得外发旧请求；错误、signal 与 `MCPClient.callTool` 返回值原样透传。500ms 版本已 red/green；用户将冷却调整为更长的 800ms 后要求不重跑。
- [x] T041 **Server-owned policy contract**：在 `apps/webapp/lib/ai/mcp/protocol/types.ts` 与 `apps/webapp/lib/ai/mcp/registry/server-definitions.ts` 增加仅服务端可见的可选 Tool batch policy；只给 `amap-maps` 固定 `{ maxBatchSize: 3, cooldownMs: 800 }`，不得写 `serverId` 特判或把策略放进模型/adapter 参数。
- [x] T042 **Manager batch implementation**：在 `apps/webapp/lib/ai/mcp/client/mcp-client-manager.ts` 实现按 `serverId` 共享的批次队列。当前批所有项 settled 后根据完成时间冷却 800ms；等待中的 abort/deadline 立即移除且不外发；`close`/`closeAll` 拒绝未 dispatch 项并阻止旧 queue 后续创建 client。不得在 manager 增加重试、错误重包、raw diagnostics 或公开事件。
- [x] T043 **External and regression verification**：在 `apps/webapp/tests/lib/ai/mcp/amap-mcp-live-smoke.test.ts` 增加 env-gated 真实 POI 搜索后连续三批各三条详情调用的安全 smoke；当前配置按 800ms 批次冷却，已通过的 500ms 真实 smoke 是更短冷却的证据，本次用户要求不重复外部调用。只断言结构与成功数量，不输出 Key、URL、POI ID、地址、坐标、payload 或原始错误。500ms 配置下的定向 Manager、地图 adapter/client/runtime 回归与 external smoke 已通过。
- [x] T044 **Synchronization and close**：同步同一 canonical `spec.md`、`plan.md`、`research.md`、`decisions.md`、`data-model.md`、`acceptance.md`、architecture/公开版本说明。800ms 为比既有外部验证更保守的常量调整；用户明确要求不重复 typecheck、lint、稳定回归或 external smoke。此前 workspace typecheck、定向 lint/回归和 external smoke 已通过；一次完整稳定回归在无关的 calculator 5ms p95 性能阈值上失败，未为本次调整重跑。800ms 同步后的 `git diff --check` 通过。未提交、tag、部署或新建 sibling spec。

## Explicitly Deferred — Not in v0.6.2

- 不新增 MCP server version/schema hash 自动漂移检测任务；T001 的人工契约记录是本版的映射证据。
- 不新增路线多候选、完整逐步指引或道路限制详情的 Tool、DTO、测试或展示任务。
- 不新增地图专用的 Chat Memory、User Memory、快照或 PostgreSQL eligibility 测试；T020 只覆盖本版实际新增的安全 Trace/`StreamEvent`、重连和取消行为。

## Phase 11: AMap `isError` transient retry classification (2026-09-28)

**Purpose**: 高频调用可能经 MCP 协议层 `isError` 返回，而不是 HTTP 429；在不保留 raw error 的前提下区分可恢复的短时失败、不可恢复的请求失败与一次兜底场景。

- [x] T045 **Test gate**：在 `apps/webapp/tests/lib/ai/mcp/adapters/amap-mcp-tool-adapter.test.ts` 与 `apps/webapp/tests/lib/ai/runtime/tool-runtime-execution.test.ts` 先写回归测试：已识别的高德限流/服务故障沿用两次指数退避，无法归类的已验证只读 `isError` 只尝试一次，权限、额度、4xx 参数和 malformed result 不重发，且原始错误永不离开 adapter。
- [x] T046 **Safe classification implementation**：在 `apps/webapp/lib/ai/mcp/protocol/errors.ts`、`apps/webapp/lib/ai/mcp/adapters/amap-mcp-tool-adapter.ts` 与 `apps/webapp/lib/ai/runtime/tool-runtime/execution.ts` 实现安全分类和 per-error retry limit；保持 Tool Runtime 是唯一的等待/重试 owner，所有重试复用 `amap-maps` 的三条一批、800ms 调度。
- [x] T047 **Synchronization and verification**：同步本 canonical workspace 的 spec/plan/data model/contract/decision/acceptance，执行相关 Vitest、typecheck、lint、`speckit-analyze`、`speckit-converge` 与 `git diff --check`；不调用真实高德服务，不提交、tag、发布或部署。

## Phase 12: Audit P1 retry remediation (2026-09-28)

**Purpose**: 已识别额度耗尽即使伴随 HTTP 429，也必须在 Runtime 前保持显式不可重试，不能被短时频率限制策略覆盖。

- [x] T048 **Regression and implementation**：在 AMap adapter 与 Tool Runtime 回归中覆盖 `DAILY_QUERY_OVER_LIMIT + 429`；adapter 先处理额度、权限和参数等不可重试信号，Runtime 尊重 `MCPHostError.retryable=false`，确保同一逻辑调用只执行一次。
- [x] T049 **Synchronization and verification**：同步 canonical plan/tasks/decision/acceptance，执行 adapter 与 Runtime 定向 Vitest、webapp typecheck、lint 和 `git diff --check`；不调用真实高德服务，不提交、tag、发布或部署。

## Phase 13: General ReAct logical Tool Call budget (2026-09-28)

**Purpose**: 将单 Run logical Tool Call 累计上限从 14 调整为 18，以允许一轮规划中更多相互独立的 Tool 调用；九个 Tool-bearing rounds 不是每轮 18 次额度。

- [x] T050 **Test-first budget boundary**：在 General ReAct state、action-batch admission、run-policy、runtime-policy matrix 与 Tool Runtime middleware 测试中先断言 18 次累计 admission、19 次第一个 overflow、最后一个 Tool-bearing round 的剩余两次 admission 与 `tool_call_limit`。旧值 14 下定向 Vitest 的 6 个断言失败。
- [x] T051 **Budget implementation**：仅将 `GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls` 设为 18；保持 `maxToolBearingRounds=9`、`maxToolConcurrency=3`、`maxToolRetries=4`、deadline、observation、权限、schema、脱敏和 MCP batch pacing 不变。
- [x] T052 **Canonical synchronization**：同步 spec、plan、data model、decision、architecture 与 ADR，明确 18 是跨所有 Action rounds 的累计上限，不改变 public contract、StreamEvent、数据库或地图专用存储。
- [x] T053 **Verification and convergence**：General ReAct 定向 Vitest 5 files / 54 tests、webapp typecheck、lint、`speckit-analyze` 等价一致性检查、`speckit-converge` 等价收口检查与 `git diff --check` 均通过；不调用真实 AMap 服务，不提交、tag、发布或部署。

## Phase 14: General ReAct 21-call cumulative budget (2026-09-28)

**Purpose**: 将单 Run logical Tool Call 累计上限从 18 调整为 21。21 是三个 Tool 的完整七批容量，不是九个 Tool-bearing rounds 的每轮额度。

- [x] T054 **Test-first 21-call boundary**：先将 General ReAct state、action-batch admission、run-policy、runtime-policy matrix 与 Tool Runtime middleware 的边界推进为前 21 次 admission、第 22 次 overflow，及第九个 Tool-bearing round 已用 19 次时只可再 admission 两次。
- [x] T055 **Budget implementation**：仅将 `GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls` 更新为 21；不改变 Tool-bearing rounds、并发、retry permits、deadline、observation、schema、安全或 MCP batch pacing。
- [x] T056 **Canonical synchronization**：把当前 FR-018、SC-010、data model、D-022、architecture、ADR 和 acceptance 当前事实更新为 21；保留 T050–T053 的 18-call 历史证据。
- [x] T057 **Verification and convergence**：General ReAct 定向 Vitest 5 files / 54 tests、webapp typecheck、lint、`speckit-analyze` 等价一致性检查、`speckit-converge` 等价收口检查与 `git diff --check` 均通过；不调用真实 AMap 服务，不提交、tag、发布或部署。

## Dependencies & Execution Order

- T001 是九项静态映射的外部契约门：Key 安全可用后应优先执行，且必须在 T007 前完成；它不是实现后的普通 smoke。T001 可使用不绑定模型权限的受控 provider probe；若复用 T004/T005 的固定连接实现，T004/T005 可先执行，但不改变 T001 先于 T007 的门槛。T002 依赖 T001 的映射证据；T003～T006 可并行推进。T006 的测试先于 T007 实现，T007 先于 T008 绑定；T001 与 T006–T008 构成进入 User Story 前的核心安全门。T021 的九项真实 smoke 是实现后的发布验收，不替代 T001 的映射核验。
- US1、US2、US3 在 foundation 后可分开实现，但同一 `apps/webapp/lib/ai/tools/amap/` 与 runner 测试文件必须由单一 owner 顺序整合，避免共享文件并发覆盖。
- 推荐先完成 US1 作为 MVP，然后 US2、US3；T018/T019 可在功能稳定后分工，T020/T021/T022 最后统一验收。
- 测试任务先写失败用例，再实现相应 Tool；实施每个 Step 只执行其相关测试与必要 typecheck，不提前勾选发布验收。

## Implementation Strategy

实现按 T001 的真实映射证据、T006–T008 的安全门与三个 User Story 顺序收口。天气工具仅诊断并留待后续版本；所有 task 的 `[x]` 由真实代码、测试、脱敏 smoke 与 diff 支持。
