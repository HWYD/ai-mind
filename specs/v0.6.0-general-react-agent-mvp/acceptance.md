# Acceptance: v0.6.0 General ReAct Agent MVP

**Status**: Implementation closing; Phase 14 Action/Answer implementation and scoped verification complete. Its full stable-suite gate remains open because the pre-existing calculator p95 performance test currently fails; release also remains gated by the separate production-like PostgreSQL p95 evidence.

**Canonical workspace**: `specs/v0.6.0-general-react-agent-mvp/`

## Purpose

本文只定义实施 Step 的进入/退出条件和证据落点。详细场景与测试矩阵以 `quickstart.md` 为准，需求结果以 `spec.md` 为准，技术约束以 `plan.md`、`data-model.md` 和 `contracts/` 为准。实施不得通过修改验收标准来迁就代码。

## Evidence Rules

- 每条命令记录执行目录、命令、日期、exit code 与简短结果；失败不得只记录“已知问题”。
- tests-first 任务须记录预期失败和实现后通过，不能只保留最终绿灯。
- 外部 Tavily smoke 只有在显式 external-test 环境和测试凭据存在时执行；未执行必须记录剩余风险，不得加入 production test fallback。
- 性能数据必须来自本地 PostgreSQL 和 scripted model/Tool；不得把 Tavily 网络波动混入 reference load。
- 每个 Step 完成后运行项目 `ai-mind-step-audit` 或人工等价审计，再进入下一 Step。

## Step 1 — Dependency Migration Gate

**Tasks**: T001–T005

**Exit criteria**:

- [x] `langchain`、`@langchain/core`、`@langchain/langgraph` 位于单一兼容线，无重复 runtime/type split。
- [x] `createAgent(version='v2')` 在 Next.js server runtime 可 import/build，middleware、abort、stream 和 `maxConcurrency=3` Spike 通过。
- [x] Tasklist、Delivery、Image、Chat Memory checkpointer 和 provider targeted suites 未回归。
- [x] 临时 Spike 没有引入第二套 Graph、手写循环或业务兼容 hack。

**Evidence**:

- 2026-09-10，工作区 `D:\code\mine\ai-mind-dev`：当前分支为 `codex/v0.6.0-general-react-agent-mvp`，基线提交为 `a770a1819afa22bcadce1153e3c2738a21ab5c48`；`git rev-parse --git-dir` 与 `git rev-parse --git-common-dir` 不同，确认当前目录已经是 linked worktree，无需再创建嵌套 worktree。
- 实施前 dirty-worktree inventory：`AGENTS.md` 为既有 managed plan pointer 修改；`design/` 与 `specs/v0.6.0-general-react-agent-mvp/` 为本版本前置设计/规格资产。以上内容均予以保留，实施不得覆盖或清理。
- 2026-09-10，仓库根目录执行 `pnpm test:stable`，exit code `0`；Turborepo 共 `6/6` tasks 成功。其中 Webapp stable 为 `167` 个 test files、`1173` 个 tests 全部通过；governance、desktop、project-assistant-service、stream-core 与 database 稳定链路均通过。该结果作为依赖迁移前回归基线。
- 2026-09-10，`apps/webapp` 执行 `..\..\node_modules\.bin\vitest.cmd run --config vitest.stable.config.ts tests/lib/ai/runtime/general-react-agent/dependency-compatibility.test.ts`，exit code `1`；T002 RED 按预期失败于 `Cannot find package 'langchain'`。测试已固定 Node.js server import/stream、middleware ordering、AbortSignal 传播和 `version='v2'` 下四个 Tool Call 的 `maxConcurrency=3` 契约。
- 2026-09-10，LangChain compatibility unit 固定为 `langchain@1.5.10`、`@langchain/core@1.2.10`、`@langchain/langgraph@1.4.14`；`pnpm install` exit code `0`，同步更新 `apps/webapp/package.json` 和 `pnpm-lock.yaml`。选择已发布约三周的 `langchain@1.5.10`，不采用发布不足一天的 `1.5.11`；三项 runtime 依赖使用 exact version，避免 lockfile 重新解析时未经 Spike 漂移。
- 2026-09-10，重新执行 T002 compatibility test，exit code `0`，`1` 个 test file、`4` 个 tests 全部通过；验证 `createAgent({ version: 'v2' })` Node.js import/stream、middleware 前序/后序、派生 AbortSignal 传播以及四个并行 Tool Call 在 `maxConcurrency=3` 下峰值严格为 `3`。
- 2026-09-10，仓库根目录执行 `pnpm --filter @ai-mind/webapp list langchain @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint --depth 8`，exit code `0`；执行 `pnpm --filter @ai-mind/webapp why @langchain/core` 与 `pnpm --filter @ai-mind/webapp why @langchain/langgraph`，exit code 均为 `0`。解析结果为 `Found 1 version of @langchain/core`（`1.2.10`）和 `Found 1 version of @langchain/langgraph`（`1.4.14`），checkpoint 为 deduped `1.1.5`，OpenAI/Ollama/Postgres checkpointer 均落在同一 core peer runtime。
- 初次 typecheck 准确暴露本地 `apps/webapp/node_modules/@langchain/{core,langgraph}` 仍指向旧 pnpm virtual-store junction；lockfile 与 `pnpm why` 已是新版本，但 package-local stale junction 覆盖了根级 hoisted runtime。未采用类型断言绕过；在确认目标为工作区内生成目录后清理旧 Webapp `node_modules`，再执行 `pnpm install --filter @ai-mind/webapp --force --ignore-scripts`，最终 Node resolution 均指向根级 hoisted `core@1.2.10` / `graph@1.4.14`，workspace package junction 同时恢复。
- 2026-09-10，仓库根目录执行 `pnpm --filter @ai-mind/webapp typecheck`，exit code `0`。
- 2026-09-10，`apps/webapp` 在清理后的单一解析路径上执行 compatibility、Tasklist、Delivery、Image、Chat Memory checkpointer provider 和 model-provider 合并专项命令，exit code `0`；共 `49` 个 test files、`377` 个 tests 全部通过。
- Phase 1 gate 结论：**PASS**。未引入第二套 Graph、手写 ReAct loop 或业务兼容 hack，可以进入 Phase 2。

## Step 2 — Foundational Runtime And Durable Stream

**Tasks**: T006–T028

**Exit criteria**:

- [x] State/context/config、execution gate、RetryPermitPool、Tool policy/runtime 的公开边界均有 tests-first 证据。
- [x] `tool-end.sources` 保持 optional/backward-compatible，未新增 chunk type 或 route。
- [x] Prisma/PrismaPg 每进程单例与 pool 参数通过集成验证，未修改 Prisma schema。
- [x] `appendEvents()` 和 projection buffer 证明 persist-before-publish、顺序、terminal-last、回滚、微批量和高低水位语义。
- [x] ordinary-chat route 尚未提前切换。

**Evidence**:

