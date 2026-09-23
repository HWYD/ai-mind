# Acceptance: v0.6.1 General ReAct Agent Streaming

**Status**: Closed on 2026-09-24. The observed invisible pre-execution Tool rejection was corrected; AC-040～AC-043 have automated plus real-environment evidence, and AC-039 local release closing was accepted. Six workspace manifests were freshly verified as `0.6.1`; no Git tag, GitHub Release, push, commit, or merge has been created.

本文件定义实现完成后的硬验收门。已勾选的项目有对应自动化或文档证据；未勾选项目是 release blocker，不能因局部代码或定向测试通过而视为完成。

## A. Core model-turn semantics

- [x] **AC-001** only-text Run 从首个正文 delta 流式显示，natural turn end 后原地成为唯一 final_answer，普通 loop 模型调用数为 1。
- [x] **AC-002** 同一 turn 的 text + Tool Calls 只产生一个 commentary Part，且 commentary end durable sequence 早于首个 Tool start。
- [x] **AC-003** Tool-only turn 不产生空 AgentTextPart。
- [x] **AC-004** Tool→final、text→Tool→final、Tool→text→Tool→final、only-final 四个序列全部保持逻辑顺序、无复制、无重排。
- [x] **AC-005** final_answer completed 后任何 Tool Call 均不执行并使 Run fail closed。

## B. Finish reason and abnormal closure

- [x] **AC-006** 只有完整 AIMessage + 正常 stream 闭合 + no Tool + non-empty + non-cancelled/non-deadline，且没有明确非自然 provider metadata，才能提交 normal final；缺失 metadata 不阻止该结果。
- [x] **AC-007** `length/content_filter/error` 与明确 unknown 的 partial text 都不成为 final；只有 length 或状态已知的 error 在满足 gate 时最多一次 constrained finalizer，content filter/unknown 不调用。仅缺失 provider metadata 不属于 unknown。
- [x] **AC-008** explicit cancel、hard deadline、unknown execution state 不启动 finalizer。
- [x] **AC-009** 空白 natural no-Tool turn 不提交空 final；未取消、未超时、执行状态明确且有 finalizer 预算时恰好可调用一次 constrained finalizer，否则按确定性安全终态收口。
- [x] **AC-010** finalizer 失败/partial 不产生 completed final end、不写 Memory；成功 constrained finalizer 的 final answer 以“处理未完成”展开 Trace + 无技术标签 + 正文限制说明呈现，且不写 Memory；任一 public delta 后的 retryable model error 均不触发 model retry、不撤回或重复正文，并以唯一 `commentary/interrupted` terminal 收口。

## C. Public stream and replay

- [x] **AC-011** `agent-text-*` 与 completed `agent-run-end.finalizationMode` strict schema、protocol export、writer/parser/reducer contracts 一致且 additive；同 Run 有 AgentTextPart 但 completed end 缺 provenance 必须 fail closed。
- [x] **AC-012** 首 delta immediate、后续 40ms/256 chars、end-before-tool、terminal-last 与 queue backpressure 均有自动测试。
- [x] **AC-013** disconnect/reconnect/replay 对 start/delta/end/run-end provenance 幂等，恢复相同 phase、text、ordinal 和 normal/constrained header。
- [x] **AC-014** unresolved pending、duplicate terminal、unknown part、illegal transition 与跨 Run ID 冲突 fail closed。
- [x] **AC-015** 旧普通 `text-*`、Tasklist、Delivery、Image 与 historical valid snapshot 不回归。

## D. Security and content boundaries

- [x] **AC-016** OpenAI reasoning items、DeepSeek/豆包 `reasoning_content`、encrypted reasoning、unknown blocks 均不进入 Agent text。
- [x] **AC-017** raw Tool input/output/error、secret、internal prompt、raw provider event 与完整网页正文不进入 commentary/Trace/snapshot/log。
- [x] **AC-018** Tool schema/policy/URL grant/secret block/concurrency/retry 权限未因可见 commentary 改变。
- [x] **AC-019** commentary 由模型 public content 产生，但不被宣传或标记为 chain-of-thought；真实调用页面仅显示“搜索/读取/并行执行”等公开行动说明，没有把模型推理过程作为正文或功能标签展示。

## E. Frontend presentation