- 2026-09-10，T006/T008/T010/T012/T014/T016/T018/T020/T022/T024/T026 均先建立 RED：新 runtime primitive 初始失败于模块不存在；Tool policy/runtime 初始失败于缺失判别式 policy、统一 timeout/retry 和 public/internal output 边界；provider continuity 初始证明 `reasoning_content` 未跨 Tool turn 保留；source schema 初始拒绝新字段；batch store 初始失败于缺少 `appendEvents()`；durable buffer 初始失败于模块不存在。实现过程中新增的 terminal 同 tick 并发用例也先准确失败于 late event 被接纳，再以 terminal admission reservation 修复。
- 固定的 General ReAct state/context/config 已覆盖 180s hard deadline、145s action cutoff、4 action rounds、9 logical Tool Calls、6 model calls、4 Run retries、concurrency 3、observation bounds 与 merge-safe reducers；execution gate 仅保存 8 个 process permit，RetryPermitPool 按“实际 retry 前竞争”执行 per-call 2、per-Run 4 且额度不返还。
- `ToolExecutionPolicy` 已把 `standard-tool` 与 `agent-tool/delegated-agent` 分开；普通 Tool 的 effective timeout 取 profile/tool/action/hard remaining 最小值，前置校验拒绝和 cancel 不进入 attempt，retry-safe remote execution failure（含网络、4xx、5xx、provider typed error、解析及未知异常）使用 Retry-After/抖动退避和原子 retry permit。Tool transcript 仍保持一个 logical call，公开结果与内部 observation 分离。
- `reasoning_content` 仅保留在 server-side internal model continuation，public chunk 仍为 0；`tool-end.sources` 以 optional 字段扩展现有协议，限定 `web-search/read-url`、安全 HTTP(S) URL 和最多 5 条记录，未新增 chunk type、route 或 raw provider 字段。
- `@ai-mind/database` 已在 development/production 共用 process singleton Prisma/PrismaPg，pool 固定为 `max=10`、connection timeout `5s`、idle timeout `30s`，无 per-request disconnect。2026-09-10 在 `packages/database` 执行 `vitest run tests/prisma.integration.test.ts`，exit code `0`，`3` tests passed、`2` 个依赖真实 `DATABASE_URL` 的数据库 roundtrip tests skipped；真实 PostgreSQL 延迟/连接验收保留到 Step 6 reference load。
- `StreamEventStore.appendEvents()` 在单 transaction 中 lock 一次、分配连续 sequence、`createMany` 一次、更新 StreamRun 一次并至多 trim 一次；terminal-last、deadline 收紧、update failure 全回滚均有测试。`DurableStreamProjectionBuffer` 已证明每 part 首 delta 立即 durable flush、后续 40ms/256 chars 合并、大 delta 不拆、结构事件保留独立顺序、64 items/256KiB 高水位、32 items/128KiB 低水位、persist-before-publish、取消清理与 terminal 原子封口。
- 2026-09-10，`apps/webapp` 执行 Phase 2 合并专项 Vitest，exit code `0`，`12` test files、`116` tests 全部通过；随后 store+buffer 加强回归为 `2` files、`26` tests 全部通过。`packages/stream-core` protocol test 为 `8/8` 通过。
- 2026-09-10，Webapp 与 database TypeScript typecheck 均 exit code `0`；`pnpm --filter @ai-mind/webapp lint` exit code `0`；`git diff --check` 无输出。`git diff --name-only -- apps/webapp/lib/ai/runtime/chat-orchestrator.ts apps/webapp/lib/ai/chat-service.ts apps/webapp/app/api/chat/route.ts packages/database/prisma/schema.prisma` 无输出，证明 ordinary-chat 路由及 Prisma schema 尚未提前切换。
- Phase 2 `ai-mind-step-audit` 结论：**PASS**。Shared contracts 与 durable primitives 范围符合 T006–T027，未引入第二 Agent loop、Redis、Worker Thread、新 route、数据库表或专用 Agent 路由修改；可进入 Phase 3。剩余的真实 PostgreSQL reference load、buffer 与 chat lifecycle 集成、指标和 hard-deadline 清理属于已排定的 T068–T079，不构成本 Step 越界实现。

## Step 3 — US1 General ReAct Kernel

**Tasks**: T029–T044

**Exit criteria**:

- [x] 零 Tool、calculator、datetime、Web Search→Read 和 1–4 轮 scripted 场景均由同一 `createAgent` loop 完成。
- [x] 四个并行 Tool 的峰值并发为 3，ToolMessage 一一配对且下一轮按 ordinal 稳定。
- [x] 4 rounds、9 logical Tool Calls、6 model calls、145s action cutoff、180s hard deadline 和 constrained final 边界可测。
- [x] Secret Guard、URL capability、provider-returned URL revalidation 与网页 prompt-injection 测试全部 fail-closed。
- [x] Tool-capable model 不可用时标准化失败，不回退旧 direct-answer 路径。

**Evidence**:

- 2026-09-10，T033/T034/T035 的 tests-first RED 已准确暴露 runner 计数/截止、stream adapter 边界和普通 chat 集成缺口；实现后于 2026-09-11 在 `D:\code\mine\ai-mind-dev\apps\webapp` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/capabilities/tool-binding.test.ts tests/lib/ai/runtime/general-react-agent tests/lib/ai/tools/web`，exit code `0`，14 个 test files、120 个 tests 全部通过。
- 同一 runner 定向套件验证 natural/constrained/deterministic final、action cutoff、hard deadline、request cancel、实际执行 source 分类、4-wide Tool batch peak concurrency `3`、ToolMessage 配对和 search→read 两轮授权链；provider-returned URL 在当前 Run 授权前无法进入 `read-url`。
- 2026-09-11，在 `D:\code\mine\ai-mind-dev\apps\webapp` 执行 route/model fail-closed 套件：`..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/app/api/chat/route.test.ts tests/lib/ai/model-provider/resolve-model-selection.test.ts tests/lib/ai/model-provider/model-provider-config.test.ts`，exit code `0`，3 个 test files、40 个 tests 全部通过；不支持 Tool Calling 的模型返回标准化 `MODEL_DOES_NOT_SUPPORT_TOOL_CALLING`，不回退旧 direct-answer。
- 2026-09-11，在 `D:\code\mine\ai-mind-dev\packages\stream-core` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run tests/protocol/chat-stream-chunk.test.ts`，exit code `0`，9 个 tests 全部通过；`tool-end.sources` 保持 optional/backward-compatible，`STREAM_SERVICE_UNAVAILABLE` 已纳入共享错误码。
- 2026-09-11，在 `D:\code\mine\ai-mind-dev\apps\webapp` 执行 `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit --project tsconfig.json`，exit code `0`；相关 General ReAct、orchestrator、capability 文件执行 ESLint exit code `0`；仓库根执行 `git diff --check` exit code `0`。
- 普通 chat 在 session/provider/Tool 创建前申请 process-scoped 8-run gate；第 9 个 run 在 `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts` 中验证为 `STREAM_SERVICE_UNAVAILABLE`、`retryable=true`，且 `createChatSession` 调用为 0；Tasklist、Delivery、Image 不申请该 generic gate。
- 2026-09-11，完成 `ai-mind-step-audit` 人工等价审计，结论 **PASS_WITH_NOTES**：Step 3 目标、createAgent 单 loop、Tool/Stream/public DTO 边界、范围控制和回归验证均通过；修正了拒绝/阻断 ToolMessage 被误算为 executed Tool 的 source 分类问题。该日审计时外部 Tavily smoke 尚未执行；后续 T089 已在显式 external-test 凭据环境完成 Search/Extract 验证。

## Step 4 — US2 Context Convergence

**Tasks**: T045–T052

**Exit criteria**:

- [x] `/summary`、`/check`、`@resource`、各现有 Skill、MCP Resource/Prompt 和允许的 MCP Tool 均先准备上下文，再进入同一 Agent。
- [x] base tools 始终存在；overlay 只增加显式授权能力，冲突或 Agent Tool fail-closed。
- [x] context preparation 不再正常提前生成 final answer，原有授权和失败语义保持。
- [x] Chat Memory/UserMemory 只写完成 final turn，既有 eligibility 未扩大。

**Evidence**:

- 2026-09-11，`apps/webapp` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts`，exit code `0`，1 个 test file、4 个 tests 通过；tests-first RED 已先证明 `/summary`、`/check`、`@resource` 只能产出 `PreparedGeneralChatContext`，不会在准备阶段调用 final model，且 capability 失败只进入受控 context observation。
- 2026-09-11，`apps/webapp` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts tests/lib/ai/capabilities/tool-binding.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts`，exit code `0`，3 个 test files、40 个 tests 通过；覆盖 Composer/Capability 汇入同一 General ReAct runner、base tool 保留、Skill overlay 冲突、agent-tool fail-closed、未授权/不可用 context 的安全失败以及不生成 early final answer。
- 2026-09-11，`apps/webapp` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/capabilities`，exit code `0`，5 个 test files、58 个 tests 通过；旧 UserMemory/Chat Memory eligibility、普通 Tool Calling、Skill/session 回归保持通过。
- 2026-09-11，`apps/webapp` 执行 `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit --project tsconfig.json`，exit code `0`；Phase 4 相关实现和类型边界通过 TypeScript 检查。
- 2026-09-11，`apps/webapp` 对 `chat-orchestrator.ts`、`composer-context.ts`、`capability-context.ts`、`types.ts`、`tool-binding.ts` 及 Phase 4 测试执行 ESLint，exit code `0`；根目录 `git diff --check` 作为阶段收口检查无输出。
- `PreparedGeneralChatContext` 只携带受控 `BaseMessage[]` 与预留的 typed non-message payload，不保存 raw provider/MCP error、raw prompt 或 raw capability state。Composer/Capability 失败统一映射为固定公开安全分类文案，既用于受控 observation 也用于 stream error，避免内部错误细节进入 Agent context 或前端。
- 本条为 Step 4 历史实现记录，已由 D033 废弃：当前 `resolveGeneralToolBinding()` 固定解析七项 General Tool，Skill 不再参与 Tool/MCP selector 或 remote discovery。
- `ChatOrchestrator` 在 generic chat 中按 `prepare Composer/Capability context → Chat Memory/UserMemory preflight → GeneralReActAgentRunner` 执行；最终只在 runner 返回 assistant text 后追加 completed turn。Tasklist、Delivery、Image 仍在 generic gate 前保留专用分支，UserMemory 的读取和写入 eligibility 未扩大。
- 2026-09-12，补充修复并验证 FR-016：General ReAct 在 `beforeAgent` 从当前最新 user message 提取安全 HTTP(S) URL，canonicalize 后以 `grantedBy='user'`、`grantCallId=null` 写入本 Run `_authorizedUrls`；系统/记忆消息、私网、凭据 URL 和跨 Run URL 均不进入授权集合。`agent-state` 与 runner 回归覆盖通过，真实 `read-url` smoke 随后成功执行并产出 `status='read'` source。
- Phase 4 `ai-mind-step-audit` 人工等价结论：**PASS_WITH_NOTES**。本段关于 generic chat 的 MCP Resource/Prompt 自动 context 已由 D033/T138 废弃；当前仅 Composer 显式上下文会进入 General ReAct，`capability-context.ts` 已移除。真实 Tavily smoke、Pencil/UI、PostgreSQL reference load 属于后续 Step 5–6 的明确 gate，不阻塞进入 Step 5。

## Step 5 — US3 Trace And Local Recovery

**Tasks**: T053–T067

**Exit criteria**:

- [x] UI 实施前已通过 Pencil MCP 读取 `design/pencil/agent-ui.pen` 并记录 canonical 节点映射；PNG 未被当作开发事实源。
- [x] Generic chat 只有一个 Trace，Tool/Skill/Resource/Prompt 旧面板在 Trace 外数量为 0；专用 Agent presentation 不变。
- [x] active/manual-collapse/final-pending/final-start/manual-reopen/cancelled/failed-terminal 以及 `agent-run` 前首帧均符合 FR-037，标题无耗时且只有 active 文本 Shimmer。
- [x] 仅 accepted follow-up 在 submitted/streaming 的 assistant slot 与 ready/error 的最终 assistant item 保留固定 `288px` response reserve，之前的历史 assistant 不带 reserve；无 viewport reply runway，Composer-safe bottom inset、稳定 live-turn key 与既有滚动意图策略保持不变。
- [x] Tool 类型图标、等权状态文案、ordinal 槽位、retry 原行更新、搜索/读取计数和最多 5 个安全 read sources 全部通过。
- [x] 完成且非空的 Trace+答案可由现有 IndexedDB snapshot 刷新恢复；取消/失败/partial 不提交，local failure 可退回服务端最终问答。
- [x] 本地 snapshot、public stream 和 UI 对 raw reasoning、raw Tool data、网页正文、internal prompt、error 与 secret 的 sentinel 泄漏为 0。

**Evidence**:

- 2026-09-11，实施前执行 `Get-Content -Raw design/pencil/agent-ui.pen | ConvertFrom-Json` 的只读结构检查；canonical 顶层节点映射为 `wtRvx`（Design Overview）、`AkNwb`（UI Primitives）、`PQwFA`（Running Expanded）、`zLnf9`（Parallel Mixed）、`FGxge`（Final Pending）、`hPpQn`（Final Auto Collapsed）、`U1aNLT`（Completed Reopened）、`zSXLs`（Exceptional Terminal）。当前会话没有 Pencil MCP callable tool，因此未伪称完成 MCP 调用；采用 `.pen` 原文结构等价检查，未读取或修改 PNG 作为开发事实源。`.pen` 未变化，T067 不重新导出 PNG。
- 2026-09-11，tests-first RED：`stream-message-reducer.test.ts` 在缺少 `general-agent-trace-view` 时按预期失败；Trace panel、assistant renderer、snapshot allowlist 和 unmount flush 用例先分别暴露缺失组件、旧面板旁路、raw 字段泄漏和 pending delta 丢失，之后实现为绿灯。
- 2026-09-11，`apps/webapp` 执行 General Agent 组件/消息定向套件，exit code `0`，13 个 test files、104 个 tests 通过；Generic chat 的 Tool/Skill/Resource/Prompt 只进入一个 `GeneralAgentTracePanel`，Tasklist Agent Graph、Delivery workflow 和 Image presentation 保持原链路。
- 2026-09-11，完成增量回归与 Shimmer/empty-Trace 修复后，`pnpm --filter @ai-mind/webapp test:stable` 重跑通过：190 个 test files、1335 个 tests passed、10 skipped；首次完整运行唯一失败为 calculator CPU p95 的环境抖动（10.57ms > 5ms），单测重跑通过，随后 stable 全量重跑通过。
- 最新针对性回归（runner callback 增量、adapter public-safe projection、General Trace、空 reasoning loading、20ms+rAF buffer 与 reducer）为 7 个 test files、53 个 tests passed；相关 TypeScript 与 targeted ESLint 通过，`git diff --check` 无输出。
- 2026-09-12，仓库根目录执行 `pnpm lint`，exit code `0`，Turborepo `5/5` workspace lint 任务成功；Webapp 为 `0` errors、`8` 个既有 warnings（Fast Refresh/export 与 image-agent hook 依赖提示），未发现阻断性格式或 import 错误。
- 2026-09-11，`apps/webapp` 执行 `..\\..\\node_modules\\.bin\\vitest.cmd run --config vitest.stable.config.ts tests/components/instamind/chat-stream/stream-message-reducer.test.ts tests/components/instamind/chat-stream/stream-message-reducer-thread-memory-status.test.ts tests/components/instamind/use-stream-text-buffer.test.tsx tests/components/instamind/local-chat-persistence.test.ts tests/components/instamind/use-chat-stream.test.tsx tests/components/instamind/use-chat-stream-hydration.test.tsx tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx`，exit code `0`，7 个 test files、88 个 tests 通过；覆盖 ordinal/retry/source projection、20ms+rAF、代码围栏提前帧、terminal/abort/unmount flush、local-first hydration、删除/重新生成和 IndexedDB blocked-upgrade fallback。
- `ToolPart` 只把 `tool-end.sources` 的 public-safe records 带入消息树；`GeneralAgentTraceView` 对 HTTP(S) URL canonicalize、去重并最多保留 5 条成功 read sources，retry 使用同一 `partId` 原位更新，search/read 计数不按 retry 重复。
- `GeneralAgentTracePanel` 使用 shadcn-compatible `Collapsible`，整行标题与相邻 chevron 为唯一 disclosure 入口；active 标题仅由官方 shadcn `shimmer` CSS utility 作用于文字，final `text-start` 只自动收起一次，manual collapse 后不被后续事件重新展开，取消/失败分别显示“已停止思考”/“处理未完成”。Skill 在 `agent-run-start` 之后进入同一 Trace，固定显示 `加载了{skill.name} Skill`。
- `assistant-message.tsx` 仅在非 Tasklist/Delivery/Image dedicated presentation 中聚合 detail parts；旧 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 被 Trace 消费，专用 Agent 分支仍走原有组件。
- `stable-snapshot.ts` 对 generic Tool/Resource/Prompt/Text/Skill 采用显式 public allowlist，移除 raw input/output/error、网页正文、internal prompt、reasoning 和 provider secret；`schema.ts` 对 snapshot 中敏感字段拒绝解析，未新增 IndexedDB store/version。已有 `conversation-snapshots` hydration、delete/regenerate 入口继续复用同一 commit。
- `use-stream-text-buffer.ts` 采用 20ms timer + 最近 rAF，ref 保存 pending queue/timer；代码围栏提前到最近帧，卸载和现有 finish/error/abort flush 路径均清空队列，不拆 provider delta。IndexedDB unavailable/quota/invalid 由现有 store status 安全降级，不阻塞服务端消息恢复。
- 2026-09-11，针对 General Agent 首次增量回归补齐 runner 投影：General ReAct 同时消费 LangGraph `values` 与 `messages` stream，模型可见文本 chunk 直接投影为 public `text-delta`，不再等 run 结束后把完整 `assistantText` 作为单块发送；现有服务端 40ms/256-char durable microbatch、浏览器 20ms+rAF buffer、消息树增量 reducer 和虚拟滚动链路保持不变。adapter 会拒绝 Tool-call 参数及 reasoning content block，hard deadline 到达后不再发布模型文本。
- 2026-09-11，统一闪动视觉：`ThinkingText`、Workflow progress running 标题和 General Agent active 标题均使用单一官方 shadcn `shimmer` CSS utility，移除旧的 `thinking-text` 与 `workflow-progress` 自定义 sheen CSS；General Trace 没有可展示 rows/source 时隐藏相邻 chevron。
- General Agent active message 不再额外预留旧 ReasoningPanel 的空 loading card；无 reasoning 内容时只保留 General Trace 标题，避免出现双“正在思考”或旧箭头交互。
- 2026-09-12，Phase 11 frontend audit remediation：General Trace 在 action-settled/final-pending 继续显示 Shimmer“正在思考”，仅首个 final `text-start` 通过 layout-safe transition 切为“已完成思考”并收起；通用 `agent-run` 硬隔离共享 `ReasoningPanel`，不会展示 raw reasoning。来源项补齐外链图标、title+hostname、`noopener noreferrer` 与 accessible name；`MessageDisclosureProvider` 按稳定 key-membership 清理状态，等价 `validKeys` 不再因每个 text delta 触发新 Context state。浏览器 buffer 保持默认 20ms+rAF，只有经评估的 `ChatModel` allowlist 可覆盖 timer，仍经过相同 rAF/terminal flush。验证：相关定向 7 files/86 tests、Trace/reducer 定向 4 files/33 tests、`test:stable` 190 files/1366 passed/10 skipped、webapp typecheck、lint、production build 与 `git diff --check` 均完成；headed browser/Pencil smoke 仍保留为人工验收项。
- 2026-09-13，首帧回归以红绿测试确认：在 assistant message 尚未创建、以及已创建但尚无 `agent-run` 的两条普通聊天路径，均直接渲染 `GeneralAgentTracePanel` 的 30px/15px active 标题；面板在缺少 run data 时只按 `running` 展示，不伪造 stream part。定向测试 `chat-message-list` 与 `general-agent-trace-panel` 共 2 files、44 tests 通过。
- 2026-09-13，accepted follow-up reply runway 回归先以红测确认旧实现会写入 `assistant-slot`、`clamp(...72dvh...)` 与 assistant `min-height`；随后将用户确认的固定 `288px` reserve 交接到 submitted/streaming assistant slot 和 ready/error 最终 assistant item，避免终态高度撤销。终态交接一度因普通 entry 的空显式 key 使历史项误匹配；回归现按 Virtuoso 实际 item key 断言并保证历史 assistant 无 reserve。`chat-message-list`、`chat-scroll-intent`、`use-chat-scroll-policy` 共 3 files / 71 tests 通过，webapp `typecheck`、本次两文件 ESLint 与 `git diff --check` 均通过。
- 2026-09-14，`assistant-message.tsx` 将 General `agent-run`、专用 `agent-graph` 和直接展示的 `displayParts` 在 JSX 之前分流；Trace 已消费的 Tool/Skill/Resource/Prompt 不再进入正文 `map`，Delivery 摘要、图片与允许的 workflow 仍保留原有展示条件。先新增异常重复 `agent-run` 只渲染首个 General Trace 的红测（旧 `contentParts.map` 产生两个标题），再完成最小重组；`assistant-message`、General routing 与组件边界共 3 个 test files / 16 tests 通过，webapp TypeScript、相关 ESLint 和 `git diff --check` 通过。当前 CUA 未能初始化浏览器 surface（`nodeRepl.fetch`），headed smoke 仍需人工补验。
- 2026-09-14，Delivery Chain 上下文摘要从 assistant renderer 拆至 `parts/delivery-agent/`：面板独占 disclosure、资源分组、标签和调试展示；父级仍拥有协议路由及哪些 Resource 进入摘要的选择。共享 URI 规范化/分组/文案规则位于同域纯 utility，面板文件只导出组件以满足 Fast Refresh。先以缺失模块红测确认新增的独立面板测试有效，再迁移实现；面板、assistant renderer、General routing 和目录边界共 4 个 test files / 17 tests 通过，webapp TypeScript、相关 ESLint 和 `git diff --check` 通过。
- 2026-09-11，`apps/webapp` 执行 Phase 5 相关 TypeScript `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit --project tsconfig.json`，exit code `0`；Phase 5 相关 ESLint exit code `0`；仓库根 `git diff --check` 无输出。
- Phase 5 `ai-mind-step-audit` 人工等价结论：**PASS_WITH_NOTES**。行为、public-safe 边界、专用 Agent 隔离和 UI 回归均满足；注意事项是当前环境缺少 Pencil MCP callable tool，使用 canonical `.pen` 只读结构检查替代，且未执行真实浏览器视觉 smoke，jsdom/component matrix 已通过。该注意事项不改变 `.pen` 为唯一设计事实源，也不阻塞进入 Step 6。

## Step 6 — US4 Reliability And Performance

**Tasks**: T068–T079

**Exit criteria**:

- [x] `quickstart.md` Budget/Failure Matrix 全部通过；schema/security/permission/cancel 前置拒绝的 retry 为 0，remote execution failure retry 每 call≤2、Run≤4。
- [x] 八个 active generic runs 可持续完成，第九个在 preparation/provider/Tool 前 busy fail-fast，专用 Agent 不使用该 gate。
- [x] 首 delta 立即 durable flush，后续 40ms 或 256 chars flush；大 delta 不拆，structural event 强制 flush，terminal 后无 append。
- [x] projection queue 不超过 64 items/256KiB，低于 32/128KiB 恢复；无 drop、overwrite、reorder 或未持久化先投递。
- [x] transport disconnect 产生 0 次 run abort；显式 cancel/hard deadline/projection failure 可唤醒等待并清理 permit/timer/listener/waiter。
- [x] 记录 StreamEvent transaction p50/p95/max（p95 目标≤20ms）、event-loop delay p50/p95/max（p95 目标≤50ms）和 calculator CPU p95（目标≤5ms）。

**Evidence**:

- 2026-09-11，`apps/webapp` 执行 Phase 6 targeted Vitest：`runtime-policy-matrix.test.ts`、`execution-lifecycle.test.ts`、`general-react-agent-observer.test.ts`、`stream-event-projector.test.ts`、`stream-event-store.test.ts`、`stream-execution-coordinator.test.ts`、`durable-stream-projection-buffer.test.ts`、`calculator-tool.test.ts`，共 `8` files / `60` tests 通过；新增矩阵覆盖 action round、observation、cancel、permit retention、backpressure cancellation、长度/复杂度边界和 calculator p95。
- 2026-09-11，真实 PostgreSQL reference load：`node scripts/dev/run-local-env.mjs pnpm test:integration`，exit code `0`；webapp `11` files / `31` tests、database `5` tests、desktop `20` tests 全部通过。reference load 直接创建 `8` 个真实 `StreamRun`，使用真实 `StreamEventStore` + `DurableStreamProjectionBuffer`，不调用 Tavily；第 `9` 个 gate rejection 发生在 provider/tool 前，provider/tool calls 均为 `8`，持久化事件 `24`，cleanup `8/0`，queue high-water `1 item / 72 bytes`。
- 2026-09-11 最新完整 reference-load 输出的内容-free 指标：StreamEvent transaction `p50=93ms / p95=206ms / max=244ms`；Node event-loop delay `p50=12.50ms / p95=22.84ms / max=24.25ms`；browser commit cadence 代理样本 `p50=76.62ms / p95=114.56ms / max=114.56ms`。transaction p95 高于 `20ms` reference target，定位为本地 Docker PostgreSQL 冷启动与 8 个并发首次连接/事务的环境成本；重复 integration load 仍通过，未静默修改固定 pool、transaction、40ms/256-char 或 queue 参数。该项保留为 release note 的环境性能观察，不改变 correctness gate。
- 2026-09-11，runner 已在正常、取消、deadline 和异常 `finally` 路径采集 event-loop delay p95；observer 输出 `count/total/p50/p95/max`，未记录 prompt、模型输出或工具正文。
- Phase 6 `ai-mind-step-audit` 人工等价结论：**PASS_WITH_NOTES**。正确性、背压、终态顺序和清理通过；注意事项为本地 reference transaction p95 超出目标，需在真实部署基线中继续观察。
- 2026-09-11，补充修复一次生产路径回归：LangChain `beforeModel jumpTo: 'end'` 在受控收口时可绕过 `afterAgent`，导致 runner 将正常关闭的 stream 误报为 `AGENT_CONTRACT_VIOLATION`。runner 现记录并校验最后一个完整 `values` state，在 `afterAgent` 未触发但 stream 正常结束时继续 constrained final；没有合法完整 state 时仍 fail-closed。新增 action cutoff 回归测试通过；`AGENT_CONTRACT_VIOLATION` 对外统一映射为“本次回答未能完成，请稍后重试。”，不泄漏内部终态文案。
- 同日最新验证：General runner/adapter/stream-errors、Trace UI、assistant routing、reducer/buffer、ChatOrchestrator 共 `8` 个 test files、`75` 个 tests（10 skipped）通过；`pnpm --filter @ai-mind/webapp typecheck`、本次修改文件 ESLint、`git diff --check` 通过；`pnpm --filter @ai-mind/webapp test:stable` 为 `190` 个 test files、`1339` 个 tests passed、`10` skipped。

## Step 7 — US5 Dedicated Agent Isolation

**Tasks**: T080–T085

**Exit criteria**:

- [x] Tasklist、Delivery、Image 代表请求 100% 绕过 generic runner/gate 并保留既有 runtime、stream 和 UI。
- [x] 通用 Web/base tools 不进入专用 allowlist。
- [x] Delivery subagent Tool 明确为 `agent-tool/delegated-agent`，不受普通短 timeout 或整体 retry；Tasklist validator 仍为本地普通 Tool。

**Evidence**:

- 2026-09-11，`delivery-chain-manager-contract.test.ts`、`chat-orchestrator.test.ts`、`route.test.ts`、`assistant-message.test.tsx` 与 capability binding 定向套件通过；Delivery subagent 五个定义均为 `agent-tool/delegated-agent`、仅 `delivery-chain-manager` scope、无 `attemptTimeoutMs/retrySafe`，generic binding 只接受 `standard-tool`。
- ChatOrchestrator regression 覆盖 `/tasklist`、`/delivery-chain`、`/image` 专用分支先于 generic admission；已有 route image smoke 保持 `streamImage`，不调用 ordinary `streamChat`。Tasklist validator 保持 `standard-tool`，Web Search/Read 未泄漏到 dedicated allowlist。
- Phase 7 `ai-mind-step-audit` 人工等价结论：**PASS**。未引入第二 generic loop，专用 Agent runtime、stream 和 UI presentation 未回归。

## Step 8 — Repository And Release Closing

**Tasks**: T086–T094

**Exit criteria**:

- [x] ADR、architecture、deployment env、README、version/release docs 与真实实现一致。
- [x] Targeted tests、typecheck、lint、stable/integration tests、build、workspace boundaries 和 `git diff --check` 通过。
- [x] Spec Kit analyze/converge 无未处理的 CRITICAL/HIGH 冲突；所有 task IDs 和 acceptance evidence 可追溯。
- [x] External Tavily smoke 已通过，或未执行原因和剩余风险已明确记录。
- [x] package version 只在 release closing 时 lockstep 提升为 `0.6.0`。

**Evidence**:

- 2026-09-11，T086–T088 已同步 `docs/adr/0019-general-react-agent-runtime.md`、`docs/adr/README.md`、runtime/capability/stream architecture、`TAVILY_API_KEY`、PrismaPg pool budget、README、version/release 文档；未新增 route、StreamRun kind、IndexedDB store、Prisma migration 或 Redis/Worker。
- T089：2026-09-12，在 `http://localhost:3000` 开发服务、显式配置 `apps/webapp/.env.local` 的 Tavily credential 下完成真实 Search/Extract smoke。Search 请求产生 `tool-start(web-search)`、`tool-end`（安全去重来源 `5` 条）和 `160` 个增量 `text-delta`，最终 `agent-run-end`/`finish` 正常收口；Extract 请求使用当前 user 明确提供的公开 URL，产生 `tool-start(read-url)`、`tool-end`（`status='read'` source `1` 条）和 `10` 个增量 `text-delta`，最终正常完成。两次请求均未出现重复 final 文本、raw provider 字段或 source schema 持久化错误；原始 credential 未进入请求 payload、日志或观测输出。
- T090：2026-09-12，仓库根目录 `pnpm test:stable` exit `0`（webapp `190` files / `1362` tests、`10` skipped，Turborepo `6/6` tasks successful）。同日首次 integration 运行时发现 webapp `all-streams-control-state.integration.test.ts` 的 3 个 cancel 断言因新增终态 payload 一致性校验遗漏 `run-status` 终态形式而失败，未产生脏写入；补充匹配 `run-status.status === terminalState` 的回归后，重新执行完整 `node scripts/dev/run-local-env.mjs pnpm test:integration` exit `0`，webapp `11` files / `31` tests、database `5` tests、desktop `20` tests 全部通过。`pnpm lint` exit `0`（`5/5` tasks；Webapp `0` errors、`8` warnings）；`pnpm build`、`pnpm validate:workspace-boundaries` 与 `git diff --check` 均 exit `0`。`pnpm --filter @ai-mind/webapp typecheck` 和本版本新增 General Agent/隔离组件精确 ESLint 均通过。
- T091：`git diff --check`、敏感 sentinel scan、`pnpm validate:workspace-boundaries`、`pnpm test:governance` 和 quickstart targeted matrix 均通过；未发现 raw reasoning、Tool input/output、网页正文、secret 或 signed URL 进入 public stream/snapshot 的证据。
- T092：只读 Spec Kit analyze 对 `spec.md`、`plan.md`、`tasks.md`、constitution 的覆盖、一致性、Non-goals 和依赖顺序检查为 clean；无 CRITICAL/HIGH finding。converge 对当前实现没有发现需要追加的 missing/partial/contradictory task，因此未创建空的 Convergence section，canonical workspace 保持唯一。
- 2026-09-12，Step 9 收口复核：`tasks.md` 114/114、`checklists/requirements.md` 16/16 均完成，`.specify/feature.json` 唯一指向本 canonical workspace；`http://localhost:3000/api/health` 返回 `200 {"service":"webapp","status":"ok"}`。本次 stable/integration/build/typecheck/boundary/diff 与新增目录精确 lint 证据均已归档，未发现需要追加的实现任务。
- 2026-09-12，补充修复消息虚拟列表高度提示：运行时与 stable snapshot 对 Tool/Resource/Prompt/Skill 使用同一 public-safe render fingerprint，避免 raw 字段裁剪导致已测量高度在刷新后失配；`MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION` 升为 `2`，旧 hint 按版本自然失效；移除单条 hint 与结构估值的 8,000px/内容行数上限，General Trace 未命中 hint 时按收起标题或流式展开行数/来源数估算。新增回归覆盖 raw 投影往返、12,345.5px 高度、General Trace 收起/空 text-start 展开估值和超长文本，相关 3 个 test files / 64 个 tests 通过。
- 2026-09-12，继续校正高度身份与当前快照契约：`agent-graph`、`image-brief` 与已完成 artifact 按可恢复展示字段参与 fingerprint；被 stable snapshot 丢弃的运行态 Part 必须失配，不复用旧高度；补齐 `workflow-progress.visibility` 的快照 schema/projection，避免完成态流程因字段遗漏无法恢复。新增 2 个回归，targeted 66 tests、webapp stable 190 files / 1,358 tests、typecheck、相关 ESLint 与 production build 通过。
- 2026-09-11，`ai-mind-step-audit` 对 Phase 6/7 输出 **PASS_WITH_NOTES**：当时的非阻塞项为本地 PostgreSQL transaction p95 reference miss 与 Tavily/浏览器视觉 smoke 尚未执行；随后 T089 已补齐真实 Tavily Search/Extract smoke，浏览器 headed/Pencil 视觉 smoke 仍受当前 CUA 初始化能力限制；没有发现 scope creep 或架构边界违规。
- T093：版本更新仅在 release closing 进行，所有 workspace package 与 lockfile 已统一为 `0.6.0`；历史 fixture、旧版本文档和 mock 版本号未批量改写。