- [x] **AC-020** 所有可见 AgentTextPart（`pending`、`commentary`、`final_answer`）均使用同一安全 Markdown 正文样式且无文本图标；`pending` 从首个 delta 起显示，无 foldable detail 时位于无箭头标题下，有既有 detail 时按 ordinal 追加进 Trace，不得插入旧事件之前。
- [x] **AC-021** pending/commentary 与 Tool/Skill/Resource/Prompt 在 Trace 顶层按 ordinal 展示；Tool 行保留现有样式且无 nested detail/chevron。安全 read source list 仅作为所属 `read-url` Tool 的直属 child 紧随该 Tool，早于后续顶层事件，不得作为 Trace footer 汇总。
- [x] **AC-022** 无 foldable details 的 running 为“正在思考”无箭头，completed 为“已完成思考”无箭头且不可交互。
- [x] **AC-023** 有详情时右/下箭头、full-row disclosure、ARIA、keyboard 与 focus 全部满足 contract。
- [x] **AC-024** active 默认展开；manual toggle sticky；final auto-collapse 至多一次；completed 可 reopen；refresh 默认收起。
- [x] **AC-025** cancelled/failed/incomplete 标题、shimmer 和默认展开符合 contract；constrained header 只由 public finalizationMode 派生，final 不自动折叠 live Trace；Markdown 跨 delta 无闪烁/重复。

## F. Final content, Memory, and snapshot

- [x] **AC-026** copy/action bar/feedback/follow-up 只消费 completed final_answer。
- [x] **AC-027** Chat Memory、UserMemory、next-turn history 和 runner assistantText 均不含 pending/commentary/interrupted；next-turn history 保留 constrained completed final answer 的正文限制说明。
- [x] **AC-028** 只有 normal final 才可能写 Chat Memory/UserMemory；constrained final 可被 copy/feedback/follow-up/同会话最终正文消费但不写 Memory；deterministic/cancelled/failed 均不写。
- [x] **AC-029** normal/constrained completed public commentary 可随 local Trace snapshot 恢复；constrained 仅恢复 finalizationMode、final 与 completed public-safe rows，并以“处理未完成”默认收起；pending/interrupted/failed/cancelled 不稳定保存。
- [x] **AC-030** snapshot schema 与 height fingerprint 升级，旧快照安全兼容且无错误高度复用。

## G. Fixed budget and operations

- [x] **AC-031** 9 Tool rounds、14 logical Tool Calls、10 loop model calls、1 finalizer、11 total calls 均有 exact-boundary 和 over-boundary tests。
- [x] **AC-032** 235s loop + 30s finalizer + 5s terminal = 270s hard limit，取消和各 deadline precedence 有 fake-clock tests。
- [x] **AC-033** 12k/call、48k cumulative observations、no-progress 2、recursion 24 有边界测试。
- [x] **AC-034** concurrency 3、Tool retries 4、remote retries 2、model retry 1、active runs 8 与 Tool timeouts 保持 v0.6.0 行为；model retry 仅限首次 public delta durable publish 前。
- [x] **AC-035** observer 能记录 loop/finalizer/model/tool/observation/budget usage，且不记录用户正文或 raw provider/Tool 数据。

## H. Design and documentation

- [x] **AC-036** Pencil 覆盖四个核心序列、pending、fold states、exception states；`Nested Trace Row Disclosure` 明确 Deferred，并已在运行中的 Pencil 文件人工复核。
- [x] **AC-037** architecture/version/release/docs 与本 workspace、实际代码一致，不再描述固定 Answer Phase，并已重新记录本轮展示层修订的验证证据。
- [x] **AC-038** typecheck、lint、stable tests、integration tests、build 和 manual browser matrix 全部通过；真实页面已验证 no-Tool 直出、手动展开和刷新默认收起，键盘/ARIA contract 由自动化覆盖。
- [x] **AC-039** Re-ran `$ai-mind-step-audit`、`speckit-converge` and local release closing after Phase 10. The canonical workspace has no recorded remaining Tool-truth/provenance implementation drift; all six package manifests were freshly verified as lockstep `0.6.1` on 2026-09-24. The user accepted the documented real-environment verification and desktop host-limitation disposition.

### Phase 10 — Tool truth and trusted URL provenance

- [x] **AC-040** admission/scope/schema/secret-web-policy/duplicate/URL-provenance provider-preexecution rejections each publish exactly one safe `tool-start` + same-part tool-scope `error`, render one failed Tool row in chronological Trace, execute provider zero times, and expose no raw input/output/source/secret/internal error; no ToolCall produces no row.
- [x] **AC-041** loop direct-final and constrained finalizer prompts share the observation-only fact boundary: no observation cannot claim Tool execution/read/search/failure, a real denied ToolMessage can only report non-execution, and only real successful read-url plus `status=read` public source can claim a page was read. No lexical runtime filter is introduced.
- [x] **AC-042** a current-user safe URL is automatically readable without an interactive grant; same verified conversation may reuse at most eight re-canonicalized raw user URLs. Other conversation, assistant, summary, pinned decision, UserMemory, Tool output, client history and compacted turn URLs cannot authorize `read-url`.
- [x] **AC-043** a question about whether a previous Run read a page neither claims historical proof nor automatically re-reads it. The resulting UI/documentation distinguish “model requested but provider did not execute” from a successful `read-url`.

## Release blocker rule

AC-001～AC-035、AC-040～AC-043 任一未通过均阻止 v0.6.1 release closing。AC-036～AC-039 是设计/治理硬门，也不得以“代码已工作”为由跳过。

## Phase 10 implementation evidence (2026-09-24)

- TDD 先新增并观察到失败断言：pre-execution rejection 原本没有 public Tool chunk；loop prompt 仍宣称正文不可见；trusted raw-user URL 尚未进入 General ReAct context。随后以最小 Runtime/prompt/context 改动实现修复。
- 定向 Vitest：`pnpm exec vitest run tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts tests/lib/ai/prompts/tool-calling.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/general-react-agent/agent-state.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/components/instamind/chat-stream/stream-message-reducer.test.ts` 通过，7 files / 109 tests。额外直接断言 scope 拒绝、八条上限和仅摘要 URL 不授权。
- fresh webapp stable：绕过受权限影响的 pnpm script launcher，直接执行同一 `vitest.stable.config.ts`，197 files / 1,471 tests 全部通过；workspace boundary、test lane 与 governance 校验也通过。`apps/webapp` typecheck 通过；相关 production/test 文件的直接 ESLint 检查通过；`git diff --check` 通过。根 `pnpm lint` / `pnpm test:stable` 仍因本机 pnpm 临时工具缓存目录 `C:\Users\HWY\AppData\Local\pnpm\.tools` 的 `EPERM` 未能启动，而 direct Turbo 又因本机 TLS 初始化权限失败，均未记录为通过。
- 完整 webapp ESLint：绕过 pnpm launcher，直接运行 `eslint .` 并以 exit 0 结束。
- 用户于 2026-09-24 明确确认真实环境验收成功。附件页面显示：多轮 `web-search → read-url` 的正文/Tool/来源仍按顺序展示；当前用户提供的 DeepSeek URL 无交互授权即可读取并只在成功后显示“已读取来源”；同 URL 在用户明确再次要求读取时才重新调用 `read-url`，而非由历史上下文自动补读。用户同时确认 provider-preexecution rejection 的浏览器验收通过；该子场景的恰好一条、脱敏且 provider=0 的 wire-level 约束仍以 T070 自动化回归为直接证据。
- Phase 10 后重新执行本机 integration：local pgvector database 为 1 file / 5 tests 通过，webapp 为 11 files / 31 tests 通过。desktop Playwright 使用 workspace CLI 后有 14 项通过、6 项在 Electron GPU process `-1073741515` 崩溃及其后的临时 Local Storage `EBUSY` 清理中失败；该失败发生在 desktop fixture host 启动，未进入本版 General ReAct Runtime。用户已明确表示真实环境测试完成，并接受该宿主限制不作为本版产品行为失败或 AC-039 阻塞项；该限制仍保留为自动化环境风险记录。
- 当前实现没有新增 public chunk type 或 Pencil layout：失败 Tool row 复用既有 `tool-start` + tool-scope `error` reducer/UI 终态，因而 `State 05 Exceptional Terminal` 的已有 flat failed Tool 表达仍适用。T076 与 AC-039 已完成。

## AC-039 closing disposition (2026-09-24)