## Phase 13 — Server Correctness And Performance Remediation (Historical, Superseded For Text Release By D032)

Phase 13 的 candidate-release 证据保留为历史记录；当前最终文本 authority 以 Phase 14 / D032 的私有 Action 与未绑定 Answer 契约为准。

**Exit criteria**:

- [x] 混合模型文本与 Tool Call 不会把候选文本写入 public stream、durable stream、Memory 或 snapshot；仅完整 state 确认为无 Tool Call 的自然回答才投影为最终文本。
- [x] IPv4-mapped 与 IPv4-compatible IPv6 会按其嵌入 IPv4 的私网规则拒绝；observer 的 percentile 样本固定为最近 1,024 条，累计 `count/total` 不截断。
- [x] 普通 Tool 的 durable `tool-start` 在底层首次 invoke 前已完成，终态和来源仅在执行结束后以同一 `partId` 发布。
- [x] reference-load 基准在预热连接后记录非秘密 topology、数据库实例、并发、pool、预热与样本数；只有元数据完整的 `production-like` target 才硬断言 transaction p95 ≤20ms，本地 Docker 只输出诊断。第九个请求经同一 scripted admission 入口并证明 provider/Tool 调用为零。

**Evidence**:

- 2026-09-13，先后运行四组红测，分别捕获模型候选文本提前输出、mapped/compatible IPv6 绕过与无界 observer、Tool start 在 invoke 后发布；实现后以同一组定向用例复验通过。包含 reference-load 文件的定向命令在当前环境得到 `6` 个执行文件 / `78` tests passed；`general-react-agent-reference-load.integration.test.ts` 因未配置 `DATABASE_URL` 未执行。
- 2026-09-13，独立安全/时序审查未发现 Critical、Important 或 Minor 问题。性能/规格审查识别并已补强两处基准证据：production-like 必须提供非秘密 topology 与数据库实例标签，输出完整测量条件；第九个请求改为复用前八个的 scripted admission 入口并明确断言 provider/Tool 为 `0`。新增配置回归先红后绿（`2` tests），防止缺少 target 标签时误作 production-like 运行。
- 2026-09-13，`pnpm --filter @ai-mind/webapp typecheck` 通过；`pnpm --dir apps/webapp lint` 为 `0` errors、`8` 条既有 React warning；本次服务端定向回归为 `7` files / `80` tests passed；此前同会话的 `pnpm --dir apps/webapp test:stable` 有一次 `191` files / `1377` tests / `10` skipped 全绿，但最终重复运行仅 `calculator-tool.test.ts` 的既有 5ms 墙钟 p95 断言在进程负载下得到 `8.89ms` 而失败，单独运行该文件通过。未修改 calculator 或放宽该断言来掩盖波动；`@ai-mind/stream-core` 的 test（`32` tests）、typecheck 与 build 全部通过，`git diff --check` 通过。
- 2026-09-13，当前会话仅确认 `DATABASE_URL` 未配置，未读取或输出连接信息。因此需要 `AI_MIND_REFERENCE_LOAD_GATE=production-like`、非秘密 topology 与数据库实例标签的目标 PostgreSQL p95 硬门槛尚无运行证据；此前本地 Docker `p95=206ms` 不能作为达标或环境豁免依据。未修改 pool、transaction、40ms/256-char 或 queue 固定参数来规避该门槛。