- `$ai-mind-step-audit` 的记录结论为 `PASS_WITH_NOTES`；`speckit-converge` 未发现需要追加的实现任务。Phase 10 的定向回归（7 files / 109 tests）、fresh webapp stable（197 files / 1,471 tests）、webapp typecheck 与完整 ESLint 的直接执行结果均已记录在本文件。
- Phase 10 后的本机 integration 重验通过 database 1 file / 5 tests 与 webapp 11 files / 31 tests；用户已明确确认真实 provider/browser/Pencil 验收成功。desktop Playwright 的 GPU/Local Storage 宿主限制保持为已知自动化环境风险，但用户已接受它不阻塞本版产品验收或 AC-039。
- 2026-09-24 再次读取根目录、`apps/webapp`、`apps/desktop`、`apps/project-assistant-service`、`packages/database` 与 `packages/stream-core` 的 manifest；六者 package version 均为 `0.6.1`。本次文档同步后，workspace-local Prettier 检查与 `git diff --check` 均通过。根 `pnpm exec` 仍受既有临时工具缓存 `EPERM` 影响，故格式检查使用已安装的 workspace-local binary；这不改变已记录的功能验证结果。
- 基于上述记录及用户于 2026-09-24 的明确指示，AC-039 与 T063 的**本地**收口完成。它不授权也不代表 Git tag、GitHub Release、推送、提交或合并；这些外部集成动作仍须单独授权。

## Implementation evidence (2026-09-23)

已完成的自动化证据：

- `pnpm --filter @ai-mind/stream-core test`：6 files、36 tests passed；`pnpm --filter @ai-mind/stream-core build` 通过。
- 定向 webapp Vitest 覆盖协议/adapter/runner/policy/normalizer/durable buffer/observer、Memory/history、local snapshot/height、Trace/assistant/message list；其中新增的 final-only copy 用例使 `chat-message-list.test.tsx` 为 40 passed。
- `pnpm --dir apps/webapp typecheck`、`pnpm --filter @ai-mind/webapp lint` 与 `pnpm --filter @ai-mind/webapp build` 通过。

未完成或受环境限制的证据：

- 根目录 `pnpm test:stable` 已获得可归档终态：6 个 Turborepo task 全部成功，webapp stable 为 197 个测试文件、1,465 个测试通过；这也覆盖旧普通 `text-*`、Tasklist、Delivery、Image 与 historical snapshot 回归，AC-015 已勾选。
- 有数据库的 integration suite 已在下文记录；其本地开发数据库仅用于测试，不构成真实 provider/browser/Pencil 人工验收的替代。
- 用户提供的真实调用页面与运行中的 Pencil 已在下文复核：它们覆盖含 Tool 的正文/Tool/来源子项时间线、完成/未完成状态、public action explanation 和 no-Tool 直出；用户也已确认 disclosure 的手动展开与刷新默认收起。键盘/ARIA contract 有自动化覆盖，因此 T060 与 AC-038 已完成。
- `$ai-mind-step-audit` 与 `speckit-converge` 已完成并记录在下文；当时记录的 release closing 待办已由本文末尾的 Release closing evidence 完成并取代。

### Phase 8 body-first and source-owner ordering evidence (2026-09-23)

- 先新增回归断言并观察到旧实现失败：模型正文未使用 `.ai-message-markdown`、长正文 Trace 按固定行高估算、read source 在后续 commentary 后才出现；修订后，`pending/commentary` 使用 `TextPartView`，read source 直属于其 owning Tool，且空 Agent text 不再产生虚拟高度。
- `pnpm exec vitest run --config vitest.stable.config.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx tests/components/chat/message-list/messages/assistant-message-general-react.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts`：4 files、92 tests passed。覆盖 body-first、正文/Tool ordinal、Trace 外 final、source owner-child 排序、空/长正文、每个 source group 的高度估算，以及不安全 URL 被 UI 隐藏时的估高一致性。
- `pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint` 与 `pnpm --dir apps/webapp build`：均通过；`design/pencil/agent-ui.pen` 已进行 JSON parse 验证。
- 该自动化证据不能替代人工验收；后续真实页面/Pencil 复核和用户确认已完成 T060 与 AC-038；当时尚未执行的 release closing 已由本文末尾证据完成。

### Phase 9 per-call search count and Tool-start idempotence evidence (2026-09-23)

- 先新增回归断言并观察到旧实现失败：两个 `web-search` Tool Part 都显示 Trace 聚合的 `3` 个来源；同 `partId` 的重复 `tool-start` 追加两条 Tool 行；冲突的重复 start 未触发 fatal error。
- `pnpm exec vitest run --config vitest.stable.config.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/parts/general-agent-trace-panel.test.tsx tests/components/chat/message-list/messages/assistant-message-general-react.test.tsx tests/components/instamind/chat-stream/stream-message-reducer.test.ts tests/components/instamind/chat-stream/stream-reader.test.ts tests/lib/ai/runtime/general-react-agent/tool-runtime-middleware.test.ts`：6 files、116 tests passed。覆盖每次 `web-search` 的独立安全 `discovered` 来源计数、query/input 不可见、相同 Tool start 的单行幂等和冲突 Tool start fail-closed，并回归 Trace/source 顺序、replay 与 Tool transcript。
- `pnpm --dir apps/webapp typecheck` 与 `pnpm --dir apps/webapp lint` 均通过；lint 首次因 sandbox 禁止 pnpm 创建本地临时工具目录而重试，提权重跑通过。后续的真实 provider/browser/Pencil 与 release closing 门槛已按本文记录完成。
- 阶段审计发现 `web-search` 的 `read` 状态会被旧条件误计入搜索结果；已改为只统计 `status=discovered`，并补齐同工具名、不同公开 input 的重复 `tool-start` fail-closed 回归断言。该修正不改变协议、后端 Runtime 或 Tool 执行。

### Real-call and Pencil visual review evidence (2026-09-23)

- 用户提供的四个真实调用页面均以现有 Tool 行展示工具；模型的“我来搜索/读取/同时进行”等公开说明采用与正文相同的 Markdown 样式、没有文本图标，也没有暴露 reasoning、Tool input/output 或网页正文。该证据通过 AC-019 的产品语义确认：它是行动说明，不是 raw chain-of-thought。
- 含 Tool 的多个流序与设计一致：说明 → 搜索 → 说明 → 读取 → 已读取来源 → 说明/最终正文按出现顺序向下排列；`已读取来源` 直接跟随其 owning `已读取 1 个页面` Tool，而不是留在 Trace footer。最终正文显示在 Trace 下方，未被折入 Trace。页面分别呈现“正在思考”“已完成思考”和“处理未完成”，未发现顺序倒置、来源卡住或正文切换为另一种文本样式。
- 多次 `web-search` 的同类来源数在页面中各自对应一次可见工具调用，并由不同的相邻行动说明分隔；截图未见同一 Tool row 紧邻重复。截图无法单独证明 wire-level 事件唯一性，因此该层仍以 Phase 9 的 reducer 幂等/fail-closed 自动化回归为事实证据。
- 通过 Pencil MCP 打开正在运行的 `design/pencil/agent-ui.pen` 并查看 `State 01 Running Expanded`、`State 02 Tools Settled Agent Text Pending`、`State 03 Final Answer Auto Collapsed`、`State 01B Parallel Mixed Expanded`、`State 04 Completed Restored And Manually Reopened`、`State 05 Exceptional Terminal` 和 `Nested Trace Row Disclosure / Deferred`。状态稿覆盖 pending、混合 Tool/文本顺序、自动折叠/手动恢复、异常终态和本版明确 Deferred 的 nested detail；画面没有明显的裁切、溢出或错误折叠。AC-036 通过。
- 用户随后提供“react 是什么”的真实 no-Tool 直答页面：它显示无 Tool Trace 的“已完成思考”无箭头标题，唯一 Markdown 最终正文位于其下，符合 one-call direct final 的可见结果。用户同时明确确认：含详情 Trace 可手动展开，刷新后恢复为默认收起。键盘/ARIA 由 T034 的自动化合约覆盖。至此 T060 与 AC-038 通过；当时未执行的 release closing/lockstep package version 已由本文末尾证据完成。

### Integration and security-boundary evidence (2026-09-23)