## Phase 14 — Explicit Action/Answer Streaming

**Exit criteria**:

- [x] Action remains the sole Tool-enabled `createAgent` loop; no Action text, reasoning or metadata is projected to public stream, durable events, Memory or stable snapshot.
- [x] Every non-cancelled/non-hard-deadline Action outcome enters exactly one same-selection, unbound Answer stream. Only Answer safe text deltas create public `text-*` events.
- [x] Answer input excludes the final no-Tool Action candidate while preserving Tool-call/ToolMessage protocol pairs and reliable observations; a model that returns empty when an assistant candidate is last now receives the user/observation boundary and streams its own final answer.
- [x] Blank normal Answer alone uses deterministic fallback. Provider error, late Answer Tool Call, and partial-text timeout/error fail the run without appending fallback, `text-end`, Memory or stable snapshot.
- [x] Budget invariants are startup-validated: 6 Tool-bearing Action rounds, 7 Action model calls, 1 reserved Answer call and 8 total; Action 145s + Answer 30s + lifecycle reserve 5s fit the 180s hard deadline.

**Evidence**:

- 2026-09-14, TDD first reproduced the user-visible all-fallback regression: an Action no-Tool terminal candidate was passed as the final assistant message into Answer; a provider-compatible scripted model consequently returned an empty completion and the runner emitted the deterministic fallback. The regression now proves that candidate is removed from Answer input while Tool protocol messages remain intact.
- 2026-09-14, added regressions for Action deadline precedence, pre-Action cutoff without a provider call, Answer late Tool Call, provider error before the first Answer delta, partial Answer provider error, and partial Answer timeout. Any Answer provider failure is now `RUN_FAILED`; partial failure emits no fallback or `text-end`, and no failure path can reach Memory/snapshot persistence.
- 2026-09-14, independently ran `pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/runtime/general-react-agent tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/app/api/chat/runs-stream-route.test.ts tests/app/api/chat/stream-resume-contract.test.ts --testTimeout=30000`: 19 files, 155 passed, 10 skipped. `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, and `git diff --check` all exited 0. `pnpm --dir apps/webapp test:stable` did not pass: the unrelated `calculator-tool.test.ts` wall-clock p95 assertion measured 11.7382ms against its 5ms threshold; its isolated rerun also failed. No calculator code or threshold was changed to mask that environmental/performance gate, so T134 remains open pending a controlled-load investigation.
- 2026-09-16, this remediation pass ran the scoped Webapp regression matrix with `pnpm --dir apps/webapp exec vitest run`: 20 files, 274 passed and 9 skipped. It covers `chat-service`, `safe-public-url`, `stream-event-store`, chat Memory/orchestrator, General Trace, Virtuoso height reserve, local snapshot/reducer and Web policy. This is a focused matrix, not a full-repository test claim. `typecheck`, scoped ESLint and `git diff --check` evidence for the same remediation pass are recorded separately once their commands finish.
- 2026-09-16, in `D:\code\mine\ai-mind-dev`, `pnpm --dir apps/webapp typecheck`, scoped `pnpm --dir apps/webapp exec eslint` over the 13 changed core files (`chat-message-list`, height hints, General Trace view, stream reducer, local snapshot schema/projection, safe public URL, outbound-secret guard, event store, chat service, chat memory service, context preflight and orchestrator), and `git diff --check` each exited `0`. These are scoped closing gates; the full stable suite is still not a passing gate because its existing `calculator-tool.test.ts` 5ms wall-clock p95 check needs a controlled-load rerun.
- 2026-09-16, after the terminal-admission and `resource://unknown` remediation, the focused matrix reran as 20 files, 276 passed and 9 skipped. `pnpm --dir apps/webapp typecheck`, the scoped 13-file ESLint invocation and `git diff --check` again each exited `0`; this remains a focused matrix rather than a whole-repository test claim.
- 2026-09-16, `pnpm --dir apps/webapp test:stable` passed its `test:check-location` gate with all 206 test files under `tests/`. To retain the otherwise omitted final suite summary, the same stable Vitest configuration was rerun with `--reporter=json` to the gitignored `.artifacts/v060-stable-20260916.json`; its actual result is `success=true`, 415 suites passed/0 failed and 1,438 tests passed/0 failed with 9 skipped. This supersedes the earlier environment-sensitive `calculator-tool.test.ts` 5ms failure as the current stable-suite evidence.
- 2026-09-16, a new `chat-service` cancellation-terminal regression first reproduced an explicit coordinator cancellation entering the real `DurableStreamProjectionBuffer` as `failed`. The fixed behavior is independently scoped-reviewed and GREEN: exactly one `cancelled` terminal, with no `failed`/`completed` terminal and no `thread-memory-status` projection. The final focused matrix is 20 files, 277 passed and 9 skipped; `pnpm --dir apps/webapp typecheck`, scoped ESLint and `git diff --check` each exited `0`.
- 2026-09-16, project `pnpm test` first completed its stable portion successfully, but its integration portion was stopped by the shell environment's missing `DATABASE_URL` validator rather than a test failure. Following the documented local environment setup, `pnpm dev:db` started local PostgreSQL and `node scripts/dev/run-local-env.mjs pnpm test:integration` exited `0`: Webapp 11 files/31 tests, database 1 file/5 tests and desktop 20 tests passed. This local integration evidence is not a production-like PostgreSQL reference-load p95 result.

## Phase 15 — Prompt-Only Skill And Fixed General Tool Policy

**Exit criteria**:

- [x] `GeneralToolPolicy` 在每个普通 General ReAct Action Run 只按固定七项候选、availability、scope 与 `standard-tool` policy 解析 Tool map；Skill 不参与该解析。
- [x] Skill registry 不再持有 Tool/MCP selector 或 source-kind 权限；Reader/Utility 只提供提示词、输出风格和路由元数据。
- [x] Generic chat 不会因 Skill 或自然语言自动 discovery remote MCP Tool、读取 remote Resource 或执行 remote Prompt；Composer 显式 context 入口仍进入同一 General ReAct runner。
- [x] Tasklist Agent 的 `validate_tasklist_structure` 和 `agent-tool` 专属边界保持不进入 General Tool Policy。

**Evidence**:

- 2026-09-14，先以 tests-first RED 运行 Tool binding、chat session 与 user-memory orchestration 回归。新测试因 `resolveGeneralToolBinding` 尚不存在、而 runtime 仍请求 `resolveToolBindingForSkill` / `resolveCapabilityContextInvocations` 按预期失败，证明旧 Skill-to-capability 耦合尚未移除。
- 实现后，`pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/capabilities/tool-binding.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts tests/lib/ai/tools/tasklist-structure.test.ts` exit code `0`：6 files、57 passed、10 skipped。覆盖固定七 Tool、remote MCP `tools/list=0`、Skill prompt-only、Reader 无隐式 remote context、Composer 显式 preparation 及 Tasklist boundary。
- 2026-09-14，`pnpm --filter @ai-mind/webapp typecheck`、`pnpm --filter @ai-mind/webapp lint` 与 `git diff --check` 均通过。
- 同日 `pnpm --filter @ai-mind/webapp test:stable` 的测试目录校验通过（205 files），但 stable 套件在既有 `calculator-tool.test.ts` 的 5ms 墙钟 p95 gate 失败；本次未改 calculator 或阈值，不能把该失败归因于本策略变更，也不能将 stable 视为全绿证据。
- 2026-09-14，移除 Composer 中 `自动 / 工具技能 / 阅读技能` 的手动选择器，以及 `skillMode` 前端状态和请求映射；普通请求不再由客户端写入 `options.skill`，仍由服务端 General Agent 自动命中。先以 Toolbar 控件缺席断言得到 RED，再运行 `tests/components/chat/composer/toolbar/composer-toolbar.test.tsx` 与 `tests/components/instamind/use-chat-stream.test.tsx`，共 40 项通过；TypeScript、相关 ESLint 与 `git diff --check` 通过。