- 通过项目既有 `pnpm dev:db:setup` 准备仅绑定 `127.0.0.1:5433` 的本地 pgvector PostgreSQL 并完成本地 migration/runtime checkpoint 初始化；未读取或修改生产配置与 secrets。
- 设置该临时本地 `DATABASE_URL` 后，根目录 `pnpm test:integration` 通过：database 1 file / 5 tests、webapp 11 files / 31 tests、desktop 20 tests，Turborepo 5 个 task 全部成功。
- `stream-adapter.test.ts`、`local-chat-persistence.test.ts`、`tool-runtime-middleware.test.ts` 与 `runtime-policy-matrix.test.ts` 共同覆盖 public allowlist、raw state/error/reasoning/webpage/prompt 的剔除、snapshot 安全投影，以及原有 allowlist、strict schema、URL grant、Secret Guard、Tool timeout/retry/concurrency 边界。审阅本版 diff 确认 Tool Runtime 仅接收重命名后的 loop deadline/round 计数，未扩大 Tool 权限，AC-017 与 AC-018 已勾选。
- 后续真实调用页面复核确认模型可见说明是 public action explanation，未被产品宣传或展示为 raw chain-of-thought；AC-019 已通过。

### Full workspace validation and Spec Kit closing evidence (2026-09-23)

- 根目录 `pnpm typecheck` 通过：7 个 Turborepo task 成功。根目录 `pnpm lint` 通过：5 个 workspace package 成功。期间发现 `packages/stream-core/tests/protocol/chat-stream-chunk.test.ts` 的一处新增类型断言未满足 Prettier；根因是换行格式，已作唯一格式化修复，并以 `pnpm exec prettier --check` 和 `pnpm --filter @ai-mind/stream-core lint` 复验。
- 根目录 `pnpm build` 通过 workspace boundary validation 与 5 个 package build；`git diff --check` 及 canonical specs/长期架构/公开版本文档的 Prettier 检查通过。
- 完整 stable evidence 已包含根目录 `pnpm test:stable` 的通过终态（webapp 197 files / 1,465 tests）；格式修复后，`chat-message-list.test.tsx` 的失败用例和完整单文件 43 tests 均复跑通过。全量并行重跑曾出现该用例一次超时，单例及完整文件均不能复现；其前提是 local height hint 读完后才接受 Virtuoso measurement，当前不把未稳定复现的时序现象伪装成 Runtime 行为缺口。release candidate 仍应在 CI 再跑一次完整 stable suite。
- `$speckit-analyze` 检查 canonical `spec.md`、`plan.md`、`tasks.md` 与 Constitution：46 项 FR、12 项 SC、4 个 User Story、69 个任务均有可追踪实现/验证映射；两个 checklist 均完成（agent streaming 40/40、requirements 17/17）。发现的仅是 acceptance/public docs 对 stable、integration、audit/converge 的陈旧状态，已在同一 workspace 和公开文档同步修正。
- `speckit-converge` 复核没有 missing、partial、contradicts 或 unrequested 的代码实现缺口，因此不追加 Convergence phase；T060 已由后续人工证据完成，T063 曾是唯一既有的 release gate，现已完成。

## Historical Step audit (2026-09-23, pre-T063)

本段审计发生在 T063 执行前；其中“不能进入 release closing”“下一步”等措辞仅记录当时状态，现已由本文末尾的 Release closing evidence 取代。

### Audit 结论

状态：PASS_WITH_NOTES

一句话结论（审计当时）：v0.6.1 的代码实现与已批准的 phase-aware ReAct、strict public contract、final-only projection 和非目标一致；可以进入剩余的人工/CI 验证步骤，再执行 release closing。

### 1. Step 目标匹配度

已完成：固定 Answer 生命周期已从正常路径移除；`agent-text-*`、`finalizationMode`、模型轮次判定、commentary/Trace、Memory/snapshot/height 投影和 1.5 倍预算均已有实现与定向测试。

审计当时未完成：release closing 与 lockstep package version；现已完成。

存疑点：无。完整 stable suite、数据库 integration 与人工矩阵均已取得终态；三类证据分别保留其独立价值。

### 2. 人工 Review 路线

1. `apps/webapp/lib/ai/runtime/general-react-agent/general-react-agent-runner.ts`
    - 主要做了什么：把 LangChain `createAgent` 的模型轮次、Tool 前收口、normal final 与异常 finalizer 串成一条受控链路。
    - 为什么要看：它决定正文是否直接结束，及异常时是否错误地再调用模型。
    - 重点确认：Tool 前 commentary end、normal 仅一次 loop、constrained gate、deadline/cancel 和 public-delta 后禁止 retry。
    - 风险信号：正文被二次生成、final 后仍执行 Tool，或错误将 partial 内容结束为 final。