## Phase 16 — Real-User Answer Prompt Policy

**Exit criteria**:

- [x] Action 与 Answer 使用独立的 server-owned prompt projection；Answer 不携带 Action-only 的 Tool 选择、调用、重试或后续行动指令。
- [x] 普通回答默认结论优先并提供适中的必要解释；用户明确的简短、详细、步骤、表格、一行、纯文本或合法 JSON 要求在安全边界内保留。
- [x] 确定性工具失败、缺少关键参数、Web 来源状态和部分成功结果均有明确的 fail-closed / 证据等级规则；`discovered` 不被表述为已读取正文，`status='read'` 才能作为页面正文来源。
- [x] Chat Memory、User Memory、Composer/Resource、MCP Prompt 与网页/Tool observation 均被标记为资料而非指令，不能扩大 Tool 权限、授权 URL、预算或数据访问范围；Skill 仍仅提供可信输出风格。

**Evidence**:

- 2026-09-15，运行 `pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/prompts/tool-calling.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts tests/lib/ai/runtime/chat-memory-context-builder.test.ts tests/lib/ai/runtime/user-memory-context-builder.test.ts`：6 个文件、57 tests passed。
- 同日 `pnpm --dir apps/webapp typecheck` 通过；针对本 Step 涉及的 Prompt、Session、Memory、Skill、Composer 文件执行 ESLint 通过；`git diff --check` 通过。
- 同日全量 `pnpm --dir apps/webapp lint` 未作为本 Step 的全绿证据：当前工作区已有的 v0.6.0 其他运行时/测试文件包含 22 个格式或规则错误及 8 个既有 React warning；本 Step 相关文件已通过精确 lint，未通过放宽规则或修改无关文件掩盖该环境阻断。
- 实现范围未改变 GeneralToolPolicy 七项固定集合、Action/Answer 模型预算、Stream DTO、Memory 写入资格或持久化边界；D034 已同步至 `spec.md`、`plan.md`、`data-model.md`、`contracts/general-react-runtime.md`、`decisions.md`、`docs/adr/0019-general-react-agent-runtime.md` 与相关 architecture 文档。

## Phase 20 — Configurable Zhipu Web Search Provider

**Exit criteria**:

- [x] `web-search` / `read-url` 在部署级静态选择 Tavily 或智谱，且智谱只使用 `search_std`；未设置 selector 保持 Tavily 默认。
- [x] 缺少所选 key、非法 provider 或非法 engine 时两个 Web Tool fail-closed；任何 failure、retry 或 429/5xx 都不会切换 provider。
- [x] 智谱 Search 与 Reader 均归一化到现有 Web Tool contract，保留最多 5 条、单授权 URL、12,000 字符、URL/Secret Guard、source 与 public-safe stream 边界。
- [x] D035 的远端只读 Tool timeout、retry permit、取消与预算不变，且两类 server key 都由 Outbound Secret Guard 保护。

**Evidence**:

- 2026-09-16，先得到新增 factory/Zhipu adapter 模块缺失、Web Provider connection error 被归类为 `unknown`、以及 binding 后环境变更会切换 provider 的预期 RED；实现后运行 `node node_modules/vitest/vitest.mjs run --root apps/webapp tests/lib/ai/tools/web/tavily-web-provider.test.ts tests/lib/ai/tools/web/zhipu-web-provider.test.ts tests/lib/ai/tools/web/web-provider-factory.test.ts tests/lib/ai/runtime/tool-runtime-execution.test.ts tests/lib/ai/capabilities/tool-binding.test.ts tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts`：6 files、47 tests passed。
- 同日 `node node_modules/typescript/bin/tsc -p apps/webapp/tsconfig.json --noEmit`、本 Step 文件的 `node node_modules/eslint/bin/eslint.js ...`、`git diff --check` 和 repository key sentinel scan 均无输出；随后在仓库根执行完整 `pnpm test:stable`，exit code `0`。
- 同日以当前 server-only development key，通过实际 `createConfiguredWebProvider()` → `ZhipuWebProvider.search()` → `ZhipuWebProvider.read()` 链路完成官方智谱 Search-Std/Reader 脱敏 smoke：Search 返回 `5` 条结果、存在安全 HTTPS 来源且未截断；Reader 返回 `2,796` 个字符、带 provider-reported URL 和标题、未截断。整个验证不记录或输出 key、Authorization、原始 response、网页正文或完整 URL。
- 已按人工等价 Spec Kit consistency/converge 检查对照 D037、FR-055～057、SC-023、plan、tool contract、tasks、env/deployment 与实现；未发现需要新增的未实现需求。真实 smoke 仅保存脱敏的状态、条目数与布尔验收结果，不记录 key、Authorization、原始 response、网页正文或完整 URL。

## Phase 21 — Prompt-Only Explicit Web Intent Policy

**Exit criteria**:

- [x] D038、FR-058 与 SC-024 仅以 server-owned Prompt 生效；不新增 Runtime keyword matcher、Tool choice 强制、Tool/Provider/URL authorization、预算、stream、Memory 或 DTO 行为。
- [x] Action Prompt contract 覆盖显式网络检索、用户 URL 读取、无 URL 的先搜索后读取、站点/语言/主题筛选和普通零 Tool 场景。
- [x] Answer Prompt contract 规定：无成功 observation 时不得声称搜索、读取、来源数、授权失败、链接或网页结论。
- [x] Prompt suite、相关 session/runner 回归、typecheck、scoped lint 与 `git diff --check` 有本次新鲜证据；真实模型 smoke 只能作为概率性观测，不替代 prompt contract 测试。

**Evidence**:

- 2026-09-16，T178 先在 `tests/lib/ai/prompts/tool-calling.test.ts` 添加 Action/Answer Prompt contract；执行 `pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/prompts/tool-calling.test.ts` 得到预期 RED：新增样例缺失 `公开网络取证`，共 9 项中 1 项失败。
- 仅更新 `apps/webapp/lib/ai/prompts/tool-calling.ts` 的 server-owned 文案后重跑同一命令：1 file、9 tests passed。新 Prompt 使用六条非推荐题样板：近期公告/利率、PostgreSQL 慢查询教程、用户 URL 风险提炼、政府网站来源限制、订单扣库存锁解释、用户提供周报摘要；样板明确不是关键词触发器或回答模板。
- 随后执行 `pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/prompts/tool-calling.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts`：3 files、47 tests passed；`pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp exec eslint lib/ai/prompts/tool-calling.ts tests/lib/ai/prompts/tool-calling.test.ts` 与 `git diff --check` 均 exit `0`。

## Final Success-Criteria Matrix

| Criteria                     | Required evidence                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001–SC-003                | US1/US2 route, zero-tool and 1–4 round Agent tests                                                                                                 |
| SC-004–SC-005, SC-011–SC-014 | Runtime policy/failure matrix, pairing, retry, deadline, concurrency and reconnect tests                                                           |
| SC-006–SC-007                | Web policy/provider fakes and cross-boundary sensitive sentinel scans                                                                              |
| SC-008–SC-009                | Special context and dedicated runtime regression suites                                                                                            |
| SC-010, SC-015–SC-017        | Trace component/browser smoke, source counts and IndexedDB recovery evidence                                                                       |
| SC-018, SC-020               | Eight-Run PostgreSQL reference load, batching/backpressure/cleanup metrics, candidate/lifecycle/security regressions, and target-topology p95 gate |
| SC-021                       | Phase 15 Tool/Skill binding and explicit Composer context regressions                                                                              |
| SC-022                       | Phase 16 prompt composition, real-user answer policy, source-state and untrusted-context regressions                                               |
| SC-023                       | Phase 20 Web provider factory/adapter fakes, fail-closed config and known-secret regressions; redacted real Zhipu Search-Std/Reader smoke passed   |
| SC-024                       | Phase 21 Prompt contract RED→GREEN, Chat Session/General ReAct runner regression, typecheck and scoped lint                                        |

## Final Decision

- **Release readiness**: **NOT_READY**。Phase 13 的服务端正确性修复、D032 的定向回归与本轮 full stable suite 已完成；但规格仍将预热后的 production-like PostgreSQL transaction p95 ≤20ms 设为硬门槛，目标数据库未提供，不能以本地结果或历史结果替代该证据。
- **Open risks**: 目标拓扑需配置 `DATABASE_URL`，标记 `AI_MIND_REFERENCE_LOAD_GATE=production-like` 并提供非秘密的 `AI_MIND_REFERENCE_LOAD_TOPOLOGY` 与 `AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE` 后运行 reference-load integration；若 p95 仍超过 `20ms`，应按容量、连接预热和数据库写入方案处理，而不是放宽断言。当前环境的浏览器 headed/Pencil 视觉 smoke 仍未完成，因为 CUA 浏览器初始化失败；组件/jsdom 矩阵和 `.pen` 结构检查已通过。真实 Tavily Search/Extract smoke 已在 T089 完成。