2. `apps/webapp/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware.ts`
    - 主要做了什么：用完整模型消息和预算 state 决定是否继续 loop、接纳 Tool 或 fail closed。
    - 为什么要看：这是 Tool 预算、late Tool 与终止 authority 的安全门。
    - 重点确认：9/14/10/11/48k/270s 边界以及 normal final 后 Tool 的拒绝。
    - 风险信号：模型文本或 Tool 回调绕过 middleware 直接改变终态。

3. `packages/stream-core/src/protocol/chat-stream-chunk.ts` 与 `apps/webapp/lib/ai/stream-chunk-schema.ts`
    - 主要做了什么：定义并校验 additive `agent-text-*` 和 `agent-run-end.finalizationMode`。
    - 为什么要看：这是服务端、持久化和 UI 共用的 public DTO 边界。
    - 重点确认：start 没有 authoritative phase、end 只允许合法 outcome/status、历史 chunk 仍能解析。
    - 风险信号：schema 接受 raw provider/Tool 字段，或 completed Run 的 provenance 可被静默省略。

4. `apps/webapp/components/instamind/chat-stream/stream-message-reducer.ts` 与 `apps/webapp/components/instamind/local-chat-persistence/stable-snapshot.ts`
    - 主要做了什么：把可回放 chunk 还原为稳定 Part，并只保存已完成、安全的 Agent 公共内容。
    - 为什么要看：它阻止 commentary/pending 混入最终正文或刷新后被误判。
    - 重点确认：同一 Run 缺 provenance 时 fail closed、partId/modelTurnId 幂等、constrained 恢复后默认折叠。
    - 风险信号：未完成 Part 被写入稳定快照，或 constrained 进入 Memory。

5. `apps/webapp/components/chat/message-list/messages/assistant-message.tsx` 与 `parts/general-agent/general-agent-trace-panel.tsx`
    - 主要做了什么：按 `message.parts` 时间线平铺正文说明与 Tool；无 detail 的 pending 位于标题下，有 detail 的 pending/commentary 位于可折叠 Trace，final answer 始终位于 Trace 外的 Markdown。
    - 为什么要看：这里验证用户看到的过程与最终正文完全分离。
    - 重点确认：纯正文仍有无箭头的“已完成思考”；有详情才可折叠；constrained 显示“处理未完成”并保持展开。
    - 风险信号：pending 出现箭头、commentary 出现在复制/操作栏，或 Tool 行出现本版未授权的 detail。

### 3. 关键代码讲解

入口由 Runner 创建 stream adapter 和 General ReAct context；adapter 先将公开 delta 投影为无 outcome 的 `agent-text-start/delta`。完整 `AIMessage` 到达后，Runner 与 Run Policy 根据 Tool Calls、normalizer 终止证据和预算 state 只做一次 authoritative end：Tool 轮次为 `commentary`，自然 no-Tool 轮次为 `final_answer`，其余走一次受约束 finalizer 或安全失败终态。reducer 再把 start 到 end 的窗口派生为 `pending`，并在稳定 part identity 上解析；UI 按 phase 呈现，Memory/history/snapshot 选择器只消费最终正文。测试覆盖四个核心序列、finish 分类、预算、replay、展示和投影边界。

### 4. 越界与范围控制

是否越界：未发现。没有新增 Tool 权限、MCP 自动发现、server Trace storage、数据库 schema 或双运行时 feature flag。

是否违反 Non-goals：未发现；Tool nested detail 在 Pencil 与 UI 中仍为 Deferred，raw reasoning/Tool output 不进入 public contract。

是否提前实现后续 Step：未发现；`deterministic_fallback` 仅是内部安全终态分类，未成为新的用户可见协议。

### 5. 代码质量与架构分层

结构设计：stream-core 拥有协议、Runtime 拥有 provider/turn 判定、reducer 拥有 replay state、UI 只消费 phase，边界清晰。

类型与边界：strict schema、part/run/turn identity、normal/constrained provenance 和 fail-closed reducer 已形成端到端约束。

错误处理：cancel、deadline、unknown finish、late Tool 与首个 public delta 后 retry 都有显式路径。

可维护性：新增 normalizer 与 adapter 有明确的 provider/stream 边界，没有引入 Chain-owned ReAct loop。

### 6. 功能与回归风险

新增风险：不同真实 provider 的 finish metadata 映射、长流/断线恢复仍需在后续真实环境持续观察；disclosure 的键盘/ARIA 合约已由自动化覆盖，手动展开与刷新默认收起已人工确认。

可能影响的旧链路：普通 `text-*`、非 General Agent 的 Trace、Tasklist/Delivery/Image 需要由完整稳定套件回归证明。

需要重点手测的地方：四个正文/Tool 顺序、取消/超时、constrained finalizer、刷新恢复、复制/反馈/follow-up 和窄屏 disclosure。

### 7. AI / Agent 专项检查

资源边界：未扩大 Resource/URL grant；snapshot 仅保留安全的 source/资源字段。

工具作用域：仍由既有 Tool Runtime、profile timeout、allowlist、并发和 retry owner 管理；未改为模型自由调度。

模型输出约束：模型可见正文只在结构和终止证据通过后获得 outcome；raw reasoning、unknown blocks 和 raw Tool detail 未公开。

AgentTracePanel / Stream 展示：Trace 只包含 run-level commentary 和已有安全行，最终正文保持在 Trace 外。

### 8. 测试与验证

已执行：stream-core test/build；相关 webapp Vitest 分组；完整根目录 `pnpm test:stable`；webapp typecheck、lint、build；`git diff --check`。

已执行：真实调用页面覆盖 no-Tool 直答及含 Tool 的混合时间线；Pencil 状态稿已复核；用户已确认 disclosure 手动展开和刷新默认收起，键盘/ARIA 由自动化合约覆盖。

建议补充：CI 持续观察完整 stable suite，以消化既有的一次并行超时风险；本地 fresh stable 与 integration 已在 closing 时重新通过。

审计当时必须通过：T063、AC-039；现已完成。

### 9. 下一步建议

审计当时的下一 Step：人工与环境验证完成后，经用户授权进入 T063；该授权及执行现已完成。

审计当时的前置条件：取得 release closing 与 package version lockstep 的执行授权；用户已授权并已完成 closing 检查。

## Converge result (2026-09-23)

`speckit-converge` 以当前 canonical `spec.md`、`plan.md`、`tasks.md` 和 Constitution 对照已实现范围。检查未发现需要追加的 missing、partial、contradicts 或 unrequested 代码任务；因此保持 `tasks.md` 不新增 Convergence phase。T060 的人工/环境矩阵已由后续证据完成；当时唯一明确未完成的 T063 已在本地 release closing 中完成。

## Historical release closing evidence (2026-09-23)

- 六个 workspace package manifest 已锁步为 `0.6.1`：根目录、`apps/webapp`、`apps/desktop`、`apps/project-assistant-service`、`packages/database` 与 `packages/stream-core`。版本更新不改动历史 fixture 或数据库 schema。
- fresh `pnpm test:stable` 通过：6 个 Turborepo task 成功，webapp 为 197 个测试文件、1,465 个测试通过。closing 期间首次根目录 `pnpm test` 的 stable 阶段曾因未改动的 calculator CPU 时间断言在共享负载下测得 58.34ms（阈值 50ms）而停止；随后隔离该文件连续 5 次均为 3/3 通过，fresh 全量 stable 重跑通过。该时序风险已如实保留，后续 CI 应继续观察。
- 以项目文档规定的仅本机 `127.0.0.1:5433` 开发 PostgreSQL 执行 `pnpm dev:db:setup` 后，临时设置本地 `DATABASE_URL` 的 `pnpm test:integration` 通过：database 1 文件/5 项、webapp 11 文件/31 项、desktop 20 项，5 个 Turborepo task 成功。
- fresh `pnpm typecheck`（7 个 task）、`pnpm lint`（5 个 task）与 `pnpm build`（workspace boundary validation 加 4 个 build task）均通过。
- 六个 manifest 的 JSON 解析和版本断言确认均为 `0.6.1`；本次 closing 触及的 manifest、canonical specs、README、ADR、architecture、version/release/tasklist 文档均通过 `pnpm exec prettier --check`，`git diff --check` 未报告空白错误。
- 当前仍未创建 Git tag、GitHub Release，亦未推送、提交或合并；这些是后续分支集成选择，不是本地 release closing 的组成部分。
